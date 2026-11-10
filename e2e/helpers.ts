import type { Page } from '@playwright/test'
import { Wallet, getEncodedToken } from '@cashu/cashu-ts'

export const TEST_MINT = 'https://testnut.cashu.space'
/** Where "Claim in Kakaonut" points (src/config.ts). */
export const WALLET_URL = 'https://kakaonut-wallet.vercel.app'

/** A photo-like JPEG (gradients, shapes, noise), drawn in the page so no binary fixture is needed. */
export async function makePhotoJpeg(page: Page, width: number, height: number): Promise<Buffer> {
  const b64 = await page.evaluate(
    async ([w, h]) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')!
      const g = ctx.createLinearGradient(0, 0, w, h)
      g.addColorStop(0, '#ffb347')
      g.addColorStop(0.5, '#6dd5ed')
      g.addColorStop(1, '#2193b0')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = `hsla(${(i * 47) % 360}, 70%, 55%, 0.55)`
        ctx.beginPath()
        ctx.arc((i * 997) % w, (i * 613) % h, 40 + ((i * 31) % 160), 0, Math.PI * 2)
        ctx.fill()
      }
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9))
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let s = ''
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      return btoa(s)
    },
    [width, height] as const,
  )
  return Buffer.from(b64, 'base64')
}

/** Re-encodes an image as JPEG in the page, like a chat app's recompression. */
export async function reencodeAsJpeg(page: Page, png: Buffer): Promise<Buffer> {
  const b64 = await page.evaluate(async (pngB64) => {
    const bytes = Uint8Array.from(atob(pngB64), (ch) => ch.charCodeAt(0))
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const c = document.createElement('canvas')
    c.width = bmp.width
    c.height = bmp.height
    c.getContext('2d')!.drawImage(bmp, 0, 0)
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.95))
    const out = new Uint8Array(await blob.arrayBuffer())
    let s = ''
    for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000))
    return btoa(s)
  }, png.toString('base64'))
  return Buffer.from(b64, 'base64')
}

/** Mints a small token from the test mint (its invoices pay themselves). */
export async function mintTestToken(amount: number): Promise<string> {
  const wallet = new Wallet(TEST_MINT, { unit: 'sat' })
  await wallet.loadMint()
  const quote = await wallet.createMintQuoteBolt11(amount, 'Kakaonut e2e')
  for (let i = 0; i < 30; i++) {
    const s = await wallet.checkMintQuoteBolt11(quote.quote)
    if (s.state === 'PAID') break
    await new Promise((r) => setTimeout(r, 1000))
  }
  const proofs = await wallet.mintProofsBolt11(amount, quote.quote)
  return getEncodedToken({ mint: TEST_MINT, proofs, unit: 'sat', memo: 'Kakaonut' }, { removeDleq: true })
}

/** Creates a test-mint invoice and waits until the mint says it's paid (testnut pays itself). */
export async function paidTestQuote(amount: number): Promise<{ quote: string; request: string }> {
  const wallet = new Wallet(TEST_MINT, { unit: 'sat' })
  await wallet.loadMint()
  const q = await wallet.createMintQuoteBolt11(amount, 'Kakaonut e2e')
  for (let i = 0; i < 30; i++) {
    if ((await wallet.checkMintQuoteBolt11(q.quote)).state === 'PAID') break
    await new Promise((r) => setTimeout(r, 1000))
  }
  return { quote: q.quote, request: q.request }
}
