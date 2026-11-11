import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const token = { id: 'public-test-id', token: 'public-test-value', amount: 10_000_000, createdAt: 0 }
const pending = { token: token.token, address: token.id, amount: token.amount, createdAt: 0, edge: 600 }
let records: Map<string, string>

beforeEach(() => {
  vi.resetModules()
  records = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
    removeItem: (key: string) => records.delete(key),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('wallet storage on a shared hosting origin', () => {
  it('notifies local History updates, follows other tabs, and unsubscribes cleanly', async () => {
    vi.stubEnv('VITE_DEMO', '0')
    const window = new EventTarget()
    vi.stubGlobal('window', window)
    const wallet = await import('../src/wallet')
    const changed = vi.fn()
    const unsubscribe = wallet.subscribeTokens(changed)
    expect(wallet.addToken(token)).toBe(true)
    expect(changed).toHaveBeenCalledTimes(1)
    const otherMode = Object.assign(new Event('storage'), { key: 'zats.demo.tokens' })
    window.dispatchEvent(otherMode)
    expect(changed).toHaveBeenCalledTimes(1)
    window.dispatchEvent(Object.assign(new Event('storage'), { key: 'zats.tokens' }))
    expect(changed).toHaveBeenCalledTimes(2)
    unsubscribe()
    wallet.markInPhoto(token.id)
    window.dispatchEvent(Object.assign(new Event('storage'), { key: 'zats.tokens' }))
    expect(changed).toHaveBeenCalledTimes(2)
  })

  it('keeps existing mainnet records readable', async () => {
    vi.stubEnv('VITE_DEMO', '0')
    records.set('zats.tokens', JSON.stringify([token]))
    records.set('zats.pending', JSON.stringify(pending))
    const wallet = await import('../src/wallet')
    expect(wallet.loadTokens()).toEqual([token])
    expect(wallet.loadPending()).toEqual(pending)
  })

  it('never reads, replaces or clears mainnet records from the demo', async () => {
    vi.stubEnv('VITE_DEMO', '1')
    const originalTokens = JSON.stringify([token])
    const originalPending = JSON.stringify(pending)
    records.set('zats.tokens', originalTokens)
    records.set('zats.pending', originalPending)
    const wallet = await import('../src/wallet')
    expect(wallet.loadTokens()).toEqual([])
    expect(wallet.loadPending()).toBeNull()
    expect(wallet.addToken(token)).toBe(true)
    expect(wallet.savePending(pending)).toBe(true)
    expect(wallet.loadTokens()).toEqual([token])
    expect(wallet.loadPending()).toEqual(pending)
    wallet.markInPhoto(token.id)
    wallet.deleteToken(token.id)
    wallet.clearPending()
    expect(records.get('zats.tokens')).toBe(originalTokens)
    expect(records.get('zats.pending')).toBe(originalPending)
    expect(records.get('zats.demo.tokens')).toBe('[]')
    expect(records.has('zats.demo.pending')).toBe(false)
  })

  it.each([['0', 'zats'], ['1', 'zats.demo']])('uses the expected photo database in mode %s', async (mode, database) => {
    vi.stubEnv('VITE_DEMO', mode)
    const open = vi.fn(() => {
      const request = { error: new Error('public test failure'), onerror: null as null | (() => void) }
      queueMicrotask(() => request.onerror?.())
      return request
    })
    vi.stubGlobal('indexedDB', { open })
    const { loadPendingPhoto } = await import('../src/photoStore')
    expect(await loadPendingPhoto('public-test-quote')).toBeNull()
    expect(open).toHaveBeenCalledWith(database, 1)
  })
})
