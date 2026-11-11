import { DEMO } from './config'
import { MAX_AMOUNT } from './amount'
import { transactionHashes } from './explorer'
import { recordTransactions } from './wallet'
import { accountState, addressOf, parseAddress } from './zenon'

/** The modern injected provider. Never request wallet entropy, arbitrary signatures or node URLs. */
export interface SyriusProvider {
  isSyriusExtension: true
  connect(): Promise<unknown>
  getAccounts(): Promise<unknown>
  getChainId(): Promise<unknown>
  sendTransaction(params: { to: string; tokenStandard: string; amount: string }): Promise<unknown>
  on(event: string, listener: () => void): unknown
  removeListener(event: string, listener: () => void): unknown
}
export interface SyriusSession {
  provider: SyriusProvider
  address: string
  current: () => boolean
}
export type SyriusErrorCode = 'missing' | 'declined' | 'locked' | 'network' | 'changed' | 'storage' | 'busy' | 'unavailable' | 'unknown' | 'unsupported' | 'invalid' | 'funded'
export class SyriusError extends Error {
  constructor(readonly code: SyriusErrorCode) { super(code) }
}

export function syriusProvider(): SyriusProvider | null {
  if (DEMO || typeof window === 'undefined') return null
  const value = (window as unknown as { zenon?: Partial<SyriusProvider> }).zenon
  return value?.isSyriusExtension === true &&
    ['connect', 'getAccounts', 'getChainId', 'sendTransaction', 'on', 'removeListener'].every(key =>
      typeof value[key as keyof SyriusProvider] === 'function') ? value as SyriusProvider : null
}

function errorCode(error: unknown): unknown {
  return error && typeof error === 'object' && 'code' in error ? error.code : null
}
export function syriusError(error: unknown): SyriusError {
  if (error instanceof SyriusError) return error
  return new SyriusError(errorCode(error) === 4001 ? 'declined' : errorCode(error) === 4900 ? 'locked' : 'unavailable')
}

async function read<T>(value: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  try {
    return await Promise.race([value, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new SyriusError('unavailable')), 8000)
    })])
  } finally { clearTimeout(timer!) }
}

function firstAccount(value: unknown): string {
  if (!Array.isArray(value) || value.length !== 1 || typeof value[0] !== 'string') throw new SyriusError('locked')
  return value[0]
}

/** Reads are bounded and never prompt. The wallet and its generation must still match the preview. */
export async function validateSyriusSession(session: SyriusSession): Promise<void> {
  if (DEMO || !session.current() || syriusProvider() !== session.provider) throw new SyriusError('changed')
  const [accounts, chain] = await read(Promise.all([session.provider.getAccounts(), session.provider.getChainId()]))
  const selected = firstAccount(accounts)
  if (chain !== 1) throw new SyriusError('network')
  const address = await parseAddress(selected).catch(() => null)
  if (!session.current() || syriusProvider() !== session.provider || address !== session.address) throw new SyriusError('changed')
}

/** Connect only in response to a click. A grant's initial account event can precede its response. */
export async function connectSyrius(provider: SyriusProvider, generation: () => number): Promise<SyriusSession> {
  if (DEMO || syriusProvider() !== provider) throw new SyriusError('missing')
  const accounts = await provider.connect()
  const revision = generation()
  const address = await parseAddress(firstAccount(accounts)).catch(() => null)
  if (!address) throw new SyriusError('invalid')
  const session = { provider, address, current: () => generation() === revision }
  await validateSyriusSession(session)
  return session
}

export type FundingState = 'none' | 'pending' | 'submitted' | 'unknown' | 'unavailable'
const fundingKey = (address: string) => `zats.syrius.funding.${address}`
export const FUNDING_EVENT = 'zats:syrius-funding'

/** Kept separately from editable History rows so unrelated receipt writes cannot erase the guard. */
export function syriusFundingState(address: string): FundingState {
  if (DEMO) return 'none'
  try {
    const value = localStorage.getItem(fundingKey(address))
    return value === null ? 'none' : value === 'pending' || value === 'submitted' ? value : 'unknown'
  } catch { return 'unavailable' }
}
function setFundingState(address: string, state: 'pending' | 'submitted' | 'unknown' | null): boolean {
  try {
    if (state === null) localStorage.removeItem(fundingKey(address))
    else localStorage.setItem(fundingKey(address), state)
    if (syriusFundingState(address) !== (state ?? 'none')) return false
    window.dispatchEvent(new Event(FUNDING_EVENT))
    return true
  } catch { return false }
}

/** One explicit funding request, fenced across tabs and reloads. Never automatically resend. */
export async function fundWithSyrius(session: SyriusSession, destination: string, amount: number, photoToken: string): Promise<{ hash: string; historySaved: boolean }> {
  if (DEMO) throw new SyriusError('missing')
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) throw new SyriusError('invalid')
  const to = await parseAddress(destination).catch(() => null)
  if (!to || to !== destination || to === session.address) throw new SyriusError('invalid')
  if (await addressOf(photoToken).catch(() => null) !== to) throw new SyriusError('invalid')
  if (!navigator.locks?.request) throw new SyriusError('unsupported')
  return navigator.locks.request(fundingKey(to), { ifAvailable: true }, async lock => {
    if (!lock) throw new SyriusError('busy')
    const state = syriusFundingState(to)
    if (state === 'unavailable') throw new SyriusError('storage')
    if (state !== 'none') throw new SyriusError('unknown')
    await validateSyriusSession(session)
    const balance = await accountState(to)
    if (balance.holdings.length || balance.blockCount || balance.unconfirmed) throw new SyriusError('funded')
    if (!session.current()) throw new SyriusError('changed')
    // A durable marker exists before the wallet can sign. A tab crash or lost reply keeps it blocked.
    if (!setFundingState(to, 'pending')) throw new SyriusError('storage')
    let hash: string
    try {
      const result = await session.provider.sendTransaction({ to, tokenStandard: 'zts1znnxxxxxxxxxxxxx9z4ulx', amount: String(amount) })
      hash = transactionHashes([result && typeof result === 'object' && 'hash' in result ? result.hash : null])[0]
      if (!hash) throw new SyriusError('unknown')
    } catch (error) {
      // Only an explicit refusal proves this request was declined. Transport/lock errors can be uncertain.
      if (errorCode(error) === 4001 && setFundingState(to, null)) throw new SyriusError('declined')
      setFundingState(to, 'unknown')
      throw new SyriusError('unknown')
    }
    setFundingState(to, 'submitted')
    let historySaved = false
    try { historySaved = recordTransactions(to, [hash]) } catch { /* The wallet already submitted it. */ }
    return { hash, historySaved }
  })
}
