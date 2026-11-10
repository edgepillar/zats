import { expect, test, type Page } from '@playwright/test'
import { Wallet } from '@cashu/cashu-ts'
import { TEST_MINT, WALLET_URL, mintTestToken } from './helpers'
import { makeStickerPng } from '../src/sticker'
import type { Pixels } from '../src/stego'

/** A noise photo with `token` hidden in it, opened on the Open page. */
async function openPhotoWith(page: Page, token: string) {
  const w = 320
  const h = 240
  const data = new Uint8Array(w * h * 3)
  for (let i = 0; i < data.length; i++) data[i] = (i * 7919) & 0xff
  const pixels: Pixels = { width: w, height: h, channels: 3, data }
  const { png } = makeStickerPng(pixels, token)
  await page.goto('./#redeem')
  await page.getByTestId('redeem-input').setInputFiles({ name: 'gift.png', mimeType: 'image/png', buffer: Buffer.from(png) })
  await expect(page.getByTestId('claim-state')).toHaveText('Unclaimed')
}

test('the claim card offers Kakaonut, Copy and Send to Lightning', async ({ page }) => {
  const token = await mintTestToken(21)
  await openPhotoWith(page, token)
  await expect(page.getByRole('link', { name: 'Claim in Kakaonut' })).toHaveAttribute('href', `${WALLET_URL}/#token=${token}`)
  await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Send to Lightning' }).click()
  await page.getByLabel('Lightning address').fill('not an address')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'doesn’t look like a Lightning address' })).toBeVisible()
})

test('sends a photo’s bitcoin to a Lightning address', async ({ page }) => {
  const token = await mintTestToken(100)

  // A fake Lightning address provider. Its invoices come from the test mint, which settles a melt
  // of its own invoice internally, so nothing touches real Lightning.
  const mint = new Wallet(TEST_MINT, { unit: 'sat' })
  await mint.loadMint()
  const asked: number[] = []
  await page.route('https://kakaonut.test/**', async (route) => {
    const url = new URL(route.request().url())
    const headers = { 'access-control-allow-origin': '*' }
    if (url.pathname === '/.well-known/lnurlp/alice') {
      return route.fulfill({
        headers,
        json: {
          tag: 'payRequest',
          callback: 'https://kakaonut.test/lnurlp/alice/callback',
          minSendable: 1000,
          maxSendable: 100_000_000,
          metadata: '[["text/plain","alice"]]',
        },
      })
    }
    if (url.pathname === '/lnurlp/alice/callback') {
      const sats = Number(url.searchParams.get('amount')) / 1000
      asked.push(sats)
      const quote = await mint.createMintQuoteBolt11(sats, 'Kakaonut e2e')
      return route.fulfill({ headers, json: { pr: quote.request, routes: [] } })
    }
    return route.fulfill({ status: 404, headers, json: { status: 'ERROR', reason: 'not found' } })
  })

  await openPhotoWith(page, token)
  await page.getByRole('button', { name: 'Send to Lightning' }).click()
  await page.getByLabel('Lightning address').fill('Alice@Kakaonut.test')
  await page.getByRole('button', { name: 'Send', exact: true }).click()

  const sent = page.getByTestId('ln-sent')
  await expect(sent).toBeVisible({ timeout: 45_000 })
  await expect(sent).toContainText('Sent to alice@kakaonut.test')
  await expect(sent.locator('.token-num')).toHaveText(String(asked.at(-1)))
  expect(asked.at(-1)).toBeGreaterThan(90)
  expect(asked.at(-1)).toBeLessThanOrEqual(100)

  // The photo's ecash is spent now.
  const states = await mint.checkProofsStates(mint.decodeToken(token).proofs)
  expect(states.every((s) => s.state === 'SPENT')).toBe(true)
})
