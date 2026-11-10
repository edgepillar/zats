import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import type { Mode } from '../nav'
import { MakeFlow } from './MakeFlow'
import { RedeemFlow } from './RedeemFlow'

/**
 * The home page's action card: Hide bitcoin in a photo, or Redeem one. The switch lives in the
 * top bar; both sides stay mounted, so an invoice in progress survives a look at Redeem. Each side
 * lays out the same way: the photo on one side, the money on the other.
 */
export function ActionSection({ mode, active }: { mode: Mode; active: boolean }) {
  const { t } = useI18n()
  const head = (title: string, sub?: string): ReactNode => (
    <div className="make-head">
      <h2 id="make-title">{title}</h2>
      {sub && <p>{sub}</p>}
    </div>
  )
  return (
    <section className="make" id="make" aria-labelledby="make-title" data-mode={mode}>
      <div hidden={mode !== 'hide'}>
        <MakeFlow active={active && mode === 'hide'} head={mode === 'hide' && head(t('make.title'))} />
      </div>
      <div hidden={mode !== 'redeem'}>
        <RedeemFlow
          active={active && mode === 'redeem'}
          head={mode === 'redeem' && ((sub: string) => head(t('redeem.title'), sub))}
        />
      </div>
    </section>
  )
}
