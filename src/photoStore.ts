/**
 * Keeps source photos while deposits arrive and completed PNGs for History. Each account has its
 * own entries, so starting another photo cannot replace an older one. Nothing leaves the device.
 */

import { DEMO } from './config'

const DB = DEMO ? 'zats.demo' : 'zats'
const STORE = 'photos'
const KEY = 'pending'
const pendingKey = (address: string) => `pending:${address}`
const madeKey = (address: string) => `made:${address}`

interface Stored {
  quote: string
  photo: Blob
}

export interface SavedPhoto {
  photo: Blob
  width: number
  height: number
  /** Amount when this exact PNG was made, not its current balance. */
  amount: number
  /** Imported PNGs contain no creation amount; do not label their metadata as one. */
  origin?: 'created' | 'opened'
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = op(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

/** Remembers the photo for the invoice `quote`. Resolves false if it couldn't be stored. */
export function savePendingPhoto(quote: string, photo: Blob): Promise<boolean> {
  const value: Stored = { quote, photo }
  return run('readwrite', (s) => s.put(value, pendingKey(quote))).then(
    () => true,
    () => false,
  )
}

/** The photo saved for `quote`, or null. */
export async function loadPendingPhoto(quote: string): Promise<Blob | null> {
  try {
    const current = await run<Stored | undefined>('readonly', (s) => s.get(pendingKey(quote)))
    if (current?.quote === quote && current.photo instanceof Blob) return current.photo
    // Read the original single-slot format without replacing or clearing another account's image.
    const legacy = await run<Stored | undefined>('readonly', (s) => s.get(KEY))
    return legacy?.quote === quote && legacy.photo instanceof Blob ? legacy.photo : null
  } catch {
    return null
  }
}

export function clearPendingPhoto(quote: string): Promise<void> {
  return run('readwrite', (s) => {
    s.delete(pendingKey(quote))
    const legacy = s.get(KEY) as IDBRequest<Stored | undefined>
    legacy.onsuccess = () => { if (legacy.result?.quote === quote) s.delete(KEY) }
    return legacy
  }).then(
    () => undefined,
    () => undefined,
  )
}

/** Resolve only after the transaction commits; a request's success alone is not durable. */
export function saveMadePhoto(address: string, photo: SavedPhoto): Promise<boolean> {
  return run('readwrite', (s) => s.put(photo, madeKey(address))).then(() => true, () => false)
}

/** Import without replacing an existing PNG, even when two tabs open the same account together. */
export function saveMadePhotoIfAbsent(address: string, photo: SavedPhoto): Promise<boolean> {
  return run('readwrite', (s) => {
    const req = s.getKey(madeKey(address))
    req.onsuccess = () => { if (req.result === undefined) s.add(photo, madeKey(address)) }
    return req
  }).then(() => true, () => false)
}

/** Check availability without loading every PNG into memory when History opens. */
export function hasMadePhoto(address: string): Promise<boolean> {
  return run('readonly', (s) => s.getKey(madeKey(address))).then((key) => key !== undefined, () => false)
}

export function loadMadePhoto(address: string): Promise<SavedPhoto | null> {
  return run<SavedPhoto | undefined>('readonly', (s) => s.get(madeKey(address))).then(
    (v) => v && v.photo instanceof Blob && v.photo.size > 0 &&
      Number.isSafeInteger(v.width) && v.width > 0 && Number.isSafeInteger(v.height) && v.height > 0 &&
      Number.isSafeInteger(v.amount) && v.amount >= 0 ? v : null,
    () => null,
  )
}

/** Called only after the owner deletes the corresponding History row. */
export function deleteMadePhoto(address: string): Promise<void> {
  return run('readwrite', (s) => s.delete(madeKey(address))).then(() => undefined, () => undefined)
}
