import { loadJson, removeKey, saveJson } from './storage'
import { DEMO } from './config'

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
   * Whether a photo has ever been made. The PNG's availability is checked separately in IndexedDB;
   * old versions did not keep completed PNGs, even when this flag was true.
   */
  photo?: boolean
}

const PENDING = DEMO ? 'zats.demo.pending' : 'zats.pending'
const TOKENS = DEMO ? 'zats.demo.tokens' : 'zats.tokens'
const CHANGED = DEMO ? 'zats.demo.tokens-changed' : 'zats.tokens-changed'

function saveTokens(list: SavedToken[]): boolean {
  const ok = saveJson(TOKENS, list)
  if (ok && typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGED))
  return ok
}

/** Same-page writes and other tabs update the list without reloading the application. */
export function subscribeTokens(listener: () => void): () => void {
  const changed = (e: StorageEvent) => { if (e.key === TOKENS || e.key === null) listener() }
  window.addEventListener(CHANGED, listener)
  window.addEventListener('storage', changed)
  return () => {
    window.removeEventListener(CHANGED, listener)
    window.removeEventListener('storage', changed)
  }
}

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
  return saveTokens([t, ...list])
}

/** Records that a saved secret is now hidden in a photo. */
export function markInPhoto(id: string): boolean {
  return saveTokens(loadTokens().map((x) => (x.id === id ? { ...x, photo: true } : x)))
}

export function deleteToken(id: string): boolean {
  return saveTokens(loadTokens().filter((x) => x.id !== id))
}
