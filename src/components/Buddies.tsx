import type { CSSProperties } from 'react'

/**
 * Zats' little cast, used as the loader and in illustrations: an alien, a photo of its planet and
 * the saucer that carries it, the three things the app is about. Pixel art, 16 × 16, drawn as
 * squares so they stay crisp at any size. They hop one after another while something is loading
 * (and stand still with reduced motion).
 */

type Drawing = { pal: Record<string, string>; rows: string[] }

const ART: Record<'alien' | 'photo' | 'ufo', Drawing> = {
  alien: {
    pal: { o: '#173a1c', g: '#7ed957', G: '#b8f08a', d: '#3f8a35', y: '#e8ff9e', E: '#120e1f', w: '#ffffff', m: '#2f6b2a' },
    rows: [
    '..y..........y..',
    '...d........d...',
    '....d......d....',
    '.....oooooo.....',
    '...ooggggggoo...',
    '..oggGGgggggggo.',
    '.ogGGgggggggggo.',
    '.ogEEEggggEEEgo.',
    '.ogEwEggggEwEgo.',
    '.ogEEEggggEEEgo.',
    '.oggggggggggggo.',
    '..oggggggggggo..',
    '...ogggmmgggo...',
    '....oggggggo....',
    '.....oooooo.....',
    '................',
    ],
  },
  photo: {
    pal: { w: '#f0ecff', W: '#c8c0e8', p: '#2e244b', P: '#3a2d5c', '*': '#ffffff', L: '#c9f26b', l: '#8fbf3a', t: '#2f8a78', T: '#1f665d', E: '#120e1f', m: '#5a478e', o: '#1a1430' },
    rows: [
    'oooooooooooooooo',
    'owwwwwwwwwwwwwwo',
    'owpPpp*ppppPpWwo',
    'owpppppppLLppWwo',
    'owpp*pppLLLLpWwo',
    'owppppppLLLlpWwo',
    'owpppppppllppWwo',
    'owtttppppppttWwo',
    'owTTttttttttTWwo',
    'owwwwwwwwwwwwwwo',
    'owwwwwwwwwwwwwwo',
    'owwwEwwwwwwEwwwo',
    'owwwwwmmmmwwwwwo',
    'owwwwwwwwwwwwwwo',
    'oooooooooooooooo',
    '................',
    ],
  },
  ufo: {
    pal: { o: '#1a1430', c: '#9ff3ff', C: '#5cc8da', w: '#ffffff', s: '#d8dbe8', S: '#8a90a8', r: '#ff8ad8', l: '#c9f26b', b: '#7ef9ff', E: '#120e1f' },
    rows: [
    '................',
    '......oooo......',
    '.....owcccco....',
    '....owcEccEco...',
    '....occccccCo...',
    '..oooooooooooo..',
    '.ossssssssssssso',
    'osrssllsslssrsSo',
    '.oSSSSSSSSSSSSo.',
    '..oooooooooooo..',
    '....o.o..o.o....',
    '................',
    '................',
    '................',
    '................',
    '................',
    ],
  },
}

/** One drawing as SVG rects, joining runs of the same colour on a row. */
function Pixels({ art, still }: { art: Drawing; still?: boolean }) {
  const rects: { x: number; y: number; w: number; c: string }[] = []
  art.rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const ch = row[x]
      let end = x + 1
      while (end < row.length && row[end] === ch) end++
      if (ch !== '.') rects.push({ x, y, w: end - x, c: art.pal[ch] })
      x = end
    }
  })
  return (
    <svg
      className={still ? 'buddy buddy--still' : 'buddy'}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {rects.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.c} />
      ))}
    </svg>
  )
}

const Alien = ({ still = false }: { still?: boolean }) => <Pixels art={ART.alien} still={still} />
const Photo = ({ still = false }: { still?: boolean }) => <Pixels art={ART.photo} still={still} />
const Ufo = ({ still = false }: { still?: boolean }) => <Pixels art={ART.ufo} still={still} />

/** Kinds keep their old names: "coin" is the alien, "bolt" the saucer. */
const CAST = { coin: Alien, photo: Photo, bolt: Ufo }

/** One character, standing still (for illustrations). */
export function Character({ kind, size = 56 }: { kind: keyof typeof CAST; size?: number }) {
  const Draw = CAST[kind]
  return (
    <span className="character" style={{ width: size, height: size }} aria-hidden="true">
      <Draw still />
    </span>
  )
}

/** The three of them in a row. `size` is each character's height in px. */
export function Buddies({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`buddies ${className}`} style={{ '--buddy': `${size}px` } as CSSProperties} aria-hidden="true">
      <Alien />
      <Photo />
      <Ufo />
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
