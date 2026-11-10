import { describe, expect, it } from 'vitest'
import { capacityBytes, crc32, embed, extract, type Pixels } from '../src/stego'
import { decodePng, encodePng } from '../src/png'

function noiseImage(width: number, height: number, channels: 3 | 4 = 4, seed = 1): Pixels {
  const data = new Uint8Array(width * height * channels)
  let s = seed
  for (let i = 0; i < data.length; i++) {
    s = (s * 1103515245 + 12345) >>> 0
    data[i] = channels === 4 && i % 4 === 3 ? 255 : s >>> 24
  }
  return { width, height, channels, data }
}

const token = new TextEncoder().encode('cashuB' + 'x'.repeat(900))

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
})

describe('embed and extract', () => {
  it('round-trips a token-sized payload', () => {
    const out = extract(embed(noiseImage(200, 200), token))
    expect(out.status).toBe('intact')
    if (out.status === 'intact') expect(new TextDecoder().decode(out.payload)).toBe(new TextDecoder().decode(token))
  })

  it('survives a lossless PNG encode and decode', () => {
    const bytes = encodePng(embed(noiseImage(120, 90, 3), token))
    const out = extract(decodePng(bytes).pixels)
    expect(out.status).toBe('intact')
  })

  it('reports no payload in an ordinary image', () => {
    expect(extract(noiseImage(100, 100)).status).toBe('none')
  })

  it('repairs a damaged first copy from the other copies', () => {
    const px = embed(noiseImage(200, 200), token)
    for (let i = 100; i < 400; i += 4) px.data[i] ^= 1 // damage inside copy 1's payload
    const out = extract(px)
    expect(out.status).toBe('repaired')
  })

  it('repairs scattered damage across all copies by majority vote', () => {
    const px = embed(noiseImage(200, 200), token)
    const frameBits = (9 + token.length + 4) * 8
    // Flip a different bit in each copy, so every copy fails its CRC on its own.
    for (let c = 0; c < 3; c++) {
      const bit = c * frameBits + 200 + c * 13
      const pixel = Math.floor(bit / 3)
      px.data[pixel * 4 + (bit % 3)] ^= 1
    }
    expect(extract(px).status).toBe('repaired')
  })

  it('reports damage when low bits are rewritten (as by JPEG recompression)', () => {
    const px = embed(noiseImage(200, 200), token)
    let s = 7
    for (let i = 0; i < px.data.length; i++) {
      if (i % 4 === 3) continue
      s = (s * 1103515245 + 12345) >>> 0
      if ((s >>> 28) < 6) px.data[i] ^= 1
    }
    expect(['damaged', 'none']).toContain(extract(px).status)
  })

  it('refuses an image that is too small', () => {
    expect(() => embed(noiseImage(20, 20), token)).toThrow(/too small/)
    expect(capacityBytes(20, 20)).toBeLessThan(token.length)
  })
})
