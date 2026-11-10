/**
 * Fake token used by test mode (Phase 0: does KakaoTalk keep the hidden bits?).
 *
 * It's shaped like a real token (starts with "cashuB", about 900 bytes, base64url-looking filler)
 * so the hidden frame is the same size as a real one, but it is clearly marked and can't be
 * decoded or spent by any wallet. It records the size the sticker was made at, so Open can say
 * which test sticker it's looking at.
 */

const MARKER = 'cashuB-KAKAONUT-TEST-DATA-NOT-MONEY-'
const TARGET_LENGTH = 900
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
