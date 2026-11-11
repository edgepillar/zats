import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyriusProvider } from '../src/syrius'

// Only a mock provider and mock ledger are used. No wallet, network or real funding is accessed.
const ledger = vi.hoisted(() => vi.fn())
vi.mock('../src/zenon', async original => ({ ...await original<typeof import('../src/zenon')>(), accountState: ledger }))
const source = 'z1qzrqf7r79d6v64yjv4lsgwuskh4quy9cuj39y5'
const photoToken = 'zats1' + '11'.repeat(32) // Public deterministic fixture, never fund it.
const hash = 'a'.repeat(64)
let destination: string
let provider: SyriusProvider & { sendTransaction: ReturnType<typeof vi.fn>; getAccounts: ReturnType<typeof vi.fn>; getChainId: ReturnType<typeof vi.fn> }
let records: Map<string, string>

beforeEach(async () => {
  vi.resetModules()
  vi.stubEnv('VITE_DEMO', '0')
  records = new Map()
  vi.stubGlobal('localStorage', { getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => records.set(key, value), removeItem: (key: string) => records.delete(key) })
  provider = {
    isSyriusExtension: true, connect: vi.fn(async () => [source]), getAccounts: vi.fn(async () => [source]), getChainId: vi.fn(async () => 1),
    sendTransaction: vi.fn(async () => ({ hash })), on: vi.fn(), removeListener: vi.fn(),
  }
  vi.stubGlobal('window', Object.assign(new EventTarget(), { zenon: provider }))
  const held = new Set<string>()
  vi.stubGlobal('navigator', { locks: { request: async (key: string, _options: unknown, fn: (lock: object | null) => Promise<unknown>) => {
    if (held.has(key)) return fn(null)
    held.add(key)
    try { return await fn({}) } finally { held.delete(key) }
  } } })
  ledger.mockReset().mockResolvedValue({ holdings: [], blockCount: 0, unconfirmed: 0 })
  const { addressOf } = await import('../src/zenon')
  destination = await addressOf(photoToken)
  const { addToken } = await import('../src/wallet')
  expect(addToken({ id: destination, token: photoToken, amount: 0, createdAt: 1 })).toBe(true)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('Syrius selection and funding', () => {
  it('detects the modern provider without reading, connecting or prompting', async () => {
    const { syriusProvider } = await import('../src/syrius')
    expect(syriusProvider()).toBe(provider)
    expect(provider.connect).not.toHaveBeenCalled()
    expect(provider.getAccounts).not.toHaveBeenCalled()
    expect(provider.sendTransaction).not.toHaveBeenCalled()
    Object.assign(window, { zenon: { isSyriusExtension: true } })
    expect(syriusProvider()).toBeNull()
  })
  it('selects a mainnet account with permission and never sends during connection', async () => {
    const { connectSyrius } = await import('../src/syrius')
    expect((await connectSyrius(provider, () => 0)).address).toBe(source)
    expect(provider.connect).toHaveBeenCalledTimes(1)
    expect(provider.sendTransaction).not.toHaveBeenCalled()
    expect(ledger).not.toHaveBeenCalled()
  })
  it('rejects another chain and a changed or locked selection before any send', async () => {
    const { connectSyrius, validateSyriusSession, fundWithSyrius } = await import('../src/syrius')
    provider.getChainId.mockResolvedValueOnce(2)
    await expect(connectSyrius(provider, () => 0)).rejects.toMatchObject({ code: 'network' })
    const session = await connectSyrius(provider, () => 0)
    provider.getAccounts.mockResolvedValueOnce([destination])
    await expect(fundWithSyrius(session, destination, 10000000, photoToken)).rejects.toMatchObject({ code: 'changed' })
    provider.getAccounts.mockResolvedValueOnce([])
    provider.getChainId.mockResolvedValueOnce(null)
    await expect(validateSyriusSession(session)).rejects.toMatchObject({ code: 'locked' })
    expect(provider.sendTransaction).not.toHaveBeenCalled()
  })
  it('retires old previews even after an account or network switches away and back', async () => {
    const { connectSyrius, fundWithSyrius } = await import('../src/syrius')
    let revision = 1
    const session = await connectSyrius(provider, () => revision)
    revision += 2
    await expect(fundWithSyrius(session, destination, 10000000, photoToken)).rejects.toMatchObject({ code: 'changed' })
    const fresh = await connectSyrius(provider, () => revision)
    ledger.mockImplementationOnce(async () => { revision++; return { holdings: [], blockCount: 0, unconfirmed: 0 } })
    await expect(fundWithSyrius(fresh, destination, 10000000, photoToken)).rejects.toMatchObject({ code: 'changed' })
    expect(provider.sendTransaction).not.toHaveBeenCalled()
  })
  it('bounds silent read-only provider calls without starting a transaction', async () => {
    const { connectSyrius, validateSyriusSession } = await import('../src/syrius')
    const session = await connectSyrius(provider, () => 0)
    vi.useFakeTimers()
    provider.getAccounts.mockImplementationOnce(() => new Promise(() => {}))
    const check = validateSyriusSession(session).catch(error => error)
    await vi.advanceTimersByTimeAsync(8001)
    expect(await check).toMatchObject({ code: 'unavailable' })
    expect(provider.sendTransaction).not.toHaveBeenCalled()
  })
  it('requests exactly 0.1 ZNN as integer base units and preserves its returned link', async () => {
    const { connectSyrius, fundWithSyrius, syriusFundingState } = await import('../src/syrius')
    const session = await connectSyrius(provider, () => 0)
    await expect(fundWithSyrius(session, destination, 10000000, photoToken)).resolves.toEqual({ hash, historySaved: true })
    expect(provider.sendTransaction).toHaveBeenCalledTimes(1)
    expect(provider.sendTransaction).toHaveBeenCalledWith({ to: destination, amount: '10000000', tokenStandard: 'zts1znnxxxxxxxxxxxxx9z4ulx' })
    expect(syriusFundingState(destination)).toBe('submitted')
    const { loadTokens } = await import('../src/wallet')
    expect(loadTokens()[0].transactions).toEqual([hash])
    await expect(fundWithSyrius(session, destination, 10000000, photoToken)).rejects.toMatchObject({ code: 'unknown' })
    expect(provider.sendTransaction).toHaveBeenCalledTimes(1)
  })
  it('refuses fractional amounts, self transfers and destinations unrelated to the recovery key', async () => {
    const { connectSyrius, fundWithSyrius } = await import('../src/syrius')
    const session = await connectSyrius(provider, () => 0)
    for (const amount of [0, 1.5, NaN, Infinity, 100000000001]) await expect(fundWithSyrius(session, destination, amount, photoToken)).rejects.toMatchObject({ code: 'invalid' })
    await expect(fundWithSyrius(session, source, 1, photoToken)).rejects.toMatchObject({ code: 'invalid' })
    await expect(fundWithSyrius(session, destination, 1, 'zats1' + '22'.repeat(32))).rejects.toMatchObject({ code: 'invalid' })
    expect(provider.sendTransaction).not.toHaveBeenCalled()
    expect(ledger).not.toHaveBeenCalled()
  })
  it('checks existing activity and storage before opening a funding approval', async () => {
    const { connectSyrius, fundWithSyrius } = await import('../src/syrius')
    const session = await connectSyrius(provider, () => 0)
    ledger.mockResolvedValueOnce({ holdings: [], blockCount: 1, unconfirmed: 0 })
    await expect(fundWithSyrius(session, destination, 1, photoToken)).rejects.toMatchObject({ code: 'funded' })
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('quota') } })
    await expect(fundWithSyrius(session, destination, 1, photoToken)).rejects.toMatchObject({ code: 'storage' })
    expect(provider.sendTransaction).not.toHaveBeenCalled()
  })
  it('blocks concurrent tabs and keeps a crash marker before invoking the provider', async () => {
    const { connectSyrius, fundWithSyrius, syriusFundingState } = await import('../src/syrius')
    const session = await connectSyrius(provider, () => 0)
    let finish!: (value: { hash: string }) => void
    provider.sendTransaction.mockImplementationOnce(() => {
      expect(syriusFundingState(destination)).toBe('pending')
      return new Promise(resolve => { finish = resolve })
    })
    const first = fundWithSyrius(session, destination, 1, photoToken)
    await vi.waitFor(() => expect(provider.sendTransaction).toHaveBeenCalledTimes(1))
    await expect(fundWithSyrius(session, destination, 1, photoToken)).rejects.toMatchObject({ code: 'busy' })
    finish({ hash }); await first
  })
  it('keeps manual funding available when cross-tab wallet locks are unsupported', async () => {
    const { connectSyrius, fundWithSyrius } = await import('../src/syrius')
    const session = await connectSyrius(provider, () => 0)
    vi.stubGlobal('navigator', {})
    await expect(fundWithSyrius(session, destination, 1, photoToken)).rejects.toMatchObject({ code: 'unsupported' })
    expect(provider.sendTransaction).not.toHaveBeenCalled()
  })
  it('keeps an unknown outcome blocked across module reloads and never retries it', async () => {
    const app = await import('../src/syrius')
    const session = await app.connectSyrius(provider, () => 0)
    provider.sendTransaction.mockRejectedValueOnce({ code: 4900, message: 'response lost after publication' })
    await expect(app.fundWithSyrius(session, destination, 1, photoToken)).rejects.toMatchObject({ code: 'unknown' })
    vi.resetModules()
    const reloaded = await import('../src/syrius')
    expect(reloaded.syriusFundingState(destination)).toBe('unknown')
    await expect(reloaded.fundWithSyrius(session, destination, 1, photoToken)).rejects.toMatchObject({ code: 'unknown' })
    expect(provider.sendTransaction).toHaveBeenCalledTimes(1)
  })
  it('allows a fresh explicit attempt after a proven refusal, without auto retry', async () => {
    const app = await import('../src/syrius')
    const session = await app.connectSyrius(provider, () => 0)
    provider.sendTransaction.mockRejectedValueOnce({ code: 4001 })
    await expect(app.fundWithSyrius(session, destination, 1, photoToken)).rejects.toMatchObject({ code: 'declined' })
    expect(app.syriusFundingState(destination)).toBe('none')
    expect(provider.sendTransaction).toHaveBeenCalledTimes(1)
    await app.fundWithSyrius(session, destination, 1, photoToken)
    expect(provider.sendTransaction).toHaveBeenCalledTimes(2)
  })
  it('keeps wallet submission successful even if receipt storage later fails', async () => {
    const app = await import('../src/syrius')
    const session = await app.connectSyrius(provider, () => 0)
    provider.sendTransaction.mockImplementationOnce(async () => {
      vi.stubGlobal('localStorage', { getItem: (key: string) => records.get(key) ?? null, setItem: () => { throw new Error('quota') } })
      return { hash }
    })
    await expect(app.fundWithSyrius(session, destination, 1, photoToken)).resolves.toEqual({ hash, historySaved: false })
    expect(app.syriusFundingState(destination)).toBe('pending')
  })
  it('never accesses an injected wallet in the isolated demo', async () => {
    vi.stubEnv('VITE_DEMO', '1'); vi.resetModules()
    const app = await import('../src/syrius')
    expect(app.syriusProvider()).toBeNull()
    await expect(app.connectSyrius(provider, () => 0)).rejects.toMatchObject({ code: 'missing' })
    expect(provider.connect).not.toHaveBeenCalled()
    expect(provider.sendTransaction).not.toHaveBeenCalled()
  })
})
