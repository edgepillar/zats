import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useI18n, type Key } from '../i18n'
import { useDropImages, usePasteImages } from '../hooks'
import { readStickerInWorker, warmUpReader } from '../workerClient'
import type { StickerReadResult } from '../read'
import { isTestPayload } from '../testPayload'
import { OfflineError, checkClaimState, loadCashu, summarizeToken, type TokenSummary } from '../mint'
import { loadBtcPrice } from '../price'
import { canReadClipboardImages, readClipboardImage } from '../actions'
import { ClaimCard, type TokenCheck } from './ClaimCard'
import { DropOverlay } from './Composer'
import { Loading } from './Buddies'
import { CopyIcon, PhotoIcon } from './Icons'

/**
 * Redeem: paste or choose the photo a friend sent, see what's inside, take the bitcoin.
 * One photo at a time; a new paste or drop replaces the current one.
 */

interface Picked {
  name: string
  url: string
}

type Outcome =
  | { k: 'money'; token: string; check: TokenCheck }
  | { k: 'test'; status: 'intact' | 'repaired' }
  | { k: 'none' | 'erased' | 'damaged' | 'unreadable' }
  /** Our side failed (offline, a download that didn't arrive), not the photo: worth a retry. */
  | { k: 'failed' }

type Stage = { k: 'idle' } | { k: 'reading'; photo: Picked } | { k: 'done'; photo: Picked; outcome: Outcome }

const MIN_READING_MS = 700 // long enough to see the buddies, short enough not to wait on them
const CLAIM_CHECK_MS = 6000 // after this, offer the claim anyway; the wallet checks again
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function outcomeOf(result: StickerReadResult): Outcome {
  if (!result.ok) return { k: result.reason }
  if (isTestPayload(result.token)) return { k: 'test', status: result.status }
  return { k: 'money', token: result.token, check: { claim: 'checking' } }
}

export function RedeemFlow({ active, head }: { active: boolean; head: false | ((sub: string) => ReactNode) }) {
  const { t } = useI18n()
  const [stage, setStage] = useState<Stage>({ k: 'idle' })
  const [notice, setNotice] = useState<string | null>(null)
  // Once the browser refuses a paste it keeps refusing (KakaoTalk's in-app browser on Android does).
  const [pasteBlocked, setPasteBlocked] = useState(false)
  const run = useRef(0)
  const url = useRef<string | null>(null)
  const lastFile = useRef<File | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const canPaste = canReadClipboardImages() && !pasteBlocked

  // Fetch the reading and Cashu code while the person finds the photo, so a connection that drops
  // in the meantime doesn't stop the photo from opening.
  useEffect(() => {
    if (!active) return
    warmUpReader()
    loadCashu().catch(() => {})
  }, [active])

  useEffect(
    () => () => {
      if (url.current) URL.revokeObjectURL(url.current)
    },
    [],
  )

  const read = async (files: File[]) => {
    const file = files[0]
    if (!file) return
    setNotice(null)
    lastFile.current = file
    const id = ++run.current
    if (url.current) URL.revokeObjectURL(url.current)
    url.current = URL.createObjectURL(file)
    const photo = { name: file.name || t('open.pastedName'), url: url.current }
    setStage({ k: 'reading', photo })

    // A broken photo comes back as a result; a throw means the reader itself didn't run.
    let result: StickerReadResult | null
    try {
      ;[result] = await Promise.all([readStickerInWorker(file), sleep(MIN_READING_MS)])
    } catch {
      result = null
    }
    if (id !== run.current) return
    if (!result) return setStage({ k: 'done', photo, outcome: { k: 'failed' } })

    const outcome = outcomeOf(result)
    if (outcome.k !== 'money') return setStage({ k: 'done', photo, outcome })

    // Real bitcoin: get the amount (and the price for dollars or won) before showing the card.
    void loadBtcPrice().catch(() => {})
    let summary: TokenSummary
    try {
      summary = await summarizeToken(outcome.token)
    } catch (e) {
      if (id !== run.current) return
      if (e instanceof OfflineError) setStage({ k: 'done', photo, outcome: { k: 'failed' } })
      else setStage({ k: 'done', photo, outcome: { ...outcome, check: { claim: 'unknown', invalid: true } } })
      return
    }
    if (id !== run.current) return
    setStage({ k: 'done', photo, outcome: { ...outcome, check: { summary, claim: 'checking' } } })
    // The ways to take the money wait for this answer, so a mint that never replies can't hold them.
    let claim: TokenCheck['claim']
    try {
      claim = await Promise.race([checkClaimState(outcome.token), sleep(CLAIM_CHECK_MS).then(() => 'unknown' as const)])
    } catch {
      claim = 'unknown'
    }
    if (id !== run.current) return
    setStage({ k: 'done', photo, outcome: { ...outcome, check: { summary, claim } } })
  }

  const paste = async () => {
    const got = await readClipboardImage('pasted')
    if (got === 'empty') setNotice(t('redeem.pasteEmpty'))
    else if (got === 'denied') {
      setPasteBlocked(true)
      setNotice(t('redeem.pasteDenied'))
    } else void read([got])
  }

  const retry = () => {
    warmUpReader()
    if (lastFile.current) void read([lastFile.current])
  }

  const reset = () => {
    run.current++
    setNotice(null)
    setStage({ k: 'idle' })
  }

  usePasteImages((files) => void read(files), active)
  const dragging = useDropImages((files) => void read(files), active)

  const choose = () => input.current?.click()

  return (
    <>
      {active && <DropOverlay show={dragging} label={t('drop.overlay')} />}
      <div className="make-grid redeem">
        {head && head(t(canPaste ? 'redeem.sub' : 'redeem.subChoose'))}

        {/* Wide screens: a drop area, then the photo itself. Phones: the photo, kept short, once there is one. */}
        <div className={`make-photo${stage.k === 'idle' ? ' make-photo--aside' : ''}`}>
          {stage.k === 'idle' ? (
            <button type="button" className="picker redeem-drop" onClick={choose}>
              <PhotoIcon size={30} className="picker-icon" />
              <span className="picker-title">{t('redeem.drop')}</span>
            </button>
          ) : (
            <figure className="redeem-shot">
              <img src={stage.photo.url} alt="" />
              <FileName name={stage.photo.name} />
            </figure>
          )}
        </div>

        <div className="make-panel">
          {stage.k === 'idle' && (
            <div className="redeem-actions">
              {canPaste && (
                <button type="button" className="btn btn--primary btn--xl btn--block" onClick={paste}>
                  <CopyIcon size={20} />
                  {t('redeem.paste')}
                </button>
              )}
              <button
                type="button"
                className={`btn btn--xl btn--block ${canPaste ? 'btn--quiet' : 'btn--primary'}`}
                onClick={choose}
              >
                <PhotoIcon size={20} />
                {t('redeem.choose')}
              </button>
              {notice && (
                <p className="redeem-notice" role="status">
                  {notice}
                </p>
              )}
            </div>
          )}
          {stage.k === 'reading' && (
            <div className="tile redeem-loading">
              <Loading label={t('redeem.reading')} size={40} layout="column" />
            </div>
          )}
          {stage.k === 'done' && (
            <>
              <Outcome outcome={stage.outcome} onRetry={retry} />
              <button type="button" className="btn btn--text redeem-again" onClick={reset}>
                {t('redeem.again')}
              </button>
            </>
          )}
        </div>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        data-testid="redeem-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = '' // allow choosing the same file again
          if (files.length) void read(files)
        }}
      />
    </>
  )
}

/** Long names lose their middle, not their end: the end (number, extension) is what differs. */
function FileName({ name }: { name: string }) {
  const cut = Math.max(0, name.length - 10)
  return (
    <figcaption title={name}>
      <span className="fname-head">{name.slice(0, cut)}</span>
      <span className="fname-tail">{name.slice(cut)}</span>
    </figcaption>
  )
}

function Outcome({ outcome, onRetry }: { outcome: Outcome; onRetry: () => void }) {
  const { t } = useI18n()
  if (outcome.k === 'failed') {
    return (
      <div className="tile redeem-msg" data-redeem="failed" role="alert">
        <h3>{t('redeem.failed.title')}</h3>
        <p>{t('redeem.failed.body')}</p>
        <button type="button" className="btn btn--primary btn--block redeem-retry" onClick={onRetry}>
          {t('redeem.retry')}
        </button>
      </div>
    )
  }
  if (outcome.k === 'money') {
    if (outcome.check.invalid) return <Message kind="unreadable" />
    return (
      <div data-redeem="money">
        <ClaimCard token={outcome.token} check={outcome.check} />
      </div>
    )
  }
  if (outcome.k === 'test') {
    return (
      <div className="tile redeem-msg" data-redeem="test">
        <h3>{t('redeem.test.title')}</h3>
        <p>{t(`redeem.test.${outcome.status}`)}</p>
      </div>
    )
  }
  return <Message kind={outcome.k} />
}

function Message({ kind }: { kind: 'none' | 'erased' | 'damaged' | 'unreadable' }) {
  const { t } = useI18n()
  return (
    <div className="tile redeem-msg" data-redeem={kind} role="status">
      <h3>{t(`redeem.${kind}.title` as Key)}</h3>
      <p>{t(`redeem.${kind}.body` as Key)}</p>
    </div>
  )
}
