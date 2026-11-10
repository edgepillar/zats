import { expect, test } from '@playwright/test'
import { makePhotoJpeg } from './helpers'

test('Redeem explains a photo KakaoTalk compressed, and starts over', async ({ page }) => {
  await page.goto('./#redeem')
  const jpeg = await makePhotoJpeg(page, 1200, 900)
  await page.getByTestId('redeem-input').setInputFiles({ name: 'from-kakaotalk.jpg', mimeType: 'image/jpeg', buffer: jpeg })
  const msg = page.locator('[data-redeem="erased"]')
  await expect(msg).toContainText('KakaoTalk compressed this photo')
  await expect(msg).toContainText('원본 (Original)')
  await expect(page.locator('.redeem-shot')).toContainText('from-kakaotalk.jpg')

  await page.getByRole('button', { name: 'Redeem another photo' }).click()
  await expect(page.getByRole('button', { name: 'Choose photo', exact: true })).toBeVisible()
})

test('Redeem says so when a photo has nothing hidden', async ({ page }) => {
  await page.goto('./#redeem')
  // A plain PNG straight from a canvas: lossless, but nothing inside.
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas')
    c.width = 200
    c.height = 150
    const x = c.getContext('2d')!
    x.fillStyle = '#8ab'
    x.fillRect(0, 0, 200, 150)
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'))
    return [...new Uint8Array(await blob.arrayBuffer())]
  })
  await page.getByTestId('redeem-input').setInputFiles({ name: 'plain.png', mimeType: 'image/png', buffer: Buffer.from(png) })
  await expect(page.locator('[data-redeem="none"]')).toContainText('No bitcoin in this photo')
})

test('switching to Redeem and back keeps the Hide form as it was', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('amount-input').fill('4,321')
  const nav = page.getByRole('navigation', { name: 'Main' })
  await nav.getByRole('link', { name: 'Redeem' }).click()
  await expect(page.getByTestId('amount-input')).toBeHidden()
  await nav.getByRole('link', { name: 'Hide' }).click()
  await expect(page.getByTestId('amount-input')).toHaveValue('4,321')
})
