import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import QRCode from 'qrcode'
import { satsUnit, useI18n } from '../i18n'
import { scrollBehavior, useDropImages, useFlash, usePasteImages } from '../hooks'
import { fitSize, loadPhoto, photoToPixels, type LoadedPhoto } from '../photo'
import { capacityBytes } from '../stego'
import { makeStickerInWorker } from '../workerClient'
import {
  AmountRangeError,
  MINT_URL,
  checkClaimState,
  createInvoice,
  invoiceState,
  isTestMint,
  mintErrorKind,
  mintToken,
  type ClaimState,
} from '../mint'
import { claimLink } from '../config'
import { redeemUrl } from '../nav'
import { clearPendingPhoto, loadPendingPhoto, savePendingPhoto } from '../photoStore'
import {
  addToken,
  clearPending,
  deleteToken,
  loadPending,
  loadTokens,
  markInPhoto,
  savePending,
  type PendingQuote,
  type SavedToken,
} from '../wallet'
import { canCopyImage, canShareFiles, copyPng, copyText, downloadBlob, shareFile } from '../actions'
import { DropOverlay } from './Composer'
import { Buddies, Loading } from './Buddies'
import { CheckIcon, ChevronIcon, CopyIcon, DownloadIcon, PhotoIcon, ShareIcon, TrashIcon } from './Icons'
import { FlashLabel } from './Flash'

/**
 * Make: photo → amount → pay → photo with sats inside.
 * Money safety (spec 5.5): the quote is saved before the invoice is shown and resumed after a
 * reload; the token is saved before it's embedded; if saving fails the raw token is shown.
 */

type Made = { file: File; url: string; width: number; height: number }

type Stage =
  | { k: 'form' }
  | { k: 'quoting' }
  /** `unsaved`: the invoice couldn't be stored, so a reload would lose it. */
  | { k: 'invoice'; pending: PendingQuote; unsaved?: boolean }
  | { k: 'minting'; amount: number }
  /** 'lost': paid, but the page reloaded and the photo couldn't be recovered. 'put': a saved token. */
  | {
      k: 'needPhoto'
      saved: SavedToken
      unsaved: boolean
      edge: number
      why: 'lost' | 'put'
    }
  | { k: 'embedding'; saved: SavedToken }
  | { k: 'done'; saved: SavedToken; made: Made; unsaved: boolean }
  | { k: 'issued' }
  /**
   * `note`: reassurance after a payment went through. `token`: a token that isn't stored anywhere
   * yet, shown so it can't be lost by tapping Cancel.
   */
  | { k: 'error'; message: string; detail?: string; note?: string; token?: string; retry?: () => void }

const EDGES = [2048, 1280, 640]
const PRESETS = [1000, 5000, 10000, 20000]
/** The Minibits mint takes up to 1,000,000 sats per Lightning deposit. */
const MAX_AMOUNT = 1_000_000
/**
 * Room a photo needs for any token up to MAX_AMOUNT: at most 20 proofs at about 150 bytes each,
 * plus the frame. Anything smaller than about 105 × 105 px is turned away before paying.
 */
const MIN_ROOM = 4096

function parseAmount(text: string): number | null {
  const clean = text.replace(/[\s,._]/g, '')
  if (!/^\d+$/.test(clean)) return null
  const n = Number(clean)
  return n >= 1 && n <= MAX_AMOUNT ? n : null
}

/** Bytes of hidden data the photo can carry once resized to `edge`. */
function room(photo: LoadedPhoto, edge: number): number {
  const { width, height } = fitSize(photo.width, photo.height, edge)
  return capacityBytes(width, height)
}

/** `head` is the section heading; it sits in the grid beside the photo on wide screens. */
export function MakeFlow({ active, head }: { active: boolean; head: ReactNode }) {
  const { t, num } = useI18n()
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null)
  /** Why the last photo chosen was turned away. */
  const [photoError, setPhotoError] = useState<'unreadable' | 'small' | null>(null)
  const [amountText, setAmountText] = useState('1,000')
  const [edge, setEdge] = useState(2048)
  const [stage, setStage] = useState<Stage>(() => {
    const pending = loadPending()
    return pending ? { k: 'invoice', pending } : { k: 'form' }
  })
  const [offline, setOffline] = useState(false)
  const [saved, setSaved] = useState<SavedToken[]>(loadTokens)
  const photoRef = useRef(photo)
  photoRef.current = photo
  /** The file behind `photo`, kept so it can be stored while its invoice is paid. */
  const photoFile = useRef<Blob | null>(null)
  const madeUrls = useRef<string[]>([])
  const card = useRef<HTMLDivElement>(null)

  useEffect(
    () => () => {
      photoRef.current?.release()
      madeUrls.current.forEach((u) => URL.revokeObjectURL(u))
    },
    [],
  )

  const amount = parseAmount(amountText)
  const amountError =
    amount !== null
      ? null
      : Number(amountText.replace(/\D/g, '')) > MAX_AMOUNT
        ? t('make.amount.max', { max: num(MAX_AMOUNT) })
        : t('make.amount.invalid')
  const tooSmall = photo !== null && room(photo, edge) < MIN_ROOM
  const mintUrl = MINT_URL

  /** A failure as words for this person: specific where we can tell what happened. */
  const failure = (e: unknown): { message: string; detail?: string } => {
    if (e instanceof AmountRangeError) return { message: t('make.err.range', { min: num(e.min), max: num(e.max) }) }
    if (e instanceof Error && /too small/i.test(e.message)) return { message: t('make.photo.tooSmall') }
    const kind = mintErrorKind(e)
    if (kind !== 'other') return { message: t(`make.err.${kind}`) }
    return { message: t('make.error'), detail: e instanceof Error ? e.message : String(e) }
  }

  const choosePhoto = async (files: File[]) => {
    const file = files[0]
    if (!file) return
    let next: LoadedPhoto
    try {
      next = await loadPhoto(file)
    } catch {
      setPhotoError('unreadable')
      return
    }
    // Already paid: the token is known, so check this photo can hold it before using it.
    if (stage.k === 'needPhoto' && room(next, stage.edge) < stage.saved.token.length) {
      next.release()
      setPhotoError('small')
      return
    }
    photoRef.current?.release()
    setPhoto(next)
    photoFile.current = file
    setPhotoError(null)
    if (stage.k === 'needPhoto') void embed(stage.saved, next, stage.edge, stage.unsaved)
  }

  const embed = async (tok: SavedToken, from: LoadedPhoto, size: number, unsaved: boolean) => {
    setStage({ k: 'embedding', saved: tok })
    try {
      const pixels = photoToPixels(from, size)
      const made = await makeStickerInWorker(pixels, tok.token)
      const file = new File([made.png as BlobPart], `kakaonut-${tok.amount}-sats.png`, { type: 'image/png' })
      const url = URL.createObjectURL(file)
      madeUrls.current.push(url)
      // Decode before showing, so the reveal plays on the photo and not on an empty box.
      const preview = new Image()
      preview.src = url
      await preview.decode().catch(() => {})
      if (!unsaved && markInPhoto(tok.id)) setSaved(loadTokens())
      setStage({
        k: 'done',
        saved: tok,
        made: { file, url, width: made.width, height: made.height },
        unsaved,
      })
      card.current?.scrollIntoView({ block: 'start', behavior: scrollBehavior() })
    } catch (e) {
      setStage({
        k: 'error',
        ...failure(e),
        // The token is in History, or (if it couldn't be stored) shown right here.
        note: unsaved ? undefined : t('make.err.paid'),
        token: unsaved ? tok.token : undefined,
        retry: () =>
          setStage({
            k: 'needPhoto',
            saved: tok,
            unsaved,
            edge: size,
            why: 'put',
          }),
      })
    }
  }

  const finish = async (pending: PendingQuote, unsaved = false) => {
    setStage({ k: 'minting', amount: pending.amount })
    let token: string
    try {
      token = await mintToken(pending.mint, pending.amount, pending.quote)
    } catch (e) {
      // The quote stays saved, so a retry (or a reload) picks it up again.
      setStage({
        k: 'error',
        ...failure(e),
        note: unsaved ? t('invoice.unsaved') : t('make.err.paid'),
        retry: () => setStage({ k: 'invoice', pending, unsaved }),
      })
      return
    }
    const tok: SavedToken = {
      id: pending.quote,
      token,
      mint: pending.mint,
      amount: pending.amount,
      createdAt: Date.now(),
      photo: false,
    }
    const stored = addToken(tok) // saved before anything else happens to it
    clearPending()
    setSaved(stored ? loadTokens() : (list) => [tok, ...list])
    // The page may have reloaded while the invoice was paid (common on phones): get the photo back.
    let current = photoRef.current
    if (!current) {
      const kept = await loadPendingPhoto(pending.quote)
      if (kept) {
        try {
          current = await loadPhoto(kept)
          photoFile.current = kept
          setPhoto(current)
        } catch {
          current = null
        }
      }
    }
    void clearPendingPhoto()
    if (!current)
      setStage({
        k: 'needPhoto',
        saved: tok,
        unsaved: !stored,
        edge: pending.edge,
        why: 'lost',
      })
    else await embed(tok, current, pending.edge, !stored)
  }

  // Poll the invoice every 2 s while it's on screen (also after a reload).
  useEffect(() => {
    if (stage.k !== 'invoice') return
    const { pending, unsaved } = stage
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        const state = await invoiceState(pending.mint, pending.quote)
        if (stopped) return
        setOffline(false)
        if (state === 'PAID') {
          stopped = true
          void finish(pending, unsaved)
          return
        }
        if (state === 'ISSUED') {
          stopped = true
          clearPending()
          void clearPendingPhoto()
          setSaved(loadTokens())
          setStage({ k: 'issued' })
          return
        }
      } catch {
        if (!stopped) setOffline(true)
      }
      if (!stopped) timer = setTimeout(tick, 2000)
    }
    timer = setTimeout(tick, 1000)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [stage])

  const pay = async () => {
    if (!photo || !amount) return
    setStage({ k: 'quoting' })
    try {
      const inv = await createInvoice(mintUrl, amount)
      const pending: PendingQuote = {
        mint: mintUrl,
        amount,
        quote: inv.quote,
        request: inv.request,
        createdAt: Date.now(),
        edge,
      }
      const stored = savePending(pending) // before the invoice is shown
      if (photoFile.current) await savePendingPhoto(pending.quote, photoFile.current)
      setStage({ k: 'invoice', pending, unsaved: !stored })
    } catch (e) {
      setStage({
        k: 'error',
        ...failure(e),
        retry: () => setStage({ k: 'form' }),
      })
    }
  }

  const cancel = async (pending: PendingQuote) => {
    // Paid at the last second? Then finish instead of throwing the payment away.
    try {
      if ((await invoiceState(pending.mint, pending.quote)) === 'PAID') return void finish(pending, stage.k === 'invoice' && stage.unsaved)
    } catch {
      // can't tell: keep it simple and cancel
    }
    clearPending()
    void clearPendingPhoto()
    setStage({ k: 'form' })
  }

  const reset = () => {
    photoRef.current?.release()
    setPhoto(null)
    setStage({ k: 'form' })
  }

  usePasteImages((files) => void choosePhoto(files), active && (stage.k === 'form' || stage.k === 'needPhoto'))
  const dragging = useDropImages(
    (files) => void choosePhoto(files),
    active && (stage.k === 'form' || stage.k === 'needPhoto'),
  )

  // Two slots: the photo (left on wide screens) and the money side (right). Phones stack them.
  let photoSlot: ReactNode = null
  let photoAside = false // only useful beside the panel: skipped on phones so the invoice stays high
  let panel: ReactNode = null

  switch (stage.k) {
    case 'form':
    case 'quoting':
      photoSlot = (
        <PhotoPicker
          photo={photo}
          onFiles={choosePhoto}
          error={photoError ?? (tooSmall ? 'small' : null)}
          testId="make-photo-input"
        />
      )
      panel = (
        <>
          <div className="amount-field">
            <label className="tile-label" htmlFor="make-amount">
              {t('make.step.amount')}
            </label>
            {/* --chars lets the number shrink to fit the width instead of running under "sats". */}
            <div className="amount" style={{ '--chars': Math.max(5, amountText.length) } as CSSProperties}>
              {/* The hidden copy of the text gives the field its exact width, so "sats" sits right after it. */}
              <span className="amount-input">
                <span className="amount-sizer" aria-hidden="true">
                  {amountText || '0'}
                </span>
                <input
                  id="make-amount"
                  inputMode="numeric"
                  autoComplete="off"
                  value={amountText}
                  onChange={(e) => {
                    // Keep the big number readable while typing: 20000 → 20,000.
                    // NFKC turns full-width digits (１２３, from CJK keyboards) into plain ones.
                    const digits = e.target.value
                      .normalize('NFKC')
                      .replace(/\D/g, '')
                      .replace(/^0+(?=\d)/, '')
                      .slice(0, 9)
                    setAmountText(digits ? num(Number(digits)) : '')
                  }}
                  aria-invalid={amount === null}
                  aria-describedby={amount === null ? 'make-amount-error' : undefined}
                  data-testid="amount-input"
                />
              </span>
              <span className="amount-unit">sats</span>
            </div>
            {amountError && (
              <p className="field-error" id="make-amount-error">
                {amountError}
              </p>
            )}
            <div className="presets">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="preset"
                  aria-pressed={amount === p}
                  onClick={() => setAmountText(num(p))}
                >
                  {num(p)}
                </button>
              ))}
            </div>
          </div>

          <div className="pay-group">
            <div className="group">
              <label className="group-row">
                <span className="group-label">{t('make.size.label')}</span>
                <span className="select">
                  <select value={edge} onChange={(e) => setEdge(Number(e.target.value))}>
                    {EDGES.map((e) => (
                      <option key={e} value={e}>
                        {e === 2048 ? t('make.size.original') : t('sticker.px', { size: e })}
                      </option>
                    ))}
                  </select>
                  <ChevronIcon size={16} />
                </span>
              </label>
            </div>
            <button
              type="button"
              className={`btn btn--primary btn--xl btn--block${stage.k === 'quoting' ? ' is-busy' : ''}`}
              disabled={!photo || !amount || tooSmall || stage.k === 'quoting'}
              aria-busy={stage.k === 'quoting'}
              onClick={pay}
            >
              {stage.k === 'quoting' && <Buddies size={22} />}
              {stage.k === 'quoting'
                ? t('invoice.creating')
                : !photo
                  ? t('make.pay.needPhoto')
                  : t('make.pay', { amount: amount ? num(amount) : '–' })}
            </button>
            <p className="pay-note">{t('make.note')}</p>
          </div>
        </>
      )
      break
    case 'invoice':
      photoSlot = photo && <PhotoPreview url={photo.url} amount={stage.pending.amount} />
      photoAside = true
      panel = (
        <InvoiceView
          pending={stage.pending}
          offline={offline}
          unsaved={!!stage.unsaved}
          onCancel={() => void cancel(stage.pending)}
        />
      )
      break
    case 'minting':
    case 'embedding':
      photoSlot = photo && (
        <PhotoPreview url={photo.url} amount={stage.k === 'minting' ? stage.amount : stage.saved.amount} />
      )
      photoAside = true
      panel = (
        <div className="tile working">
          <Loading label={t('make.minting')} size={44} layout="column" />
        </div>
      )
      break
    case 'needPhoto':
      photoSlot = <PhotoPicker photo={null} onFiles={choosePhoto} error={photoError} testId="make-photo-input" />
      panel = (
        <div className="tile notice">
          <p className="notice-title">
            {stage.why === 'lost' ? t('make.needPhoto') : t('make.putPhoto', { amount: num(stage.saved.amount) })}
          </p>
          {stage.unsaved && <RawToken token={stage.saved.token} />}
        </div>
      )
      break
    case 'done':
      photoSlot = <DonePhoto stage={stage} />
      panel = <Done stage={stage} onAgain={reset} />
      break
    case 'issued':
      panel = (
        <div className="tile notice">
          <p className="notice-title">{t('invoice.issued')}</p>
          <button type="button" className="btn btn--primary btn--block" onClick={reset}>
            {t('make.done.again')}
          </button>
        </div>
      )
      break
    case 'error':
      photoSlot = photo && <PhotoPreview url={photo.url} />
      photoAside = true
      panel = (
        <div className="tile notice" role="alert">
          <div>
            <p className="notice-title notice-title--bad">{stage.message}</p>
            {stage.note && <p className="notice-note">{stage.note}</p>}
            {/* The mint's or browser's own words, kept for support; they are usually English. */}
            {stage.detail && (
              <p className="notice-detail" lang="en">
                {stage.detail}
              </p>
            )}
          </div>
          {stage.token && <RawToken token={stage.token} />}
          <div className="btn-row">
            {stage.retry && (
              <button type="button" className="btn btn--primary" onClick={stage.retry}>
                {t('make.retry')}
              </button>
            )}
            <button type="button" className="btn btn--quiet" onClick={reset}>
              {t('invoice.cancel')}
            </button>
          </div>
        </div>
      )
      break
  }

  return (
    <>
      {active && <DropOverlay show={dragging} label={t('drop.overlay')} />}
      <div className={`make-grid${photoSlot ? '' : ' make-grid--solo'}`} ref={card}>
        {head}
        {photoSlot && <div className={`make-photo${photoAside ? ' make-photo--aside' : ''}`}>{photoSlot}</div>}
        <div className="make-panel">{panel}</div>
        <SavedList
          tokens={saved}
          onPut={(tok) => {
            setStage({
              k: 'needPhoto',
              saved: tok,
              unsaved: false,
              edge,
              why: 'put',
            })
            card.current?.scrollIntoView({
              block: 'start',
              behavior: scrollBehavior(),
            })
          }}
          onDelete={(id) => {
            deleteToken(id)
            setSaved(loadTokens())
          }}
        />
      </div>
    </>
  )
}

/** The photo being paid for, with the amount it will hold. */
function PhotoPreview({ url, amount }: { url: string; amount?: number }) {
  const { t, num } = useI18n()
  return (
    <div className="make-preview">
      <img src={url} alt="" />
      {amount !== undefined && <span className="done-badge">{t('make.inside', { amount: num(amount) })}</span>}
    </div>
  )
}

function DonePhoto({ stage }: { stage: Extract<Stage, { k: 'done' }> }) {
  const { t, num } = useI18n()
  return (
    <div className="done-photo">
      <img src={stage.made.url} alt="" />
      <span className="done-badge">{t('make.inside', { amount: num(stage.saved.amount) })}</span>
    </div>
  )
}

function PhotoPicker({
  photo,
  onFiles,
  error,
  testId,
}: {
  photo: LoadedPhoto | null
  onFiles: (files: File[]) => void
  error: 'unreadable' | 'small' | null
  testId: string
}) {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  return (
    <div>
      <button type="button" className={`picker${photo ? ' picker--has' : ''}`} onClick={() => input.current?.click()}>
        {photo ? (
          <>
            <img src={photo.url} alt="" />
            <span className="picker-change">{t('make.photo.change')}</span>
          </>
        ) : (
          <>
            <PhotoIcon size={30} className="picker-icon" />
            <span className="picker-title">{t('make.step.photo')}</span>
            <span className="picker-hint">{t('make.photo.dropHint')}</span>
          </>
        )}
      </button>
      {error && (
        <p className="field-error" role="alert">
          {t(error === 'small' ? 'make.photo.tooSmall' : 'pick.unreadable')}
        </p>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        data-testid={testId}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length) onFiles(files)
        }}
      />
    </div>
  )
}

function InvoiceView({
  pending,
  offline,
  unsaved,
  onCancel,
}: {
  pending: PendingQuote
  offline: boolean
  unsaved: boolean
  onCancel: () => void
}) {
  const { t, num } = useI18n()
  const [qr, setQr] = useState<string | null>(null)
  const [copied, flash] = useFlash()
  useEffect(() => {
    let live = true
    QRCode.toDataURL(pending.request.toUpperCase(), {
      margin: 0,
      width: 560,
      errorCorrectionLevel: 'M',
    })
      .then((url) => live && setQr(url))
      .catch(() => live && setQr(null))
    return () => {
      live = false
    }
  }, [pending.request])
  return (
    <div className="tile invoice" data-testid="invoice">
      <p className="invoice-title">{t('invoice.title')}</p>
      <p className="invoice-amount" style={{ '--chars': num(pending.amount).length } as CSSProperties}>
        {num(pending.amount)} <span>{satsUnit(pending.amount)}</span>
      </p>
      {isTestMint(pending.mint) && <p className="invoice-note">{t('token.testMint')}</p>}
      {unsaved && (
        <p className="invoice-warn" role="alert">
          {t('invoice.unsaved')}
        </p>
      )}
      {/* The code takes a few milliseconds to draw: an empty square of the same size, no loader. */}
      <a className="qr" href={`lightning:${pending.request}`} aria-label={t('invoice.open')}>
        {qr && <img src={qr} alt="" />}
      </a>
      <Loading className="waiting" label={offline ? t('invoice.offline') : t('invoice.waiting')} size={20} />
      <div className="stack">
        <div className="invoice-buttons">
          <a className="btn btn--primary" href={`lightning:${pending.request}`}>
            {t('invoice.open')}
          </a>
          <button
            type="button"
            className="btn btn--quiet"
            onClick={async () =>
              flash((await copyText(pending.request)) ? t('action.copied') : t('action.copyFailedShort'))
            }
          >
            {copied === t('action.copied') ? <CheckIcon size={18} className="flash-in" /> : <CopyIcon size={18} />}
            <FlashLabel flash={copied}>{t('invoice.copy')}</FlashLabel>
          </button>
        </div>
        <button type="button" className="btn btn--text" onClick={onCancel}>
          {t('invoice.cancel')}
        </button>
      </div>
    </div>
  )
}

function Done({ stage, onAgain }: { stage: Extract<Stage, { k: 'done' }>; onAgain: () => void }) {
  const { t, num, bytes } = useI18n()
  const [flash, setFlash] = useFlash()
  const { made, saved, unsaved } = stage
  const share = canShareFiles(made.file)
  return (
    <div className="done" data-testid="made-photo">
      <div className="done-card">
        <p className="done-title">{t('make.done.title', { amount: num(saved.amount) })}</p>
        <p className="done-facts">
          <span>PNG</span>,{' '}
          <span>
            {made.width}×{made.height}
          </span>
          , <span>{bytes(made.file.size)}</span>
        </p>
        <div className="stack">
          <button
            type="button"
            className="btn btn--primary btn--xl btn--block"
            onClick={() => downloadBlob(made.file, made.file.name)}
          >
            <DownloadIcon size={20} />
            {t('action.download')}
          </button>
          {(share || canCopyImage()) && (
            <div className="btn-row">
              {share && (
                <button
                  type="button"
                  className="btn btn--quiet"
                  onClick={() => void shareFile(made.file, t('share.text', { url: redeemUrl() }))}
                >
                  <ShareIcon size={18} />
                  {t('action.share')}
                </button>
              )}
              {canCopyImage() && (
                <button
                  type="button"
                  className="btn btn--quiet"
                  onClick={async () =>
                    setFlash((await copyPng(made.file)) ? t('action.copied') : t('action.copyFailed'))
                  }
                >
                  {flash === t('action.copied') ? <CheckIcon size={18} className="flash-in" /> : <CopyIcon size={18} />}
                  <FlashLabel flash={flash}>{t('action.copyImage')}</FlashLabel>
                </button>
              )}
            </div>
          )}
        </div>
        <p className="done-tip">{t('make.done.tip')}</p>
        {unsaved && <RawToken token={saved.token} />}
      </div>
      <button type="button" className="btn btn--text done-again" onClick={onAgain}>
        {t('make.done.again')}
      </button>
    </div>
  )
}

function RawToken({ token }: { token: string }) {
  const { t } = useI18n()
  const [copied, flash] = useFlash()
  return (
    <div className="raw-token" role="alert">
      <p>{t('make.storageFailed')}</p>
      <textarea readOnly value={token} rows={3} onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn btn--primary btn--block"
        onClick={async () => flash((await copyText(token)) ? t('action.copied') : t('token.copyFailed'))}
      >
        <FlashLabel flash={copied}>{t('token.copy')}</FlashLabel>
      </button>
    </div>
  )
}

function SavedList({
  tokens,
  onPut,
  onDelete,
}: {
  tokens: SavedToken[]
  onPut: (t: SavedToken) => void
  onDelete: (id: string) => void
}) {
  const { t } = useI18n()
  if (!tokens.length) return null
  return (
    <details className="saved">
      <summary className="saved-summary">
        <span className="saved-title">{t('saved.title')}</span>
        <span className="saved-count">{tokens.length}</span>
        <ChevronIcon size={18} className="saved-chevron" />
      </summary>
      <ul className="group">
        {tokens.map((tok) => (
          <SavedItem key={tok.id} tok={tok} onPut={() => onPut(tok)} onDelete={() => onDelete(tok.id)} />
        ))}
      </ul>
      <p className="group-caption">{t('saved.hint')}</p>
    </details>
  )
}

/**
 * One sent photo. The row answers "has my friend claimed it?"; actions appear only where they can
 * still do something: recover unclaimed bitcoin, or clear a claimed row away. "Put in a photo" is
 * only for bitcoin that never made it into one (the page closed, or making the photo failed).
 */
function SavedItem({ tok, onPut, onDelete }: { tok: SavedToken; onPut: () => void; onDelete: () => void }) {
  const { t, num, lang } = useI18n()
  const [claim, setClaim] = useState<ClaimState | 'checking' | 'unknown'>('checking')
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    let live = true
    checkClaimState(tok.token)
      .then((s) => live && setClaim(s))
      .catch(() => live && setClaim('unknown'))
    return () => {
      live = false
    }
  }, [tok.token])

  const date = new Date(tok.createdAt)
  const when = new Intl.DateTimeFormat(lang, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(date.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }),
  }).format(date)
  const claimed = claim === 'spent'
  const recoverable = claim === 'unspent' || claim === 'unknown'
  // Deleting unclaimed bitcoin loses it, so that asks first; a claimed row just goes.
  const remove = () => (claimed || armed ? onDelete() : setArmed(true))

  return (
    <li className={`saved-item saved-item--${claim}`}>
      <div className="saved-row">
        <div className="saved-main">
          <strong>
            {num(tok.amount)} <span>sats</span>
          </strong>
          <p className="saved-meta">
            {when}
            {isTestMint(tok.mint) && ` (${t('make.mint.test')})`}
          </p>
        </div>
        <span className={`status status--${claim}`}>{t(`saved.${claim}`)}</span>
        {claimed && (
          <button type="button" className="saved-trash" aria-label={t('saved.delete')} onClick={remove}>
            <TrashIcon size={18} />
          </button>
        )}
      </div>
      {recoverable && (
        <div className="saved-actions">
          {armed ? (
            // While a delete is armed, the row says what will happen and nothing else competes.
            <p className="saved-warn" role="alert">
              {t('saved.deleteConfirm')}
            </p>
          ) : (
            <>
              {tok.photo === false && (
                <button type="button" className="btn btn--white btn--sm" onClick={onPut}>
                  {t('saved.put')}
                </button>
              )}
              <a className="btn btn--white btn--sm" href={claimLink(tok.token)} target="_blank" rel="noopener noreferrer">
                {t('saved.takeBack')}
              </a>
            </>
          )}
          <button
            type="button"
            className={`saved-trash${armed ? ' is-armed' : ''}`}
            aria-label={t('saved.delete')}
            onClick={remove}
            onBlur={() => setArmed(false)}
          >
            <TrashIcon size={18} />
            {armed && <span>{t('saved.delete')}</span>}
          </button>
        </div>
      )}
    </li>
  )
}
