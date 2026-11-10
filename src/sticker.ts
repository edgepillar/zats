import { embed, extract, type Pixels } from './stego'
import { decodePng, encodePng } from './png'

/** Making a sticker: pure functions, safe to run in a worker or in Node tests. */

/** Drops the alpha channel. The caller has already composited the photo onto white. */
export function rgbaToRgb(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Pixels {
  const rgb = new Uint8Array(width * height * 3)
  for (let p = 0, q = 0; p < rgba.length; p += 4, q += 3) {
    rgb[q] = rgba[p]
    rgb[q + 1] = rgba[p + 1]
    rgb[q + 2] = rgba[p + 2]
  }
  return { width, height, channels: 3, data: rgb }
}

export interface MadeSticker {
  png: Uint8Array
  width: number
  height: number
  copies: number
}

/**
 * Hides the token, encodes the PNG with fast-png (never canvas.toBlob), then decodes the result and
 * checks the token comes back intact. Throws if it doesn't, so a bad sticker is never shown.
 */
export function makeStickerPng(px: Pixels, token: string): MadeSticker {
  const png = encodePng(embed(px, new TextEncoder().encode(token)))
  const check = extract(decodePng(png).pixels)
  if (check.status !== 'intact' || new TextDecoder().decode(check.payload) !== token) {
    throw new Error('Self-check failed: the sticker did not read back intact.')
  }
  return { png, width: px.width, height: px.height, copies: check.copies }
}
