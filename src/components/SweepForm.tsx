import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useI18n } from '../i18n'
import { prefersReducedMotion } from '../hooks'
import { SweepError, parseAddress, sweep, type SweepResult, type SweepStep } from '../zenon'
import { Loading } from './Buddies'

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
    const to = await parseAddress(address).catch(() => null)
    if (!to) {
      setError(t('sweep.err.invalid'))
      setShake((n) => n + 1)
      return
    }
    setError(null)
    setStep({ k: 'connecting' })
    onBusy?.(true)
    // Keep the screen on while proof of work runs, where the browser allows it.
    const lock = await navigator.wakeLock?.request('screen').catch(() => null)
    try {
      onDone(await sweep(token, to, setStep))
    } catch (err) {
      const code = err instanceof SweepError ? err.code : 'failed'
      setError(t(`sweep.err.${code}`))
      setShake((n) => n + 1)
    } finally {
      void lock?.release().catch(() => {})
      setStep(null)
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
        <p className="money-ln-status">{t('sweep.pow')}</p>
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
            setError(null)
          }}
        />
        <button type="submit" className="money-ln-send" disabled={!address.trim()}>
          {t('sweep.send')}
        </button>
      </div>
      <p className={`money-ln-status${error ? ' is-error' : ''}`} role="status">
        {error ?? ''}
      </p>
    </form>
  )
}
