import { Fragment, useEffect, useRef, useState } from 'react'
import { Bot, Me, SysChip, Thread } from '../components/Chat'
import { Composer, DropOverlay } from '../components/Composer'
import { useI18n, type Key } from '../i18n'
import { useDropImages, usePasteImages } from '../hooks'
import { readStickerInWorker } from '../workerClient'
import type { StickerReadResult } from '../read'
import { FORMAT_NAMES } from '../imageInfo'
import { isTestPayload, parseTestPayload, type TestPayloadInfo } from '../testPayload'
import { checkClaimState, summarizeToken, type TokenSummary } from '../mint'
import { ClaimCard, type TokenCheck } from '../components/ClaimCard'
import { loadBtcPrice } from '../price'
import { canReadClipboardImages, readClipboardImage } from '../actions'
import { CopyIcon, PhotoIcon } from '../components/Icons'

/**
 * Open: reads any image and says what's in it. Keeps a thread of every image opened this visit.
 */

interface Entry {
  id: number
  name: string
  url: string
  reading: boolean
  error?: string
  result?: StickerReadResult
  test?: TestPayloadInfo | null
  token?: TokenCheck
}

export function OpenScreen({ active }: { active: boolean }) {
  const { t } = useI18n()
  const [entries, setEntries] = useState<Entry[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const nextId = useRef(0)
  const urls = useRef<string[]>([])

  useEffect(
    () => () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u))
    },
    [],
  )

  const update = (id: number, patch: (e: Entry) => Partial<Entry>) => {
    setEntries((es) => es.map((e) => (e.id === id ? { ...e, ...patch(e) } : e)))
  }

  const checkToken = async (id: number, token: string) => {
    void loadBtcPrice().catch(() => {}) // so the amount can show in dollars or won right away
    let summary: TokenSummary
    try {
      summary = await summarizeToken(token)
    } catch {
      return update(id, () => ({ token: { claim: 'unknown', invalid: true } }))
    }
    update(id, () => ({ token: { summary, claim: 'checking' } }))
    let claim: TokenCheck['claim']
    try {
      claim = await checkClaimState(token)
    } catch {
      claim = 'unknown'
    }
    update(id, (e) => ({ token: { ...e.token, summary, claim } }))
  }

  const open = async (files: File[]) => {
    setNotice(null)
    const fresh: Entry[] = files.map((f) => {
      const url = URL.createObjectURL(f)
      urls.current.push(url)
      return { id: ++nextId.current, name: f.name || t('open.pastedName'), url, reading: true }
    })
    setEntries((es) => [...es, ...fresh])

    // One at a time: decoding a 2048 px PNG is heavy on a phone.
    for (const [i, file] of files.entries()) {
      const id = fresh[i].id
      let result: StickerReadResult
      try {
        result = await readStickerInWorker(file)
      } catch (e) {
        update(id, () => ({ reading: false, error: e instanceof Error ? e.message : String(e) }))
        continue
      }
      const realToken = result.ok && !isTestPayload(result.token)
      update(id, () => ({
        reading: false,
        result,
        test: result.ok ? parseTestPayload(result.token) : null,
        token: realToken ? { claim: 'checking' } : undefined,
      }))
      if (result.ok && realToken) void checkToken(id, result.token)
    }
  }

  const pasteFromButton = async () => {
    const got = await readClipboardImage('pasted')
    if (got === 'empty') setNotice(t('pick.pasteEmpty'))
    else if (got === 'denied') setNotice(t('pick.pasteDenied'))
    else void open([got])
  }

  usePasteImages((files) => void open(files), active)
  const dragging = useDropImages((files) => void open(files), active)

  return (
    <>
      <Thread>
        <Bot head>
          {t('open.hello')}
        </Bot>
        <Bot delay={450}>{t('open.explain')} 👇</Bot>

        {entries.map((e) => (
          <Fragment key={e.id}>
            <Me media>
              <Thumb entry={e} />
              <span className="media-caption">{e.name}</span>
            </Me>
            <Bot head busy={e.reading} typing={0} scrollIntoView bare={isMoney(e)}>
              <Verdict entry={e} />
            </Bot>
          </Fragment>
        ))}

        {notice && <SysChip>{notice}</SysChip>}
      </Thread>

      {active && <DropOverlay show={dragging} label={t('drop.overlay')} />}
      <Composer
        label={t('pick.chooseImage')}
        icon={<PhotoIcon size={20} />}
        multiple
        onFiles={(files) => void open(files)}
        testId="open-input"
      >
        {canReadClipboardImages() && (
          <button type="button" className="btn btn--soft" onClick={pasteFromButton}>
            <CopyIcon size={20} />
            {t('pick.paste')}
          </button>
        )}
      </Composer>
    </>
  )
}

type T = ReturnType<typeof useI18n>['t']

function formatName(format: StickerReadResult['format'], t: T): string {
  return format === 'unknown' ? t('format.unknown') : FORMAT_NAMES[format]
}

/** A photo with bitcoin in it: the money card is shown on its own, without a chat bubble. */
function isMoney(e: Entry): boolean {
  return !!(e.result?.ok && e.token?.summary && !e.token.invalid)
}

function verdictKey(e: Entry): 'intact' | 'repaired' | 'damaged' | 'none' | 'erased' | 'unreadable' {
  const r = e.result
  if (!r || e.error) return 'unreadable'
  return r.ok ? r.status : r.reason
}

function Thumb({ entry }: { entry: Entry }) {
  const [broken, setBroken] = useState(false)
  if (broken) {
    return (
      <span className="media-file" aria-hidden="true">
        🗂️
      </span>
    )
  }
  return <img className="media-img" src={entry.url} alt="" onError={() => setBroken(true)} />
}

function warningText(w: string, t: T): string {
  if (/palette/i.test(w)) return t('warn.palette')
  if (/16-bit/i.test(w)) return t('warn.depth16')
  if (/greyscale|grayscale/i.test(w)) return t('warn.grey')
  return t('warn.other', { detail: w })
}

function Facts({ r, bad }: { r: StickerReadResult; bad?: boolean }) {
  const { t, bytes } = useI18n()
  return (
    <p className="facts-line" data-testid="facts">
      <span className={bad ? 'is-bad' : undefined}>{formatName(r.format, t)}</span>,{' '}
      <span>{r.width ? `${r.width}×${r.height}` : t('facts.dimsUnknown')}</span>, <span>{bytes(r.size)}</span>
    </p>
  )
}

function Verdict({ entry: e }: { entry: Entry }) {
  const { t } = useI18n()
  const key = verdictKey(e)
  const r = e.result

  if (!r || e.error) {
    return (
      <div data-verdict="unreadable">
        <p className="lead">{t('verdict.unreadable.title')}</p>
        <p>{t('verdict.unreadable.body')}</p>
      </div>
    )
  }

  const warnings = r.warnings.length > 0 && (
    <ul className="warnings">
      {r.warnings.map((w) => (
        <li key={w}>{warningText(w, t)}</li>
      ))}
    </ul>
  )

  if (r.ok && e.token) {
    return (
      <div data-verdict={key}>
        <ClaimCard token={r.token} check={e.token} />
      </div>
    )
  }

  return (
    <div data-verdict={key}>
      <p className="lead">{t(`verdict.${key}.title` as Key)}</p>
      {key === 'erased' ? (
        <>
          <p>{t('verdict.erased.body', { format: formatName(r.format, t) })}</p>
          <p className="muted">{t('verdict.erased.hint')}</p>
        </>
      ) : (
        <p>{t(`verdict.${key}.body` as Key)}</p>
      )}
      {e.test && <p className="test-line">{t('test.found', { w: e.test.width, h: e.test.height })}</p>}
      <Facts r={r} bad={key === 'erased' || key === 'damaged'} />
      {warnings}
    </div>
  )
}
