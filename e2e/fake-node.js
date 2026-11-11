// A pretend Zenon node, installed before the page loads: it answers the JSON-RPC calls Zats makes
// over WebSocket, keeps balances per account, and applies the signed blocks the page publishes.
// Response shapes are copied from a live mainnet node. Proof of work difficulty is lowered so the
// test runs quickly; the real difficulty was measured separately in a real browser.
;(() => {
  const ZNN = 'zts1znnxxxxxxxxxxxxx9z4ulx'
  const QSR = 'zts1qsrxxxxxxxxxxxxxmrhjll'
  const token = (sym) => ({
    name: sym, symbol: sym, domain: 'zenon.network', totalSupply: '1390138344693310', decimals: 8,
    owner: 'z1qxemdeddedxt0kenxxxxxxxxxxxxxxxxh9amk0', tokenStandard: sym === 'ZNN' ? ZNN : QSR,
    maxSupply: '9007199254740991', isBurnable: true, isMintable: true, isUtility: true,
  })
  const TOKENS = { [ZNN]: token('ZNN'), [QSR]: token('QSR') }
  const MOM = {
    version: 1, chainIdentifier: 1, hash: '632ea050e1f689c175cd6cb8e66d5606d2b2910ce1e561fd0f8b16a458543901',
    previousHash: 'a55c43257b14430bae7155e9105b3de3e877ebe721a5f62b7bc2c83247ec7ac6', height: 14634548,
    timestamp: 1794354550, data: '', content: [], changesHash: 'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a',
    publicKey: 'iyyltT42L6pZgS0B7RQOSl5p26FsMSlt4V76ZI9+kcU=',
    signature: 'n6CDJO/JVjiJV0sY9ZAr2ouB3G49KbSm30UikO/PkGltGb03UKux0YKrfdbBGtj9Oo176cOLBQBp/gQZs+7rCQ==',
    producer: 'z1qzrqf7r79d6v64yjv4lsgwuskh4quy9cuj39y5',
  }
  const BLOCK = {
    version: 1, chainIdentifier: 1, blockType: 2, hash: '', previousHash: '0'.repeat(64), height: 1,
    momentumAcknowledged: { hash: MOM.hash, height: MOM.height }, address: '', toAddress: '', amount: '0',
    tokenStandard: ZNN, fromBlockHash: '0'.repeat(64), data: '', fusedPlasma: 0, difficulty: 0, nonce: '0000000000000000',
    basePlasma: 21000, usedPlasma: 21000, changesHash: '0'.repeat(64), publicKey: null, signature: null, token: null,
    confirmationDetail: { numConfirmations: 1, momentumHeight: MOM.height, momentumHash: MOM.hash, momentumTimestamp: MOM.timestamp },
    pairedAccountBlock: null,
  }
  const SENDER = 'z1qzrqf7r79d6v64yjv4lsgwuskh4quy9cuj39y5'
  const hex64 = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('')
  const state = { height: MOM.height, accounts: {}, unreceived: {}, blocks: {}, published: [], calls: {}, errors: [], connections: { opened: 0, active: 0, peak: 0 } }
  const acc = (a) => (state.accounts[a] ??= { height: 0, balances: {}, frontier: null })

  function fund(address, amount, zts = ZNN) {
    const b = { ...BLOCK, hash: hex64(), address: SENDER, toAddress: address, amount: String(amount), tokenStandard: zts, token: TOKENS[zts] }
    state.blocks[b.hash] = b
    ;(state.unreceived[address] ??= []).push(b)
    return b.hash
  }

  function publish(tx) {
    const a = acc(tx.address)
    if (tx.height !== a.height + 1) throw new Error(`height ${tx.height}, expected ${a.height + 1}`)
    if (tx.previousHash !== (a.frontier?.hash ?? '0'.repeat(64))) throw new Error('previousHash does not build on the frontier')
    if (tx.difficulty > 0 && tx.nonce === '0000000000000000') throw new Error('missing proof of work')
    let zts = tx.tokenStandard, amount = BigInt(tx.amount)
    if (tx.blockType === 3) {
      const list = state.unreceived[tx.address] ?? []
      const i = list.findIndex((b) => b.hash === tx.fromBlockHash)
      if (i < 0) throw new Error('nothing to receive with that hash')
      const [from] = list.splice(i, 1)
      zts = from.tokenStandard
      amount = BigInt(from.amount)
      a.balances[zts] = (a.balances[zts] ?? 0n) + amount
    } else if (tx.blockType === 2) {
      if ((a.balances[zts] ?? 0n) < amount) throw new Error('insufficient balance')
      a.balances[zts] -= amount
      const out = { ...BLOCK, ...tx, token: TOKENS[zts] ?? null }
      state.blocks[tx.hash] = out
      ;(state.unreceived[tx.toAddress] ??= []).push(out)
    } else throw new Error('unexpected block type ' + tx.blockType)
    a.height = tx.height
    a.frontier = { ...BLOCK, ...tx, token: TOKENS[zts] ?? null }
    state.blocks[tx.hash] = a.frontier
    state.published.push({ type: tx.blockType === 3 ? 'receive' : 'send', address: tx.address, toAddress: tx.toAddress, amount: String(amount), difficulty: tx.difficulty, hasNonce: tx.nonce !== '0000000000000000', signed: !!tx.signature })
  }

  const handlers = {
    'ledger.getFrontierMomentum': () => ({ ...MOM, height: ++state.height }),
    'ledger.getAccountInfoByAddress': ([a]) => {
      const x = state.accounts[a]
      const map = {}
      for (const [zts, bal] of Object.entries(x?.balances ?? {})) if (bal > 0n) map[zts] = { token: TOKENS[zts], balance: String(bal) }
      return { address: a, accountHeight: x?.height ?? 0, balanceInfoMap: map }
    },
    'ledger.getUnreceivedBlocksByAddress': ([a, page]) => {
      const list = page === 0 ? [...(state.unreceived[a] ?? [])] : []
      return { count: list.length, list, more: false }
    },
    'ledger.getUnconfirmedBlocksByAddress': () => ({ count: 0, list: [], more: false }),
    'ledger.getFrontierAccountBlock': ([a]) => state.accounts[a]?.frontier ?? null,
    'ledger.getAccountBlockByHash': ([h]) => state.blocks[h] ?? null,
    'embedded.plasma.getRequiredPoWForAccountBlock': () => ({ availablePlasma: 0, basePlasma: 21000, requiredDifficulty: 315000 }),
    'ledger.publishRawTransaction': ([tx]) => (publish(tx), null),
  }

  class FakeSocket extends EventTarget {
    constructor(url) {
      super()
      this.url = url
      this.readyState = 0
      state.connections.opened++
      state.connections.active++
      state.connections.peak = Math.max(state.connections.peak, state.connections.active)
      setTimeout(() => this._fire('open', new Event('open'), (this.readyState = 1)), 5)
    }
    _fire(type, ev) {
      this['on' + type]?.(ev)
      this.dispatchEvent(ev)
    }
    send(raw) {
      const msg = JSON.parse(raw)
      state.calls[msg.method] = (state.calls[msg.method] ?? 0) + 1
      let reply
      try {
        const h = handlers[msg.method]
        if (!h) throw new Error('unknown method ' + msg.method)
        reply = { jsonrpc: '2.0', id: msg.id, result: h(msg.params ?? []) }
      } catch (e) {
        state.errors.push(msg.method + ': ' + e.message)
        reply = { jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: e.message } }
      }
      setTimeout(() => this._fire('message', new MessageEvent('message', { data: JSON.stringify(reply) })), 5)
    }
    close() {
      if (this.readyState === 3) return
      state.connections.active--
      this.readyState = 3
      setTimeout(() => this._fire('close', new CloseEvent('close', { code: 1000 })), 1)
    }
  }
  FakeSocket.CONNECTING = 0; FakeSocket.OPEN = 1; FakeSocket.CLOSING = 2; FakeSocket.CLOSED = 3
  window.WebSocket = FakeSocket
  window.__fake = { state, fund, SENDER }
})()
