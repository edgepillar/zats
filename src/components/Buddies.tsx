import type { CSSProperties } from 'react'

/**
 * Kakaonut's own little cast, used as the loader: a sat coin, a photo and a lightning bolt, the
 * three things the app is about. Original drawings: flat colour, ink outline, dot eyes. They hop
 * one after another while something is loading (and stand still with reduced motion).
 */

const INK = '#191919'
const LINE = 2.6

function Coin({ still = false }: { still?: boolean }) {
  return (
    <svg className={still ? 'buddy buddy--still' : 'buddy'} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle cx="20" cy="21" r="15" fill="#F7931A" stroke={INK} strokeWidth={LINE} />
      <circle cx="20" cy="21" r="11.2" fill="none" stroke="#D9760C" strokeWidth="1.6" />
      <path d="M10.2 17.4a10.6 10.6 0 0 1 5.6-6.4" stroke="#FFD08A" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <circle cx="15.6" cy="20.5" r="1.9" fill={INK} />
      <circle cx="24.4" cy="20.5" r="1.9" fill={INK} />
      <path d="M17.2 25.2q2.8 2.4 5.6 0" stroke={INK} strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function Photo({ still = false }: { still?: boolean }) {
  return (
    <svg className={still ? 'buddy buddy--still' : 'buddy'} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <rect x="7.5" y="5.5" width="25" height="30" rx="4" fill="#fff" stroke={INK} strokeWidth={LINE} />
      <rect x="11.5" y="9.5" width="17" height="13" rx="1.5" fill="#BACEE0" />
      <path d="M11.5 22.5 17 16.8l3.6 3.6 2.6-2.4 5.3 4.5z" fill="#7FA6C8" />
      <circle cx="24.6" cy="13.2" r="1.9" fill="#FEE500" />
      <circle cx="16.4" cy="27.4" r="1.7" fill={INK} />
      <circle cx="23.6" cy="27.4" r="1.7" fill={INK} />
      <path d="M18.3 30.6q1.7 1.4 3.4 0" stroke={INK} strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function Bolt({ still = false }: { still?: boolean }) {
  return (
    <svg className={still ? 'buddy buddy--still' : 'buddy'} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <path
        d="M25.5 3 7 23.5h10.5L14.5 37.5 33.5 14H23.5z"
        fill="#FEE500"
        stroke={INK}
        strokeWidth={LINE}
        strokeLinejoin="round"
      />
      <circle cx="16.9" cy="17.6" r="1.7" fill={INK} />
      <circle cx="23.3" cy="17.6" r="1.7" fill={INK} />
      <path d="M18.6 20.8q1.5 1.3 3 0" stroke={INK} strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  )
}

const CAST = { coin: Coin, photo: Photo, bolt: Bolt }

/** One character, standing still (for illustrations). */
export function Character({ kind, size = 56 }: { kind: keyof typeof CAST; size?: number }) {
  const Drawing = CAST[kind]
  return (
    <span className="character" style={{ width: size, height: size }} aria-hidden="true">
      <Drawing still />
    </span>
  )
}

/** The three of them in a row. `size` is each character's height in px. */
export function Buddies({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`buddies ${className}`} style={{ '--buddy': `${size}px` } as CSSProperties} aria-hidden="true">
      <Coin />
      <Photo />
      <Bolt />
    </span>
  )
}

/** Hopping buddies with a status line next to (row) or under (column) them. */
export function Loading({
  label,
  size = 24,
  layout = 'row',
  className = '',
}: {
  label: string
  size?: number
  layout?: 'row' | 'column'
  className?: string
}) {
  return (
    <div className={`loading loading--${layout} ${className}`} role="status">
      <Buddies size={size} />
      <span className="loading-label">{label}</span>
    </div>
  )
}
