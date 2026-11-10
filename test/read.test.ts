import { describe, expect, it } from 'vitest'
import { readStickerFromBytes, readStickerFromFile } from '../src/read'
import { sniffImage } from '../src/imageInfo'
import { makeStickerPng } from '../src/sticker'
import { encodePng } from '../src/png'
import { isTestPayload, makeTestPayload, parseTestPayload } from '../src/testPayload'
import type { Pixels } from '../src/stego'

function photo(width: number, height: number): Pixels {
  const data = new Uint8Array(width * height * 3)
  let s = 42
  for (let i = 0; i < data.length; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    data[i] = s >>> 24
  }
  return { width, height, channels: 3, data }
}

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)))

describe('readStickerFromBytes', () => {
  it('reads a sticker back to the exact token', () => {
    const token = 'cashuB' + 'o2FteBxodHRwczovL3Rlc3RudXQuY2FzaHUuc3BhY2VhdWNzYXQ'.repeat(12)
    const { png } = makeStickerPng(photo(160, 120), token)
    const r = readStickerFromBytes(png)
    expect(r).toMatchObject({ ok: true, status: 'intact', token, format: 'png', width: 160, height: 120, size: png.length })
  })

  it('says "none" for a PNG without a sticker', () => {
    expect(readStickerFromBytes(encodePng(photo(80, 60)))).toMatchObject({ ok: false, reason: 'none', format: 'png' })
  })

  it('says "erased" for a JPEG, with its pixel size', () => {
    // SOI, APP0 (JFIF), SOF0 with height 480 and width 640
    const jpeg = bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], 'JFIF', [0, 1, 1, 0, 0, 1, 0, 1, 0, 0],
      [0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])
    expect(readStickerFromBytes(jpeg)).toMatchObject({ ok: false, reason: 'erased', format: 'jpeg', width: 640, height: 480 })
  })

  it('turns away a PNG far bigger than Kakaonut makes, without decoding it', () => {
    // Only the header: a real 6000 × 8000 PNG would take seconds and ~144 MB to decode.
    const png = encodePng(photo(2, 2))
    new DataView(png.buffer, png.byteOffset).setUint32(16, 6000)
    new DataView(png.buffer, png.byteOffset).setUint32(20, 8000)
    expect(readStickerFromBytes(png)).toMatchObject({ ok: false, reason: 'none', width: 6000, height: 8000 })
  })

  it('says "unreadable" for something that is not an image', () => {
    expect(readStickerFromBytes(bytes('hello, not an image'))).toMatchObject({ ok: false, reason: 'unreadable' })
  })

  it('works from a Blob', async () => {
    const { png } = makeStickerPng(photo(100, 100), makeTestPayload(100, 100))
    const r = await readStickerFromFile(new Blob([png as BlobPart], { type: 'image/png' }))
    expect(r.ok && isTestPayload(r.token)).toBe(true)
  })
})

describe('sniffImage', () => {
  it('reads WebP (VP8X), GIF and HEIC sizes', () => {
    const webp = bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8X', [10, 0, 0, 0, 0, 0, 0, 0], [0x7f, 0x02, 0x00, 0xdf, 0x01, 0x00])
    expect(sniffImage(webp)).toEqual({ format: 'webp', width: 640, height: 480 })
    expect(sniffImage(bytes('GIF89a', [0x80, 0x02, 0xe0, 0x01]))).toEqual({ format: 'gif', width: 640, height: 480 })
    const heic = bytes([0, 0, 0, 24], 'ftypheic', [0, 0, 0, 0], 'mif1heic', [0, 0, 0, 20], 'ispe', [0, 0, 0, 0],
      [0, 0, 0x0f, 0xc0], [0, 0, 0x0b, 0xd0])
    expect(sniffImage(heic)).toEqual({ format: 'heic', width: 4032, height: 3024 })
  })
})

describe('test payload', () => {
  it('is about 900 bytes, clearly marked, and records its size', () => {
    const p = makeTestPayload(1280, 960)
    expect(p.length).toBe(900)
    expect(p.startsWith('cashuB')).toBe(true)
    expect(p).toContain('NOT-MONEY')
    expect(parseTestPayload(p)).toEqual({ width: 1280, height: 960 })
    expect(parseTestPayload('cashuBo2Ftd...')).toBeNull()
  })
})
