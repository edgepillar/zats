const BASE = 'https://zenonhub.io/explorer'
const HASH = /^[0-9a-f]{64}$/i
export const MAX_SAVED_TRANSACTIONS = 50

/** Accept only actual hash-shaped values; never put arbitrary stored text in an explorer URL. */
export function transactionHashes(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((hash): hash is string => typeof hash === 'string')
    .map((hash) => hash.trim().toLowerCase())
    .filter((hash) => HASH.test(hash) && hash !== '0'.repeat(64)))].slice(-MAX_SAVED_TRANSACTIONS)
}

export const accountExplorerUrl = (address: string): string => `${BASE}/account/${encodeURIComponent(address)}`
export function transactionExplorerUrl(hash: string): string | null {
  const clean = transactionHashes([hash])[0]
  return clean ? `${BASE}/transaction/${clean}` : null
}
