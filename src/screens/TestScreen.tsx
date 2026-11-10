import { useEffect, useRef, useState } from 'react'
import { Bot, Me, SysChip, Thread } from '../components/Chat'
import { Composer, DropOverlay } from '../components/Composer'
import { useI18n } from '../i18n'
import { useDropImages, useFlash, usePasteImages } from '../hooks'
import { loadPhoto, photoToPixels } from '../photo'
import { makeStickerInWorker } from '../workerClient'
import { makeTestPayload } from '../testPayload'
import { canCopyImage, canShareFiles, copyPng, downloadBlob, shareFile } from '../actions'
import { DownloadIcon, PhotoIcon } from '../components/Icons'

/**
 * Test mode (Phase 0): fake payload, three sizes, no payment. The instrument for finding out what
 * KakaoTalk does to images.
 */

const MAX_EDGE = 2048
const SMALLER_EDGES = [1280, 640]

interface TestSticker {
  edge: number
  isOriginal: boolean
  width: number
  height: number
  file: File
  url: string
}

interface PhotoInfo {
  url: string
  width: number
  height: number
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'working'; run: number; photo: PhotoInfo; done: number; total: number; stickers: TestSticker[] }
  | { kind: 'done'; run: number; photo: PhotoInfo; stickers: TestSticker[]; small: boolean }
  | { kind: 'error'; run: number; photo?: PhotoInfo; message: string }

const nextPaint = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)))

export function TestScreen({ active }: { active: boolean }) {
  const { t } = useI18n()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const run = useRef(0)
  const urls = useRef<string[]>([])

  const releaseUrls = () => {
    urls.current.forEach((u) => URL.revokeObjectURL(u))
    urls.current = []
  }
  useEffect(() => releaseUrls, [])

  const start = async (files: File[]) => {
    const file = files[0]
    if (!file) return
    const myRun = ++run.current
    releaseUrls()

    let photo
    try {
      photo = await loadPhoto(file)
    } catch {
      if (myRun === run.current) setPhase({ kind: 'error', run: myRun, message: t('pick.unreadable') })
      return
    }
    if (myRun !== run.current) return photo.release()
    urls.current.push(photo.url)
    const info: PhotoInfo = { url: photo.url, width: photo.width, height: photo.height }

    const first = Math.min(MAX_EDGE, Math.max(photo.width, photo.height))
    const edges = [first, ...SMALLER_EDGES.filter((e) => e < first)]
    const stickers: TestSticker[] = []
    setPhase({ kind: 'working', run: myRun, photo: info, done: 0, total: edges.length, stickers })

    try {
      for (const [i, edge] of edges.entries()) {
        await nextPaint()
        const pixels = photoToPixels(photo, edge, t('sticker.badge', { size: edge }))
        const made = await makeStickerInWorker(pixels, makeTestPayload(pixels.width, pixels.height))
        if (myRun !== run.current) return
        const file = new File([made.png as BlobPart], `test-photo-${edge}.png`, { type: 'image/png' })
        const url = URL.createObjectURL(file)
        urls.current.push(url)
        stickers.push({ edge, isOriginal: i === 0, width: made.width, height: made.height, file, url })
        setPhase({ kind: 'working', run: myRun, photo: info, done: i + 1, total: edges.length, stickers: [...stickers] })
      }
      setPhase({ kind: 'done', run: myRun, photo: info, stickers: [...stickers], small: edges.length < 3 })
    } catch (e) {
      if (myRun !== run.current) return
      const error = e instanceof Error ? e.message : String(e)
      setPhase({ kind: 'error', run: myRun, photo: info, message: t('test.failed', { error }) })
    }
  }

  usePasteImages(start, active)
  const dragging = useDropImages(start, active)

  const photo = phase.kind === 'idle' ? undefined : phase.photo
  const stickers = phase.kind === 'working' || phase.kind === 'done' ? phase.stickers : []

  return (
    <>
      <Thread>
        <SysChip tone="test">{t('test.notice')}</SysChip>
        <Bot head>
          {t('test.hello')}
        </Bot>
        <Bot delay={450}>{t('test.explain')}</Bot>
        <Bot delay={900}>{t('test.pick')} 👇</Bot>

        {photo && (
          <Me media key={`photo-${phase.kind !== 'idle' && phase.run}`}>
            <img className="media-img" src={photo.url} alt="" />
            <span className="media-caption">
              {photo.width}×{photo.height}
            </span>
          </Me>
        )}

        {phase.kind === 'working' && (
          <Bot head typing={0} key={`status-${phase.run}`}>
            <p>{t('test.making', { done: phase.done, total: phase.total })}</p>
            <progress className="progress" max={phase.total} value={phase.done + 0.35} />
          </Bot>
        )}
        {phase.kind === 'done' && (
          <Bot head typing={0} key={`status-${phase.run}`}>
            <p className="lead">{t('test.done', { count: phase.stickers.length })}</p>
            {phase.small && (
              <p className="muted">{t('test.small', { w: phase.photo.width, h: phase.photo.height })}</p>
            )}
          </Bot>
        )}
        {phase.kind === 'error' && (
          <Bot head typing={300} key={`error-${phase.run}`} scrollIntoView>
            {phase.message}
          </Bot>
        )}

        {stickers.map((s) => (
          <Bot key={s.url} typing={0} card scrollIntoView>
            <StickerCard sticker={s} />
          </Bot>
        ))}

        {phase.kind === 'done' && (
          <>
            <Bot typing={0}>
              <button
                type="button"
                className="btn btn--soft btn--block"
                onClick={async () => {
                  for (const s of phase.stickers) {
                    downloadBlob(s.file, s.file.name)
                    await new Promise((r) => setTimeout(r, 350))
                  }
                }}
              >
                <DownloadIcon size={18} />
                {t('action.downloadAll')}
              </button>
              <p className="muted small">{t('action.saveHint')}</p>
            </Bot>
            <Bot head delay={350} card>
              <HowTo />
            </Bot>
          </>
        )}
      </Thread>

      {active && <DropOverlay show={dragging} label={t('drop.overlay')} />}
      <Composer
        label={phase.kind === 'idle' ? t('pick.choosePhoto') : t('test.again')}
        icon={<PhotoIcon size={20} />}
        onFiles={start}
        testId="test-photo-input"
      />
    </>
  )
}

function StickerCard({ sticker: s }: { sticker: TestSticker }) {
  const { t, bytes } = useI18n()
  const [flash, setFlash] = useFlash()
  const share = canShareFiles(s.file)
  const copy = canCopyImage()
  return (
    <div className="sticker" data-testid="test-sticker">
      <a className="sticker-thumb" href={s.url} target="_blank" rel="noopener">
        <img src={s.url} alt={t('sticker.badge', { size: s.edge })} />
      </a>
      <div className="sticker-info">
        <div className="sticker-title">
          <strong>{t('sticker.px', { size: s.edge })}</strong>
          {s.isOriginal && <span className="tag">{t('sticker.original')}</span>}
        </div>
        <div className="facts">
          <span>PNG</span>, <span>{s.width}×{s.height}</span>, <span>{bytes(s.file.size)}</span>
        </div>
      </div>
      <div className="sticker-actions">
        {share && (
          <button type="button" className="btn btn--primary btn--sm" onClick={() => void shareFile(s.file)}>
            {t('action.share')}
          </button>
        )}
        {copy && (
          <button
            type="button"
            className="btn btn--soft btn--sm"
            onClick={async () => setFlash((await copyPng(s.file)) ? t('action.copied') : t('action.copyFailed'))}
          >
            {t('action.copyImage')}
          </button>
        )}
        <button
          type="button"
          className={`btn btn--sm ${share ? 'btn--soft' : 'btn--primary'}`}
          onClick={() => downloadBlob(s.file, s.file.name)}
        >
          {t('action.download')}
        </button>
      </div>
      {flash && (
        <p className="flash" role="status">
          {flash}
        </p>
      )}
    </div>
  )
}

function HowTo() {
  const { t } = useI18n()
  return (
    <div className="howto">
      <h3>{t('test.howto.title')}</h3>
      <ol>
        <li>{t('test.howto.1')}</li>
        <li>{t('test.howto.2')}</li>
        <li>{t('test.howto.3')}</li>
        <li>{t('test.howto.4')}</li>
        <li>{t('test.howto.5')}</li>
      </ol>
    </div>
  )
}
