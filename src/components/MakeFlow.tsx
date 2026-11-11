import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import { zatsUnit, useI18n } from '../i18n'
import { scrollBehavior, useDropImages, useFlash, usePasteImages } from '../hooks'
import { fitSize, loadPhoto, photoToPixels, type LoadedPhoto } from '../photo'
import { capacityBytes } from '../stego'
import { makeStickerInWorker } from '../workerClient'
import {
  accountState,
  accountTransactions,
  claimStateOf,
  newSecret,
  shortAddress as short,
  wordsOf,
  zatsToZnn,
  zenonErrorKind,
  type AccountState,
  type SweepResult,
} from '../zenon'
import { redeemUrl } from '../nav'
import {
  clearPendingPhoto, deleteMadePhoto, hasMadePhoto, loadMadePhoto, loadPendingPhoto,
  saveMadePhoto, savePendingPhoto, type SavedPhoto,
} from '../photoStore'
import {
  addToken,
  clearPending,
  deleteToken,
  loadPending,
  loadTokens,
  markInPhoto,
  savePending,
  recordTransactions,
  subscribeTokens,
  type PendingDeposit,
  type SavedToken,
} from '../wallet'
import { canCopyImage, canShareFiles, copyPng, copyText, downloadBlob, shareFile } from '../actions'
import { DropOverlay } from './Composer'
import { Buddies, Loading } from './Buddies'
import { CheckIcon, ChevronIcon, CopyIcon, DownloadIcon, PhotoIcon, ShareIcon, TrashIcon } from './Icons'
import { FlashLabel } from './Flash'
import { SweepForm } from './SweepForm'
import { DEMO, demoFund } from '../demo'
import { MAX_AMOUNT, parseZats } from '../amount'
import { SyriusFunding } from './SyriusFunding'
import { transactionHashes } from '../explorer'
import { TransactionLinks } from './TransactionLinks'

/**
 * Make: photo → amount → a fresh Zenon address → the sender sends ZNN there → photo with zats inside.
 * The secret is saved to History before its address is shown when browser storage is available.
 * Failed saves require an offline recovery backup before funding; browser storage can be lost.
 */

type Made = { file: File; url: string; width: number; height: number }

type Stage =
  | { k: 'form' }
  | { k: 'creating' }
  /** `unsaved`: the secret couldn't be stored, so a reload would lose it. */
  | { k: 'deposit'; pending: PendingDeposit; unsaved?: boolean }
  /** 'lost': funded, but the page reloaded and the photo couldn't be recovered. 'put': from History. */
  | {
      k: 'needPhoto'
      saved: SavedToken
      unsaved: boolean
      edge: number
      why: 'lost' | 'put'
    }
  | { k: 'embedding'; saved: SavedToken }
  | { k: 'done'; saved: SavedToken; made: Made; unsaved: boolean; photoSaved: boolean; fromHistory?: boolean }
  /** `token`: a secret that isn't stored anywhere yet, shown so it can't be lost by tapping Cancel. */
  | { k: 'error'; message: string; detail?: string; note?: string; token?: string; retry?: () => void }

const EDGES = [2048, 1280, 640]
/** 0.1, 0.5, 1 and 5 ZNN. */
const PRESETS = [10_000_000, 50_000_000, 100_000_000, 500_000_000]
/** Room a photo needs for the secret (69 bytes) and its frame, with margin. */
const MIN_ROOM = 128
const POLL_MS = 3000

/** Bytes of hidden data the photo can carry once resized to `edge`. */
function room(photo: LoadedPhoto, edge: number): number {
  const { width, height } = fitSize(photo.width, photo.height, edge)
  return capacityBytes(width, height)
}

/** `head` is the section heading; it sits in the grid beside the photo on wide screens. */
export function MakeFlow({ active, head, historyHost, historyActive }: {
  active: boolean
  head: ReactNode
  historyHost: HTMLElement | null
  historyActive: boolean
}) {
  const { t, num } = useI18n()
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null)
  /** Why the last photo chosen was turned away. */
  const [photoError, setPhotoError] = useState<'unreadable' | 'small' | null>(null)
  const [amountText, setAmountText] = useState(() => num(100_000_000))
  const [edge, setEdge] = useState(2048)
  const [stage, setStage] = useState<Stage>(() => {
    const pending = loadPending()
    return pending ? { k: 'deposit', pending } : { k: 'form' }
  })
  const [offline, setOffline] = useState(false)
  const [saved, setSaved] = useState<SavedToken[]>(loadTokens)
  const [photoStorageFailed, setPhotoStorageFailed] = useState(false)
  const [historyPhoto, setHistoryPhoto] = useState<{ saved: SavedToken; photo: SavedPhoto } | null>(null)
  const photoRef = useRef(photo)
  photoRef.current = photo
  /** The file behind `photo`, kept so it can be stored while the deposit arrives. */
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

  useEffect(() => subscribeTokens(() => setSaved(loadTokens())), [])

  const pendingAddress = stage.k === 'deposit' ? stage.pending.address : null
  useEffect(() => {
    if (!pendingAddress || photoRef.current) return
    let stopped = false
    void loadPendingPhoto(pendingAddress).then(async (kept) => {
      if (stopped) return
      if (!kept) { setPhotoStorageFailed(true); return }
      try {
        const restored = await loadPhoto(kept)
        if (stopped || photoRef.current) { restored.release(); return }
        photoRef.current = restored
        photoFile.current = kept
        setPhoto(restored)
        setPhotoStorageFailed(false)
      } catch {
        if (!stopped) setPhotoStorageFailed(true)
      }
    })
    return () => { stopped = true }
  }, [pendingAddress])

  const parsedAmount = parseZats(amountText)
  const amount = parsedAmount.value
  const amountError = parsedAmount.error === null
    ? null
    : t(`make.amount.${parsedAmount.error}`, { max: num(MAX_AMOUNT) })
  const tooSmall = photo !== null && room(photo, edge) < MIN_ROOM

  /** A failure as words for this person: specific where we can tell what happened. */
  const failure = (e: unknown): { message: string; detail?: string } => {
    if (e instanceof Error && /too small/i.test(e.message)) return { message: t('make.photo.tooSmall') }
    if (zenonErrorKind(e) === 'offline') return { message: t('make.err.offline') }
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
    if (stage.k === 'needPhoto' && room(next, stage.edge) < MIN_ROOM) {
      next.release()
      setPhotoError('small')
      return
    }
    photoRef.current?.release()
    photoRef.current = next
    setPhoto(next)
    photoFile.current = file
    setPhotoError(null)
    if (stage.k === 'needPhoto') {
      await savePendingPhoto(stage.saved.id, file)
      void embed(stage.saved, next, stage.edge, stage.unsaved)
    }
  }

  const embed = async (tok: SavedToken, from: LoadedPhoto, size: number, unsaved: boolean) => {
    setStage({ k: 'embedding', saved: tok })
    try {
      const pixels = photoToPixels(from, size)
      const made = await makeStickerInWorker(pixels, tok.token)
      const file = new File([made.png as BlobPart], `zats-${tok.amount}.png`, { type: 'image/png' })
      const photoSaved = await saveMadePhoto(tok.id, { photo: file, width: made.width, height: made.height, amount: tok.amount, origin: 'created' })
      const url = URL.createObjectURL(file)
      madeUrls.current.push(url)
      // Decode before showing, so the reveal plays on the photo and not on an empty box.
      const preview = new Image()
      preview.src = url
      await preview.decode().catch(() => {})
      if (photoSaved) {
        const marked = !unsaved && markInPhoto(tok.id)
        setSaved((list) => marked ? loadTokens() : list.map((x) => x.id === tok.id ? { ...x } : x))
        // Keep the deposit and source until the finished PNG's transaction has committed.
        if (loadPending()?.address === tok.id) clearPending()
        await clearPendingPhoto(tok.id)
      }
      setStage({
        k: 'done',
        saved: tok,
        made: { file, url, width: made.width, height: made.height },
        unsaved,
        photoSaved,
      })
      card.current?.scrollIntoView({ block: 'start', behavior: scrollBehavior() })
    } catch (e) {
      setStage({
        k: 'error',
        ...failure(e),
        // The secret is in History, or (if it couldn't be stored) shown right here.
        note: unsaved ? undefined : t('make.err.paid'),
        token: unsaved ? tok.token : undefined,
        retry: () => setStage({ k: 'needPhoto', saved: tok, unsaved, edge: size, why: 'put' }),
      })
    }
  }

  /** ZNN arrived at the deposit address: record how much, then hide the secret in the photo. */
  const finish = async (pending: PendingDeposit, state: AccountState, unsaved = false) => {
    const tok: SavedToken = {
      id: pending.address,
      token: pending.token,
      amount: Number(state.zats),
      createdAt: pending.createdAt,
      photo: false,
      transactions: state.incomingTransactions,
    }
    const ok = addToken(tok)
    // In the demo nothing real can be lost, so a page without storage doesn't warn about it.
    const stored = ok || DEMO
    setSaved(ok ? loadTokens() : (list) => [tok, ...list.filter((x) => x.id !== tok.id)])
    // The page may have reloaded while waiting (common on phones): get the photo back.
    let current = photoRef.current
    if (!current) {
      const kept = await loadPendingPhoto(pending.address)
      if (kept) {
        try {
          const restored = await loadPhoto(kept)
          // The deposit preview may have restored the same image while this read was in flight.
          if (photoRef.current) { restored.release(); current = photoRef.current }
          else { current = restored; photoRef.current = restored }
          photoFile.current = kept
          setPhoto(current)
        } catch {
          current = null
        }
      }
    }
    if (!current) setStage({ k: 'needPhoto', saved: tok, unsaved: unsaved || !stored, edge: pending.edge, why: 'lost' })
    else await embed(tok, current, pending.edge, unsaved || !stored)
  }

  // Watch the deposit address every few seconds while it's on screen (also after a reload).
  useEffect(() => {
    if (stage.k !== 'deposit') return
    const { pending, unsaved } = stage
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        const state = await accountState(pending.address)
        if (stopped) return
        setOffline(false)
        // ZNN is what the photo is for; QSR alone (or airdrop spam, which is ignored) doesn't count.
        if (state.zats > 0n) {
          stopped = true
          void finish(pending, state, unsaved)
          return
        }
      } catch {
        if (!stopped) setOffline(true)
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS)
    }
    timer = setTimeout(tick, 500)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [stage])

  const start = async () => {
    if (!photo || !amount) return
    setStage({ k: 'creating' })
    try {
      const { token, address } = await newSecret()
      const createdAt = Date.now()
      // Save recovery material before showing the deposit address, if storage is available.
      const ok = addToken({ id: address, token, amount: 0, createdAt, photo: false })
      if (ok) setSaved(loadTokens())
      const stored = ok || DEMO
      const pending: PendingDeposit = { token, address, amount, createdAt, edge }
      savePending(pending)
      const photoSaved = photoFile.current ? await savePendingPhoto(address, photoFile.current) : false
      setPhotoStorageFailed(!photoSaved)
      setStage({ k: 'deposit', pending, unsaved: !stored })
    } catch (e) {
      setStage({ k: 'error', ...failure(e), retry: () => setStage({ k: 'form' }) })
    }
  }

  const cancel = async (pending: PendingDeposit, unsaved: boolean) => {
    // Arrived at the last second? Then finish instead of walking away from it.
    try {
      const state = await accountState(pending.address)
      if (state.zats > 0n) return void finish(pending, state, unsaved)
    } catch {
      // can't tell: the secret stays in History either way
    }
    clearPending()
    // Retain the source with this History entry: a transfer can arrive after cancellation.
    setStage({ k: 'form' })
  }

  const reset = () => {
    photoRef.current?.release()
    photoRef.current = null
    photoFile.current = null
    setPhoto(null)
    setStage({ k: 'form' })
  }

  const putSavedPhoto = async (tok: SavedToken, amount: number) => {
    if (stage.k === 'deposit' || stage.k === 'creating' || stage.k === 'embedding') return
    const funded = { ...tok, amount }
    const unsaved = !DEMO && !loadTokens().some((x) => x.id === tok.id && x.token === tok.token)
    setStage({ k: 'embedding', saved: funded })
    const kept = await loadPendingPhoto(tok.id)
    if (kept) {
      try {
        const restored = await loadPhoto(kept)
        photoRef.current?.release()
        photoRef.current = restored
        photoFile.current = kept
        setPhoto(restored)
        await embed(funded, restored, edge, unsaved)
        return
      } catch {
        // The source is unavailable; the secret can still be embedded in a new photo.
      }
    }
    setStage({ k: 'needPhoto', saved: funded, unsaved, edge, why: 'put' })
    card.current?.scrollIntoView({ block: 'start', behavior: scrollBehavior() })
  }

  usePasteImages((files) => void choosePhoto(files), active && (stage.k === 'form' || stage.k === 'needPhoto'))
  const dragging = useDropImages(
    (files) => void choosePhoto(files),
    active && (stage.k === 'form' || stage.k === 'needPhoto'),
  )

  // Two slots: the photo (left on wide screens) and the money side (right). Phones stack them.
  let photoSlot: ReactNode = null
  let photoAside = false
  let panel: ReactNode = null

  switch (stage.k) {
    case 'form':
    case 'creating':
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
            {/* --chars lets the number shrink to fit the width instead of running under "zats". */}
            <div className="amount" style={{ '--chars': Math.max(5, amountText.length) } as CSSProperties}>
              <span className="amount-input">
                <span className="amount-sizer" aria-hidden="true">
                  {amountText || '0'}
                </span>
                <input
                  id="make-amount"
                  inputMode="numeric"
                  autoComplete="off"
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value.normalize('NFKC'))}
                  onBlur={() => {
                    if (amount !== null) setAmountText(num(amount))
                  }}
                  aria-invalid={amount === null}
                  aria-describedby={amount === null ? 'make-amount-error' : 'make-amount-znn'}
                  data-testid="amount-input"
                />
              </span>
              <span className="amount-unit">zats</span>
            </div>
            {amountError ? (
              <p className="field-error" id="make-amount-error" role="status">
                {amountError}
              </p>
            ) : (
              <p className="pay-note" id="make-amount-znn">
                {t('make.amount.znn', { znn: zatsToZnn(amount ?? 0) })}
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
                  {zatsToZnn(p)} ZNN
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
              className={`btn btn--primary btn--xl btn--block${stage.k === 'creating' ? ' is-busy' : ''}`}
              disabled={!photo || !amount || tooSmall || stage.k === 'creating'}
              aria-busy={stage.k === 'creating'}
              onClick={start}
            >
              {stage.k === 'creating' && <Buddies size={22} />}
              {stage.k === 'creating'
                ? t('deposit.creating')
                : !photo
                  ? t('make.pay.needPhoto')
                  : t('make.pay', { amount: amount ? num(amount) : '–' })}
            </button>
            <p className="pay-note">{t('make.note')}</p>
          </div>
        </>
      )
      break
    case 'deposit':
      photoSlot = photo && <PhotoPreview url={photo.url} amount={stage.pending.amount} />
      photoAside = true
      panel = (
        <DepositView
          pending={stage.pending}
          offline={offline}
          unsaved={!!stage.unsaved}
          photoStorageFailed={photoStorageFailed}
          onCancel={() => void cancel(stage.pending, !!stage.unsaved)}
        />
      )
      break
    case 'embedding':
      photoSlot = photo && <PhotoPreview url={photo.url} amount={stage.saved.amount} />
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
          {stage.unsaved && <RawWords token={stage.saved.token} />}
        </div>
      )
      break
    case 'done':
      photoSlot = <DonePhoto stage={stage} />
      panel = <Done stage={stage} onAgain={reset} />
      break
    case 'error':
      photoSlot = photo && <PhotoPreview url={photo.url} />
      photoAside = true
      panel = (
        <div className="tile notice" role="alert">
          <div>
            <p className="notice-title notice-title--bad">{stage.message}</p>
            {stage.note && <p className="notice-note">{stage.note}</p>}
            {stage.detail && (
              <p className="notice-detail" lang="en">
                {stage.detail}
              </p>
            )}
          </div>
          {stage.token && <RawWords token={stage.token} />}
          <div className="btn-row">
            {stage.retry && (
              <button type="button" className="btn btn--primary" onClick={stage.retry}>
                {t('make.retry')}
              </button>
            )}
            <button type="button" className="btn btn--quiet" onClick={reset}>
              {t('deposit.cancel')}
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
      </div>
      {historyHost && createPortal(<>
        {historyPhoto && <SavedPhotoDialog value={historyPhoto} onClose={() => setHistoryPhoto(null)} />}
        <SavedList
          active={historyActive}
          tokens={saved}
          canPut={stage.k !== 'deposit' && stage.k !== 'creating' && stage.k !== 'embedding'}
          onPut={(tok, amount) => {
            location.hash = '#hide'
            void putSavedPhoto(tok, amount)
          }}
          onView={async (tok) => {
            const photo = await loadMadePhoto(tok.id)
            if (!photo) return false
            setHistoryPhoto({ saved: { ...tok, amount: photo.amount }, photo })
            return true
          }}
          onDelete={(id) => {
            if (deleteToken(id)) {
              setSaved(loadTokens())
              void deleteMadePhoto(id)
              void clearPendingPhoto(id)
            }
          }}
        />
      </>, historyHost)}
    </>
  )
}

/** The photo being funded, with the amount it will hold. */
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
      {!(stage.fromHistory && stage.saved.origin === 'opened') && (
        <span className="done-badge">{t(stage.fromHistory ? 'saved.photo.amount' : 'make.inside', { amount: num(stage.saved.amount) })}</span>
      )}
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

function DepositView({
  pending,
  offline,
  unsaved,
  photoStorageFailed,
  onCancel,
}: {
  pending: PendingDeposit
  offline: boolean
  unsaved: boolean
  photoStorageFailed: boolean
  onCancel: () => void
}) {
  const { t, num } = useI18n()
  const [qr, setQr] = useState<string | null>(null)
  const [copied, flash] = useFlash()
  const [backupCopied, flashBackup] = useFlash()
  const [walletBusy, setWalletBusy] = useState(false)
  useEffect(() => {
    let live = true
    QRCode.toDataURL(pending.address, { margin: 0, width: 560, errorCorrectionLevel: 'M' })
      .then((url) => live && setQr(url))
      .catch(() => live && setQr(null))
    return () => {
      live = false
    }
  }, [pending.address])
  return (
    <div className="tile invoice" data-testid="deposit">
      <p className="invoice-title">{t('deposit.title', { znn: zatsToZnn(pending.amount) })}</p>
      <p className="invoice-amount" style={{ '--chars': num(pending.amount).length } as CSSProperties}>
        {num(pending.amount)} <span>{zatsUnit(pending.amount)}</span>
      </p>
      {unsaved && (
        <p className="invoice-warn" role="alert">
          {t('deposit.unsaved')}
        </p>
      )}
      {unsaved && <RawWords token={pending.token} />}
      {photoStorageFailed && <p className="invoice-warn" role="alert">{t('deposit.photoUnsaved')}</p>}
      <div className="qr" aria-label={pending.address}>
        {qr && <img src={qr} alt="" />}
      </div>
      <p className="deposit-address" data-testid="deposit-address">
        {pending.address}
      </p>
      <Loading className="waiting" label={offline ? t('deposit.offline') : t('deposit.waiting')} size={20} />
      <div className="stack">
        {DEMO && (
          <button
            type="button"
            className="btn btn--primary btn--xl btn--block"
            data-testid="demo-send"
            onClick={() => demoFund(pending.address, pending.amount)}
          >
            {t('demo.send', { znn: zatsToZnn(pending.amount) })}
          </button>
        )}
        <div className="invoice-buttons invoice-buttons--one">
          <button
            type="button"
            className={DEMO ? 'btn btn--quiet' : 'btn btn--primary'}
            data-testid="deposit-copy-address"
            onClick={async () => flash((await copyText(pending.address)) ? t('action.copied') : t('action.copyFailedShort'))}
          >
            {copied === t('action.copied') ? <CheckIcon size={18} className="flash-in" /> : <CopyIcon size={18} />}
            <FlashLabel flash={copied}>{t('deposit.copy')}</FlashLabel>
          </button>
          {!DEMO && !unsaved && (
            <button
              type="button"
              className="btn btn--quiet"
              data-testid="deposit-copy-words"
              onClick={async () => {
                const words = await wordsOf(pending.token).catch(() => null)
                flashBackup(words && (await copyText(words)) ? t('action.copied') : t('action.copyFailedShort'))
              }}
            >
              <FlashLabel flash={backupCopied}>{t('claim.copy')}</FlashLabel>
            </button>
          )}
        </div>
        {!DEMO && !unsaved && <p className="invoice-note">{t('deposit.backupHint')}</p>}
        {!DEMO && <SyriusFunding key={pending.address} address={pending.address} amount={pending.amount} token={pending.token} onBusy={setWalletBusy} />}
        <p className="invoice-note">{t(DEMO ? 'demo.hint' : 'deposit.hint')}</p>
        <button type="button" className="btn btn--text" data-testid="deposit-cancel" disabled={walletBusy} onClick={onCancel}>
          {t('deposit.cancel')}
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
        <p className="done-title">{t(stage.fromHistory ? 'saved.photo.title' : 'make.done.title', { amount: num(saved.amount) })}</p>
        {stage.fromHistory && <p className="pay-note">{t(saved.origin === 'opened' ? 'saved.photo.importedInfo' : 'saved.photo.info')}</p>}
        {!stage.photoSaved && <p className="invoice-warn" role="alert" data-testid="photo-save-warning">{t('make.photoUnsaved')}</p>}
        <p className="done-facts">
          <span>PNG</span>,{' '}
          <span>
            {made.width}×{made.height}
          </span>
          , <span>{bytes(made.file.size)}</span>
        </p>
        <div className="stack">
          {DEMO ? (
            <button
              type="button"
              className="btn btn--primary btn--xl btn--block"
              data-testid="demo-open"
              onClick={() => {
                if (stage.fromHistory) onAgain()
                location.hash = '#redeem'
                // After the page switch, so Redeem is showing when the photo opens.
                setTimeout(() => window.dispatchEvent(new CustomEvent('zats:open', { detail: made.file })), 50)
              }}
            >
              {t('demo.open')}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary btn--xl btn--block"
              onClick={() => downloadBlob(made.file, made.file.name)}
            >
              <DownloadIcon size={20} />
              {t('action.download')}
            </button>
          )}
          {!DEMO && (share || canCopyImage()) && (
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
        <p className="done-tip">{t(DEMO ? 'demo.tip' : 'make.done.tip')}</p>
        {unsaved && <RawWords token={saved.token} />}
      </div>
      <button type="button" className="btn btn--text done-again" onClick={onAgain}>
        {t(stage.fromHistory ? 'saved.photo.close' : 'make.done.again')}
      </button>
    </div>
  )
}

/** Viewing an archived PNG must not replace or stop a deposit in progress. */
function SavedPhotoDialog({ value, onClose }: {
  value: { saved: SavedToken; photo: SavedPhoto }
  onClose: () => void
}) {
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const [made, setMade] = useState<Made | null>(null)
  useEffect(() => {
    const file = new File([value.photo.photo], value.photo.origin === 'opened' ? 'zats-photo.png' : `zats-${value.photo.amount}.png`, { type: 'image/png' })
    const url = URL.createObjectURL(file)
    setMade({ file, url, width: value.photo.width, height: value.photo.height })
    const element = dialog.current
    element?.showModal()
    return () => { element?.close(); URL.revokeObjectURL(url) }
  }, [value])
  const stage: Extract<Stage, { k: 'done' }> | null = made && {
    k: 'done', saved: { ...value.saved, origin: value.photo.origin ?? 'created' }, made, unsaved: false, photoSaved: true, fromHistory: true,
  }
  return (
    <dialog ref={dialog} className="history-photo" aria-label={t('saved.photo.title')} onClose={onClose} data-testid="history-photo">
      {stage && <><DonePhoto stage={stage} /><Done stage={stage} onAgain={onClose} /></>}
    </dialog>
  )
}

/** The 24 recovery words of a secret that couldn't be stored: the only copy, so it must be kept. */
function RawWords({ token }: { token: string }) {
  const { t } = useI18n()
  const [copied, flash] = useFlash()
  const [words, setWords] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    wordsOf(token)
      .then((w) => live && setWords(w))
      .catch(() => live && setWords(token))
    return () => {
      live = false
    }
  }, [token])
  return (
    <div className="raw-token" role="alert">
      <p>{t('make.storageFailed')}</p>
      <textarea readOnly value={words ?? ''} rows={3} onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn btn--primary btn--block"
        onClick={async () => flash(words && (await copyText(words)) ? t('action.copied') : t('token.copyFailed'))}
      >
        <FlashLabel flash={copied}>{t('token.copy')}</FlashLabel>
      </button>
    </div>
  )
}

function SavedList({
  active,
  tokens,
  canPut,
  onPut,
  onView,
  onDelete,
}: {
  active: boolean
  tokens: SavedToken[]
  canPut: boolean
  onPut: (t: SavedToken, amount: number) => void
  onView: (t: SavedToken) => Promise<boolean>
  onDelete: (id: string) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden')
  const [round, setRound] = useState(0)
  useEffect(() => { if (!tokens.length) setOpen(false) }, [tokens.length])
  useEffect(() => {
    const refresh = () => {
      const shown = document.visibilityState !== 'hidden'
      setVisible(shown)
      if (shown) setRound((n) => n + 1)
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [])
  if (!tokens.length) return null
  return (
    <details className="saved" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="saved-summary">
        <span className="saved-title">{t('saved.title')}</span>
        <span className="saved-count">{tokens.length}</span>
        <ChevronIcon size={18} className="saved-chevron" />
      </summary>
      <ul className="group">
        {tokens.map((tok) => (
          <SavedItem
            key={tok.id}
            tok={tok}
            round={round}
            live={active && open && visible}
            canPut={canPut}
            onPut={(amount) => onPut(tok, amount)}
            onView={() => onView(tok)}
            onDelete={() => onDelete(tok.id)}
          />
        ))}
      </ul>
      <p className="group-caption">{t('saved.hint')}</p>
    </details>
  )
}

type SavedStatus = 'checking' | 'unspent' | 'pending' | 'spent' | 'empty' | 'unknown'

/**
 * One secret made on this device. The row answers "has my friend claimed it?" from the chain;
 * actions appear only where they can still do something: take back what's unclaimed, put a funded
 * secret that never reached a photo into one, or clear a finished row away.
 */
function SavedItem({
  tok,
  round,
  live,
  canPut,
  onPut,
  onView,
  onDelete,
}: {
  tok: SavedToken
  round: number
  live: boolean
  canPut: boolean
  onPut: (amount: number) => void
  onView: () => Promise<boolean>
  onDelete: () => void
}) {
  const { t, num, lang } = useI18n()
  const [status, setStatus] = useState<SavedStatus>('checking')
  const [zats, setZats] = useState(tok.amount)
  const [armed, setArmed] = useState(false)
  const [takingBack, setTakingBack] = useState(false)
  const [busy, setBusy] = useState(false)
  const [back, setBack] = useState<SweepResult | null>(null)
  const [photoAvailable, setPhotoAvailable] = useState<boolean | null>(null)
  const [opening, setOpening] = useState(false)
  const [photoError, setPhotoError] = useState(false)
  const nextTransactionRead = useRef(0)
  const hasTransactions = transactionHashes(tok.transactions).length > 0
  const formId = useId()

  useEffect(() => {
    let stopped = false
    void hasMadePhoto(tok.id).then((available) => {
      if (!stopped) {
        setPhotoAvailable(available)
        if (available) setPhotoError(false)
      }
    })
    return () => { stopped = true }
  }, [tok, round])

  useEffect(() => {
    if (!live || busy) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const check = async () => {
      try {
        const s = await accountState(tok.id)
        if (stopped) return
        // What's inside now; once it's claimed, what it held.
        setZats(s.zats > 0n ? Number(s.zats) : tok.amount)
        const next = claimStateOf(s)
        setStatus(next)
        if (!DEMO && s.incomingTransactions?.length) recordTransactions(tok.id, s.incomingTransactions)
        if (!DEMO && (next === 'spent' || next === 'unspent') && s.blockCount > 0 &&
          tok.transactionsHeight !== s.blockCount && Date.now() >= nextTransactionRead.current) {
          nextTransactionRead.current = Date.now() + 30_000
          try {
            const hashes = await accountTransactions(tok.id)
            if (!stopped && hashes.length) recordTransactions(tok.id, hashes, s.blockCount)
          } catch {
            // Keep the known account status and account-history link when this optional read fails.
          }
        }
      } catch {
        if (!stopped) setStatus('unknown')
      }
      // Schedule after completion, so a slow read never overlaps the next poll for this row.
      if (!stopped) timer = setTimeout(check, 5000)
    }
    void check()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [tok.id, tok.amount, tok.transactionsHeight, back, round, live, busy, hasTransactions])

  const date = new Date(tok.createdAt)
  const when = new Intl.DateTimeFormat(lang, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(date.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }),
  }).format(date)
  const finished = status === 'spent'
  const recoverable = status === 'unspent' || status === 'unknown'
  const amountUnknown = tok.origin === 'opened' && tok.amount === 0 && (status === 'checking' || status === 'unknown')
  // Deleting a secret that may still hold ZNN loses it, so that asks first; a claimed row just goes.
  const remove = () => (finished || armed ? onDelete() : setArmed(true))

  return (
    <li className={`saved-item saved-item--${status === 'empty' ? 'pending' : status}`} data-address={tok.id}>
      <div className="saved-row">
        <div className="saved-main">
          <strong>
            {amountUnknown ? '—' : num(zats)} <span>{zatsUnit(zats)}</span>
          </strong>
          <p className="saved-meta">{t(tok.origin === 'opened' ? 'saved.opened' : 'saved.created')} · {when}</p>
        </div>
        <span className={`status status--${status === 'empty' ? 'pending' : status}`}>{t(`saved.${status}`)}</span>
        {finished && (
          <button type="button" className="saved-trash" aria-label={t('saved.delete')} onClick={remove}>
            <TrashIcon size={18} />
          </button>
        )}
      </div>
      {photoAvailable && (
        <div className="saved-actions">
          <button type="button" className="btn btn--white btn--sm" data-testid="saved-view-photo" disabled={opening} onClick={async () => {
            setOpening(true)
            const ok = await onView()
            setOpening(false)
            if (!ok) { setPhotoAvailable(false); setPhotoError(true) }
          }}>
            <PhotoIcon size={16} />
            {t('saved.view')}
          </button>
        </div>
      )}
      {photoError && <p className="saved-warn" role="status">{t('saved.photo.missing')}</p>}
      {back && <p className="saved-warn">{t('sweep.sentTo', { address: short(back.to) })}</p>}
      {(finished || hasTransactions || back) && <TransactionLinks
        hashes={[...transactionHashes(tok.transactions), ...(back?.hashes ?? [])]} address={tok.id}
      />}
      {!DEMO && back?.historySaved === false && <p className="saved-warn" role="status">{t('saved.txSaveFailed')}</p>}
      {(recoverable || status === 'empty') && !back && (
        <div className="saved-actions">
          {takingBack ? (
            <div style={{ flex: 1 }}>
              <SweepForm id={formId} token={tok.token} onBusy={setBusy} onDone={setBack} />
              {!busy && (
                <button type="button" className="btn btn--text btn--sm" onClick={() => setTakingBack(false)}>
                  {t('claim.cancel')}
                </button>
              )}
            </div>
          ) : armed ? (
            <p className="saved-warn" role="alert">
              {t('saved.deleteConfirm')}
            </p>
          ) : (
            recoverable && (
              <>
                {photoAvailable === false && (
                  <button type="button" className="btn btn--white btn--sm" data-testid="saved-recreate-photo" disabled={!canPut} onClick={() => onPut(zats)}>
                    {t(tok.photo ? 'saved.recreate' : 'saved.put')}
                  </button>
                )}
                <button type="button" className="btn btn--white btn--sm" onClick={() => setTakingBack(true)}>
                  {t(tok.origin === 'opened' ? 'claim.button' : 'saved.takeBack')}
                </button>
              </>
            )
          )}
          {!takingBack && (
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
          )}
        </div>
      )}
    </li>
  )
}
