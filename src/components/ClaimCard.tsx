import { useId, useState, type CSSProperties } from 'react'
import { zatsUnit, useI18n } from '../i18n'
import { useFlash } from '../hooks'
import { copyText } from '../actions'
import { shortAddress as short, wordsOf, zatsToZnn, type ClaimState, type SweepResult, type TokenSummary } from '../zenon'
import { Typing } from './Chat'
import { CheckIcon } from './Icons'
import { FlashLabel } from './Flash'
import { SweepForm } from './SweepForm'
import { DEMO } from '../demo'
import { accountExplorerUrl } from '../explorer'
import { TransactionLinks } from './TransactionLinks'

/**
 * What Open shows when a photo holds zats, shaped like a money message in a chat: the amount on
 * yellow, then plain rows to take it (to a z1… address, or the 24 words for Syrius).
 */

export interface TokenCheck {
  summary?: TokenSummary
  invalid?: boolean
  claim: 'checking' | ClaimState | 'unknown'
}

export const explorerUrl = accountExplorerUrl

export function ClaimCard({ token, check }: { token: string; check: TokenCheck }) {
  const { t } = useI18n()
  const [mode, setMode] = useState<'actions' | 'claim'>('actions')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<SweepResult | null>(null)
  const [copied, flash] = useFlash()
  const formId = useId()

  if (check.invalid) return <p className="lead">{t('token.invalid')}</p>
  if (!check.summary) return <Typing />

  const { amount, others, address } = check.summary
  const gone = !sent && (check.claim === 'spent' || check.claim === 'pending' || check.claim === 'empty')
  // Until the chain answers, the ways to take the money wait: an already-claimed photo would
  // otherwise offer Claim for a moment and then turn grey.
  const checking = check.claim === 'checking'

  return (
    <div className={`money${gone ? ' is-gone' : ''}`} data-testid={sent ? 'sweep-sent' : 'money'}>
      <div className="money-top">
        <div className={`money-amount${sent ? ' is-new' : ''}`} key={sent ? 'sent' : 'claim'}>
          <Amount zats={sent ? sent.zats : amount} others={sent ? sent.others : others} />
        </div>
        <span className="sr-only" data-testid="claim-state">
          {t(sent ? 'state.spent' : `state.${check.claim}`)}
        </span>
      </div>

      <div className={`money-bottom${checking ? ' is-checking' : ''}`} aria-busy={checking || undefined}>
        {sent ? (
          <>
            <p className="money-row money-row--done">
              <CheckIcon size={18} />
              <span>{t('sweep.sentTo', { address: short(sent.to) })}</span>
            </p>
            <TransactionLinks hashes={sent.hashes} />
            {!DEMO && sent.historySaved === false && <p className="saved-warn" role="status">{t('saved.txSaveFailed')}</p>}
            {!DEMO && (
              <a className="money-row money-cta money-cta--small" href={explorerUrl(sent.to)} target="_blank" rel="noopener noreferrer">
                {t('claim.explorer')}
              </a>
            )}
          </>
        ) : gone ? (
          <p className="money-row money-row--note">{t(`state.${check.claim}`)}</p>
        ) : mode === 'claim' ? (
          <>
            <SweepForm id={formId} token={token} onBusy={setBusy} onDone={setSent} />
            {!busy && (
              <div className="money-split money-split--one">
                <button type="button" onClick={() => setMode('actions')}>
                  {t('claim.cancel')}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <button type="button" className="money-row money-cta" aria-controls={formId} onClick={() => setMode('claim')}>
              {t('claim.button')}
            </button>
            <div className={`money-split${DEMO ? ' money-split--one' : ''}`}>
              <button
                type="button"
                onClick={async () => {
                  const words = await wordsOf(token).catch(() => null)
                  flash(words && (await copyText(words)) ? t('action.copied') : t('action.copyFailedShort'))
                }}
              >
                <FlashLabel flash={copied}>{t('claim.copy')}</FlashLabel>
              </button>
              {!DEMO && (
                <a href={explorerUrl(address)} target="_blank" rel="noopener noreferrer">
                  {t('claim.explorer')}
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** zats big, ZNN (and any other tokens) under it. */
function Amount({ zats, others }: { zats: number; others: string[] }) {
  const { num } = useI18n()
  const fit = (chars: number) => ({ '--chars': chars }) as CSSProperties
  return (
    <>
      <p className="money-main" style={fit(num(zats).length + 5)}>
        <span className="token-num">{num(zats)}</span> <span className="money-unit">{zatsUnit(zats)}</span>
      </p>
      <p className="money-sub">
        {zatsToZnn(zats)} ZNN
        {others.map((o) => ` + ${o}`).join('')}
      </p>
    </>
  )
}
