/**
 * Works out what kind of image a file is, and its pixel size, from the bytes alone.
 * No canvas and no <img>, so it also works for formats the browser can't display (HEIC in Chrome).
 */

export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'heic' | 'avif' | 'gif' | 'unknown'

export interface ImageInfo {
  format: ImageFormat
  width?: number
  height?: number
}

/** Display name of a format, the same in every language. */
export const FORMAT_NAMES: Record<Exclude<ImageFormat, 'unknown'>, string> = {
  png: 'PNG',
  jpeg: 'JPEG',
  webp: 'WebP',
  heic: 'HEIC',
  avif: 'AVIF',
  gif: 'GIF',
}

const be16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1]
const be32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
const le16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)
const le24 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n))

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'])
const AVIF_BRANDS = new Set(['avif', 'avis'])

export function sniffImage(bytes: Uint8Array): ImageInfo {
  if (bytes.length >= 24 && PNG_SIGNATURE.every((v, i) => bytes[i] === v)) {
    return { format: 'png', width: be32(bytes, 16), height: be32(bytes, 20) }
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { format: 'jpeg', ...jpegSize(bytes) }
  }
  if (bytes.length >= 10 && ascii(bytes, 0, 4) === 'GIF8') {
    return { format: 'gif', width: le16(bytes, 6), height: le16(bytes, 8) }
  }
  if (bytes.length >= 16 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return { format: 'webp', ...webpSize(bytes) }
  }
  if (bytes.length >= 16 && ascii(bytes, 4, 4) === 'ftyp') {
    const boxSize = Math.min(be32(bytes, 0), bytes.length)
    const brands = [ascii(bytes, 8, 4)]
    for (let o = 16; o + 4 <= boxSize; o += 4) brands.push(ascii(bytes, o, 4))
    const format: ImageFormat | null = brands.some((b) => AVIF_BRANDS.has(b))
      ? 'avif'
      : brands.some((b) => HEIC_BRANDS.has(b))
        ? 'heic'
        : null
    if (format) return { format, ...heifSize(bytes) }
  }
  return { format: 'unknown' }
}

function jpegSize(b: Uint8Array): { width?: number; height?: number } {
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++
      continue
    }
    const marker = b[i + 1]
    if (marker === 0xff) {
      i++
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2
      continue
    }
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof) return { height: be16(b, i + 5), width: be16(b, i + 7) }
    i += 2 + be16(b, i + 2)
  }
  return {}
}

function webpSize(b: Uint8Array): { width?: number; height?: number } {
  const chunk = ascii(b, 12, 4)
  if (chunk === 'VP8 ' && b.length >= 30) {
    return { width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff }
  }
  if (chunk === 'VP8L' && b.length >= 25) {
    const [b0, b1, b2, b3] = [b[21], b[22], b[23], b[24]]
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    }
  }
  if (chunk === 'VP8X' && b.length >= 30) {
    return { width: 1 + le24(b, 24), height: 1 + le24(b, 27) }
  }
  return {}
}

/** HEIC and AVIF store sizes in 'ispe' boxes. Thumbnails have their own, so take the largest. */
function heifSize(b: Uint8Array): { width?: number; height?: number } {
  let best: { width: number; height: number } | undefined
  const last = Math.min(b.length - 16, 1 << 20) // an ispe box needs 16 bytes from its type field
  for (let i = 4; i <= last; i++) {
    if (b[i] === 0x69 && b[i + 1] === 0x73 && b[i + 2] === 0x70 && b[i + 3] === 0x65) {
      const width = be32(b, i + 8)
      const height = be32(b, i + 12)
      if (!best || width * height > best.width * best.height) best = { width, height }
    }
  }
  return best ?? {}
}
