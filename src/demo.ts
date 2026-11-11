/**
 * Demo mode (build with VITE_DEMO=1): a pretend Zenon node inside the page, so Zats can be tried
 * with no ZNN and no network. It replaces WebSocket before the SDK connects, answers the JSON-RPC
 * calls Zats makes (shapes copied from a live mainnet node), keeps balances in localStorage, and
 * applies the signed blocks the page publishes. Keys and signatures are real; proof of work is
 * skipped and each block takes a moment instead.
 */

export const DEMO = import.meta.env.VITE_DEMO === '1'

const ZNN = 'zts1znnxxxxxxxxxxxxx9z4ulx'
const QSR = 'zts1qsrxxxxxxxxxxxxxmrhjll'
const ZERO = '0'.repeat(64)
/** A public all-zero BIP39 test-vector address for the pretend wallet. Never fund it. */
const WALLET = 'z1qzrqf7r79d6v64yjv4lsgwuskh4quy9cuj39y5'
const STORE = 'zats.demo.chain'
const BLOCK_MS = 1600

type Json = Record<string, unknown>
interface Account {
  height: number
  balances: Record<string, string>
  frontier: Json | null
}
interface Chain {
  height: number
  accounts: Record<string, Account>
  unreceived: Record<string, Json[]>
  blocks: Record<string, Json>
}

const token = (symbol: 'ZNN' | 'QSR') => ({
  name: symbol,
  symbol,
  domain: 'zenon.network',
  totalSupply: '1390138344693310',
  decimals: 8,
  owner: 'z1qxemdeddedxt0kenxxxxxxxxxxxxxxxxh9amk0',
  tokenStandard: symbol === 'ZNN' ? ZNN : QSR,
  maxSupply: '9007199254740991',
  isBurnable: true,
  isMintable: true,
  isUtility: true,
})
const TOKENS: Record<string, Json> = { [ZNN]: token('ZNN'), [QSR]: token('QSR') }

const MOMENTUM = {
  version: 1,
  chainIdentifier: 1,
  hash: '632ea050e1f689c175cd6cb8e66d5606d2b2910ce1e561fd0f8b16a458543901',
  previousHash: 'a55c43257b14430bae7155e9105b3de3e877ebe721a5f62b7bc2c83247ec7ac6',
  height: 14634548,
  timestamp: 1794354550,
  data: '',
  content: [],
  changesHash: 'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a',
  publicKey: 'iyyltT42L6pZgS0B7RQOSl5p26FsMSlt4V76ZI9+kcU=',
  signature: 'n6CDJO/JVjiJV0sY9ZAr2ouB3G49KbSm30UikO/PkGltGb03UKux0YKrfdbBGtj9Oo176cOLBQBp/gQZs+7rCQ==',
  producer: WALLET,
}

const BLOCK: Json = {
  version: 1,
  chainIdentifier: 1,
  blockType: 2,
  hash: ZERO,
  previousHash: ZERO,
  height: 1,
  momentumAcknowledged: { hash: MOMENTUM.hash, height: MOMENTUM.height },
  address: WALLET,
  toAddress: WALLET,
  amount: '0',
  tokenStandard: ZNN,
  fromBlockHash: ZERO,
  data: '',
  fusedPlasma: 0,
  difficulty: 0,
  nonce: '0000000000000000',
  basePlasma: 21000,
  usedPlasma: 21000,
  changesHash: ZERO,
  publicKey: null,
  signature: null,
  token: null,
  confirmationDetail: {
    numConfirmations: 1,
    momentumHeight: MOMENTUM.height,
    momentumHash: MOMENTUM.hash,
    momentumTimestamp: MOMENTUM.timestamp,
  },
  pairedAccountBlock: null,
}

const hex64 = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('')

function load(): Chain {
  try {
    const raw = localStorage.getItem(STORE)
    if (raw) return JSON.parse(raw) as Chain
  } catch {
    // a fresh chain
  }
  return { height: MOMENTUM.height, accounts: {}, unreceived: {}, blocks: {} }
}

let chain: Chain = load()
const save = () => {
  try {
    localStorage.setItem(STORE, JSON.stringify(chain))
  } catch {
    // the demo just won't survive a reload
  }
}
const account = (a: string) => (chain.accounts[a] ??= { height: 0, balances: {}, frontier: null })
const balance = (a: Account, zts: string) => BigInt(a.balances[zts] ?? '0')

/** The pretend wallet sends `zats` of ZNN to `address`. */
export function demoFund(address: string, zats: number): void {
  const b = { ...BLOCK, hash: hex64(), address: WALLET, toAddress: address, amount: String(zats), token: TOKENS[ZNN] }
  chain.blocks[b.hash as string] = b
  ;(chain.unreceived[address] ??= []).push(b)
  save()
}

/** A fresh, valid z1 address to claim into. */
export async function demoAddress(): Promise<string> {
  const { loadZenon } = await import('./zenon')
  const m = await loadZenon()
  return m.KeyStore.newRandom().getKeyPair(0).getAddress().toString()
}

function publish(tx: Json) {
  const from = tx.address as string
  const a = account(from)
  if (tx.height !== a.height + 1) throw new Error(`height ${tx.height}, expected ${a.height + 1}`)
  if (tx.previousHash !== ((a.frontier?.hash as string | undefined) ?? ZERO)) throw new Error('previousHash does not match')
  if (!tx.signature) throw new Error('unsigned block')
  let zts = tx.tokenStandard as string
  let amount = BigInt(tx.amount as string)
  if (tx.blockType === 3) {
    const list = chain.unreceived[from] ?? []
    const i = list.findIndex((b) => b.hash === tx.fromBlockHash)
    if (i < 0) throw new Error('nothing to receive with that hash')
    const [sent] = list.splice(i, 1)
    zts = sent.tokenStandard as string
    amount = BigInt(sent.amount as string)
    a.balances[zts] = String(balance(a, zts) + amount)
  } else if (tx.blockType === 2) {
    if (balance(a, zts) < amount) throw new Error('insufficient balance')
    a.balances[zts] = String(balance(a, zts) - amount)
    const out = { ...BLOCK, ...tx, token: TOKENS[zts] ?? null }
    ;(chain.unreceived[tx.toAddress as string] ??= []).push(out)
  } else {
    throw new Error(`unexpected block type ${String(tx.blockType)}`)
  }
  a.height = tx.height as number
  a.frontier = { ...BLOCK, ...tx, token: TOKENS[zts] ?? null }
  chain.blocks[tx.hash as string] = a.frontier
  save()
}

const handlers: Record<string, (p: unknown[]) => unknown> = {
  'ledger.getFrontierMomentum': () => ({ ...MOMENTUM, height: ++chain.height }),
  'ledger.getAccountInfoByAddress': ([a]) => {
    const x = chain.accounts[a as string]
    const map: Record<string, Json> = {}
    for (const [zts, bal] of Object.entries(x?.balances ?? {}))
      if (BigInt(bal) > 0n) map[zts] = { token: TOKENS[zts], balance: bal }
    return { address: a, accountHeight: x?.height ?? 0, balanceInfoMap: map }
  },
  'ledger.getUnreceivedBlocksByAddress': ([a, page]) => {
    const list = page === 0 ? [...(chain.unreceived[a as string] ?? [])] : []
    return { count: list.length, list, more: false }
  },
  'ledger.getUnconfirmedBlocksByAddress': () => ({ count: 0, list: [], more: false }),
  'ledger.getFrontierAccountBlock': ([a]) => chain.accounts[a as string]?.frontier ?? null,
  'ledger.getAccountBlockByHash': ([h]) => chain.blocks[h as string] ?? null,
  // No proof of work in the demo: the account is treated as having plasma.
  'embedded.plasma.getRequiredPoWForAccountBlock': () => ({ availablePlasma: 21000, basePlasma: 21000, requiredDifficulty: 0 }),
  'ledger.publishRawTransaction': ([tx]) => (publish(tx as Json), null),
}

class DemoSocket extends EventTarget {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  readyState = 0
  onopen: ((e: Event) => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onclose: ((e: CloseEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  constructor(readonly url: string) {
    super()
    setTimeout(() => {
      this.readyState = 1
      this.fire('open', new Event('open'))
    }, 30)
  }
  private fire(type: 'open' | 'message' | 'close', ev: Event) {
    const handler = this[`on${type}`] as ((e: Event) => void) | null
    handler?.(ev)
    this.dispatchEvent(ev)
  }
  send(raw: string) {
    const msg = JSON.parse(raw) as { id: number; method: string; params?: unknown[] }
    let reply: Json
    try {
      const h = handlers[msg.method]
      if (!h) throw new Error(`not in the demo: ${msg.method}`)
      reply = { jsonrpc: '2.0', id: msg.id, result: h(msg.params ?? []) }
    } catch (e) {
      reply = { jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: e instanceof Error ? e.message : String(e) } }
    }
    // A published block takes a moment, standing in for proof of work and a momentum.
    const delay = msg.method === 'ledger.publishRawTransaction' ? BLOCK_MS : 40
    setTimeout(() => this.fire('message', new MessageEvent('message', { data: JSON.stringify(reply) })), delay)
  }
  close() {
    this.readyState = 3
    setTimeout(() => this.fire('close', new CloseEvent('close', { code: 1000 })), 1)
  }
}

/** Swaps in the pretend node. Call once, before anything connects. */
export function installDemo(): void {
  chain = load()
  ;(window as unknown as { WebSocket: unknown }).WebSocket = DemoSocket
}
