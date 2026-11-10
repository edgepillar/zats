import { convertIndexedToRgb, decode, encode, hasPngSignature } from 'fast-png'
import type { Pixels } from './stego'

/**
 * PNG bytes are decoded and encoded in JavaScript rather than through a canvas, because some
 * browsers add fingerprinting noise to canvas pixel reads, which would corrupt the hidden bits.
 */

export function isPng(bytes: Uint8Array): boolean {
  return hasPngSignature(bytes)
}

export interface DecodedImage {
  pixels: Pixels
  /** Anything about the file that means low bits were probably rewritten. */
  warnings: string[]
}

export function decodePng(bytes: Uint8Array): DecodedImage {
  const png = decode(bytes)
  const warnings: string[] = []
  let data: Uint8Array | Uint8ClampedArray | Uint16Array = png.data
  let channels = png.channels

  if (png.palette) {
    data = convertIndexedToRgb(png)
    channels = png.transparency ? 4 : 3
    warnings.push('The PNG was converted to a 256-colour palette.')
  }
  if (png.depth === 16) {
    const eight = new Uint8Array(data.length)
    for (let i = 0; i < data.length; i++) eight[i] = (data as Uint16Array)[i] >> 8
    data = eight
    warnings.push('The PNG was converted to 16-bit colour.')
  } else if (png.depth !== 8 && !png.palette) {
    warnings.push(`Unexpected ${png.depth}-bit PNG.`)
  }
  if (channels === 1 || channels === 2) {
    const rgb = new Uint8Array(png.width * png.height * 3)
    for (let p = 0; p < png.width * png.height; p++) {
      const v = data[p * channels]
      rgb[p * 3] = rgb[p * 3 + 1] = rgb[p * 3 + 2] = v
    }
    data = rgb
    channels = 3
    warnings.push('The PNG was converted to greyscale.')
  }
  return {
    pixels: { width: png.width, height: png.height, channels: channels as 3 | 4, data: data as Uint8Array },
    warnings,
  }
}

export function encodePng(px: Pixels): Uint8Array {
  return encode({ width: px.width, height: px.height, channels: px.channels, depth: 8, data: px.data as Uint8Array })
}
