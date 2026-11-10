// Copies the Zenon SDK's proof-of-work files (pow.js + pow.wasm) into public/pow/, where the SDK's
// browser worker loads them from (see Zenon.setPowBasePath in src/zenon.ts). Runs before dev/build.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'node_modules', 'znn-typescript-sdk', 'dist', 'browser')
const to = join(root, 'public', 'pow')
mkdirSync(to, { recursive: true })
for (const f of ['pow.js', 'pow.wasm']) copyFileSync(join(from, f), join(to, f))
