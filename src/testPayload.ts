/**
 * Fake secret used by test mode (does a chat app keep the hidden bits?).
 *
 * It's shaped like a real one (starts with "zats", 69 characters) so the hidden frame is the same
 * size as a real one, but it is clearly marked and isn't a key to any account. It records the size the sticker was made at, so Open can say
 * which test sticker it's looking at.
 */

const MARKER = 'zats-TEST-NOT-MONEY-'
const TARGET_LENGTH = 69
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export interface TestPayloadInfo {
  width: number
  height: number
}

export function makeTestPayload(width: number, height: number): string {
  const head = `${MARKER}${width}x${height}-`
  let s = 0x6b616b61 // fixed seed, so every test sticker carries the same filler
  let filler = ''
  while (head.length + filler.length < TARGET_LENGTH) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    filler += ALPHABET[s >>> 26]
  }
  return head + filler
}

export function isTestPayload(token: string): boolean {
  return token.startsWith(MARKER)
}

export function parseTestPayload(token: string): TestPayloadInfo | null {
  if (!isTestPayload(token)) return null
  const m = /^(\d+)x(\d+)-/.exec(token.slice(MARKER.length))
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null
}
