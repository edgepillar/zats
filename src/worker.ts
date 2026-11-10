/// <reference lib="webworker" />
import { makeStickerPng } from './sticker'
import { readStickerFromBytes } from './read'
import type { WorkerRequest, WorkerResponse } from './workerClient'

/** Heavy pixel work (embedding, PNG encoding, reading) runs here so phones stay responsive. */
const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data
  try {
    if (req.op === 'make') {
      const made = makeStickerPng(req.pixels, req.token)
      const res: WorkerResponse = { id: req.id, ok: true, op: 'make', result: made }
      scope.postMessage(res, [made.png.buffer])
    } else {
      const res: WorkerResponse = { id: req.id, ok: true, op: 'read', result: readStickerFromBytes(req.bytes) }
      scope.postMessage(res)
    }
  } catch (e) {
    const res: WorkerResponse = { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) }
    scope.postMessage(res)
  }
}
