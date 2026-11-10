import { expect, test } from '@playwright/test'
import { makePhotoJpeg } from './helpers'

for (const colorScheme of ['light'] as const) {
  for (const lang of ['en', 'ko'] as const) {
    test(`360 px, ${lang}: no horizontal scroll`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 760 })
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await page.addInitScript((l) => localStorage.setItem('kakaonut.lang', JSON.stringify(l)), lang)
      await page.goto('./#test')
      await expect(page.locator('html')).toHaveAttribute('lang', lang)

      const photo = await makePhotoJpeg(page, 1600, 1200)
      await page.getByTestId('test-photo-input').setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: photo })
      await expect(page.getByTestId('test-sticker')).toHaveCount(3, { timeout: 60_000 })
      await page.waitForTimeout(400)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
      await page.screenshot({ path: `test-results/shots/test-${colorScheme}-${lang}.png`, fullPage: true })

      await page.locator('.foot a[href="#redeem"]').click()
      await page.getByTestId('redeem-input').setInputFiles({ name: 'resaved-photo-from-kakaotalk.jpg', mimeType: 'image/jpeg', buffer: photo })
      await expect(page.locator('[data-redeem="erased"]')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
      await page.screenshot({ path: `test-results/shots/redeem-${colorScheme}-${lang}.png`, fullPage: true })

      await page.locator('.modes a[href="#hide"]').click()
      await page.getByTestId('make-photo-input').setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: photo })
      await expect(page.locator('.picker--has')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
      await page.screenshot({ path: `test-results/shots/make-${colorScheme}-${lang}.png`, fullPage: true })
    })
  }
}

test('language toggle switches instantly and is remembered', async ({ page }) => {
  await page.goto('./#test')
  await page.getByRole('button', { name: '한국어' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko')
  await expect(page).toHaveTitle('카카오넛: 사진 속에 숨긴 비트코인')
  await expect(page.locator('.foot')).toContainText('프라이버시 에디션')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko')
  await page.getByRole('button', { name: 'EN' }).click()
  await expect(page).toHaveTitle('Kakaonut: bitcoin hidden in a photo')
})

test('always light, even when the phone prefers dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('./')
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bg).toBe('rgb(255, 255, 255)')
})

test('Hide and Redeem: two doors in the top bar, the hero and the footer', async ({ page }) => {
  await page.goto('./')
  const nav = page.getByRole('navigation', { name: 'Main' })
  // A fresh visit opens on Hide.
  await expect(nav.getByRole('link', { name: 'Hide' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Hide bitcoin in your photo' })).toBeVisible()

  await page.locator('.hero').getByRole('link', { name: 'Redeem a photo' }).click()
  await expect(page).toHaveURL(/#redeem$/)
  await expect(nav.getByRole('link', { name: 'Redeem' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Redeem a photo' })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Choose photo', exact: true })).toBeVisible()

  await nav.getByRole('link', { name: 'Hide' }).click()
  await expect(page.getByRole('heading', { name: 'Hide bitcoin in your photo' })).toBeInViewport()

  await page.locator('.foot').getByRole('link', { name: 'Redeem a photo' }).click()
  await expect(page.getByRole('heading', { name: 'Redeem a photo' })).toBeInViewport()
})

test('a #redeem link lands on the Redeem card, in view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./#redeem')
  await expect(page.getByRole('heading', { name: 'Redeem a photo' })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Choose photo', exact: true })).toBeInViewport()
})
