import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Only the transport is mocked. These tests never contact a node, sign, or publish a block.
const fake = vi.hoisted(() => {
  const znn = { tokenStandard: { toString: () => 'zts1znnxxxxxxxxxxxxx9z4ulx' }, symbol: 'ZNN', decimals: 8 }
  const emptyInfo = { blockCount: 0, balanceInfoMap: {} as Record<string, { token: typeof znn; balance: bigint }> }
  const state = { sequence: 0, opened: [] as string[], closed: [] as number[] }
  const z = {
    client: undefined as { id: number; status: () => number } | undefined,
    initialize: vi.fn(async (_url: string, _timeout?: number, _options?: { reconnect: boolean }) => {}),
    clearConnection: vi.fn(() => {}),
    ledger: {
      getFrontierMomentum: vi.fn(async () => ({})),
      getAccountInfoByAddress: vi.fn(async (_addr: unknown) => emptyInfo),
      getUnreceivedBlocksByAddress: vi.fn(async () => ({ list: [] as unknown[], more: false })),
      getUnconfirmedBlocksByAddress: vi.fn(async () => ({ count: 0 })),
      getFrontierAccountBlock: vi.fn(async () => ({ hash: { toString: (): string => 'published-hash' } })),
    },
    send: vi.fn(async (_template: unknown, _keyPair: unknown) => ({ hash: { toString: (): string => 'published-hash' } })),
  }
  const open = (url: string) => {
    state.opened.push(url)
    // Match the affected SDK: it reports Uninitialized even after opening the socket.
    z.client = { id: ++state.sequence, status: () => 0 }
  }
  return { z, state, open, emptyInfo, znn }
})

vi.mock('znn-typescript-sdk', () => ({
  Zenon: { getInstance: () => fake.z, setPowBasePath: () => {} },
  isPowWorkerSupported: () => false,
  Address: { userByte: 0, parse: (value: string) => ({
    toString: () => value.trim().toLowerCase(),
    getBytes: () => new Uint8Array([value.toLowerCase().startsWith('z1qxemdeddedx') ? 1 : 0, ...Array(19).fill(1)]),
  }) },
  KeyStore: {
    fromEntropy: () => ({
      mnemonic: 'public mocked fixture',
      getKeyPair: () => ({ getAddress: () => ({ toString: () => 'photo' }) }),
    }),
  },
  AccountBlockTemplate: {
    send: (to: unknown, token: unknown, amount: unknown) => ({ to, token, amount }),
    receive: (hash: unknown) => ({ receive: hash }),
  },
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.stubEnv('VITE_ZNN_NODES', '')
  fake.z.client = undefined
  fake.state.sequence = 0
  fake.state.opened.length = 0
  fake.state.closed.length = 0
  fake.z.initialize.mockImplementation(async (url) => fake.open(url))
  fake.z.clearConnection.mockImplementation(() => {
    if (fake.z.client) fake.state.closed.push(fake.z.client.id)
    fake.z.client = undefined
  })
  fake.z.ledger.getFrontierMomentum.mockResolvedValue({})
  fake.z.ledger.getAccountInfoByAddress.mockResolvedValue(fake.emptyInfo)
  fake.z.ledger.getUnreceivedBlocksByAddress.mockResolvedValue({ list: [], more: false })
  fake.z.ledger.getUnconfirmedBlocksByAddress.mockResolvedValue({ count: 0 })
  fake.z.ledger.getFrontierAccountBlock.mockResolvedValue({ hash: { toString: () => 'published-hash' } })
  fake.z.send.mockResolvedValue({ hash: { toString: () => 'published-hash' } })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('the shared node connection', () => {
  it('reuses one connection for repeated and concurrent reads despite the SDK status', async () => {
    const { accountState } = await import('../src/zenon')
    await Promise.all(Array.from({ length: 8 }, () => accountState('photo')))
    await accountState('photo')
    expect(fake.z.initialize).toHaveBeenCalledTimes(1)
    expect(fake.z.initialize).toHaveBeenCalledWith('wss://node.atsocy.com:35998', 8000, { reconnect: false })
    expect(fake.state.closed).toEqual([])
    expect(fake.z.ledger.getFrontierMomentum).toHaveBeenCalledTimes(1)
  })

  it('closes a failed candidate before using the next node', async () => {
    const { accountState } = await import('../src/zenon')
    fake.z.ledger.getFrontierMomentum.mockRejectedValueOnce(new Error('unavailable'))
    await accountState('photo')
    expect(fake.state.opened).toEqual(['wss://node.atsocy.com:35998', 'wss://node.zenonhub.io:35998'])
    expect(fake.state.closed).toEqual([1])
  })

  it('drops a silent probe instead of caching it forever', async () => {
    vi.useFakeTimers()
    const { accountState } = await import('../src/zenon')
    fake.z.ledger.getFrontierMomentum.mockImplementationOnce(() => new Promise(() => {}))
    const read = accountState('photo')
    await vi.waitFor(() => expect(fake.z.ledger.getFrontierMomentum).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(8000)
    await read
    expect(fake.z.initialize).toHaveBeenCalledTimes(2)
    expect(fake.state.closed).toEqual([1])
  })

  it('cleans up all failed candidates and permits a later fresh attempt', async () => {
    const { accountState, OfflineError } = await import('../src/zenon')
    fake.z.ledger.getFrontierMomentum.mockRejectedValue(new Error('unavailable'))
    await expect(accountState('photo')).rejects.toBeInstanceOf(OfflineError)
    expect(fake.state.closed).toEqual([1, 2, 3])
    expect(fake.z.client).toBeUndefined()
    fake.z.ledger.getFrontierMomentum.mockResolvedValue({})
    await accountState('photo')
    expect(fake.z.initialize).toHaveBeenCalledTimes(4)
  })

  it('rotates after a failed read and ignores late errors from the old connection', async () => {
    const { accountState, OfflineError } = await import('../src/zenon')
    const late = deferred<typeof fake.emptyInfo>()
    fake.z.ledger.getAccountInfoByAddress.mockImplementation(async (addr) => {
      if (String(addr) === 'late') return late.promise
      if (String(addr) === 'fail') throw new Error('failed read')
      return fake.emptyInfo
    })
    const oldRead = accountState('late').catch((error: unknown) => error)
    await vi.waitFor(() => expect(fake.z.ledger.getAccountInfoByAddress).toHaveBeenCalledTimes(1))
    await expect(accountState('fail')).rejects.toBeInstanceOf(OfflineError)
    await accountState('healthy')
    late.reject(new Error('late failure'))
    expect(await oldRead).toBeInstanceOf(OfflineError)
    await accountState('healthy')
    expect(fake.z.initialize).toHaveBeenCalledTimes(2)
    expect(fake.state.opened[1]).toBe('wss://node.zenonhub.io:35998')
    expect(fake.state.closed).toEqual([1])
  })

  it('keeps a claim connected through background read failures and rejects overlapping claims', async () => {
    const { accountState, sweep, OfflineError } = await import('../src/zenon')
    fake.z.ledger.getAccountInfoByAddress.mockResolvedValue({
      blockCount: 1, balanceInfoMap: { znn: { token: fake.znn, balance: 1n } },
    })
    const publication = deferred<{ hash: { toString: () => string } }>()
    fake.z.send.mockImplementationOnce(() => publication.promise)
    const claim = sweep('zats1' + '00'.repeat(32), 'recipient')
    await vi.waitFor(() => expect(fake.z.send).toHaveBeenCalledTimes(1))
    await expect(sweep('zats1' + '00'.repeat(32), 'recipient')).rejects.toMatchObject({ code: 'busy' })
    fake.z.ledger.getAccountInfoByAddress.mockRejectedValueOnce(new Error('background read failed'))
    await expect(accountState('history')).rejects.toBeInstanceOf(OfflineError)
    expect(fake.state.closed).toEqual([])
    publication.resolve({ hash: { toString: () => 'published-hash' } })
    await expect(claim).resolves.toMatchObject({ to: 'recipient', zats: 1 })
    expect(fake.state.closed).toEqual([1])
    await accountState('history')
    expect(fake.z.initialize).toHaveBeenCalledTimes(2)
  })
})

describe('claim safety', () => {
  it('refuses the photo’s own address and contract addresses before touching the network', async () => {
    const { sweep } = await import('../src/zenon')
    // The mocked key store gives every secret the address "photo".
    await expect(sweep('zats1' + '00'.repeat(32), 'photo')).rejects.toMatchObject({ code: 'self' })
    await expect(sweep('zats1' + '00'.repeat(32), 'z1qxemdeddedxplasmaxxxxxxxxxxxxxxxxsctrp')).rejects.toMatchObject({ code: 'contract' })
    expect(fake.z.initialize).not.toHaveBeenCalled()
    expect(fake.z.send).not.toHaveBeenCalled()
  })

  it('never reports a claim that moved nothing as sent', async () => {
    const { sweep } = await import('../src/zenon')
    // Holdings come from an unreceived transfer; after receiving, the node still shows no balance.
    const incoming = { list: [{ hash: 'incoming', tokenStandard: fake.znn.tokenStandard, token: fake.znn, amount: 5n }], more: false }
    // Seen by the first state read and by the claim's own list; received after that.
    fake.z.ledger.getUnreceivedBlocksByAddress
      .mockResolvedValueOnce(incoming)
      .mockResolvedValueOnce(incoming)
      .mockResolvedValue({ list: [], more: false })
    await expect(sweep('zats1' + '00'.repeat(32), 'recipient')).rejects.toMatchObject({ code: 'unconfirmed' })
    expect(fake.z.send).toHaveBeenCalledTimes(1) // the receive only, no send of nothing
  })

  it('stops when a published block never shows up as the account’s latest', async () => {
    vi.useFakeTimers()
    const { sweep } = await import('../src/zenon')
    fake.z.ledger.getAccountInfoByAddress.mockResolvedValue({
      blockCount: 1, balanceInfoMap: { znn: { token: fake.znn, balance: 1n } },
    })
    fake.z.ledger.getFrontierAccountBlock.mockResolvedValue({ hash: { toString: () => 'someone-else' } })
    const claim = sweep('zats1' + '00'.repeat(32), 'recipient').catch((e: unknown) => e)
    await vi.waitFor(() => expect(fake.z.ledger.getFrontierAccountBlock).toHaveBeenCalled())
    await vi.advanceTimersByTimeAsync(31_000)
    expect(await claim).toMatchObject({ code: 'unconfirmed' })
  })

  it('bounds a silent frontier RPC and does not publish a second block', async () => {
    vi.useFakeTimers()
    const { sweep } = await import('../src/zenon')
    const incoming = { list: [{ hash: 'incoming', tokenStandard: fake.znn.tokenStandard, token: fake.znn, amount: 5n }], more: false }
    fake.z.ledger.getUnreceivedBlocksByAddress.mockResolvedValue(incoming)
    fake.z.ledger.getFrontierAccountBlock.mockImplementation(() => new Promise(() => {}))
    const claim = sweep('zats1' + '00'.repeat(32), 'recipient').catch((e: unknown) => e)
    await vi.waitFor(() => expect(fake.z.send).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(31_000)
    expect(await claim).toMatchObject({ code: 'unconfirmed' })
    expect(fake.z.send).toHaveBeenCalledTimes(1)
  })

  it('stops before sending if receives remain unconfirmed', async () => {
    vi.useFakeTimers()
    const { sweep } = await import('../src/zenon')
    const incoming = { list: [{ hash: 'incoming', tokenStandard: fake.znn.tokenStandard, token: fake.znn, amount: 5n }], more: false }
    fake.z.ledger.getUnreceivedBlocksByAddress
      .mockResolvedValueOnce(incoming).mockResolvedValueOnce(incoming)
      .mockResolvedValue({ list: [], more: false })
    fake.z.ledger.getUnconfirmedBlocksByAddress.mockResolvedValueOnce({ count: 0 }).mockResolvedValue({ count: 1 })
    const claim = sweep('zats1' + '00'.repeat(32), 'recipient').catch((e: unknown) => e)
    await vi.waitFor(() => expect(fake.z.send).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(61_000)
    expect(await claim).toMatchObject({ code: 'unconfirmed' })
    expect(fake.z.send).toHaveBeenCalledTimes(1)
  })

  it('treats a failed publication response as uncertain and never retries the send', async () => {
    const { sweep } = await import('../src/zenon')
    fake.z.ledger.getAccountInfoByAddress.mockResolvedValue({
      blockCount: 1, balanceInfoMap: { znn: { token: fake.znn, balance: 1n } },
    })
    fake.z.send.mockRejectedValue(new Error('response lost'))
    await expect(sweep('zats1' + '00'.repeat(32), 'recipient')).rejects.toMatchObject({ code: 'unconfirmed' })
    expect(fake.z.send).toHaveBeenCalledTimes(1)
  })
})
