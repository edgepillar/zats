import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { satsUnit, useI18n } from '../i18n'
import { prefersReducedMotion, useFlash } from '../hooks'
import { copyText } from '../actions'
import { claimLink } from '../config'
import { LnAddressError, parseLightningAddress } from '../lightning'
import { SendError, sendToLightningAddress, type ClaimState, type SendResult, type SendStep, type TokenSummary } from '../mint'
import { formatFiat, useBtcPrice } from '../price'
import { addToken } from '../wallet'
import { Typing } from './Chat'
import { Loading } from './Buddies'
import { CheckIcon } from './Icons'
import { FlashLabel } from './Flash'

/**
 * What Open shows when a photo holds bitcoin, shaped like a money message in a chat: the amount on
 * yellow, then plain rows to take it (the Kakaonut wallet, copy the token, or a Lightning address).
 */

export interface TokenCheck {
  summary?: TokenSummary
  invalid?: boolean
  claim: 'checking' | ClaimState | 'unknown'
}

type T = ReturnType<typeof useI18n>['t']
type Num = ReturnType<typeof useI18n>['num']

export function ClaimCard({ token, check }: { token: string; check: TokenCheck }) {
  const { t } = useI18n()
  const [mode, setMode] = useState<'actions' | 'lightning'>('actions')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<SendResult | null>(null)
  const [copied, flash] = useFlash()
  const formId = useId()

  if (check.invalid) return <p className="lead">{t('token.invalid')}</p>
  if (!check.summary) return <Typing />

  const { amount, mint } = check.summary
  const gone = !sent && (check.claim === 'spent' || check.claim === 'pending')
  // Until the mint answers, the ways to take the money wait: an already-claimed photo would
  // otherwise offer Claim for a moment and then turn grey.
  const checking = check.claim === 'checking'

  return (
    <div className={`money${gone ? ' is-gone' : ''}`} data-testid={sent ? 'ln-sent' : 'money'}>
      <div className="money-top">
        <div className={`money-amount${sent ? ' is-new' : ''}`} key={sent ? 'sent' : 'claim'}>
          <Amount sats={sent ? sent.sent : amount} />
        </div>
        <span className="sr-only" data-testid="claim-state">
          {t(`state.${check.claim}`)}
        </span>
      </div>

      <div className={`money-bottom${checking ? ' is-checking' : ''}`} aria-busy={checking || undefined}>
        {sent ? (
          <Sent result={sent} />
        ) : gone ? (
          <p className="money-row money-row--note">{t(`state.${check.claim}`)}</p>
        ) : mode === 'lightning' ? (
          <>
            <LightningForm id={formId} token={token} mint={mint} onBusy={setSending} onSent={setSent} />
            {!sending && (
              <div className="money-split money-split--one">
                <button type="button" onClick={() => setMode('actions')}>
                  {t('claim.cancel')}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <a className="money-row money-cta" href={claimLink(token)} target="_blank" rel="noopener noreferrer">
              {t('claim.button')}
            </a>
            <div className="money-split">
              <button
                type="button"
                onClick={async () => flash((await copyText(token)) ? t('action.copied') : t('action.copyFailedShort'))}
              >
                <FlashLabel flash={copied}>{t('claim.copy')}</FlashLabel>
              </button>
              <button type="button" aria-controls={formId} onClick={() => setMode('lightning')}>
                {t('claim.lightning')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Dollars or won first, sats under it. Sats alone if the price can't be fetched. */
function Amount({ sats }: { sats: number }) {
  const { lang, num } = useI18n()
  const price = useBtcPrice()
  const number = <span className="token-num">{num(sats)}</span>
  // --chars shrinks a long amount to fit on one line; an amount never breaks mid-number.
  const fit = (chars: number) => ({ '--chars': chars }) as CSSProperties
  if (!price) {
    return (
      <p className="money-main" style={fit(num(sats).length + 3)}>
        {number} <span className="money-unit">{satsUnit(sats)}</span>
      </p>
    )
  }
  const fiat = formatFiat(sats, price, lang)
  return (
    <>
      {/* 원 is a full-width glyph: count it as two. */}
      <p className="money-main" style={fit(fiat.length + (lang === 'ko' ? 1 : 0))}>
        {fiat}
      </p>
      <p className="money-sub">
        {number} {satsUnit(sats)}
      </p>
    </>
  )
}

function LightningForm({
  id,
  token,
  mint,
  onBusy,
  onSent,
}: {
  id: string
  token: string
  mint: string
  onBusy: (busy: boolean) => void
  onSent: (r: SendResult) => void
}) {
  const { t, num } = useI18n()
  const [address, setAddress] = useState('')
  const [step, setStep] = useState<SendStep | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Counts rejected sends; each one shakes the row once, so a repeat of the same error still shows.
  const [shake, setShake] = useState(0)
  const row = useRef<HTMLDivElement>(null)
  const parsed = parseLightningAddress(address)
  const inputId = `${id}-input`

  useEffect(() => {
    if (!shake || prefersReducedMotion()) return
    row.current?.animate(
      [
        { transform: 'none' },
        { transform: 'translateX(-6px)' },
        { transform: 'translateX(5px)' },
        { transform: 'translateX(-3px)' },
        { transform: 'none' },
      ],
      { duration: 280, easing: 'ease-out' },
    )
  }, [shake])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (step) return
    if (!parsed) {
      setError(t('ln.err.invalid'))
      setShake((n) => n + 1)
      return
    }
    setError(null)
    setStep('address')
    onBusy(true)
    try {
      const result = await sendToLightningAddress(token, parsed.address, setStep)
      if (result.change) {
        // Leftover fee reserve is money too: keep it with the other saved tokens on this device.
        addToken({
          id: `change-${result.change.token.slice(-16)}`,
          token: result.change.token,
          mint,
          amount: result.change.amount,
          createdAt: Date.now(),
        })
      }
      onSent(result)
    } catch (err) {
      setError(errorText(err, parsed.address, t, num))
      setShake((n) => n + 1)
    } finally {
      setStep(null)
      onBusy(false)
    }
  }

  if (step) {
    return (
      <div id={id} className="money-ln money-ln--busy">
        <Loading label={t(`ln.step.${step}`, { address: parsed?.address ?? '' })} size={26} />
      </div>
    )
  }

  return (
    <form id={id} className="money-ln" onSubmit={submit} noValidate>
      <label className="sr-only" htmlFor={inputId}>
        {t('ln.label')}
      </label>
      <div className="money-ln-row" ref={row}>
        <input
          id={inputId}
          className="money-ln-input"
          type="text"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          autoFocus
          placeholder={t('ln.placeholder')}
          value={address}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setAddress(e.target.value)
            setError(null)
          }}
        />
        <button type="submit" className="money-ln-send" disabled={!address.trim()}>
          {t('ln.send')}
        </button>
      </div>
      <p className={`money-ln-status${error ? ' is-error' : ''}`} role="status">
        {error ?? ''}
      </p>
    </form>
  )
}

function Sent({ result }: { result: SendResult }) {
  const { t, num } = useI18n()
  const paid = result.state === 'paid'
  return (
    <>
      <p className="money-row money-row--done">
        <CheckIcon size={18} />
        <span>{t(paid ? 'ln.sentTo' : 'ln.sendingTo', { address: result.address })}</span>
      </p>
      {!paid && <p className="money-row money-row--note">{t('ln.pending')}</p>}
      {result.change && (
        <a className="money-row money-cta money-cta--small" href={claimLink(result.change.token)} target="_blank" rel="noopener noreferrer">
          {t('ln.change', { amount: num(result.change.amount) })}
        </a>
      )}
    </>
  )
}

function errorText(err: unknown, address: string, t: T, num: Num): string {
  if (err instanceof LnAddressError) {
    switch (err.code) {
      case 'invalid':
        return t('ln.err.invalid')
      case 'notFound':
        return t('ln.err.notFound', { address })
      case 'blocked':
        return t('ln.err.blocked', { domain: err.detail.domain ?? address.split('@')[1] ?? '' })
      case 'range':
        return t('ln.err.range', { address, min: num(err.detail.min ?? 0), max: num(err.detail.max ?? 0) })
      case 'invoice':
        return t('ln.err.invoice', { address })
    }
  }
  if (err instanceof SendError) return t(`ln.err.${err.code}`)
  return t('ln.err.other')
}
