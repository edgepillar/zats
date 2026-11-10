import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { makePhotoJpeg } from './helpers'

/**
 * The whole demo, across both apps: make a photo on the site (test mint), then paste it into the
 * wallet fork and claim it. Needs the wallet running:
 *
 *   (cd wallet && E2E=true npx quasar dev --port 8080)
 *   WALLET_URL=http://localhost:8080/ npm run e2e -- wallet.spec.ts
 */
const WALLET_URL = process.env.WALLET_URL

test.skip(!WALLET_URL, 'set WALLET_URL to run the wallet test')

test('site → photo → wallet: paste, scan, claim', async ({ browser }) => {
  test.setTimeout(150_000)
  const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })

  // 1. Make a photo with 50 test sats on the Kakaonut site.
  const site = await ctx.newPage()
  await site.goto('./')
  const photo = await makePhotoJpeg(site, 1600, 1200)
  await site.getByTestId('make-photo-input').setInputFiles({ name: 'lunch.jpg', mimeType: 'image/jpeg', buffer: photo })
  await site.getByTestId('amount-input').fill('50')
  await site.getByRole('button', { name: 'Pay 50 sats' }).click()
  const done = site.getByTestId('made-photo')
  await expect(done).toBeVisible({ timeout: 60_000 })
  const [download] = await Promise.all([site.waitForEvent('download'), done.getByRole('button', { name: /Download/ }).click()])
  const png = await readFile((await download.path())!)

  // 2. A fresh wallet: no onboarding, default mint added.
  const wallet = await ctx.newPage()
  await wallet.goto(WALLET_URL!)
  await expect(wallet.getByTestId('wallet-photo')).toBeVisible({ timeout: 30_000 })
  expect(wallet.url()).not.toContain('welcome')
  await expect
    .poll(() => wallet.evaluate(() => localStorage.getItem('cashu.mints') ?? ''), { timeout: 60_000 })
    .toContain('mint.minibits.cash/Bitcoin')

  // 3. Copy the photo, tap "Paste photo": scan → reveal → claim.
  await wallet.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })])
  }, png.toString('base64'))
  await wallet.getByTestId('wallet-photo').click()
  await expect(wallet.getByTestId('photo-claim-amount')).toContainText('50', { timeout: 20_000 })
  await wallet.getByTestId('photo-claim-claim').click()
  await expect(wallet.getByTestId('photo-claim-received')).toContainText('in your wallet', { timeout: 60_000 })

  // 4. The same photo can't be claimed twice.
  await wallet.getByRole('button', { name: 'Done' }).click()
  await wallet.getByTestId('wallet-photo').click()
  await expect(wallet.getByTestId('photo-claim-error')).toHaveText('You already claimed the bitcoin in this photo.')
  await ctx.close()
})
