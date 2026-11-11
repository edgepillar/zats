import { describe, expect, it } from 'vitest'
import { accountExplorerUrl, transactionExplorerUrl, transactionHashes } from '../src/explorer'

describe('explorer links', () => {
  it('links hash values to the transaction route without accepting arbitrary stored URLs', () => {
    expect(transactionExplorerUrl('A'.repeat(64))).toBe('https://zenonhub.io/explorer/transaction/' + 'a'.repeat(64))
    for (const hash of ['', 'javascript:alert(1)', '../account/test', '0'.repeat(64), 'x'.repeat(64)]) {
      expect(transactionExplorerUrl(hash)).toBeNull()
    }
    expect(accountExplorerUrl('public/fixture')).toBe('https://zenonhub.io/explorer/account/public%2Ffixture')
  })

  it('deduplicates known hashes and bounds retained history', () => {
    expect(transactionHashes(['A'.repeat(64), 'a'.repeat(64), null, 1])).toEqual(['a'.repeat(64)])
    const many = Array.from({ length: 60 }, (_, i) => (i + 1).toString(16).padStart(64, '0'))
    expect(transactionHashes(many)).toEqual(many.slice(-50))
    expect(transactionHashes(null)).toEqual([])
  })
})
