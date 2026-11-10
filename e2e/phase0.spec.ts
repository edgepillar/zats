import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { WALLET_URL, makePhotoJpeg, mintTestToken, reencodeAsJpeg } from './helpers'
import { makeStickerPng } from '../src/sticker'
import type { Pixels } from '../src/stego'

async function makeTestStickers(page: Page): Promise<Map<string, Buffer>> {
  await page.goto('./#test')
  const photo = await makePhotoJpeg(page, 3000, 2000)
  await page.getByTestId('test-photo-input').setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: photo })
  const cards = page.getByTestId('test-sticker')
  await expect(cards).toHaveCount(3, { timeout: 60_000 })

  const files = new Map<string, Buffer>()
  for (let i = 0; i < 3; i++) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      cards.nth(i).getByRole('button', { name: 'Download' }).click(),
    ])
    files.set(download.suggestedFilename(), await readFile((await download.path())!))
  }
  return files
}

test('test mode makes 3 sizes without payment, and each reads back intact on Open', async ({ page }) => {
  const files = await makeTestStickers(page)
  expect([...files.keys()].sort()).toEqual(['test-photo-1280.png', 'test-photo-2048.png', 'test-photo-640.png'])

  await page.goto('./#open')
  await page.getByTestId('open-input').setInputFiles(
    [...files].map(([name, buffer]) => ({ name, mimeType: 'image/png', buffer })),
  )
  await expect(page.locator('[data-verdict="intact"]')).toHaveCount(3)
  for (const size of ['2048×1365', '1280×853', '640×427']) {
    await expect(page.getByText(`made at ${size}`)).toBeVisible()
  }
})

test('a JPEG re-save of a test photo is reported as erased', async ({ page }) => {
  const files = await makeTestStickers(page)
  const jpeg = await reencodeAsJpeg(page, files.get('test-photo-640.png')!)
  await page.goto('./#open')
  await page.getByTestId('open-input').setInputFiles({ name: 'kakao-resave.jpg', mimeType: 'image/jpeg', buffer: jpeg })
  const verdict = page.locator('[data-verdict="erased"]')
  await expect(verdict).toBeVisible()
  await expect(verdict).toContainText('This is a JPEG, so the hidden data was erased.')
})

test('copy image, then paste on Open, stays intact (Chromium)', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await makeTestStickers(page)
  await page.getByTestId('test-sticker').nth(2).getByRole('button', { name: 'Copy image' }).click()
  await expect(page.getByText('Copied!')).toBeVisible()

  await page.goto('./#open')
  // The Paste image button goes through navigator.clipboard.read(), where Chrome re-encodes the PNG.
  await page.getByRole('button', { name: 'Paste image' }).click()
  await expect(page.locator('[data-verdict="intact"]')).toHaveCount(1)
  // Keyboard paste goes through the global paste listener.
  await page.keyboard.press('ControlOrMeta+V')
  await expect(page.locator('[data-verdict="intact"]')).toHaveCount(2)
})

test('a real test-mint token hidden in a PNG shows the amount and "Unclaimed"', async ({ page }) => {
  const token = await mintTestToken(21)
  const w = 320
  const h = 240
  const data = new Uint8Array(w * h * 3)
  for (let i = 0; i < data.length; i++) data[i] = (i * 7919) & 0xff
  const pixels: Pixels = { width: w, height: h, channels: 3, data }
  const { png } = makeStickerPng(pixels, token)

  await page.goto('./#open')
  await page.getByTestId('open-input').setInputFiles({ name: 'sticker.png', mimeType: 'image/png', buffer: Buffer.from(png) })
  await expect(page.locator('[data-verdict="intact"]')).toBeVisible()
  await expect(page.locator('.token-num')).toHaveText('21')
  await expect(page.getByTestId('claim-state')).toHaveText('Unclaimed')
  await expect(page.getByRole('link', { name: 'Claim in Kakaonut' })).toHaveAttribute(
    'href',
    `${WALLET_URL}/#token=${token}`,
  )
})
