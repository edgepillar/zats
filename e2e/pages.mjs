// Serve the combined artifact at a project subpath and test only simulated transactions.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root = fileURLToPath(new URL('../dist/', import.meta.url))
const prefix = process.env.ZATS_TEST_PREFIX ?? '/zats/'
if (!prefix.startsWith('/') || !prefix.endsWith('/')) throw new Error('The test prefix must start and end with /.')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2' }
const { headers } = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost')
    if (!url.pathname.startsWith(prefix)) { res.writeHead(404).end(); return }
    const pathname = decodeURIComponent(url.pathname.slice(prefix.length))
    const file = resolve(root, pathname.endsWith('/') || !pathname ? pathname + 'index.html' : pathname)
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403).end(); return }
    const body = await readFile(pathname.endsWith('__e2e__/csp-probe.js') ? new URL('./csp-probe.js', import.meta.url) : file)
    const extension = file.slice(file.lastIndexOf('.'))
    const responseHeaders = { 'Content-Type': mime[extension] ?? 'application/octet-stream' }
    // Match production policies after removing the simulated hosting prefix.
    for (const rule of headers) {
      if (new RegExp('^' + rule.source + '$').test('/' + pathname)) {
        for (const header of rule.headers) responseHeaders[header.key] = header.value
      }
    }
    res.writeHead(200, responseHeaders).end(body)
  } catch {
    res.writeHead(404).end()
  }
})
await new Promise((ready, reject) => { server.once('error', reject); server.listen(4317, '127.0.0.1', ready) })
const base = 'http://127.0.0.1:4317' + prefix
try {
  for (const [script, extra] of [['flow.mjs', {}], ['demo-flow.mjs', {}], ['demo-flow.mjs', { NO_STORAGE: '1' }], ['security-headers.mjs', {}]]) {
    const code = await new Promise((done, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], {
        stdio: 'inherit',
        env: { ...process.env, ZATS_URL: base, ZATS_DEMO_URL: base + 'demo/', ZATS_USE_DEPLOYMENT_HEADERS: '1', ...extra },
      })
      child.once('error', reject)
      child.once('exit', (code) => done(code ?? 1))
    })
    if (code !== 0) throw new Error(`${script} failed with exit ${code}`)
  }
} finally {
  await new Promise((done) => server.close(done))
}
