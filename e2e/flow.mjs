import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
// End-to-end: make a photo, fund it, open it, claim it, against a pretend Zenon node (fake-node.js).
// Proof of work and signing are real; only the network is pretend. Needs a local Chrome:
//   npm run build && npx vite preview --port 4317 &   then   CHROME=/path/to/chrome npm run e2e
import puppeteer from 'puppeteer-core'
import { KeyStore } from 'znn-typescript-sdk'
import { fileURLToPath, URL as NodeURL } from 'node:url'
import { dirname, join } from 'node:path'
const here = dirname(fileURLToPath(import.meta.url))
const tmp = (name) => join(here, '..', 'test-results', name)
const fake = readFileSync(join(here, 'fake-node.js'), 'utf8')
const CHROME = process.env.CHROME ?? '/usr/bin/google-chrome'
const URL = process.env.ZATS_URL ?? 'http://localhost:4317/'
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
await browser.defaultBrowserContext().overridePermissions(new NodeURL(URL).origin, ['clipboard-read', 'clipboard-write'])
const page = await browser.newPage()
const logs = []
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') logs.push('console.error: ' + m.text().slice(0, 200)) })
await page.evaluateOnNewDocument(fake)
await page.setViewport({ width: 1280, height: 900 })
const shot = (n) => page.screenshot({ path: tmp(`e2e-${n}.png`) })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const result = {}
mkdirSync(join(here, '..', 'test-results'), { recursive: true })
const t0 = Date.now()
process.on('unhandledRejection', (e) => { console.log(JSON.stringify({ failedAt: String(e).slice(0, 200), ...result, logs }, null, 1)); process.exit(1) })

// 1. Make: photo, amount, address
await page.goto(URL + '#hide', { waitUntil: 'networkidle0' })
await (await page.$('[data-testid="make-photo-input"]')).uploadFile(join(here, 'sample.jpg'))
await wait(800)
// Invalid input must remain visible and must not enable a differently valued deposit.
for (const text of ['1.5', '１．５', '0,1', '-1', '1e3', '0'.repeat(65) + '1.5']) {
  await page.click('[data-testid="amount-input"]', { clickCount: 3 })
  await page.keyboard.press('Backspace')
  await page.type('[data-testid="amount-input"]', text)
  const shown = await page.$eval('[data-testid="amount-input"]', el => el.value)
  if (shown !== text.normalize('NFKC')) throw new Error('Amount input silently changed the value')
  await page.waitForFunction(() => document.querySelector('[data-testid="amount-input"]').getAttribute('aria-invalid') === 'true')
  if (!(await page.$eval('.pay-group .btn--primary', el => el.disabled))) throw new Error('Invalid amount enabled a deposit')
}
result.invalidAmountsBlocked = true
await page.click('.presets .preset[aria-pressed="false"]')
// Restore the 1 ZNN amount used by this fake-node scenario.
await page.click('[data-testid="amount-input"]', { clickCount: 3 })
await page.keyboard.press('Backspace')
await page.type('[data-testid="amount-input"]', '100000000')
await page.click('.pay-group .btn--primary')
await page.waitForSelector('[data-testid="deposit-address"]', { timeout: 20000 })
const photoAddr = await page.$eval('[data-testid="deposit-address"]', (e) => e.textContent.trim())
result.photoAddr = photoAddr

// Back up the unfunded account through the UI. Never log the words, even for this fake node.
await page.click('[data-testid="deposit-copy-words"]')
await page.waitForFunction(() => document.querySelector('[data-testid="deposit-copy-words"]')?.textContent.includes('Copied'))
let backupWords = await page.evaluate(() => navigator.clipboard.readText())
result.backupWordCount = backupWords.trim().split(/\s+/).length
try {
  result.backupControlsDeposit = KeyStore.fromMnemonic(backupWords).getKeyPair(0).getAddress().toString() === photoAddr
} catch {
  result.backupControlsDeposit = false
}
backupWords = ''
await page.click('[data-testid="deposit-copy-address"]')
await page.waitForFunction(() => document.querySelector('[data-testid="deposit-copy-address"]')?.textContent.includes('Copied'))
result.copiedDepositAddressMatches = await page.evaluate((address) => navigator.clipboard.readText().then((text) => text === address), photoAddr)

// Switching to a wallet can reload the page before the transfer arrives.
await page.reload({ waitUntil: 'networkidle0' })
await page.waitForSelector('[data-testid="deposit-address"]')
await page.waitForFunction(() => document.querySelector('.make-preview img')?.naturalWidth > 0)
result.pendingPhotoSurvivesReload = await page.$eval('[data-testid="deposit-address"]', (el, address) => el.textContent.trim() === address, photoAddr)

// 2. ZNN arrives at the address (plus 2 QSR, to check both tokens move)
await page.evaluate((a) => { window.__fake.fund(a, 100000000n); window.__fake.fund(a, 200000000n, 'zts1qsrxxxxxxxxxxxxxmrhjll') }, photoAddr)
await page.waitForSelector('[data-testid="made-photo"]', { timeout: 30000 })
await wait(600)
await page.evaluate(() => document.querySelector('.make-grid').scrollIntoView())
await shot('1-made')
result.doneTitle = await page.$eval('.done-title', (e) => e.textContent)
result.makeConnections = await page.evaluate(() => ({ ...window.__fake.state.connections }))
const b64 = await page.evaluate(async () => {
  const buf = new Uint8Array(await (await fetch(document.querySelector('.done-photo img').src)).arrayBuffer())
  let s = ''; for (const x of buf) s += String.fromCharCode(x); return btoa(s)
})
writeFileSync(tmp('made.png'), Buffer.from(b64, 'base64'))
result.history = await page.evaluate(() => JSON.parse(localStorage.getItem('zats.tokens')).map((t) => ({ id: t.id.slice(0, 10), amount: t.amount, photo: t.photo })))
result.pendingCleared = await page.evaluate(() => localStorage.getItem('zats.pending') === null)

// History must return the exact generated bytes, including on the mainnet build.
await page.click('details.saved summary')
await page.waitForSelector('.saved-item [data-testid="history-tx"]', { visible: true })
result.fundingTransactionLinks = await page.$$eval('.saved-item [data-testid="history-tx"]', links => links.length === 2)
await page.waitForSelector('[data-testid="saved-view-photo"]')
await page.click('[data-testid="saved-view-photo"]')
await page.waitForSelector('dialog[open] .done-photo img')
result.archivedPngMatches = await page.$eval('dialog[open] .done-photo img', async (el, original) => {
  const bytes = new Uint8Array(await (await fetch(el.src)).arrayBuffer())
  let text = ''; for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text) === original
}, b64)
await page.keyboard.press('Escape')
await page.waitForSelector('dialog[open]', { hidden: true })
await page.click('details.saved summary')

// 3. Redeem the photo
await page.goto(URL + '#redeem', { waitUntil: 'networkidle0' })
await wait(500)
await (await page.$('[data-testid="redeem-input"]')).uploadFile(tmp('made.png'))
await page.waitForFunction(() => document.querySelector('[data-testid="claim-state"]')?.textContent === 'Unclaimed', { timeout: 30000 })
await wait(400)
await page.evaluate(() => document.querySelector('.make-grid.redeem').scrollIntoView())
await shot('2-open')
result.cardAmount = await page.$eval('.money-main', (e) => e.textContent)
result.cardSub = await page.$eval('.money-sub', (e) => e.textContent)

// The shared History remains usable without replacing the photo selected on Redeem.
const redeemPreview = await page.$eval('.redeem-shot img', el => el.src)
await page.click('details.saved summary')
await page.waitForSelector('[data-testid="saved-view-photo"]', { visible: true })
await page.click('[data-testid="saved-view-photo"]')
await page.waitForSelector('dialog[open] .done-photo img', { visible: true })
await page.keyboard.press('Escape')
await page.waitForSelector('dialog[open]', { hidden: true })
result.redeemHistoryPreservesSelection = await page.$eval('.redeem-shot img', (el, src) => el.src === src, redeemPreview)
await page.click('details.saved summary')

// 4. Claim: a bad address first, then a real one
await page.click('.money-cta')
await page.type('.money-ln-input', 'z1qnotarealaddress')
await page.click('.money-ln-send')
await wait(500)
result.badAddressError = await page.$eval('.money-ln-status', (e) => e.textContent)
const beforeGuards = await page.evaluate(() => JSON.stringify(window.__fake.state.calls))
for (const [destination, expected] of [[photoAddr, 'photo’s own address'], ['z1qxemdeddedxplasmaxxxxxxxxxxxxxxxxsctrp', 'contract address'], ['z1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsggv2f', 'empty address']]) {
  await page.click('.money-ln-input', { clickCount: 3 })
  await page.keyboard.press('Backspace')
  await page.type('.money-ln-input', destination)
  await page.click('.money-ln-send')
  await page.waitForFunction((text) => document.querySelector('.money-ln-status')?.textContent.includes(text), {}, expected)
}
result.destinationsBlockedBeforeRpc = await page.evaluate((before) => window.__fake.state.published.length === 0 && JSON.stringify(window.__fake.state.calls) === before, beforeGuards)
await page.$eval('.money-ln-input', (e) => (e.value = ''))
await page.click('.money-ln-input', { clickCount: 3 })
await page.keyboard.press('Backspace')
const to = await page.evaluate(() => window.__fake.SENDER)
await page.type('.money-ln-input', to)
await page.click('.money-ln-send')
await page.waitForSelector('[data-testid="sweeping"]', { timeout: 10000 })
await wait(300)
await shot('3-sweeping')
result.sweepingLabel = await page.$eval('[data-testid="sweeping"]', (e) => e.innerText.split('\n')[0])
const s0 = Date.now()
await page.waitForSelector('[data-testid="sweep-sent"]', { timeout: 180000 })
result.sweepSeconds = Math.round((Date.now() - s0) / 1000)
await wait(400)
await shot('4-sent')
result.sent = await page.$eval('[data-testid="sweep-sent"]', (e) => e.innerText.replace(/\n+/g, ' | '))
result.chain = await page.evaluate((a) => {
  const s = window.__fake.state
  const bal = (x) => Object.fromEntries(Object.entries(s.accounts[x]?.balances ?? {}).map(([k, v]) => [k.slice(0, 7), String(v)]))
  return { published: s.published, photoBalances: bal(a), photoUnreceived: (s.unreceived[a] ?? []).length, recipientIncoming: (s.unreceived[window.__fake.SENDER] ?? []).map((b) => `${b.amount} ${b.tokenStandard.slice(0, 7)}`), errors: s.errors, connections: { ...s.connections } }
}, photoAddr)

// 5. Open the same photo again: it should say it's already claimed
await page.click('.redeem-again')
await wait(300)
await (await page.$('[data-testid="redeem-input"]')).uploadFile(tmp('made.png'))
await page.waitForFunction(() => ['Already claimed', 'Unclaimed'].includes(document.querySelector('[data-testid="claim-state"]')?.textContent), { timeout: 30000 })
result.reopened = await page.$eval('[data-testid="claim-state"]', (e) => e.textContent)

// 6. History now shows it as claimed
await page.goto(URL + '#hide', { waitUntil: 'networkidle0' })
await page.click('details.saved summary')
await page.waitForFunction(() => /Claimed/.test(document.querySelector('.saved-item .status')?.textContent ?? ''), { timeout: 20000 })
result.historyStatus = await page.$eval('.saved-item .status', (e) => e.textContent)
const savedHashes = await page.evaluate(() => JSON.parse(localStorage.getItem('zats.tokens'))[0].transactions)
result.completedClaimHashesSaved = savedHashes?.length === 6
const expectedTxLinks = savedHashes.map(hash => 'https://zenonhub.io/explorer/transaction/' + hash)
await page.waitForSelector('.saved-item [data-testid="history-tx"]', { visible: true })
result.historyHasExactTransactionLinks = JSON.stringify(await page.$$eval('.saved-item [data-testid="history-tx"]', links => links.map(link => link.href))) === JSON.stringify(expectedTxLinks)
await page.evaluate(() => document.querySelector('details.saved').scrollIntoView({ block: 'center' }))
await shot('5-history')

// Link persistence is independent of a fresh node snapshot after a browser reload.
await page.reload({ waitUntil: 'networkidle0' })
await page.click('details.saved summary')
await page.waitForSelector('.saved-item [data-testid="history-tx"]', { visible: true })
result.transactionLinksSurviveReload = JSON.stringify(await page.$$eval('.saved-item [data-testid="history-tx"]', links => links.map(link => link.href))) === JSON.stringify(expectedTxLinks)

result.logs = logs.slice(0, 10)
result.totalSeconds = Math.round((Date.now() - t0) / 1000)
console.log(JSON.stringify(result, null, 1))
await browser.close()
const ok =
  result.invalidAmountsBlocked &&
  result.pendingPhotoSurvivesReload &&
  result.archivedPngMatches &&
  result.redeemHistoryPreservesSelection &&
  result.completedClaimHashesSaved &&
  result.fundingTransactionLinks &&
  result.historyHasExactTransactionLinks &&
  result.transactionLinksSurviveReload &&
  result.destinationsBlockedBeforeRpc &&
  result.backupWordCount === 24 &&
  result.backupControlsDeposit &&
  result.copiedDepositAddressMatches &&
  result.makeConnections.opened === 1 &&
  result.makeConnections.peak === 1 &&
  result.chain.connections.opened === 1 &&
  result.chain.connections.peak === 1 &&
  result.reopened === 'Already claimed' &&
  result.historyStatus === 'Claimed' &&
  result.chain.errors.length === 0 &&
  result.chain.published.length === 4 &&
  result.chain.published.every((p) => p.hasNonce && p.signed) &&
  result.logs.length === 0
console.log(ok ? 'PASS' : 'FAIL')
process.exit(ok ? 0 : 1)
