/**
 * Talking to Cashu mints. cashu-ts is loaded on demand, so test mode and the first paint don't
 * pay for it. Never log tokens.
 */

import { fetchInvoice, resolveLightningAddress } from './lightning'

export type ClaimState = 'unspent' | 'pending' | 'spent'

export interface TokenSummary {
  mint: string
  unit: string
  amount: number
}

type CashuModule = typeof import('@cashu/cashu-ts')
type WalletInstance = InstanceType<CashuModule['Wallet']>

const toNum = (a: { toString(): string } | number) => Number(a.toString())

/** The Cashu code couldn't be downloaded (offline, or an old file name after a deploy). Worth a retry. */
export class OfflineError extends Error {
  constructor(cause?: unknown) {
    super('offline', { cause })
  }
}

let cashu: Promise<CashuModule> | undefined
/** Loads the Cashu code once. A failed load is forgotten, so the next try downloads it again. */
export const loadCashu = (): Promise<CashuModule> =>
  (cashu ??= import('@cashu/cashu-ts').catch((e: unknown) => {
    cashu = undefined
    throw new OfflineError(e)
  }))

const wallets = new Map<string, Promise<WalletInstance>>()

async function walletFor(mintUrl: string, unit: string): Promise<WalletInstance> {
  const key = `${mintUrl}|${unit}`
  let w = wallets.get(key)
  if (!w) {
    w = (async () => {
      const { Wallet } = await loadCashu()
      const wallet = new Wallet(mintUrl, { unit })
      await wallet.loadMint()
      return wallet
    })()
    wallets.set(key, w)
    w.catch(() => wallets.delete(key))
  }
  return w
}

export async function summarizeToken(token: string): Promise<TokenSummary> {
  const { getTokenMetadata } = await loadCashu()
  const meta = getTokenMetadata(token)
  return { mint: meta.mint, unit: meta.unit ?? 'sat', amount: Number(meta.amount.toString()) }
}

/** Asks the mint whether the token's proofs are spent. Worst state wins. */
export async function checkClaimState(token: string): Promise<ClaimState> {
  const summary = await summarizeToken(token)
  const wallet = await walletFor(summary.mint, summary.unit)
  const states = await wallet.checkProofsStates(wallet.decodeToken(token).proofs)
  if (states.some((s) => s.state === 'SPENT')) return 'spent'
  if (states.some((s) => s.state === 'PENDING')) return 'pending'
  return 'unspent'
}

export function mintHost(mintUrl: string): string {
  try {
    const u = new URL(mintUrl)
    return u.host + (u.pathname === '/' ? '' : u.pathname)
  } catch {
    return mintUrl
  }
}

/* ---------- Making: invoice → paid → token ---------- */

const REAL_MINT = 'https://mint.minibits.cash/Bitcoin'
const TEST_MINT = 'https://testnut.cashu.space'

/**
 * The mint new photos are made with: real bitcoin. Automated tests build with VITE_TEST_MINT=1 so
 * they can use a test mint whose invoices pay themselves.
 */
export const MINT_URL = import.meta.env.VITE_TEST_MINT === '1' ? TEST_MINT : REAL_MINT

export function isTestMint(mintUrl: string): boolean {
  return /testnut/i.test(mintUrl)
}

export interface Invoice {
  quote: string
  /** bolt11 */
  request: string
}

/** The amount is outside what the mint takes in one Lightning deposit. */
export class AmountRangeError extends Error {
  constructor(
    readonly min: number,
    readonly max: number,
  ) {
    super('amount-range')
  }
}

/** The mint's own limits for one Lightning deposit, from its info. Null if it doesn't publish any. */
function depositLimits(wallet: WalletInstance): { min: number; max: number } | null {
  try {
    const method = wallet
      .getMintInfo()
      .isSupported(4)
      .params.find((p) => p.method === 'bolt11' && p.unit === 'sat')
    if (!method) return null
    return {
      min: method.min_amount == null ? 1 : toNum(method.min_amount),
      max: method.max_amount == null ? Infinity : toNum(method.max_amount),
    }
  } catch {
    return null
  }
}

export async function createInvoice(mintUrl: string, amount: number): Promise<Invoice> {
  const wallet = await walletFor(mintUrl, 'sat')
  // Checked here so the person gets the limit in their own language, not the mint's error text.
  const limits = depositLimits(wallet)
  if (limits && (amount < limits.min || amount > limits.max)) throw new AmountRangeError(limits.min, limits.max)
  const q = await wallet.createMintQuoteBolt11(amount, 'Kakaonut')
  return { quote: q.quote, request: q.request }
}

/**
 * What kind of failure talking to a mint was: 'offline' (no connection, or the mint is down),
 * 'busy' (rate limited or a server error), or 'other' (the mint refused, or a bug).
 */
export function mintErrorKind(e: unknown): 'offline' | 'busy' | 'other' {
  const name = e instanceof Error ? e.name : ''
  const status = (e as { status?: unknown } | null)?.status
  if (name === 'RateLimitError' || status === 429 || (typeof status === 'number' && status >= 500)) return 'busy'
  if (name === 'NetworkError') return 'offline'
  // A bare fetch failure: "Failed to fetch" (Chrome), "Load failed" (Safari), "NetworkError…" (Firefox).
  if (e instanceof TypeError && /fetch|load failed|network/i.test(e.message)) return 'offline'
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  return 'other'
}

export type QuoteState = 'UNPAID' | 'PAID' | 'ISSUED'

export async function invoiceState(mintUrl: string, quote: string): Promise<QuoteState> {
  const wallet = await walletFor(mintUrl, 'sat')
  const s = await wallet.checkMintQuoteBolt11(quote)
  return String(s.state) as QuoteState
}

/** Mints the proofs for a paid quote and returns them as a compact token (no DLEQ). */
export async function mintToken(mintUrl: string, amount: number, quote: string): Promise<string> {
  const cashuTs = await loadCashu()
  const wallet = await walletFor(mintUrl, 'sat')
  const proofs = await wallet.mintProofsBolt11(amount, quote)
  return cashuTs.getEncodedToken({ mint: mintUrl, proofs, unit: 'sat', memo: 'Kakaonut' }, { removeDleq: true })
}

/* ---------- Sending a photo's bitcoin to a Lightning address ---------- */

export type SendStep = 'address' | 'invoice' | 'paying'

export type SendErrorCode = 'tooSmall' | 'spent' | 'failed' | 'mismatch' | 'unknown'

export class SendError extends Error {
  constructor(readonly code: SendErrorCode) {
    super(code)
  }
}

export interface SendResult {
  /** 'pending': the mint is still paying; the Lightning wallet will show it when it lands. */
  state: 'paid' | 'pending'
  address: string
  /** sats the address receives */
  sent: number
  /** sats spent on Lightning fees (paid only) */
  fee: number
  /** Unused fee reserve the mint gave back, as a token to claim. */
  change?: { token: string; amount: number }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Pays a Lightning address with the token's ecash ("melting"): the mint pays the invoice and burns
 * the proofs. The address gets as much as fits after the mint's fee reserve; whatever reserve isn't
 * used comes back as change. If the payment fails, the proofs stay unspent and the photo still holds
 * the bitcoin.
 */
export async function sendToLightningAddress(
  token: string,
  address: string,
  onStep?: (step: SendStep) => void,
): Promise<SendResult> {
  const cashuTs = await loadCashu()
  const summary = await summarizeToken(token)
  const wallet = await walletFor(summary.mint, summary.unit)
  const proofs = wallet.decodeToken(token).proofs
  const total = proofs.reduce((sum, p) => sum + toNum(p.amount), 0)
  const inputFee = toNum(wallet.getFeesForProofs(proofs))

  onStep?.('address')
  const endpoint = await resolveLightningAddress(address)

  onStep?.('invoice')
  // Find the biggest invoice that fits: amount + fee reserve + input fee <= total. The reserve
  // depends on the amount, so start with a guess and adjust from the mint's answer.
  let amount = total - inputFee - Math.max(2, Math.ceil(total * 0.01))
  let quote: Awaited<ReturnType<typeof wallet.createMeltQuoteBolt11>> | undefined
  for (let i = 0; i < 4 && !quote; i++) {
    if (amount < 1) break
    const invoice = await fetchInvoice(endpoint, amount)
    const q = await wallet.createMeltQuoteBolt11(invoice)
    // Never pay more than we asked the provider for.
    if (toNum(q.amount) !== amount) throw new SendError('mismatch')
    const need = amount + toNum(q.fee_reserve) + inputFee
    if (need <= total) quote = q
    else amount -= need - total
  }
  if (!quote) throw new SendError('tooSmall')

  onStep?.('paying')
  let melted: Awaited<ReturnType<typeof wallet.meltProofsBolt11>>
  try {
    melted = await wallet.meltProofsBolt11(quote, proofs)
  } catch {
    // The request can fail after the mint acted on it, so ask about the quote before blaming
    // Lightning, then tell "already claimed" apart from "nothing was spent".
    const after = await wallet.checkMeltQuoteBolt11(quote.quote).catch(() => null)
    const afterState = after ? String(after.state) : ''
    if (afterState === 'PAID') return { state: 'paid', address: endpoint.address, sent: amount, fee: total - amount }
    if (afterState === 'PENDING') return { state: 'pending', address: endpoint.address, sent: amount, fee: 0 }
    const claim = await checkClaimState(token).catch(() => 'unknown' as const)
    if (claim === 'spent') throw new SendError('spent')
    if (claim === 'pending') return { state: 'pending', address: endpoint.address, sent: amount, fee: 0 }
    throw new SendError(claim === 'unknown' ? 'unknown' : 'failed')
  }

  let state = String(melted.quote.state)
  const change = melted.change
  for (let i = 0; state === 'PENDING' && i < 15; i++) {
    await sleep(2000)
    const q = await wallet.checkMeltQuoteBolt11(quote.quote)
    state = String(q.state)
  }
  if (state === 'UNPAID') throw new SendError('failed')
  if (state !== 'PAID') return { state: 'pending', address: endpoint.address, sent: amount, fee: 0 }

  const back = change.reduce((sum, p) => sum + toNum(p.amount), 0)
  const result: SendResult = { state: 'paid', address: endpoint.address, sent: amount, fee: total - amount - back }
  if (back > 0) {
    result.change = {
      amount: back,
      token: cashuTs.getEncodedToken({ mint: summary.mint, proofs: change, unit: summary.unit }, { removeDleq: true }),
    }
  }
  return result
}
