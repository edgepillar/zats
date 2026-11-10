import { isPng, decodePng } from './png'
import { extract } from './stego'
import { sniffImage, type ImageFormat } from './imageInfo'

/**
 * Reads a Kakaonut sticker. Pure and canvas-free (see section 4 of the spec), so it runs the same in
 * a page, a worker, Node tests and the cashu.me fork.
 */

export type StickerFailure =
  /** Not a PNG: the image was re-encoded (JPEG, WebP, HEIC…) and every low bit was rewritten. */
  | 'erased'
  /** A sticker header was found but no copy passed its checksum. */
  | 'damaged'
  /** A PNG with no sticker in it. */
  | 'none'
  /** Not an image we can read at all, or a broken PNG. */
  | 'unreadable'

export interface StickerFileFacts {
  format: ImageFormat
  width?: number
  height?: number
  /** File size in bytes. */
  size: number
  /** Things about the PNG that suggest it was changed on the way (from png.ts). */
  warnings: string[]
}

export type StickerReadResult = StickerFileFacts &
  (
    | { ok: true; status: 'intact' | 'repaired'; token: string; copies: number }
    | { ok: false; reason: StickerFailure; detail?: string }
  )

/**
 * Kakaonut makes photos at most 2048 px on the long edge. A PNG far bigger than that can't hold a
 * sticker, and decoding it could take seconds and more memory than a phone gives a page.
 */
const MAX_EDGE = 4096

export function readStickerFromBytes(bytes: Uint8Array): StickerReadResult {
  const info = sniffImage(bytes)
  const facts: StickerFileFacts = { ...info, size: bytes.length, warnings: [] }

  if (!isPng(bytes)) {
    return { ...facts, ok: false, reason: info.format === 'unknown' ? 'unreadable' : 'erased' }
  }
  if ((info.width ?? 0) > MAX_EDGE || (info.height ?? 0) > MAX_EDGE) {
    return { ...facts, ok: false, reason: 'none', detail: 'Too big to be a Kakaonut photo.' }
  }

  let decoded
  try {
    decoded = decodePng(bytes)
  } catch (e) {
    return { ...facts, ok: false, reason: 'unreadable', detail: e instanceof Error ? e.message : String(e) }
  }
  facts.width = decoded.pixels.width
  facts.height = decoded.pixels.height
  facts.warnings = decoded.warnings

  const result = extract(decoded.pixels)
  if (result.status === 'none') return { ...facts, ok: false, reason: 'none' }
  if (result.status === 'damaged') return { ...facts, ok: false, reason: 'damaged', detail: result.reason }

  let token: string
  try {
    token = new TextDecoder('utf-8', { fatal: true }).decode(result.payload)
  } catch {
    return { ...facts, ok: false, reason: 'damaged', detail: 'The hidden data is not valid text.' }
  }
  if (!token.startsWith('cashu')) {
    return { ...facts, ok: false, reason: 'unreadable', detail: 'The hidden data is not a Cashu token.' }
  }
  return { ...facts, ok: true, status: result.status, token, copies: result.copies }
}

export async function readStickerFromFile(file: Blob): Promise<StickerReadResult> {
  return readStickerFromBytes(new Uint8Array(await file.arrayBuffer()))
}
