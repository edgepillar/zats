import type { Pixels } from './stego'
import { rgbaToRgb } from './sticker'

/**
 * Turning the user's photo into pixels. This is the one place a canvas is used: fingerprinting
 * noise added to these reads is harmless, because the hidden bits are written afterwards.
 */

export interface LoadedPhoto {
  image: HTMLImageElement
  width: number
  height: number
  url: string
  release: () => void
}

export async function loadPhoto(file: Blob): Promise<LoadedPhoto> {
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.decoding = 'async'
  image.src = url
  try {
    await image.decode()
  } catch {
    URL.revokeObjectURL(url)
    throw new Error('photo-unreadable')
  }
  return {
    image,
    width: image.naturalWidth, // EXIF orientation already applied by the browser
    height: image.naturalHeight,
    url,
    release: () => URL.revokeObjectURL(url),
  }
}

/** Size of the photo once its long edge is capped at `maxEdge`. Never upscales. */
export function fitSize(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export function photoToPixels(photo: LoadedPhoto, maxEdge: number, badge?: string): Pixels {
  const { width, height } = fitSize(photo.width, photo.height, maxEdge)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false })
  if (!ctx) throw new Error('canvas-unavailable')
  ctx.fillStyle = '#ffffff' // transparency goes onto white (spec section 4)
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(photo.image, 0, 0, width, height)
  if (badge) drawBadge(ctx, badge, Math.max(width, height))
  const rgba = ctx.getImageData(0, 0, width, height).data
  canvas.width = canvas.height = 0 // free the backing store early on iOS
  return rgbaToRgb(rgba, width, height)
}

/** Visible label on test stickers, so a tester can tell them apart in the chat. */
function drawBadge(ctx: CanvasRenderingContext2D, text: string, longEdge: number) {
  const fs = Math.max(11, Math.round(longEdge * 0.026))
  ctx.font = `700 ${fs}px system-ui, -apple-system, "Segoe UI", sans-serif`
  const padX = fs * 0.75
  const padY = fs * 0.45
  const w = ctx.measureText(text).width + padX * 2
  const h = fs + padY * 2
  const x = fs * 0.8
  const y = fs * 0.8
  ctx.fillStyle = 'rgba(43, 29, 20, 0.82)'
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, h / 2)
  else ctx.rect(x, y, w, h)
  ctx.fill()
  ctx.fillStyle = '#FFD43B'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + padX, y + h / 2 + fs * 0.04)
}
