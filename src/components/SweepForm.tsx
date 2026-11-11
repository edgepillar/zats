import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useI18n } from '../i18n'
import { prefersReducedMotion } from '../hooks'
import { SweepError, parseAddress, sweep, type SweepResult, type SweepStep } from '../zenon'
import { Loading } from './Buddies'
import { DEMO, demoAddress } from '../demo'
import { recordClaimTransactions } from '../wallet'
import { syriusError, SyriusError, validateSyriusSession, type SyriusSession } from '../syrius'
import { useSyrius } from '../useSyrius'

/**
 * A z1… address field that moves everything in a photo's account there. Used to claim a photo on
 * Open, and to take one back from History. Each block needs about half a minute of proof of work.
 */
export function SweepForm({
  id,
  token,
  onBusy,
  onDone,
}: {
  id: string
  token: string
  onBusy?: (busy: boolean) => void
  onDone: (r: SweepResult) => void
}) {
  const { t } = useI18n()
  const [address, setAddress] = useState('')
  const [step, setStep] = useState<SweepStep | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const row = useRef<HTMLDivElement>(null)
  const submitting = useRef(false)
  const wallet = useSyrius()
  const [walletRecipient, setWalletRecipient] = useState<SyriusSession | null>(null)
  const [choosingWallet, setChoosingWallet] = useState(false)
  const inputId = `${id}-input`

  useEffect(() => {
    if (walletRecipient && !walletRecipient.current() && !submitting.current) {
      setAddress('')
      setWalletRecipient(null)
      setError(t('syrius.changed'))
    }
  }, [wallet.revision, walletRecipient, t])

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
    if (submitting.current || choosingWallet) return
    submitting.current = true
    setError(null)
    setStep({ k: 'connecting' })
    onBusy?.(true)
    // Keep the screen on while proof of work runs, where the browser allows it.
    const lock = await Promise.resolve()
      .then(() => navigator.wakeLock?.request('screen'))
      .catch(() => null)
    try {
      const to = await parseAddress(address).catch(() => null)
      if (!to) throw new SweepError('invalid')
      if (walletRecipient) {
        await validateSyriusSession(walletRecipient)
        if (walletRecipient.address !== to) throw new SyriusError('changed')
      }
      const result = await sweep(token, to, setStep)
      let historySaved = false
      try { historySaved = recordClaimTransactions(token, result.hashes) } catch { /* Transfer already sent. */ }
      onDone({ ...result, historySaved })
    } catch (err) {
      if (walletRecipient && !(err instanceof SweepError)) setError(t(`syrius.err.${syriusError(err).code}`))
      else setError(t(`sweep.err.${err instanceof SweepError ? err.code : 'failed'}`))
      setShake((n) => n + 1)
    } finally {
      void lock?.release().catch(() => {})
      setStep(null)
      submitting.current = false
      onBusy?.(false)
    }
  }

  if (step) {
    const label =
      step.k === 'receiving' || step.k === 'sending'
        ? t(`sweep.step.${step.k}`, { i: step.i, n: step.n })
        : t(`sweep.step.${step.k}`)
    return (
      <div id={id} className="money-ln money-ln--busy" data-testid="sweeping">
        <Loading label={label} size={26} />
        <p className="money-ln-status">{t(DEMO ? 'demo.pow' : 'sweep.pow')}</p>
      </div>
    )
  }

  return (
    <form id={id} className="money-ln" onSubmit={submit} noValidate>
      <label className="sr-only" htmlFor={inputId}>
        {t('sweep.label')}
      </label>
      <div className="money-ln-row" ref={row}>
        <input
          id={inputId}
          className="money-ln-input"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          autoFocus
          placeholder={t('sweep.placeholder')}
          value={address}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setAddress(e.target.value)
            setWalletRecipient(null)
            setError(null)
          }}
        />
        <button type="submit" className="money-ln-send" disabled={!address.trim() || choosingWallet}>
          {t('sweep.send')}
        </button>
      </div>
      <p className={`money-ln-status${error ? ' is-error' : ''}`} role="status">
        {error ?? ''}
      </p>
      {!DEMO && wallet.available && <button type="button" className="btn btn--text btn--sm" data-testid="syrius-recipient" disabled={choosingWallet} onClick={async () => {
        setChoosingWallet(true); setError(null)
        try {
          const selected = await wallet.connect()
          setAddress(selected.address)
          setWalletRecipient(selected)
        } catch (e) { setError(t(`syrius.err.${syriusError(e).code}`)) }
        finally { setChoosingWallet(false) }
      }}>{t(choosingWallet ? 'syrius.connecting' : 'syrius.recipient')}</button>}
      {DEMO && !address && (
        <button
          type="button"
          className="btn btn--text btn--sm"
          data-testid="demo-address"
          onClick={async () => setAddress(await demoAddress())}
        >
          {t('demo.address')}
        </button>
      )}
    </form>
  )
}
