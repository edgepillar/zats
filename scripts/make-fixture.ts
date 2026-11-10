/**
 * Makes the cross-repo test vector (spec section 4): a PNG with a real test-mint token hidden in it,
 * plus the exact token string. The wallet fork's tests must decode the PNG to exactly this token.
 *
 *   npx vite-node scripts/make-fixture.ts
 */
import { writeFileSync } from 'node:fs'
import { Wallet, getEncodedToken } from '@cashu/cashu-ts'
import { makeStickerPng } from '../src/sticker'
import type { Pixels } from '../src/stego'

const MINT = 'https://testnut.cashu.space'
const AMOUNT = 21

const wallet = new Wallet(MINT, { unit: 'sat' })
await wallet.loadMint()
const q = await wallet.createMintQuoteBolt11(AMOUNT, 'Kakaonut fixture')
for (let i = 0; i < 30 && (await wallet.checkMintQuoteBolt11(q.quote)).state !== 'PAID'; i++) {
  await new Promise((r) => setTimeout(r, 1000))
}
const proofs = await wallet.mintProofsBolt11(AMOUNT, q.quote)
const token = getEncodedToken({ mint: MINT, proofs, unit: 'sat', memo: 'Kakaonut' }, { removeDleq: true })

// A soft gradient "photo", 320×240.
const width = 320
const height = 240
const data = new Uint8Array(width * height * 3)
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3
    data[i] = 255 - Math.round((y / height) * 90)
    data[i + 1] = 180 + Math.round((x / width) * 60)
    data[i + 2] = 90 + Math.round(((x + y) / (width + height)) * 120)
  }
}
const pixels: Pixels = { width, height, channels: 3, data }
const { png } = makeStickerPng(pixels, token)

writeFileSync('test/fixtures/kakaonut-fixture.png', png)
writeFileSync('test/fixtures/kakaonut-fixture.token.txt', token)
console.log(`fixture: ${png.length} bytes, token ${token.length} chars, ${AMOUNT} sat on ${MINT}`)
