import { loadJson, removeKey, saveJson } from './storage'

/**
 * What must survive a reload: the invoice being paid, and every token minted. Tokens are bearer
 * money, so they are saved before they're hidden in a photo, and never logged.
 */

export interface PendingQuote {
  mint: string
  amount: number
  quote: string
  request: string
  createdAt: number
  edge: number
}

export interface SavedToken {
  id: string
  token: string
  mint: string
  amount: number
  createdAt: number
  /**
   * False from payment until the token is in a photo; true after. History offers "Put in a photo"
   * only while it's false. Missing on tokens saved before this field existed: treated as in a photo.
   */
  photo?: boolean
}

const PENDING = 'kakaonut.pending'
const TOKENS = 'kakaonut.tokens'

export const loadPending = (): PendingQuote | null => loadJson<PendingQuote | null>(PENDING, null)
export const savePending = (p: PendingQuote): boolean => saveJson(PENDING, p)
export const clearPending = (): void => removeKey(PENDING)

export function loadTokens(): SavedToken[] {
  const list = loadJson<SavedToken[]>(TOKENS, [])
  return Array.isArray(list) ? list : []
}

/** Returns false if the token could not be stored: the caller must show it to the user right away. */
export function addToken(t: SavedToken): boolean {
  const list = loadTokens().filter((x) => x.id !== t.id)
  return saveJson(TOKENS, [t, ...list])
}

/** Records that a saved token is now hidden in a photo. */
export function markInPhoto(id: string): boolean {
  return saveJson(
    TOKENS,
    loadTokens().map((x) => (x.id === id ? { ...x, photo: true } : x)),
  )
}

export function deleteToken(id: string): boolean {
  return saveJson(
    TOKENS,
    loadTokens().filter((x) => x.id !== id),
  )
}
