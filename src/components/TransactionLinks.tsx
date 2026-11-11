import { DEMO } from '../config'
import { useI18n } from '../i18n'
import { accountExplorerUrl, transactionExplorerUrl, transactionHashes } from '../explorer'

/** Normal links only: nothing is fetched from the explorer until the owner opens one. */
export function TransactionLinks({ hashes, address }: { hashes: unknown; address?: string }) {
  const { t } = useI18n()
  if (DEMO) return null
  const valid = transactionHashes(hashes)
  if (!valid.length && !address) return null
  return (
    <nav className="transaction-links" aria-label={t('saved.transactions')} data-testid="transaction-links">
      {valid.map((hash, i) => (
        <a key={hash} href={transactionExplorerUrl(hash)!} target="_blank" rel="noopener noreferrer"
          title={hash} aria-label={t('saved.txLabel', { hash })} data-testid="history-tx">
          {t('saved.tx', { n: i + 1 })} · {hash.slice(0, 6)}…{hash.slice(-6)}
        </a>
      ))}
      {address && <a href={accountExplorerUrl(address)} target="_blank" rel="noopener noreferrer" data-testid="history-account">
        {t('saved.accountHistory')}
      </a>}
    </nav>
  )
}
