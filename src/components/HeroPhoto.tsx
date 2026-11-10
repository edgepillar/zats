import { useEffect, useRef, type RefObject } from 'react'
import photo1x from '../assets/hero-photo-1x.webp'
import photo2x from '../assets/hero-photo-2x.webp'
import photo3x from '../assets/hero-photo-3x.webp'

/**
 * The photo sent in the hero chat: an autumn afternoon at a Seoul palace, the city behind the roof.
 * Plus the same photo as coarse pixels, which the hero shows where light passes over it.
 */

const SRC_SET = `${photo1x} 1x, ${photo2x} 2x, ${photo3x} 3x`

/** Fetch the photo before the chat sends it, so it never arrives as an empty grey box. */
export function preloadHeroPhoto() {
  const img = new Image()
  img.srcset = SRC_SET
  img.src = photo2x
}

export function HeroPhoto({ ref }: { ref?: RefObject<HTMLImageElement | null> }) {
  return <img ref={ref} className="hero-photo" src={photo2x} srcSet={SRC_SET} alt="" decoding="async" />
}

// The pixel view: the photo at 24 × 18, a hairline grid, and a few pixels in KakaoTalk yellow.
const COLS = 24
const ROWS = 18
const LIT: [number, number][] = [
  [2, 5], [4, 11], [6, 3], [8, 8], [9, 14], [11, 6], [13, 10],
  [14, 2], [16, 7], [17, 13], [19, 4], [21, 9], [22, 15],
]

/** The photo drawn as big square pixels, the same colours as the photo under it. */
export function HeroPixels({ source }: { source: RefObject<HTMLImageElement | null> }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const img = source.current
    const el = canvas.current
    if (!img || !el) return
    let live = true
    img
      .decode()
      .then(() => {
        const ctx = el.getContext('2d')
        if (!live || !ctx) return
        const dpr = Math.min(window.devicePixelRatio || 1, 3)
        const w = Math.round(el.clientWidth * dpr)
        const h = Math.round(el.clientHeight * dpr)
        el.width = w
        el.height = h

        // Shrink the photo to one sample per pixel, then blow it up without smoothing.
        const small = document.createElement('canvas')
        small.width = COLS
        small.height = ROWS
        const sctx = small.getContext('2d')
        if (!sctx) return
        sctx.imageSmoothingQuality = 'high'
        sctx.drawImage(img, 0, 0, COLS, ROWS)
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(small, 0, 0, w, h)

        const x = (c: number) => Math.round((c * w) / COLS)
        const y = (r: number) => Math.round((r * h) / ROWS)
        ctx.fillStyle = '#fee500'
        for (const [c, r] of LIT) ctx.fillRect(x(c), y(r), x(c + 1) - x(c), y(r + 1) - y(r))

        ctx.fillStyle = 'rgba(255, 255, 255, 0.32)'
        const line = Math.max(1, Math.round(dpr / 2))
        for (let c = 1; c < COLS; c++) ctx.fillRect(x(c), 0, line, h)
        for (let r = 1; r < ROWS; r++) ctx.fillRect(0, y(r), w, line)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [source])

  return <canvas ref={canvas} className="kt-pixels" aria-hidden="true" />
}
