// End-to-end for the demo build (VITE_DEMO=1): make, pretend-fund, open on Redeem, claim to a demo
// address, reload, check History, all under a strict CSP like the Claude artifact viewer's (own files
// only, no eval, no outside connections). Set NO_STORAGE=1 to run with localStorage blocked.
//   npm run build:demo && npx vite preview --outDir dist-demo --port 4318 &   then   CHROME=/path/to/chrome npm run e2e:demo
import puppeteer from 'puppeteer-core'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'
const here = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(here, '..', 'test-results'), { recursive: true })
const URL = process.env.ZATS_DEMO_URL ?? 'http://localhost:4318/'
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const logs = []
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error' || /Content Security Policy|Refused/.test(m.text())) logs.push(m.type() + ': ' + m.text().slice(0, 200)) })
page.on('requestfailed', (r) => logs.push('requestfailed: ' + r.url().slice(0, 120)))
await page.setViewport({ width: 1280, height: 900 })
if (process.env.NO_STORAGE) await page.evaluateOnNewDocument(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError') } }) })
else await page.evaluateOnNewDocument(() => {
  // Public sentinels stand in for existing mainnet records on this same origin.
  localStorage.setItem('zats.tokens', JSON.stringify([{ id: 'public-mainnet-sentinel' }]))
  localStorage.setItem('zats.pending', JSON.stringify({ address: 'public-mainnet-sentinel' }))
})
// Strict policy like the artifact viewer's: own files only, no eval, no outside connections.
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data: blob:; worker-src 'self' blob:; media-src 'self' blob: data:"
await page.setRequestInterception(true)
page.on('request', async (req) => {
  if (!req.url().startsWith(URL)) return req.abort()
  const res = await fetch(req.url())
  const body = Buffer.from(await res.arrayBuffer())
  const headers = Object.fromEntries(res.headers.entries())
  delete headers['content-encoding']; delete headers['content-length']
  if (!process.env.ZATS_USE_DEPLOYMENT_HEADERS && (req.resourceType() === 'document' || req.url().endsWith('.js'))) headers['content-security-policy'] = CSP
  req.respond({ status: res.status, headers, body })
})
const shot = (n) => page.screenshot({ path: join(here, '..', 'test-results', `demo-${n}.png`) })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const r = {}
process.on('unhandledRejection', async (e) => { await shot('fail'); console.log(JSON.stringify({ failedAt: String(e).slice(0, 300), ...r, logs }, null, 1)); process.exit(1) })
await page.goto(URL + '#hide', { waitUntil: 'networkidle0' })
r.banner = await page.$eval('.demo-banner', (e) => e.textContent)
await (await page.$('[data-testid="make-photo-input"]')).uploadFile(join(here, 'sample.jpg'))
await wait(600)
await page.click('.pay-group .btn--primary')
await page.waitForSelector('[data-testid="demo-send"]', { timeout: 20000 })
await wait(800)
await page.evaluate(() => document.querySelector('.make-grid').scrollIntoView())
await shot('1-deposit')
r.sendLabel = await page.$eval('[data-testid="demo-send"]', (e) => e.textContent)
await page.click('[data-testid="demo-send"]')
await page.waitForSelector('[data-testid="made-photo"]', { timeout: 30000 })
await wait(800)
await page.evaluate(() => document.querySelector('.make-grid').scrollIntoView())
await shot('2-made')
r.done = await page.$eval('.done-title', (e) => e.textContent)
await page.click('[data-testid="demo-open"]')
await page.waitForFunction(() => document.querySelector('[data-testid="claim-state"]')?.textContent === 'Unclaimed', { timeout: 30000 })
await wait(500)
r.hash = await page.evaluate(() => location.hash)
r.card = await page.$eval('.money-top', (e) => e.innerText.replace(/\n+/g, ' | '))
await shot('3-open')
await page.click('.money-cta')
await page.waitForSelector('[data-testid="demo-address"]')
await page.click('[data-testid="demo-address"]')
await page.waitForFunction(() => /^z1/.test(document.querySelector('.money-ln-input')?.value ?? ''))
r.to = await page.$eval('.money-ln-input', (e) => e.value)
await page.click('.money-ln-send')
await page.waitForSelector('[data-testid="sweeping"]')
await wait(700)
await shot('4-sweeping')
r.sweepNote = await page.$eval('[data-testid="sweeping"] .money-ln-status', (e) => e.textContent)
r.warningsDuringFlow = await page.$$eval('.raw-token, .invoice-warn', (e) => e.length)
const s0 = Date.now()
await page.waitForSelector('[data-testid="sweep-sent"]', { timeout: 60000 })
r.sweepSeconds = Math.round((Date.now() - s0) / 1000)
await wait(500)
await shot('5-sent')
r.sent = await page.$eval('[data-testid="sweep-sent"]', (e) => e.innerText.replace(/\n+/g, ' | '))
if (process.env.NO_STORAGE) { r.unsavedWarnings = await page.$$eval('.raw-token, .invoice-warn', (e) => e.length); r.logs = logs; console.log(JSON.stringify(r, null, 1)); await browser.close(); console.log(r.logs.length === 0 && r.unsavedWarnings === 0 ? 'PASS' : 'FAIL'); process.exit(r.logs.length === 0 && r.unsavedWarnings === 0 ? 0 : 1) }
// Reload: the pretend chain and History survive
await page.reload({ waitUntil: 'networkidle0' })
await page.goto(URL + '#hide', { waitUntil: 'networkidle0' })
await page.click('details.saved summary')
await page.waitForFunction(() => /Claimed|Unclaimed/.test(document.querySelector('.saved-item .status')?.textContent ?? ''), { timeout: 20000 })
r.historyAfterReload = await page.$$eval('.saved-item', (els) => els.map((e) => e.innerText.replace(/\n+/g, ' | ')))
r.chainRecipient = await page.evaluate((to) => { const c = JSON.parse(localStorage.getItem('zats.demo.chain')); return (c.unreceived[to] ?? []).map((b) => b.amount) }, r.to)
r.mainnetRecordsUnchanged = await page.evaluate(() =>
  localStorage.getItem('zats.tokens') === JSON.stringify([{ id: 'public-mainnet-sentinel' }]) &&
  localStorage.getItem('zats.pending') === JSON.stringify({ address: 'public-mainnet-sentinel' }),
)
r.logs = logs
console.log(JSON.stringify(r, null, 1))
await browser.close()
const ok = r.sent?.includes('Sent to') && r.mainnetRecordsUnchanged && /Claimed/.test(r.historyAfterReload?.[0] ?? '') && r.logs.length === 0
console.log(ok ? 'PASS' : 'FAIL')
process.exit(ok ? 0 : 1)
