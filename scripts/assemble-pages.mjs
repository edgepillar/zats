import { cpSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
for (const file of ['dist/index.html', 'dist/pow/pow.js', 'dist/pow/pow.wasm', 'dist-demo/index.html']) {
  if (!existsSync(new URL(file, root))) throw new Error(`Missing build output: ${file}`)
}
cpSync(fileURLToPath(new URL('dist-demo/', root)), fileURLToPath(new URL('dist/demo/', root)), {
  recursive: true,
})
console.log('Pages output: mainnet at /, simulated network at /demo/.')
