import { expect, test, type Page } from '@playwright/test'
import { makePhotoJpeg } from './helpers'

/** Edge cases on the Hide side, checked in Korean on a 360 px phone. */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => localStorage.setItem('kakaonut.lang', JSON.stringify('ko')))
})

const pay = (page: Page) => page.locator('.pay-group .btn--primary')

/** A flat PNG of the given size, drawn in the page. */
async function makePng(page: Page, width: number, height: number): Promise<Buffer> {
  const bytes = await page.evaluate(
    async ([w, h]) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      c.getContext('2d')!.fillRect(0, 0, w, h)
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'))
      return [...new Uint8Array(await blob.arrayBuffer())]
    },
    [width, height] as const,
  )
  return Buffer.from(bytes)
}

test('a long amount shrinks to fit beside "sats", and over the limit says what the limit is', async ({ page }) => {
  await page.goto('./#hide')
  const amount = page.getByTestId('amount-input')
  for (const value of ['1000000', '99999999']) {
    await amount.fill(value)
    const gap = await page.evaluate(
      () => document.querySelector('.amount-unit')!.getBoundingClientRect().left - document.querySelector('.amount-sizer')!.getBoundingClientRect().right,
    )
    expect(gap, value).toBeGreaterThanOrEqual(0)
  }
  await expect(page.locator('#make-amount-error')).toHaveText('사진 한 장에 최대 1,000,000 sats까지 담을 수 있어요.')

  // Full-width digits from a CJK keyboard count as digits.
  await amount.fill('１２３４')
  await expect(amount).toHaveValue('1,234')
})

test('a photo too small to hold the bitcoin is turned away before paying', async ({ page }) => {
  await page.goto('./#hide')
  await page.getByTestId('make-photo-input').setInputFiles({ name: 'icon.png', mimeType: 'image/png', buffer: await makePng(page, 24, 24) })
  await expect(page.locator('.make-photo .field-error')).toHaveText('사진이 너무 작아서 비트코인을 담을 수 없어요. 더 큰 사진을 골라 주세요.')
  await expect(pay(page)).toBeDisabled()
})

test('when the mint can’t be reached, the error is in Korean', async ({ page, context }) => {
  await page.goto('./#hide')
  const photo = await makePhotoJpeg(page, 1200, 900)
  await page.getByTestId('make-photo-input').setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: photo })
  await context.route(/testnut/, (r) => r.abort('internetdisconnected'))
  await pay(page).click()
  const alert = page.locator('.make-panel [role="alert"]')
  await expect(alert).toContainText('민트에 연결하지 못했어요.')
  await expect(alert).not.toContainText('Failed to fetch')
})

test('if the invoice can’t be saved on the device, the page says to keep it open', async ({ page }) => {
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'kakaonut.pending') throw new DOMException('full', 'QuotaExceededError')
      return set.call(this, key, value)
    }
  })
  await page.goto('./#hide')
  const photo = await makePhotoJpeg(page, 1200, 900)
  await page.getByTestId('make-photo-input').setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: photo })
  await page.getByTestId('amount-input').fill('21')
  await pay(page).click()
  await expect(page.locator('.invoice-warn')).toContainText('이 페이지를 닫지 마세요')
})
