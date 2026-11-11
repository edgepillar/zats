// Recovery regressions use a pretend node and disposable browser profiles, never a real wallet.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'

const base = process.env.ZATS_URL ?? 'http://127.0.0.1:4317/'
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'History tests are local-only')
const fake = await readFile(new URL('./fake-node.js', import.meta.url), 'utf8')
const sample = new URL('./sample.jpg', import.meta.url).pathname
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
const logs = []
const results = {}
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function newPage(context = browser.defaultBrowserContext()) {
  const page = await context.newPage()
  await page.bringToFront()
  page.on('pageerror', error => logs.push(error.message.slice(0, 200)))
  await page.evaluateOnNewDocument(fake + `
    // Keep only the simulated ledger across reloads; no production namespace is involved.
    const saved = sessionStorage.getItem('zats.e2e.chain');
    if (saved) Object.assign(window.__fake.state, JSON.parse(saved, (key, value) =>
      value && typeof value === 'object' && '__e2eBigInt' in value ? BigInt(value.__e2eBigInt) : value));
    window.__fake.state.connections = { opened: 0, active: 0, peak: 0 };
    window.addEventListener('beforeunload', () => sessionStorage.setItem('zats.e2e.chain',
      JSON.stringify(window.__fake.state, (key, value) => typeof value === 'bigint' ? { __e2eBigInt: String(value) } : value)));
  `)
  await page.goto(base + '#hide', { waitUntil: 'networkidle0' })
  return page
}

async function start(page) {
  await (await page.$('[data-testid="make-photo-input"]')).uploadFile(sample)
  await page.waitForFunction(() => !document.querySelector('.pay-group .btn--primary')?.disabled)
  await page.click('.pay-group .btn--primary')
  await page.waitForSelector('[data-testid="deposit-address"]')
  return page.$eval('[data-testid="deposit-address"]', element => element.textContent.trim())
}

async function fund(page, address, amount) {
  await page.evaluate((id, value) => window.__fake.fund(id, BigInt(value)), address, amount)
}

async function made(page) {
  await page.waitForSelector('.make-grid [data-testid="made-photo"]', { timeout: 30000 })
}

async function digest(page, selector) {
  return page.$eval(selector, async element => {
    const bytes = await (await fetch(element.src)).arrayBuffer()
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
  })
}

async function pngBytes(page) {
  return page.$eval('.make-grid .done-photo img', async element => {
    const bytes = new Uint8Array(await (await fetch(element.src)).arrayBuffer())
    let text = ''; for (const byte of bytes) text += String.fromCharCode(byte)
    return btoa(text)
  })
}

async function uploadIncoming(page, bytes) {
  await page.evaluate(encoded => {
    const file = new File([Uint8Array.from(atob(encoded), char => char.charCodeAt(0))], 'received.png', { type: 'image/png' })
    const input = document.querySelector('[data-testid="redeem-input"]')
    const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, bytes)
}

async function history(page) {
  if (!await page.$eval('details.saved', element => element.open)) await page.click('details.saved summary')
  await page.waitForSelector('details.saved[open] .group', { visible: true })
}

const row = address => `.saved-item[data-address="${address}"]`
async function openPhoto(page, address, expected) {
  await page.waitForSelector(row(address) + ' [data-testid="saved-view-photo"]', { visible: true })
  await page.click(row(address) + ' [data-testid="saved-view-photo"]')
  await page.waitForSelector('dialog[open] .done-photo img', { visible: true })
  assert.equal(await digest(page, 'dialog[open] .done-photo img'), expected)
}

async function closePhoto(page) {
  await page.click('dialog[open] .done-again')
  await page.waitForSelector('dialog[open]', { hidden: true })
}

async function status(page, address, expected) {
  await page.waitForFunction((selector, text) => document.querySelector(selector)?.textContent === text,
    { timeout: 15000 }, row(address) + ' .status', expected)
}

try {
  const page = await newPage()
  const first = await start(page)
  // Model an outstanding deposit from the original single-slot photo store.
  await page.evaluate(async address => {
    const db = await new Promise((resolve, reject) => { const req = indexedDB.open('zats', 1); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('photos', 'readwrite'), store = tx.objectStore('photos')
        const req = store.get('pending:' + address)
        req.onsuccess = () => { store.put(req.result, 'pending'); store.delete('pending:' + address) }
        tx.oncomplete = resolve; tx.onabort = () => reject(tx.error)
      })
    } finally { db.close() }
  }, first)
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForFunction(() => document.querySelector('.make-preview img')?.naturalWidth > 0)
  assert.equal(await page.$eval('[data-testid="deposit-address"]', element => element.textContent.trim()), first)
  results.legacyPendingPhotoRestored = true

  // Stop precisely inside embedding, then refresh before a finished PNG exists.
  await page.evaluate(() => {
    const post = Worker.prototype.postMessage
    Worker.prototype.postMessage = function(message, ...rest) {
      if (message?.op === 'make') { window.__heldMake = true; return }
      return post.call(this, message, ...rest)
    }
  })
  await fund(page, first, 10000000)
  await page.waitForFunction(() => window.__heldMake === true)
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('zats.pending'))?.address), first)
  await page.reload({ waitUntil: 'networkidle0' })
  await made(page)
  const firstHash = await digest(page, '.make-grid .done-photo img')
  const firstPng = await pngBytes(page)
  assert.equal(await page.evaluate(() => localStorage.getItem('zats.pending')), null)
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('zats.tokens')).length), 1)
  results.reloadDuringEmbeddingResumedSameAccount = true

  await page.click('.make-grid .done-again')
  const second = await start(page)
  assert.notEqual(first, second)
  await history(page)
  await openPhoto(page, first, firstHash)
  // Viewing an old photo must not stop the current deposit watcher.
  assert.equal(await page.$eval('[data-testid="deposit-address"]', element => element.textContent.trim()), second)
  await fund(page, second, 20000000)
  await made(page)
  await closePhoto(page)
  const secondHash = await digest(page, '.make-grid .done-photo img')
  const secondPng = await pngBytes(page)
  assert.notEqual(firstHash, secondHash)
  results.viewingHistoryPreservesCurrentDeposit = true

  await page.reload({ waitUntil: 'networkidle0' })
  await history(page)
  await openPhoto(page, first, firstHash)
  await closePhoto(page)
  await openPhoto(page, second, secondHash)
  await closePhoto(page)
  results.multipleExactPngsSurviveReload = true

  // Both modes expose one shared list; moving between them preserves its open state and records.
  await page.goto(base + '#redeem', { waitUntil: 'networkidle0' })
  await page.waitForSelector('.action-history details.saved[open] .group', { visible: true })
  assert.equal(await page.$$eval('details.saved', elements => elements.length), 1)
  assert.equal(await page.$eval('.saved-count', element => element.textContent), '2')
  await openPhoto(page, first, firstHash)
  const dialogStyle = await page.$eval('dialog[open]', element => ({
    background: getComputedStyle(element).backgroundColor,
    opacity: getComputedStyle(element).opacity,
  }))
  assert.match(dialogStyle.background, /^rgb\(\d+, \d+, \d+\)$/)
  assert.equal(dialogStyle.opacity, '1')
  await closePhoto(page)
  results.sameHistoryAndPhotosOnRedeem = true
  results.photoDialogHasOpaqueBackground = true

  // Simulate a claim made elsewhere, leaving History open on Redeem throughout.
  await page.evaluate(address => {
    window.__fake.state.unreceived[address] = []
    window.__fake.state.accounts[address] = { height: 2, balances: {}, frontier: null }
  }, first)
  await status(page, first, 'Claimed')
  await page.setOfflineMode(true)
  await openPhoto(page, first, firstHash)
  await closePhoto(page)
  await page.setOfflineMode(false)
  results.claimStatusRefreshesWithoutRetoggling = true
  results.claimedPhotoAvailableOffline = true

  await fund(page, second, 5000000)
  await page.waitForFunction(selector => document.querySelector(selector)?.textContent.includes('25,000,000'), { timeout: 15000 }, row(second) + ' strong')
  await openPhoto(page, second, secondHash)
  assert((await page.$eval('dialog[open] .done-badge', element => element.textContent)).includes('20,000,000'))
  await closePhoto(page)
  results.amountRefreshDoesNotRelabelArchivedPng = true

  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')) })
  await wait(300)
  const reads = await page.evaluate(() => window.__fake.state.calls['ledger.getAccountInfoByAddress'])
  await fund(page, second, 5000000)
  await wait(5600)
  assert.equal(await page.evaluate(() => window.__fake.state.calls['ledger.getAccountInfoByAddress']), reads)
  await page.evaluate(() => { delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')) })
  await page.waitForFunction(selector => document.querySelector(selector)?.textContent.includes('30,000,000'), { timeout: 3000 }, row(second) + ' strong')
  results.hiddenPollingPausesAndVisibilityRefreshes = true

  const other = await newPage()
  const third = await start(other)
  await page.waitForSelector(row(third))
  assert.equal(await page.$eval('.saved-count', element => element.textContent), '3')
  await page.bringToFront()
  await status(page, third, 'Nothing arrived')
  await page.click(row(third) + ' .saved-trash')
  await page.click(row(third) + ' .saved-trash')
  await page.waitForSelector(row(third), { hidden: true })
  await other.waitForFunction(() => document.querySelector('.saved-count')?.textContent === '2')
  results.otherTabsUpdateHistoryWithoutReload = true
  await other.close()

  // Old versions marked photo=true but kept no PNG. They must still offer recreation.
  await page.evaluate(async address => {
    const db = await new Promise((resolve, reject) => { const req = indexedDB.open('zats', 1); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('photos', 'readwrite'); tx.objectStore('photos').delete('made:' + address)
        tx.oncomplete = resolve; tx.onabort = () => reject(tx.error)
      })
    } finally { db.close() }
    window.__fake.fund(address, 10000000n)
    window.dispatchEvent(new Event('focus'))
  }, first)
  await status(page, first, 'Unclaimed')
  await page.waitForSelector(row(first) + ' [data-testid="saved-recreate-photo"]')
  assert.equal(await page.$eval(row(first) + ' [data-testid="saved-recreate-photo"]', element => element.textContent.trim()), 'Recreate photo')
  await page.click(row(first) + ' [data-testid="saved-recreate-photo"]')
  await page.waitForFunction(() => location.hash === '#hide')
  await page.waitForSelector('[data-testid="make-photo-input"]')
  await (await page.$('[data-testid="make-photo-input"]')).uploadFile(sample)
  await made(page)
  await openPhoto(page, first, await digest(page, '.make-grid .done-photo img'))
  await closePhoto(page)
  results.legacyPhotoFlagDoesNotHideRecovery = true
  results.recreateFromRedeemReturnsToHide = true
  assert.equal(await page.evaluate(() => window.__fake.state.published.length), 0)

  // Abort the archive transaction while keeping its source valid. A refresh must retry only
  // image creation for the same account, with no publication or additional deposit address.
  const isolated = await browser.createBrowserContext()
  const failedSave = await newPage(isolated)
  const retryAddress = await start(failedSave)
  await failedSave.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function(value, key) {
      const req = put.call(this, value, key)
      if (typeof key === 'string' && key.startsWith('made:')) this.transaction.abort()
      return req
    }
  })
  await fund(failedSave, retryAddress, 10000000)
  await made(failedSave)
  await failedSave.waitForSelector('[data-testid="photo-save-warning"]')
  assert.equal(await failedSave.evaluate(() => JSON.parse(localStorage.getItem('zats.pending'))?.address), retryAddress)
  await failedSave.reload({ waitUntil: 'networkidle0' })
  await made(failedSave)
  assert.equal(await failedSave.$('[data-testid="photo-save-warning"]'), null)
  assert.equal(await failedSave.evaluate(() => localStorage.getItem('zats.pending')), null)
  assert.equal(await failedSave.evaluate(() => JSON.parse(localStorage.getItem('zats.tokens')).length), 1)
  await history(failedSave)
  await failedSave.waitForSelector(row(retryAddress) + ' [data-testid="saved-view-photo"]')
  assert.equal(await failedSave.evaluate(() => window.__fake.state.published.length), 0)
  results.abortedArchiveKeepsReloadRecovery = true
  await isolated.close()

  // A different browser receives the file: it has no creation record or archived copy.
  const recipientContext = await browser.createBrowserContext()
  const recipient = await newPage(recipientContext)
  await recipient.goto(base + '#redeem', { waitUntil: 'networkidle0' })
  await fund(recipient, first, 10000000)
  await recipient.evaluate(() => {
    WebSocket.prototype.send = function(raw) {
      const message = JSON.parse(raw)
      setTimeout(() => this._fire('message', new MessageEvent('message', { data: JSON.stringify({
        jsonrpc: '2.0', id: message.id, error: { code: -32000, message: 'Offline recovery fixture' },
      }) })), 5)
    }
  })
  await uploadIncoming(recipient, firstPng)
  await recipient.waitForSelector('[data-redeem="failed"]', { timeout: 30000 })
  await history(recipient)
  await openPhoto(recipient, first, firstHash)
  assert.equal(await recipient.$('dialog[open] .done-badge'), null)
  assert((await recipient.$eval('dialog[open] .pay-note', element => element.textContent)).includes('Saved from Redeem'))
  await closePhoto(recipient)
  const importedAt = await recipient.evaluate(() => JSON.parse(localStorage.getItem('zats.tokens'))[0].createdAt)
  await recipient.reload({ waitUntil: 'networkidle0' })
  await history(recipient)
  await status(recipient, first, 'Unclaimed')
  await openPhoto(recipient, first, firstHash)
  await closePhoto(recipient)
  await uploadIncoming(recipient, firstPng)
  await recipient.waitForFunction(() => document.querySelector('[data-testid="claim-state"]')?.textContent === 'Unclaimed')
  assert.deepEqual(await recipient.evaluate(() => JSON.parse(localStorage.getItem('zats.tokens')).map(record => ({ createdAt: record.createdAt, origin: record.origin, amount: record.amount }))),
    [{ createdAt: importedAt, origin: 'opened', amount: 10000000 }])
  await openPhoto(recipient, first, firstHash)
  await closePhoto(recipient)
  results.incomingPngSavedBeforeOfflineNodeRead = true
  results.incomingHistorySurvivesReloadWithoutDuplicates = true

  // A failed import transaction must warn while preserving the incoming account's key.
  await fund(recipient, second, 20000000)
  await recipient.evaluate(() => {
    const add = IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add = function(value, key) {
      const req = add.call(this, value, key)
      if (typeof key === 'string' && key.startsWith('made:')) this.transaction.abort()
      return req
    }
  })
  await uploadIncoming(recipient, secondPng)
  await recipient.waitForSelector('[data-testid="redeem-history-warning"]', { visible: true })
  assert.equal(await recipient.evaluate(() => JSON.parse(localStorage.getItem('zats.tokens')).length), 2)
  await (await recipient.$('[data-testid="redeem-input"]')).uploadFile(sample)
  await recipient.waitForSelector('[data-redeem="erased"]')
  assert.equal(await recipient.evaluate(() => JSON.parse(localStorage.getItem('zats.tokens')).length), 2)
  assert.equal(await recipient.evaluate(() => window.__fake.state.published.length), 0)
  results.failedIncomingArchiveWarnsAndKeepsKey = true
  results.invalidImageDoesNotEnterHistory = true
  await recipientContext.close()

  assert.deepEqual(logs, [])
  console.log(JSON.stringify({ historyRecovery: results, mainnetTransactions: 0 }, null, 2))
} catch (error) {
  console.error(JSON.stringify({ historyRecoveryCompletedBeforeFailure: results }, null, 2))
  throw error
} finally {
  await browser.close()
}
