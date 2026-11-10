/**
 * Keeps the chosen photo on this device while its invoice is being paid. Paying usually means
 * switching to a Lightning wallet, and a phone browser may reload the tab meanwhile: without this,
 * the bitcoin would be saved but the photo gone. IndexedDB, because photos are too big for
 * localStorage. Nothing here leaves the device.
 */

const DB = 'kakaonut'
const STORE = 'photos'
const KEY = 'pending'

interface Stored {
  quote: string
  photo: Blob
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
  return run('readwrite', (s) => s.put(value, KEY)).then(
    () => true,
    () => false,
  )
}

/** The photo saved for `quote`, or null. */
export function loadPendingPhoto(quote: string): Promise<Blob | null> {
  return run<Stored | undefined>('readonly', (s) => s.get(KEY)).then(
    (v) => (v && v.quote === quote && v.photo instanceof Blob ? v.photo : null),
    () => null,
  )
}

export function clearPendingPhoto(): Promise<void> {
  return run('readwrite', (s) => s.delete(KEY)).then(
    () => undefined,
    () => undefined,
  )
}
