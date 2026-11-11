import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'

const base = process.env.ZATS_URL ?? 'http://127.0.0.1:4317/'
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Security probes are local-only')
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
const results = []
try {
  for (const [mode, url, allowEval] of [['mainnet', base, true], ['demo', base + 'demo/', false]]) {
    const page = await browser.newPage()
    await page.evaluateOnNewDocument(() => {
      window.__policyViolations = []
      document.addEventListener('securitypolicyviolation', e => window.__policyViolations.push({ directive: e.effectiveDirective, blocked: e.blockedURI }))
    })
    const response = await page.goto(url, { waitUntil: 'networkidle0' })
    const headers = response.headers()
    assert.equal(headers['x-content-type-options'], 'nosniff')
    assert.equal(headers['x-frame-options'], 'DENY')
    assert.equal(headers['referrer-policy'], 'no-referrer')
    const csp = headers['content-security-policy']
    assert(csp.includes("frame-ancestors 'none'"))
    assert.equal(csp.includes("'unsafe-eval'"), allowEval)
    if (!allowEval) assert(!csp.includes('wss:') && !csp.includes('https:'))

    const script = await page.$eval('script[src]', el => el.src)
    const asset = await fetch(script, { method: 'HEAD' })
    assert.match(asset.headers.get('cache-control'), /max-age=31536000, immutable/)
    for (const name of ['pow.js', 'pow.wasm']) {
      const pow = await fetch(new URL('pow/' + name, url), { method: 'HEAD' })
      assert.equal(pow.status, 200)
      assert(!pow.headers.get('cache-control')?.includes('immutable'))
      if (name.endsWith('.wasm')) assert.match(pow.headers.get('content-type'), /^application\/wasm/)
    }

    await page.addScriptTag({ url: new URL('__e2e__/csp-probe.js', url).href })
    await page.waitForFunction(() => !!window.__zatsCspProbe)
    const probe = await page.evaluate(() => ({ ...window.__zatsCspProbe, violations: window.__policyViolations }))
    assert.equal(probe.evalAllowed, allowEval)
    assert.equal(probe.outsideRequestSucceeded, false)
    assert(probe.violations.some(v => v.directive === 'connect-src' && v.blocked.startsWith('https://example.invalid')))
    if (!allowEval) assert(probe.violations.some(v => v.directive === 'script-src' && v.blocked === 'eval'))

    let timer
    const denied = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Framing was not refused')), 5000)
      page.on('console', message => { if (/frame-ancestors|refused to (?:frame|display)/i.test(message.text())) resolve() })
    })
    await page.evaluate(() => { const frame = document.createElement('iframe'); frame.src = location.href; document.body.append(frame) })
    try { await denied } finally { clearTimeout(timer) }
    results.push({ mode, securityHeaders: true, immutableHashedAssets: true, powFilesNotImmutable: true, evalAllowed: probe.evalAllowed, externalConnectBlocked: true, framingBlocked: true })
    await page.close()
  }
  console.log(JSON.stringify({ securityHeaders: results }, null, 2))
} finally {
  await browser.close()
}
