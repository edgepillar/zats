import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { TEST_MINT, WALLET_URL, makePhotoJpeg, paidTestQuote } from './helpers'

test('make → pay (test mint) → download → open: intact and unclaimed', async ({ page }) => {
  await page.goto('./')
  const photo = await makePhotoJpeg(page, 2400, 1600)
  await page.getByTestId('make-photo-input').setInputFiles({ name: 'lunch.jpg', mimeType: 'image/jpeg', buffer: photo })
  await page.getByTestId('amount-input').fill('21')
  await page.getByRole('button', { name: 'Pay 21 sats' }).click()

  // The invoice is saved before it is shown.
  await expect(page.getByTestId('invoice')).toBeVisible()
  const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('kakaonut.pending') ?? 'null'))
  expect(pending).toMatchObject({ mint: TEST_MINT, amount: 21 })
  expect(pending.request).toMatch(/^ln/)

  const done = page.getByTestId('made-photo')
  await expect(done).toBeVisible({ timeout: 45_000 })
  await expect(done).toContainText('21 sats are hidden in your photo')

  // The token was saved before it went into the photo; the pending invoice is gone.
  const stored = await page.evaluate(() => ({
    tokens: JSON.parse(localStorage.getItem('kakaonut.tokens') ?? '[]'),
    pending: localStorage.getItem('kakaonut.pending'),
  }))
  expect(stored.pending).toBeNull()
  expect(stored.tokens).toHaveLength(1)
  expect(stored.tokens[0]).toMatchObject({ amount: 21, mint: TEST_MINT, photo: true })

  // It's already in a photo, so History offers Take back but not "Put in a photo".
  await page.locator('.saved-summary').click()
  const row = page.locator('.saved-item')
  await expect(row.getByRole('link', { name: 'Take back' })).toHaveCount(1, { timeout: 15_000 })
  await expect(row.getByRole('button', { name: 'Put in a photo' })).toHaveCount(0)

  const [download] = await Promise.all([page.waitForEvent('download'), done.getByRole('button', { name: /Download/ }).click()])
  expect(download.suggestedFilename()).toBe('kakaonut-21-sats.png')
  const png = await readFile((await download.path())!)

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Redeem' }).click()
  await page.getByTestId('redeem-input').setInputFiles({ name: 'from-friend.png', mimeType: 'image/png', buffer: png })
  await expect(page.locator('[data-redeem="money"]')).toBeVisible()
  await expect(page.locator('.token-num')).toHaveText('21')
  await expect(page.getByTestId('claim-state')).toHaveText('Unclaimed')
  await expect(page.getByRole('link', { name: 'Claim in Kakaonut' })).toHaveAttribute(
    'href',
    `${WALLET_URL}/#token=${stored.tokens[0].token}`,
  )
})

test('an invoice paid during a reload is resumed, minted and saved', async ({ page }) => {
  const { quote, request } = await paidTestQuote(5)
  await page.addInitScript(
    (p) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('kakaonut.pending', JSON.stringify(p))
        sessionStorage.setItem('seeded', '1')
      }
    },
    { mint: TEST_MINT, amount: 5, quote, request, createdAt: Date.now(), edge: 640 },
  )
  await page.goto('./')
  // No photo survived the reload, so it asks for one; the sats are already saved.
  await expect(page.getByText('Paid! Your bitcoin is saved, but the page reloaded. Choose your photo again.')).toBeVisible({ timeout: 30_000 })
  const tokens = await page.evaluate(() => JSON.parse(localStorage.getItem('kakaonut.tokens') ?? '[]'))
  expect(tokens).toHaveLength(1)
  expect(tokens[0].photo).toBe(false)
  expect(await page.evaluate(() => localStorage.getItem('kakaonut.pending'))).toBeNull()
  // Not in a photo yet, so History offers to put it in one.
  await page.locator('.saved-summary').click()
  const put = page.locator('.saved-item').getByRole('button', { name: 'Put in a photo' })
  await expect(put).toHaveCount(1, { timeout: 15_000 })

  const photo = await makePhotoJpeg(page, 1200, 900)
  await page.getByTestId('make-photo-input').setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: photo })
  await expect(page.getByTestId('made-photo')).toContainText('5 sats are hidden in your photo')
  await expect(page.locator('.saved-item')).toHaveCount(1)
  await expect(put).toHaveCount(0)
})

test('a reload while the invoice is open keeps the chosen photo', async ({ page }) => {
  await page.goto('./')
  const photo = await makePhotoJpeg(page, 1600, 1200)
  await page.getByTestId('make-photo-input').setInputFiles({ name: 'dinner.jpg', mimeType: 'image/jpeg', buffer: photo })
  await page.getByTestId('amount-input').fill('7')

  // Hold back the "is it paid?" checks so the reload happens while the invoice is still open.
  const holdChecks = (route: import('@playwright/test').Route) =>
    route.request().method() === 'GET' ? route.abort() : route.continue()
  await page.route('**/v1/mint/quote/bolt11/**', holdChecks)
  await page.getByRole('button', { name: 'Pay 7 sats' }).click()
  await expect(page.getByTestId('invoice')).toBeVisible()
  await page.unroute('**/v1/mint/quote/bolt11/**', holdChecks)

  await page.reload()
  const done = page.getByTestId('made-photo')
  await expect(done).toBeVisible({ timeout: 45_000 })
  await expect(done).toContainText('7 sats are hidden in your photo')
  await expect(page.getByText('Choose your photo again')).toHaveCount(0)
})
