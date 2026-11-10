import { expect, test } from '@playwright/test'

test('How it works opens from the footer on the simple explanation', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('link', { name: 'KakaoTalk test' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Ecash by Cashu' })).toHaveAttribute('href', 'https://cashu.space')

  await page.getByRole('link', { name: 'How it works' }).click()
  await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Simple' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: 'Pick a photo and an amount' })).toBeVisible()

  // Arrow keys move between the tabs, like any tab list.
  await page.getByRole('tab', { name: 'Simple' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Advanced' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: 'Hidden in the lowest bits' })).toBeVisible()
  await expect(page.locator('.frame code')).toHaveText(['SATS', '01', 'u32', 'cashuB…', 'CRC-32'])

  await page.getByRole('button', { name: '한국어' }).click()
  await expect(page.getByRole('tab', { name: '자세히' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: '쉽게' }).click()
  await expect(page.getByRole('heading', { name: '사진과 금액을 골라요' })).toBeVisible()
})
