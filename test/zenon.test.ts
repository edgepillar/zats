import { describe, expect, it } from 'vitest'
import { makeStickerPng } from '../src/sticker'
import { readStickerFromBytes } from '../src/read'
import {
  addressOf,
  claimStateOf,
  entropyOf,
  formatUnits,
  isSecret,
  newSecret,
  parseAddress,
  shortAddress,
  wordsOf,
  zatsToZnn,
  type AccountState,
} from '../src/zenon'
import type { Pixels } from '../src/stego'

const photo = (w: number, h: number): Pixels => ({ width: w, height: h, channels: 3, data: new Uint8Array(w * h * 3).fill(128) })

// The BIP39 test vector with all-zero entropy: "abandon" ×23 + "art".
const ZERO = 'zats1' + '00'.repeat(32)

describe('the secret in the photo', () => {
  it('is "zats1" plus 64 lowercase hex characters', () => {
    expect(entropyOf(ZERO)).toBe('00'.repeat(32))
    expect(isSecret('zats1' + 'AB'.repeat(32))).toBe(false)
    expect(isSecret('zats1' + 'ab'.repeat(31))).toBe(false)
    expect(isSecret('cashuBo2F…')).toBe(false)
  })

  it('turns into 24 words that Syrius can import', async () => {
    const words = (await wordsOf(ZERO)).split(' ')
    expect(words).toHaveLength(24)
    expect(words.slice(0, 23).every((w) => w === 'abandon')).toBe(true)
    expect(words[23]).toBe('art')
  })

  it('makes a fresh account each time, and the photo text leads back to its address', async () => {
    const a = await newSecret()
    const b = await newSecret()
    expect(a.token).not.toBe(b.token)
    expect(isSecret(a.token)).toBe(true)
    expect(a.address).toMatch(/^z1[02-9ac-hj-np-z]{38}$/)
    expect(await addressOf(a.token)).toBe(a.address)
  })

  it('survives a trip through a photo', async () => {
    const { token } = await newSecret()
    const r = readStickerFromBytes(makeStickerPng(photo(64, 48), token).png)
    expect(r).toMatchObject({ ok: true, status: 'intact', token })
  })
})

describe('addresses and amounts', () => {
  it('accepts real z1 addresses and nothing else', async () => {
    const { address } = await newSecret()
    expect(await parseAddress(`  ${address} `)).toBe(address)
    expect(await parseAddress(address.slice(0, -1) + (address.endsWith('q') ? 'p' : 'q'))).toBeNull() // bad checksum
    expect(await parseAddress('z1qxemdeddedxplasmaxxxxxxxxxxxxxxxxsctrp')).toBe('z1qxemdeddedxplasmaxxxxxxxxxxxxxxxxsctrp')
    expect(await parseAddress('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBeNull()
    expect(await parseAddress('')).toBeNull()
  })

  it('writes zats as ZNN', () => {
    expect(zatsToZnn(100_000_000)).toBe('1')
    expect(zatsToZnn(150_000_000)).toBe('1.5')
    expect(zatsToZnn(1)).toBe('0.00000001')
    expect(zatsToZnn(123_456_789_000n)).toBe('1,234.56789')
    expect(formatUnits(0n, 8)).toBe('0')
    expect(shortAddress('z1qzrqf7r79d6v64yjv4lsgwuskh4quy9cuj39y5')).toBe('z1qzrqf…j39y5')
  })

  it('reads the claim state from the account', () => {
    const base: AccountState = { address: 'z1', zats: 0n, holdings: [], unreceived: 0, blockCount: 0, unconfirmed: 0 }
    const znn = { tokenStandard: 'zts1znnxxxxxxxxxxxxx9z4ulx', symbol: 'ZNN', decimals: 8, amount: 1n }
    expect(claimStateOf({ ...base, holdings: [znn], zats: 1n })).toBe('unspent')
    expect(claimStateOf({ ...base, blockCount: 3 })).toBe('spent')
    expect(claimStateOf({ ...base, holdings: [znn], unconfirmed: 1 })).toBe('pending')
    expect(claimStateOf(base)).toBe('empty')
    expect(claimStateOf({ ...base, blockCount: 1 })).toBe('spent')
    expect(claimStateOf({ ...base, unconfirmed: 1 })).toBe('pending')
  })
})
