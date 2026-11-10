import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useI18n, type Key } from '../i18n'
import { prefersReducedMotion } from '../hooks'

/**
 * A four-step picture of how the bitcoin hides: a photo, zoomed until it's pixels, one pixel as
 * three numbers in binary, and the last bit of each number set to the next bit of the ecash.
 * Plays on its own while on screen; tap to step through. Real numbers throughout.
 */

const STEPS = 4
const DURATION = [3400, 3800, 4800, 6500] // ms per step while playing

// The scene is 320 × 240. The zoom box sits on the sun's left edge: 32 × 24, split into 8 × 6 pixels.
const BOX = { x: 200, y: 50, w: 32, h: 24, cols: 8, rows: 6 }
const SUN = { x: 240, y: 72, r: 34 }
const ZOOM = 320 / BOX.w // = 240 / BOX.h
// Scale around this origin (in %) and the box fills the stage exactly.
const ORIGIN = `${((ZOOM * BOX.x) / 320 / (ZOOM - 1)) * 100}% ${((ZOOM * BOX.y) / 240 / (ZOOM - 1)) * 100}%`

type RGB = readonly [number, number, number]
const SKY: RGB = [186, 206, 224]
const SUNNY: RGB = [254, 229, 0]
const EDGE: RGB = [220, 218, 112]
const rgb = (c: RGB) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`

const CELLS: RGB[] = Array.from({ length: BOX.cols * BOX.rows }, (_, i) => {
  const cx = BOX.x + (i % BOX.cols) * 4 + 2
  const cy = BOX.y + Math.floor(i / BOX.cols) * 4 + 2
  const d = Math.hypot(cx - SUN.x, cy - SUN.y)
  return d < SUN.r - 1.5 ? SUNNY : d < SUN.r + 1.5 ? EDGE : SKY
})
const PICK = 9 // column 1, row 1: a sky pixel

// The first letter of every token, "c" = 01100011. Its first three bits go into this pixel.
const C_BITS = [0, 1, 1, 0, 0, 0, 1, 1]
const AFTER: RGB = [
  (SKY[0] & ~1) | C_BITS[0],
  (SKY[1] & ~1) | C_BITS[1],
  (SKY[2] & ~1) | C_BITS[2],
] as const
const bits = (n: number) => n.toString(2).padStart(8, '0').split('').map(Number)

export function PixelExplainer() {
  const { t } = useI18n()
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(() => !prefersReducedMotion())
  const [onScreen, setOnScreen] = useState(false)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.5 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const running = playing && onScreen
  useEffect(() => {
    if (!running) return
    const id = setTimeout(() => setStep((s) => (s + 1) % STEPS), DURATION[step])
    return () => clearTimeout(id)
  }, [running, step])

  const go = (next: number) => {
    setPlaying(false)
    setStep(next)
  }

  return (
    <figure className="px" ref={ref} data-step={step}>
      <div className="px-bars">
        {Array.from({ length: STEPS }, (_, i) => (
          <button
            key={i}
            type="button"
            className={`px-bar${i < step ? ' is-done' : ''}${i === step ? ' is-on' : ''}`}
            aria-label={t('px.step', { n: i + 1 })}
            aria-current={i === step ? 'step' : undefined}
            onClick={() => go(i)}
          >
            <span
              key={`${i}-${step}-${running}`}
              className={i === step && running ? 'is-filling' : ''}
              style={{ '--px-ms': `${DURATION[i]}ms` } as CSSProperties}
            />
          </button>
        ))}
      </div>

      <button type="button" className="px-stage" aria-label={t('px.next')} onClick={() => go((step + 1) % STEPS)}>
        <span className="px-zoom" style={{ transformOrigin: ORIGIN }} aria-hidden="true">
          <Scene />
          <span className="px-box" />
        </span>
        {/* Drawn at full size and faded in once the zoom lands, so the squares line up crisply. */}
        <span className="px-grid" aria-hidden="true">
          {CELLS.map((c, i) => (
            <span key={i} className={i === PICK ? 'is-pick' : undefined} style={{ background: rgb(c) }} />
          ))}
        </span>

        <span className="px-pixel" aria-hidden="true">
          <span className="px-swatches">
            <span className="px-swatch">
              <span style={{ background: rgb(SKY) }} />
              <small>{t('px.before')}</small>
            </span>
            {/* The two colours are meant to match: that is the whole trick, so say it. */}
            <span className="px-swatch-eq">=</span>
            <span className="px-swatch px-swatch--after">
              <span style={{ background: rgb(AFTER) }} />
              <small>{t('px.after')}</small>
            </span>
          </span>
          <span className="px-rows">
            {(['R', 'G', 'B'] as const).map((ch, row) => {
              const before = bits(SKY[row])
              const changed = SKY[row] !== AFTER[row]
              return (
                <span key={ch} className={`px-row px-row--${ch}${changed ? ' is-changed' : ''}`}>
                  <b className="px-ch">{ch}</b>
                  <span className="px-byte">
                    {before.map((bit, i) => {
                      const last = i === 7
                      return (
                        <span key={i} className={last ? 'px-bit is-last' : 'px-bit'}>
                          <span className="px-bit-old">{bit}</span>
                          {last && <span className="px-bit-new">{C_BITS[row]}</span>}
                        </span>
                      )
                    })}
                  </span>
                  <span className="px-num">
                    <span className="px-num-old">{SKY[row]}</span>
                    {changed && (
                      <>
                        <span className="px-num-arrow">→</span>
                        <span className="px-num-new">{AFTER[row]}</span>
                      </>
                    )}
                  </span>
                </span>
              )
            })}
          </span>
          <span className="px-token">
            <span>{t('px.ecash')}</span>
            <code>
              <mark>c</mark>ashuB…
            </code>
            <span className="px-token-bits">
              {C_BITS.map((b, i) => (
                <span key={i} className={i < 3 ? 'is-used' : undefined}>
                  {b}
                </span>
              ))}
            </span>
          </span>
        </span>
      </button>

      <figcaption aria-live="polite">{t(`px.${step}` as Key)}</figcaption>
    </figure>
  )
}

/** "Your photo": a sunny landscape, drawn rather than shipped as an image. */
function Scene() {
  return (
    <svg className="px-scene" viewBox="0 0 320 240" preserveAspectRatio="none">
      <rect width="320" height="240" fill={rgb(SKY)} />
      <circle cx={SUN.x} cy={SUN.y} r={SUN.r} fill={rgb(SUNNY)} />
      <path d="M0 168C52 128 104 122 160 146s104 6 160-26v120H0z" fill="#9DBAD6" />
      <path d="M0 196c60-30 128-34 196-10s92 14 124 2v52H0z" fill="#7FA6C8" />
      <path d="M0 222c80-20 168-22 320-4v22H0z" fill="#6890B8" />
    </svg>
  )
}
