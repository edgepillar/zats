/**
 * Talking to Zenon. A photo holds the secret of a fresh, single-use Zenon account: the 32-byte
 * BIP39 entropy behind its 24 recovery words, written as "zats1" + 64 hex characters. Whoever has
 * the photo controls that account, so it works like cash. The SDK (about 1 MB) is loaded on demand.
 * Never log secrets.
 *
 * Account 0 of the 24 words is used, the same one Syrius opens, so the words also work there.
 */

import { DEMO } from './demo'
import { transactionHashes } from './explorer'

type Sdk = typeof import('znn-typescript-sdk')
type ZenonClient = ReturnType<Sdk['Zenon']['getInstance']>
type KeyPair = ReturnType<InstanceType<Sdk['KeyStore']>['getKeyPair']>

/** 1 ZNN = 100,000,000 zats (ZNN has 8 decimals, like bitcoin). */
export const ZATS_PER_ZNN = 100_000_000
const PREFIX = 'zats1'
const ZNN = 'zts1znnxxxxxxxxxxxxx9z4ulx'
const QSR = 'zts1qsrxxxxxxxxxxxxxmrhjll'
/**
 * The only tokens a photo counts and moves. Zenon accounts get unsolicited airdrop tokens, and each
 * one would cost the claimer two more blocks of proof of work; anything else stays in the account,
 * reachable with the 24 words.
 */
const KEPT = new Set([ZNN, QSR])
const znnFirst = (zts: string) => (zts === ZNN ? 0 : 1)

/** Public mainnet nodes from blog.zenon.info/public-nodes, quickest first. VITE_ZNN_NODES overrides. */
const DEFAULT_NODES = ['wss://node.atsocy.com:35998', 'wss://node.zenonhub.io:35998', 'wss://my.hc1node.com:35998']
export const NODES: string[] = ((import.meta.env.VITE_ZNN_NODES as string | undefined) ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const nodes = () => (NODES.length ? NODES : DEFAULT_NODES)

/* ---------- The secret in the photo ---------- */

const HEX64 = /^[0-9a-f]{64}$/

/** The text hidden in a photo, or null if it isn't one of ours. */
export function entropyOf(token: string): string | null {
  if (!token.startsWith(PREFIX)) return null
  const hex = token.slice(PREFIX.length)
  return HEX64.test(hex) ? hex : null
}

export const isSecret = (token: string) => entropyOf(token) !== null

/** The SDK's loader and its connection failed. Worth a retry. */
export class OfflineError extends Error {
  constructor(cause?: unknown) {
    super('offline', { cause })
  }
}

let sdk: Promise<Sdk> | undefined
/** Loads the Zenon code once. A failed load is forgotten, so the next try downloads it again. */
export const loadZenon = (): Promise<Sdk> =>
  (sdk ??= import('znn-typescript-sdk')
    .then((m) => {
      // Proof of work runs in the SDK's own worker, from public/pow/ (copied there by scripts/copy-pow.mjs).
      m.Zenon.setPowBasePath(`${import.meta.env.BASE_URL}pow/`)
      if (!DEMO && m.isPowWorkerSupported()) m.Zenon.usePowWorker()
      return m
    })
    .catch((e: unknown) => {
      sdk = undefined
      throw new OfflineError(e)
    }))

async function keysOf(token: string): Promise<{ sdk: Sdk; keyPair: KeyPair; address: string; words: string }> {
  const hex = entropyOf(token)
  if (!hex) throw new Error('not-a-zats-secret')
  const m = await loadZenon()
  const store = m.KeyStore.fromEntropy(hex)
  const keyPair = store.getKeyPair(0)
  return { sdk: m, keyPair, address: keyPair.getAddress().toString(), words: store.mnemonic }
}

/** A brand-new single-use account: the text to hide in the photo, and the address to fund. */
export async function newSecret(): Promise<{ token: string; address: string }> {
  const m = await loadZenon()
  const store = m.KeyStore.newRandom()
  const token = PREFIX + store.entropy.toLowerCase()
  return { token, address: store.getKeyPair(0).getAddress().toString() }
}

export async function addressOf(token: string): Promise<string> {
  return (await keysOf(token)).address
}

/** The 24 recovery words, for importing the photo's account into Syrius. */
export async function wordsOf(token: string): Promise<string> {
  return (await keysOf(token)).words
}

/** A z1… address, cleaned up, or null. */
export async function parseAddress(text: string): Promise<string | null> {
  const clean = text.trim()
  if (!/^z1[02-9ac-hj-np-z]{38}$/i.test(clean)) return null
  const m = await loadZenon()
  try {
    return m.Address.parse(clean).toString()
  } catch {
    return null
  }
}

/* ---------- The connection ---------- */

type NodeConnection = { z: ZenonClient; nodeIndex: number }

// SDK 1.0.5 never updates client.status() to Running. Cache the successful connection ourselves.
let connection: Promise<NodeConnection> | undefined
let nextNode = 0
let sweepInProgress = false
let deferredDrop: (() => void) | undefined

function closeConnection(z: ZenonClient) {
  try {
    z.clearConnection()
  } catch {
    // Already closed.
  }
}

/** An open socket is not enough: a silent node must not pin the cached connection forever. */
function nodeRead<T>(read: Promise<T>, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Zenon node request timed out')), Math.max(1, timeoutMs))
    read.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error: unknown) => { clearTimeout(timer); reject(error) },
    )
  })
}

/** A live connection to a public node, trying each one in turn. */
async function zenon() {
  const m = await loadZenon()
  const z = m.Zenon.getInstance()
  const pending = (connection ??= (async () => {
    let last: unknown
    const endpoints = nodes()
    for (let attempt = 0; attempt < endpoints.length; attempt++) {
      const nodeIndex = (nextNode + attempt) % endpoints.length
      closeConnection(z)
      try {
        // Own reconnection here: SDK stop() can leave a scheduled automatic reconnect alive.
        await z.initialize(endpoints[nodeIndex], 8000, { reconnect: false })
        await nodeRead(z.ledger.getFrontierMomentum()) // proves the node answers, not just that the socket opened
        return { z, nodeIndex }
      } catch (e) {
        last = e
      }
    }
    closeConnection(z)
    throw new OfflineError(last)
  })())
  try {
    return { sdk: m, ...(await pending), pending }
  } catch (e) {
    if (connection === pending) connection = undefined
    throw e
  }
}

/** A late error from an old read must never close a newer connection. */
function dropConnection(pending: Promise<NodeConnection>, z: ZenonClient, nodeIndex: number) {
  const drop = () => {
    if (connection !== pending) return
    connection = undefined
    nextNode = nodeIndex + 1
    closeConnection(z)
  }
  if (connection !== pending) return
  // Background History reads must not disconnect a claim while it is doing proof of work.
  if (sweepInProgress) deferredDrop = drop
  else drop()
}

/* ---------- Reading an account ---------- */

export interface Holding {
  tokenStandard: string
  symbol: string
  decimals: number
  /** In the token's smallest unit (zats for ZNN). */
  amount: bigint
}

export interface AccountState {
  address: string
  /** ZNN in the account plus ZNN sent to it and not yet received, in zats. */
  zats: bigint
  /** ZNN and QSR, received or not (other tokens are ignored). */
  holdings: Holding[]
  /** ZNN and QSR transfers sent to the account that haven't been received yet. */
  unreceived: number
  /** Blocks on the account's own chain. 0 means it has never been used. */
  blockCount: number
  /** Blocks published by the account but not yet in a momentum: a claim is in progress. */
  unconfirmed: number
  /** Kept incoming transfer hashes already returned by the balance read. */
  incomingTransactions?: string[]
}

type Addr = ReturnType<Sdk['Address']['parse']>

/** ZNN and QSR transfers waiting to be received, paging past any airdrop spam (at most 500 looked at). */
async function incomingKept(z: ZenonClient, addr: Addr) {
  const kept: Awaited<ReturnType<ZenonClient['ledger']['getUnreceivedBlocksByAddress']>>['list'] = []
  for (let page = 0; page < 10; page++) {
    const list = await z.ledger.getUnreceivedBlocksByAddress(addr, page, 50)
    kept.push(...list.list.filter((b) => KEPT.has(b.tokenStandard.toString())))
    if (!list.more) break
  }
  return kept
}

export async function accountState(address: string): Promise<AccountState> {
  const { sdk: m, z, pending, nodeIndex } = await zenon()
  const addr = m.Address.parse(address)
  const [info, incoming, unconfirmed] = await nodeRead(Promise.all([
    z.ledger.getAccountInfoByAddress(addr),
    incomingKept(z, addr),
    z.ledger.getUnconfirmedBlocksByAddress(addr, 0, 50),
  ])).catch((e) => {
    dropConnection(pending, z, nodeIndex)
    throw new OfflineError(e)
  })
  const byToken = new Map<string, Holding>()
  const add = (zts: string, symbol: string, decimals: number, amount: bigint) => {
    if (amount <= 0n || !KEPT.has(zts)) return
    const h = byToken.get(zts)
    if (h) h.amount += amount
    else byToken.set(zts, { tokenStandard: zts, symbol, decimals, amount })
  }
  for (const item of Object.values(info?.balanceInfoMap ?? {})) {
    add(item.token.tokenStandard.toString(), item.token.symbol, item.token.decimals, BigInt(item.balance.toString()))
  }
  for (const b of incoming) {
    const zts = b.tokenStandard.toString()
    add(zts, b.token?.symbol ?? (zts === ZNN ? 'ZNN' : 'QSR'), b.token?.decimals ?? 8, BigInt(b.amount.toString()))
  }
  const holdings = [...byToken.values()].sort((a, b) => znnFirst(a.tokenStandard) - znnFirst(b.tokenStandard))
  return {
    address,
    zats: byToken.get(ZNN)?.amount ?? 0n,
    holdings,
    unreceived: incoming.length,
    blockCount: info?.blockCount ?? 0,
    unconfirmed: unconfirmed.count,
    incomingTransactions: transactionHashes(incoming.map((block) => block.hash.toString())),
  }
}

/** Recent confirmed mainnet ZNN/QSR blocks for an old completed History row; read-only and bounded. */
export async function accountTransactions(address: string): Promise<string[]> {
  const { sdk: m, z, pending, nodeIndex } = await zenon()
  const addr = m.Address.parse(address)
  const blocks = await nodeRead(z.ledger.getAccountBlocksByPage(addr, 0, 20)).catch((e) => {
    dropConnection(pending, z, nodeIndex)
    throw new OfflineError(e)
  })
  return transactionHashes(blocks.list.filter((block) =>
    block.address.toString() === addr.toString() && block.chainIdentifier === 1 &&
    (block.blockType === 2 || block.blockType === 3) && KEPT.has(block.tokenStandard.toString()) &&
    (block.confirmationDetail?.numConfirmations ?? 0) > 0,
  ).sort((a, b) => a.height - b.height).map((block) => block.hash.toString()))
}

/* ---------- What Open shows ---------- */

export type ClaimState = 'unspent' | 'pending' | 'spent' | 'empty'

export interface TokenSummary {
  address: string
  /** ZNN inside, in zats. */
  amount: number
  /** QSR inside, e.g. "10 QSR". */
  others: string[]
}

export function formatUnits(amount: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals)
  const whole = amount / base
  const frac = (amount % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return frac ? `${whole.toLocaleString('en-US')}.${frac}` : whole.toLocaleString('en-US')
}

export async function summarizeToken(token: string): Promise<TokenSummary> {
  const address = await addressOf(token)
  const s = await accountState(address)
  return {
    address,
    amount: Number(s.zats),
    others: s.holdings.filter((h) => h.tokenStandard !== ZNN).map((h) => `${formatUnits(h.amount, h.decimals)} ${h.symbol}`),
  }
}

/** Whether the photo still holds anything. */
export async function checkClaimState(token: string): Promise<ClaimState> {
  return claimStateOf(await accountState(await addressOf(token)))
}

export function claimStateOf(s: AccountState): ClaimState {
  if (s.unconfirmed > 0) return 'pending'
  if (s.holdings.length > 0) return 'unspent'
  return s.blockCount === 0 && s.unreceived === 0 ? 'empty' : 'spent'
}

/* ---------- Moving it out ---------- */

export type SweepStep =
  | { k: 'connecting' }
  /** Proof of work and publishing for block `i` of `n`. */
  | { k: 'receiving' | 'sending'; i: number; n: number }
  | { k: 'settling' }

export interface SweepResult {
  to: string
  /** ZNN moved, in zats. */
  zats: number
  others: string[]
  hashes: string[]
  /** UI storage annotation, independent of whether the transfer was sent. */
  historySaved?: boolean
}

export class SweepError extends Error {
  constructor(readonly code: 'empty' | 'busy' | 'failed' | 'invalid' | 'self' | 'contract' | 'burn' | 'unconfirmed', cause?: unknown) {
    super(code, { cause })
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Moves the ZNN and QSR in the photo's account to `to`: one receive block for each incoming
 * transfer, then one send block per token. Every block needs proof of work (the account has no
 * plasma): about 18 seconds each on a recent laptop, longer on a phone.
 */
export async function sweep(token: string, to: string, onStep?: (s: SweepStep) => void): Promise<SweepResult> {
  if (sweepInProgress) throw new SweepError('busy')
  sweepInProgress = true
  try {
    return await sweepOnce(token, to, onStep)
  } finally {
    sweepInProgress = false
    const drop = deferredDrop
    deferredDrop = undefined
    drop?.()
  }
}

async function sweepOnce(token: string, to: string, onStep?: (s: SweepStep) => void): Promise<SweepResult> {
  onStep?.({ k: 'connecting' })
  const { sdk: m, keyPair, address } = await keysOf(token)
  // Parse once, before connecting. Canonical comparison also covers uppercase Bech32 input.
  let destination: Addr
  try {
    destination = m.Address.parse(to.trim())
  } catch (e) {
    throw new SweepError('invalid', e)
  }
  const recipient = destination.toString()
  if (recipient === address) throw new SweepError('self')
  const core = destination.getBytes()
  if (core[0] !== m.Address.userByte) throw new SweepError('contract')
  if (core.every((byte) => byte === 0)) throw new SweepError('burn')

  const { z, pending, nodeIndex } = await zenon()
  const addr = m.Address.parse(address)
  const hashes: string[] = []
  let publicationAttempted = false

  try {
    let state = await accountState(address)
    if (state.unconfirmed > 0) throw new SweepError('busy')
    if (state.holdings.length === 0) throw new SweepError('empty')
    const incoming = await nodeRead(incomingKept(z, addr))
    const plan = incoming.length + state.holdings.length
    let i = 0
    for (const block of incoming) {
      onStep?.({ k: 'receiving', i: ++i, n: plan })
      publicationAttempted = true
      const done = await z.send(m.AccountBlockTemplate.receive(block.hash), keyPair)
      hashes.push(done.hash.toString())
      await waitForFrontier(z, addr, done.hash.toString())
    }

    if (incoming.length) {
      onStep?.({ k: 'settling' })
      // The balance moves once the receives are in a momentum; send only what is really there.
      let settled = false
      const deadline = Date.now() + 60_000
      while (Date.now() < deadline) {
        state = await accountState(address)
        settled = state.unreceived === 0 && state.unconfirmed === 0
        if (settled) break
        await sleep(Math.min(2000, Math.max(0, deadline - Date.now())))
      }
      if (!settled) throw new SweepError('unconfirmed', new Error('receives not confirmed in time'))
    }

    const info = await nodeRead(z.ledger.getAccountInfoByAddress(addr))
    const balances = Object.values(info?.balanceInfoMap ?? {}).filter(
      (b) => KEPT.has(b.token.tokenStandard.toString()) && BigInt(b.balance.toString()) > 0n,
    )
    // Never report "sent" for a claim that moved nothing.
    if (balances.length === 0) throw new SweepError(publicationAttempted ? 'unconfirmed' : 'empty')
    // ZNN first, so the main amount is moved even if a later token fails.
    balances.sort((a, b) => znnFirst(a.token.tokenStandard.toString()) - znnFirst(b.token.tokenStandard.toString()))
    let zats = 0
    const others: string[] = []
    for (const b of balances) {
      onStep?.({ k: 'sending', i: ++i, n: Math.max(plan, i) })
      const amount = BigInt(b.balance.toString())
      publicationAttempted = true
      const done = await z.send(m.AccountBlockTemplate.send(destination, b.token.tokenStandard, amount), keyPair)
      hashes.push(done.hash.toString())
      if (b.token.tokenStandard.toString() === ZNN) zats = Number(amount)
      else others.push(`${formatUnits(amount, b.token.decimals)} ${b.token.symbol}`)
      await waitForFrontier(z, addr, done.hash.toString())
    }
    return { to: recipient, zats, others, hashes }
  } catch (e) {
    if (e instanceof SweepError && e.code !== 'unconfirmed') throw e
    dropConnection(pending, z, nodeIndex)
    if (e instanceof SweepError) throw e
    // A failed response after a publish attempt cannot prove that no money moved.
    throw new SweepError(publicationAttempted ? 'unconfirmed' : 'failed', e)
  }
}

/** Waits until the node shows `hash` as the account's latest block, so the next block builds on it. */
async function waitForFrontier(z: ZenonClient, addr: Parameters<ZenonClient['ledger']['getFrontierAccountBlock']>[0], hash: string) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const frontier = await nodeRead(z.ledger.getFrontierAccountBlock(addr), Math.min(8000, deadline - Date.now())).catch(() => null)
    if (frontier?.hash.toString() === hash) return
    await sleep(Math.min(1000, Math.max(0, deadline - Date.now())))
  }
  throw new SweepError('unconfirmed', new Error('published block not visible on the node'))
}

/** What kind of failure talking to Zenon was. */
export function zenonErrorKind(e: unknown): 'offline' | 'other' {
  if (e instanceof OfflineError) return 'offline'
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  return 'other'
}

/** z1qzal6c…0mz-style short form for tight rows. */
export const shortAddress = (address: string) => `${address.slice(0, 7)}…${address.slice(-5)}`

/** zats → "1.5" ZNN. */
export const zatsToZnn = (zats: number | bigint) => formatUnits(BigInt(zats), 8)
