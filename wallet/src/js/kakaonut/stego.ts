/**
 * Hides bytes in the lowest bit of each red, green and blue value of an image.
 *
 * Frame layout (big-endian), repeated up to MAX_COPIES times back to back:
 *   "SATS" | version (1 byte) | payload length (4 bytes) | payload | CRC-32 of payload (4 bytes)
 *
 * The CRC is what lets the reader say "survived" or "damaged" honestly instead of guessing.
 * Extra copies let small amounts of damage be repaired by a bitwise majority vote; they cannot
 * survive JPEG recompression or resizing, which rewrite almost every low bit.
 */

const MAGIC = [0x53, 0x41, 0x54, 0x53] // "SATS"
const VERSION = 1
const HEADER_BYTES = MAGIC.length + 1 + 4
const CRC_BYTES = 4
const MAX_COPIES = 3

/** Pixels as 8-bit RGB or RGBA, row by row. */
export interface Pixels {
  width: number
  height: number
  channels: 3 | 4
  data: Uint8Array | Uint8ClampedArray
}

export type ExtractResult =
  | { status: 'intact'; payload: Uint8Array; copies: number }
  | { status: 'repaired'; payload: Uint8Array; copies: number }
  | { status: 'damaged'; reason: string }
  | { status: 'none' }

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** How many payload bytes fit in an image of this size, for one copy. */
export function capacityBytes(width: number, height: number): number {
  return Math.floor((width * height * 3) / 8) - HEADER_BYTES - CRC_BYTES
}

function frameBytes(payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(HEADER_BYTES + payload.length + CRC_BYTES)
  const view = new DataView(frame.buffer)
  frame.set(MAGIC, 0)
  frame[4] = VERSION
  view.setUint32(5, payload.length)
  frame.set(payload, HEADER_BYTES)
  view.setUint32(HEADER_BYTES + payload.length, crc32(payload))
  return frame
}

/** Indexes of the colour (non-alpha) values, in embedding order. */
function* colourIndexes(px: Pixels): Generator<number> {
  const total = px.width * px.height
  for (let p = 0; p < total; p++) {
    const base = p * px.channels
    yield base
    yield base + 1
    yield base + 2
  }
}

/** Writes the payload into a copy of the pixels. Throws if it doesn't fit. */
export function embed(px: Pixels, payload: Uint8Array): Pixels {
  const frame = frameBytes(payload)
  const totalBits = px.width * px.height * 3
  const frameBits = frame.length * 8
  if (frameBits > totalBits) {
    throw new Error(`Image too small: needs ${frame.length} bytes, holds ${Math.floor(totalBits / 8)}`)
  }
  const copies = Math.min(MAX_COPIES, Math.floor(totalBits / frameBits))
  const out = new Uint8Array(px.data)
  const idx = colourIndexes(px)
  for (let c = 0; c < copies; c++) {
    for (const byte of frame) {
      for (let bit = 7; bit >= 0; bit--) {
        const i = idx.next().value as number
        out[i] = (out[i] & 0xfe) | ((byte >> bit) & 1)
      }
    }
  }
  return { ...px, data: out }
}

function readBits(px: Pixels, bitCount: number): Uint8Array {
  const bytes = new Uint8Array(Math.ceil(bitCount / 8))
  const idx = colourIndexes(px)
  for (let b = 0; b < bitCount; b++) {
    const i = idx.next().value as number
    bytes[b >> 3] |= (px.data[i] & 1) << (7 - (b & 7))
  }
  return bytes
}

function hasMagic(bytes: Uint8Array, offset: number): boolean {
  return MAGIC.every((m, i) => bytes[offset + i] === m) && bytes[offset + 4] === VERSION
}

/** Reads a payload written by `embed`, reporting whether it arrived intact. */
export function extract(px: Pixels): ExtractResult {
  const totalBits = px.width * px.height * 3
  if (totalBits < (HEADER_BYTES + CRC_BYTES) * 8) return { status: 'none' }

  // Find a readable header in any copy position. Copy length is unknown until a header is read,
  // so try the first one, then fall back to scanning for later copies.
  const all = readBits(px, totalBits - (totalBits % 8))
  let length = -1
  if (hasMagic(all, 0)) length = new DataView(all.buffer).getUint32(5)
  if (length < 0) {
    for (let off = 1; off + HEADER_BYTES <= all.length && off < all.length / 2; off++) {
      if (hasMagic(all, off)) {
        const candidate = new DataView(all.buffer).getUint32(off + 5)
        if (off === HEADER_BYTES + candidate + CRC_BYTES || off === 2 * (HEADER_BYTES + candidate + CRC_BYTES)) {
          length = candidate
          break
        }
      }
    }
  }
  if (length < 0) return { status: 'none' }

  const frameLen = HEADER_BYTES + length + CRC_BYTES
  if (frameLen > all.length) return { status: 'damaged', reason: 'The size field is corrupted.' }
  const copies = Math.min(MAX_COPIES, Math.floor(all.length / frameLen))

  const payloadOf = (frame: Uint8Array) => frame.subarray(HEADER_BYTES, HEADER_BYTES + length)
  const crcOf = (frame: Uint8Array) => new DataView(frame.buffer, frame.byteOffset).getUint32(HEADER_BYTES + length)

  const frames: Uint8Array[] = []
  for (let c = 0; c < copies; c++) {
    const frame = all.slice(c * frameLen, (c + 1) * frameLen)
    frames.push(frame)
    if (crc32(payloadOf(frame)) === crcOf(frame)) {
      return { status: c === 0 ? 'intact' : 'repaired', payload: payloadOf(frame).slice(), copies }
    }
  }

  if (copies >= 3) {
    const voted = new Uint8Array(frameLen)
    for (let i = 0; i < frameLen; i++) {
      const [a, b, c] = [frames[0][i], frames[1][i], frames[2][i]]
      voted[i] = (a & b) | (a & c) | (b & c)
    }
    if (crc32(payloadOf(voted)) === crcOf(voted)) {
      return { status: 'repaired', payload: payloadOf(voted).slice(), copies }
    }
  }
  return { status: 'damaged', reason: 'The hidden data failed its checksum in every copy.' }
}
