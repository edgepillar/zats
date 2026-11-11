// Injected-provider integration controls. Local fake ledger and mock wallet only; never real funds.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'

const base = process.env.ZATS_URL ?? 'http://127.0.0.1:4317/'
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Wallet controls are local-only')
const fake = await readFile(new URL('./fake-node.js', import.meta.url), 'utf8')
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
const sample = new URL('./sample.jpg', import.meta.url).pathname
const results = {}
const errors = []

async function newPage(context = browser.defaultBrowserContext()) {
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message.slice(0, 160)))
  await page.setRequestInterception(true)
  page.on('request', request => {
    const url = request.url()
    if (url.startsWith(base) || url.startsWith('data:') || url.startsWith('blob:')) request.continue()
    else { errors.push('Unexpected external request'); request.abort() }
  })
  await page.evaluateOnNewDocument(fake)
  await page.evaluateOnNewDocument(() => {
    window.__installSyrius = () => {
      const listeners = new Map()
      const state = { account: window.__fake.SENDER, chain: 1, mode: 'success', calls: [], connections: 0, reads: 0 }
      window.__syrius = state
      window.zenon = {
        isSyriusExtension: true,
        connect: async () => { state.connections++; return [state.account] },
        getAccounts: async () => { state.reads++; return [state.account] },
        getChainId: async () => state.chain,
        on: (event, fn) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn) },
        removeListener: (event, fn) => listeners.get(event)?.delete(fn),
        sendTransaction: async params => {
          state.calls.push(params)
          if (state.mode === 'decline') throw { code: 4001 }
          if (state.mode === 'unknown') throw { code: 4900 }
          if (state.mode === 'pending') return new Promise(() => {})
          return { hash: window.__fake.fund(params.to, BigInt(params.amount), params.tokenStandard) }
        },
      }
      state.emit = event => { for (const fn of listeners.get(event) ?? []) fn() }
      window.dispatchEvent(new Event('zenon#initialized'))
    }
  })
  await page.goto(base + '#hide', { waitUntil: 'networkidle0' })
  return page
}
async function start(page) {
  await (await page.$('[data-testid="make-photo-input"]')).uploadFile(sample)
  await page.click('[data-testid="amount-input"]', { clickCount: 3 })
  await page.keyboard.press('Backspace')
  await page.type('[data-testid="amount-input"]', '10000000')
  await page.waitForFunction(() => !document.querySelector('.pay-group .btn--primary')?.disabled)
  await page.click('.pay-group .btn--primary')
  await page.waitForSelector('[data-testid="deposit-address"]')
  return page.$eval('[data-testid="deposit-address"]', element => element.textContent.trim())
}
async function connect(page) {
  await page.waitForSelector('[data-testid="syrius-connect"]')
  await page.click('[data-testid="syrius-connect"]')
  await page.waitForSelector('[data-testid="syrius-pay"]')
}
try {
  const page = await newPage()
  const address = await start(page)
  assert.equal(await page.$('[data-testid="syrius-connect"]'), null)
  await page.evaluate(() => window.__installSyrius())
  await page.waitForSelector('[data-testid="syrius-connect"]')
  assert.equal(await page.evaluate(() => window.__syrius.connections + window.__syrius.reads + window.__syrius.calls.length), 0)
  results.lateInjectionDoesNotPrompt = true
  await page.evaluate(() => { window.__syrius.chain = 2 })
  await page.click('[data-testid="syrius-connect"]')
  await page.waitForFunction(() => document.querySelector('[data-testid="syrius-funding"]')?.textContent.includes('Select Zenon mainnet'))
  assert.equal(await page.$('[data-testid="syrius-pay"]'), null)
  await page.evaluate(() => { window.__syrius.chain = 1 })
  await connect(page)
  assert.equal(await page.$eval('[data-testid="syrius-pay"]', element => element.disabled), true)
  assert.equal(await page.evaluate(() => window.__syrius.calls.length), 0)
  results.mainnetAndBackupRequired = true

  await page.evaluate(() => window.__syrius.emit('nodeChanged'))
  await page.waitForSelector('[data-testid="syrius-pay"]', { hidden: true })
  await connect(page)
  await page.click('[data-testid="syrius-backup"]')
  await page.evaluate(() => { window.__syrius.mode = 'decline' })
  await page.click('[data-testid="syrius-pay"]')
  await page.waitForFunction(() => document.querySelector('[data-testid="syrius-funding"]')?.textContent.includes('Request declined'))
  assert.equal(await page.evaluate(address => localStorage.getItem('zats.syrius.funding.' + address), address), null)
  assert.equal(await page.evaluate(() => window.__syrius.calls.length), 1)
  results.declineDoesNotRetry = true
  await page.evaluate(() => { window.__syrius.mode = 'success' })
  await page.click('[data-testid="syrius-pay"]')
  await page.waitForSelector('[data-testid="made-photo"]', { timeout: 30000 })
  assert.deepEqual(await page.evaluate(() => window.__syrius.calls), Array(2).fill({ to: address, tokenStandard: 'zts1znnxxxxxxxxxxxxx9z4ulx', amount: '10000000' }))
  assert.equal(await page.evaluate(address => localStorage.getItem('zats.syrius.funding.' + address), address), 'submitted')
  assert.equal(await page.evaluate(() => window.__fake.state.published.length), 0)
  const png = await page.$eval('.make-grid .done-photo img', async image => {
    const bytes = new Uint8Array(await (await fetch(image.src)).arrayBuffer())
    let text = ''; for (const byte of bytes) text += String.fromCharCode(byte)
    return btoa(text)
  })
  results.exactFundingRequestWithoutPhotoSecret = true

  await page.goto(base + '#redeem', { waitUntil: 'networkidle0' })
  await page.evaluate(encoded => {
    const file = new File([Uint8Array.from(atob(encoded), char => char.charCodeAt(0))], 'mock-funded.png', { type: 'image/png' })
    const input = document.querySelector('[data-testid="redeem-input"]')
    const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, png)
  await page.waitForFunction(() => document.querySelector('[data-testid="claim-state"]')?.textContent === 'Unclaimed')
  await page.click('.money-cta')
  await page.waitForSelector('[data-testid="syrius-recipient"]')
  await page.click('[data-testid="syrius-recipient"]')
  await page.waitForFunction(() => document.querySelector('.money-ln-input')?.value === window.__syrius.account)
  await page.evaluate(() => window.__syrius.emit('accountsChanged'))
  await page.waitForFunction(() => document.querySelector('.money-ln-input')?.value === '')
  await page.click('[data-testid="syrius-recipient"]')
  await page.waitForFunction(() => document.querySelector('.money-ln-input')?.value === window.__syrius.account)
  // A missing event must not bypass the final read-only chain check.
  await page.evaluate(() => { window.__syrius.chain = 2 })
  await page.click('.money-ln-send')
  await page.waitForFunction(() => document.querySelector('.money-ln-status')?.textContent.includes('Select Zenon mainnet'))
  assert.equal(await page.evaluate(() => window.__fake.state.published.length), 0)
  results.recipientChangeAndFinalNetworkCheck = true
  await page.evaluate(() => { window.__syrius.chain = 1 })
  await page.click('[data-testid="syrius-recipient"]')
  await page.waitForFunction(() => document.querySelector('.money-ln-input')?.value === window.__syrius.account)
  await page.click('.money-ln-send')
  await page.waitForSelector('[data-testid="sweep-sent"]', { timeout: 60000 })
  assert.equal(await page.evaluate(() => window.__syrius.calls.length), 2)
  assert.equal(await page.evaluate(() => window.__fake.state.published.length), 2)
  assert.equal(await page.evaluate(() => window.__fake.state.unreceived[window.__syrius.account][0].amount), '10000000')
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('zats.tokens'))[0].transactions.length), 3)
  results.claimUsesPhotoAccountRatherThanWalletTransfer = true

  const isolated = await browser.createBrowserContext()
  const pending = await newPage(isolated)
  const pendingAddress = await start(pending)
  await pending.evaluate(() => window.__installSyrius())
  await connect(pending)
  await pending.click('[data-testid="syrius-backup"]')
  await pending.evaluate(() => { window.__syrius.mode = 'pending' })
  await pending.click('[data-testid="syrius-pay"]')
  await pending.waitForFunction(() => window.__syrius.calls.length === 1)
  assert.equal(await pending.$eval('[data-testid="deposit-cancel"]', element => element.disabled), true)
  const otherTab = await newPage(isolated)
  await otherTab.evaluate(() => window.__installSyrius())
  await otherTab.waitForSelector('[data-testid="syrius-funding-status"]')
  assert.equal(await otherTab.$('[data-testid="syrius-pay"]'), null)
  assert.equal(await otherTab.evaluate(() => window.__syrius.calls.length), 0)
  await pending.reload({ waitUntil: 'networkidle0' })
  await pending.evaluate(() => window.__installSyrius())
  await pending.waitForSelector('[data-testid="syrius-funding-status"]')
  assert.equal(await pending.$('[data-testid="syrius-pay"]'), null)
  assert.equal(await pending.evaluate(address => localStorage.getItem('zats.syrius.funding.' + address), pendingAddress), 'pending')
  assert.equal(await pending.evaluate(() => window.__syrius.calls.length), 0)
  results.pendingRequestSurvivesReloadAndBlocksOtherTabs = true
  await isolated.close()
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ ...results, externalRequests: 0, realWallets: 0, realTransactions: 0, result: 'PASS' }))
} catch (error) {
  console.error(JSON.stringify({ completedControls: results, errors, result: 'FAIL' }))
  throw error
} finally { await browser.close() }
