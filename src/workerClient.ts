import type { Pixels } from './stego'
import type { MadeSticker } from './sticker'
import type { StickerReadResult } from './read'

export type WorkerRequest =
  | { id: number; op: 'make'; pixels: Pixels; token: string }
  | { id: number; op: 'read'; bytes: Uint8Array }

type RequestBody = WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, 'id'> : never) : never

export type WorkerResponse =
  | { id: number; ok: true; op: 'make'; result: MadeSticker }
  | { id: number; ok: true; op: 'read'; result: StickerReadResult }
  | { id: number; ok: false; error: string }

let worker: Worker | null | undefined
let nextId = 1
const waiting = new Map<number, { resolve: (r: WorkerResponse) => void }>()

/** A read or make that takes longer than this has hung (a phone killing the worker for memory). */
const TIMEOUT_MS = 20_000

function getWorker(): Worker | null {
  if (worker !== undefined) return worker
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      waiting.get(e.data.id)?.resolve(e.data)
      waiting.delete(e.data.id)
    }
    worker.onerror = () => {
      // A worker that can't start (old browser, strict CSP): fail the pending calls, then run inline.
      for (const [id, w] of waiting) w.resolve({ id, ok: false, error: 'worker-failed' })
      waiting.clear()
      worker?.terminate()
      worker = null
    }
  } catch {
    worker = null
  }
  return worker
}

async function call(req: RequestBody, transfer: Transferable[]): Promise<WorkerResponse> {
  const w = getWorker()
  if (w) {
    const id = nextId++
    const res = await new Promise<WorkerResponse>((resolve) => {
      const timer = setTimeout(() => {
        // Start a fresh worker next time; this one is stuck or gone.
        waiting.delete(id)
        if (worker === w) {
          w.terminate()
          worker = undefined
        }
        resolve({ id, ok: false, error: 'timeout' })
      }, TIMEOUT_MS)
      waiting.set(id, {
        resolve: (r) => {
          clearTimeout(timer)
          resolve(r)
        },
      })
      w.postMessage({ ...req, id }, transfer)
    })
    if (res.ok || res.error !== 'worker-failed') return res
  }
  // Inline fallback. Same code, just on the main thread.
  try {
    if (req.op === 'make') {
      const { makeStickerPng } = await import('./sticker')
      return { id: 0, ok: true, op: 'make', result: makeStickerPng(req.pixels, req.token) }
    }
    const { readStickerFromBytes } = await import('./read')
    return { id: 0, ok: true, op: 'read', result: readStickerFromBytes(req.bytes) }
  } catch (e) {
    return { id: 0, ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Downloads the reading code ahead of time, so a photo can still be read if the connection drops
 * later. Also gives a worker that failed to start (often: offline at the time) another chance.
 */
export function warmUpReader(): void {
  if (worker === null) worker = undefined
  getWorker()
  import('./read').catch(() => {})
}

export async function makeStickerInWorker(pixels: Pixels, token: string): Promise<MadeSticker> {
  // Not transferred: the inline fallback may need the pixels again if the worker dies mid-call.
  const res = await call({ op: 'make', pixels, token }, [])
  if (!res.ok) throw new Error(res.error)
  if (res.op !== 'make') throw new Error('Unexpected worker reply')
  return res.result
}

export async function readStickerInWorker(file: Blob): Promise<StickerReadResult> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const res = await call({ op: 'read', bytes }, [])
  if (!res.ok) throw new Error(res.error)
  if (res.op !== 'read') throw new Error('Unexpected worker reply')
  return res.result
}
