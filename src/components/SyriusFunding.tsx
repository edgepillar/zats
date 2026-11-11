import { useEffect, useRef, useState } from 'react'
import { DEMO } from '../config'
import { useI18n } from '../i18n'
import { zatsToZnn } from '../zenon'
import { FUNDING_EVENT, fundWithSyrius, syriusError, syriusFundingState, type SyriusErrorCode } from '../syrius'
import { useSyrius } from '../useSyrius'
import { TransactionLinks } from './TransactionLinks'

export function SyriusFunding({ address, amount, token, onBusy }: { address: string; amount: number; token: string; onBusy: (busy: boolean) => void }) {
  const { t } = useI18n()
  const wallet = useSyrius()
  const [backedUp, setBackedUp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [error, setError] = useState<SyriusErrorCode | null>(null)
  const [guard, setGuard] = useState(() => syriusFundingState(address))
  const [sent, setSent] = useState<{ hash: string; historySaved: boolean } | null>(null)
  const alive = useRef(true)
  const requesting = useRef(false)
  useEffect(() => {
    alive.current = true
    const update = () => setGuard(syriusFundingState(address))
    update()
    window.addEventListener('storage', update)
    window.addEventListener(FUNDING_EVENT, update)
    return () => {
      alive.current = false
      window.removeEventListener('storage', update)
      window.removeEventListener(FUNDING_EVENT, update)
    }
  }, [address])
  if (DEMO || (!wallet.available && guard === 'none')) return null
  const started = guard !== 'none' && guard !== 'unavailable'
  return (
    <div className="syrius-wallet" data-testid="syrius-funding">
      <p className="tile-label">{t('syrius.title')}</p>
      {started ? <p role="status" data-testid="syrius-funding-status">{t(guard === 'submitted' ? 'syrius.submitted' : busy ? 'syrius.waiting' : 'syrius.unknown')}</p> : <>
        {!wallet.session ? <button type="button" className="btn btn--quiet" data-testid="syrius-connect" disabled={choosing} onClick={async () => {
          setChoosing(true); setError(null)
          try { await wallet.connect() } catch (e) { if (alive.current) setError(syriusError(e).code) }
          finally { if (alive.current) setChoosing(false) }
        }}>{t(choosing ? 'syrius.connecting' : 'syrius.connect')}</button> : <>
          <p className="syrius-address" data-testid="syrius-from">{t('syrius.from', { address: wallet.session.address })}</p>
          <p className="syrius-address">{t('syrius.payment', { znn: zatsToZnn(amount), address })}</p>
          <label className="syrius-backup"><input type="checkbox" data-testid="syrius-backup" checked={backedUp} onChange={e => setBackedUp(e.target.checked)} />{t('syrius.backup')}</label>
          <button type="button" className="btn btn--primary btn--block" data-testid="syrius-pay" disabled={!backedUp || busy || guard === 'unavailable'} onClick={async () => {
            if (!wallet.session || !backedUp || requesting.current) return
            requesting.current = true
            setBusy(true); onBusy(true); setError(null)
            try {
              const result = await fundWithSyrius(wallet.session, address, amount, token)
              if (alive.current) setSent(result)
            } catch (e) { if (alive.current) setError(syriusError(e).code) }
            finally {
              requesting.current = false
              if (alive.current) { setBusy(false); setGuard(syriusFundingState(address)); onBusy(false) }
            }
          }}>{t('syrius.pay')}</button>
        </>}
        {wallet.invalidated && !wallet.session && <p className="invoice-note">{t('syrius.changed')}</p>}
      </>}
      {guard === 'unavailable' && <p className="invoice-warn" role="status">{t('syrius.err.storage')}</p>}
      {error && <p className="invoice-warn" role="status">{t(`syrius.err.${error}`)}</p>}
      {sent && <TransactionLinks hashes={[sent.hash]} />}
      {sent?.historySaved === false && <p className="invoice-warn" role="status">{t('saved.txSaveFailed')}</p>}
      {started && <TransactionLinks hashes={[]} address={address} />}
    </div>
  )
}
