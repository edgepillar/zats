import { loadJson, removeKey, saveJson } from './storage'

/**
 * What must survive a reload: the deposit address being paid, and every secret made. A secret is
 * the key to the money, so it is saved before its address is shown, and never logged.
 */

export interface PendingDeposit {
  /** "zats1…": the secret that will go in the photo. */
  token: string
  /** Its z1… address, where the sender sends ZNN. */
  address: string
  /** What the sender meant to send, in zats. The photo holds whatever actually arrives. */
  amount: number
  createdAt: number
  edge: number
}

export interface SavedToken {
  /** The account's address. */
  id: string
  token: string
  /** ZNN that arrived, in zats. */
  amount: number
  createdAt: number
  /**
   * False from deposit until the secret is in a photo; true after. History offers "Put in a photo"
   * only while it's false.
   */
  photo?: boolean
}

const PENDING = 'zats.pending'
const TOKENS = 'zats.tokens'

export const loadPending = (): PendingDeposit | null => loadJson<PendingDeposit | null>(PENDING, null)
export const savePending = (p: PendingDeposit): boolean => saveJson(PENDING, p)
export const clearPending = (): void => removeKey(PENDING)

export function loadTokens(): SavedToken[] {
  const list = loadJson<SavedToken[]>(TOKENS, [])
  return Array.isArray(list) ? list : []
}

/** Returns false if the secret could not be stored: the caller must show it to the user right away. */
export function addToken(t: SavedToken): boolean {
  const list = loadTokens().filter((x) => x.id !== t.id)
  return saveJson(TOKENS, [t, ...list])
}

/** Records that a saved secret is now hidden in a photo. */
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
