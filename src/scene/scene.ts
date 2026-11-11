/**
 * The living backdrop: a small isometric pixel-art alien world drawn by code (no image files), with
 * a day/night cycle and weather. Drawn at a low resolution and scaled up with `pixelated`, so every
 * art pixel is a crisp square.
 *
 * The world is procedural and endless (value noise decides moss, flora and craters), with a hand-
 * placed clearing in the middle: a dome habitat, a glowing pool, a garden of sprouts, a path of metal
 * plates, beacons and a satellite dish. The ground and everything on it is painted once into two
 * buffers: the picture, and the parts that glow (pool, crystals, orbs, portholes, specks). Each
 * frame adds glints, spores, the time-of-day tint, the glow, lights, a visiting saucer and weather.
 */

export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night'
export type Weather = 'clear' | 'mist' | 'meteors'

export interface SceneControls {
  set(opts: { time?: TimeOfDay; weather?: Weather }): void
  stop(): void
}

/* ---------- Seeded noise ---------- */

function hash(x: number, y: number, s = 0): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + s * 2147483647
  h = (h ^ (h >>> 13)) * 1274126177
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const smooth = (t: number) => t * t * (3 - 2 * t)
function noise(x: number, y: number, s = 0): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = smooth(x - xi)
  const fy = smooth(y - yi)
  const a = hash(xi, yi, s)
  const b = hash(xi + 1, yi, s)
  const c = hash(xi, yi + 1, s)
  const d = hash(xi + 1, yi + 1, s)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}
const fbm = (x: number, y: number, s = 0) => noise(x, y, s) * 0.6 + noise(x * 2.1, y * 2.1, s + 7) * 0.3 + noise(x * 4.3, y * 4.3, s + 13) * 0.1

/* ---------- Colours ---------- */

type RGB = [number, number, number]
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const css = ([r, g, b]: RGB, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`
const pal = (...h: string[]) => h.map(hex)

const P = {
  moss: pal('#1b1530', '#241c3d', '#2e244b', '#3a2d5c', '#47376d'),
  mossTeal: pal('#132c38', '#1a3a45', '#224a53'),
  speck: pal('#7ef9ff', '#ff8ad8', '#c8f56a', '#b9a3ff'),
  plate: pal('#3c3656', '#625b84', '#7d76a0', '#9790b8'),
  soil: pal('#1a1128', '#261936', '#312244'),
  goo: pal('#0c3742', '#104e58', '#156b72', '#1f9196'),
  rim: pal('#150f22', '#2a1f3d'),
  stalk: pal('#8f86ab', '#b8aed0', '#d6cde8'),
  capPink: pal('#331430', '#5a2150', '#80346e', '#a54f8c', '#c878ad'),
  capTeal: pal('#0d2c31', '#154643', '#1f665d', '#2f8a78', '#4fae96'),
  capAmber: pal('#35200f', '#5a3617', '#80511f', '#a66e2e', '#c99448'),
  capViolet: pal('#1c1436', '#2c2052', '#41316f', '#5a478e', '#7a66ae'),
  crystalC: pal('#163a52', '#276a8e', '#4aa8d0', '#a6ecff'),
  crystalP: pal('#3a1650', '#682b86', '#a052c4', '#e2a6ff'),
  frond: pal('#140c26', '#22163e', '#332258', '#4a3478'),
  stone: pal('#1d1830', '#2e2844', '#423b5e', '#5e567e'),
  metal: pal('#4c5068', '#787e98', '#a4a9c0', '#cdd1e0', '#eef0f7'),
  outline: hex('#0b0816'),
  cyan: hex('#7ef9ff'),
  pink: hex('#ff8ad8'),
  lime: hex('#c8f56a'),
  amber: hex('#ffc861'),
  red: hex('#ff5d6a'),
}

/* ---------- The world ---------- */

/** World (u, v) in tiles → art pixels. A tile is 16 × 8. */
const toScreen = (u: number, v: number) => ({ x: (u - v) * 8, y: (u + v) * 4 })
const toWorld = (x: number, y: number) => ({ u: (x / 8 + y / 4) / 2, v: (y / 4 - x / 8) / 2 })

const POOL = { u: 4.2, v: -6.5, ru: 3.6, rv: 2.6 }
const PLOT = { u0: 1.2, u1: 4.6, v0: 2.6, v1: 5.4 }
const PATH: [number, number][] = [
  [-5.4, -1.2],
  [-3.6, 0.6],
  [-1.2, 1.6],
  [0.4, 1.2],
  [2.4, 0.6],
  [5.2, 1.6],
  [7.6, 3.8],
  [10.5, 5.2],
  [14, 7],
  [19, 9],
  [26, 12],
]
const CLEARING = { u: 0.5, v: -0.5, r: 8.5 }
/** Where the habitat stands (its front corner) and where the saucer comes to hover. */
const HOME = { u: -6.5, v: -2.5 }
const HOVER = { u: 0.6, v: -3.2 }

function poolValue(u: number, v: number) {
  const du = (u - POOL.u) / POOL.ru
  const dv = (v - POOL.v) / POOL.rv
  return du * du + dv * dv + (noise(u * 0.9, v * 0.9, 41) - 0.5) * 0.35
}

function distToPath(u: number, v: number) {
  let best = Infinity
  for (let i = 0; i < PATH.length - 1; i++) {
    const [au, av] = PATH[i]
    const [bu, bv] = PATH[i + 1]
    const du = bu - au
    const dv = bv - av
    const t = Math.max(0, Math.min(1, ((u - au) * du + (v - av) * dv) / (du * du + dv * dv)))
    best = Math.min(best, Math.hypot(au + du * t - u, av + dv * t - v))
  }
  return best
}

const inPlot = (u: number, v: number) => u > PLOT.u0 && u < PLOT.u1 && v > PLOT.v0 && v < PLOT.v1
const clearingDist = (u: number, v: number) => Math.hypot(u - CLEARING.u, (v - CLEARING.v) * 1.1)

/** How overgrown a spot is: 0 in the clearing, rising into the wilds. */
function wild(u: number, v: number) {
  const edge = (clearingDist(u, v) - CLEARING.r) / 3
  return Math.max(0, Math.min(1, edge)) * (0.55 + fbm(u * 0.18, v * 0.18, 3) * 0.6)
}

/** A ground pixel's colour, and its glow (null when it doesn't glow). */
function ground(u: number, v: number, px: number, py: number): [RGB, RGB | null] {
  const j = hash(px, py, 5) // per-pixel jitter for dithering
  const p = poolValue(u, v)
  if (p < 1) {
    const depth = Math.min(1, (1 - p) * 2.2)
    const i = Math.min(3, Math.floor(depth * 3 + j * 0.9))
    const c = P.goo[i]
    return [c, [c[0] * 0.6, c[1] * 1.1, c[2] * 1.1]]
  }
  if (p < 1.18) return [P.rim[j < 0.6 ? 0 : 1], null]
  const d = distToPath(u, v)
  if (d < 0.55 + (noise(u * 2, v * 2, 9) - 0.5) * 0.2) {
    // Metal plates: half-tile cells along the world grid, with dark seams and a rivet now and then.
    const cu = u * 2
    const cv = v * 2
    const fu = cu - Math.floor(cu)
    const fv = cv - Math.floor(cv)
    if (Math.min(fu, 1 - fu, fv, 1 - fv) < 0.07) return [P.plate[0], null]
    const tone = hash(Math.floor(cu), Math.floor(cv), 8)
    if (fu > 0.15 && fu < 0.22 && fv > 0.15 && fv < 0.22) return [P.plate[3], null]
    return [P.plate[1 + Math.min(1, Math.floor(tone * 1.6 + j * 0.6))], null]
  }
  if (inPlot(u, v)) {
    const inRow = ((v - PLOT.v0) * 3.2) % 1
    return [inRow < 0.35 ? P.soil[0] : P.soil[Math.floor((v - PLOT.v0) * 3.2) % 2 === 0 ? 2 : 1], null]
  }
  // Craters: a dark rim and a dim floor, scattered on a one-tile grid.
  const cu = Math.floor(u * 0.5)
  const cv = Math.floor(v * 0.5)
  if (hash(cu, cv, 101) < 0.06 && clearingDist(u, v) > 3) {
    const r = Math.hypot(u * 0.5 - cu - 0.5, (v * 0.5 - cv - 0.5) * 1.2)
    if (r < 0.26) return [P.moss[r > 0.2 ? 0 : 1], null]
    if (r < 0.31) return [P.moss[4], null]
  }
  // Moss: violet bands from smooth noise, teal patches, dithered with per-pixel jitter.
  const shade = fbm(u * 0.35, v * 0.35, 1) * 0.75 + fbm(u * 1.6, v * 1.6, 2) * 0.25 - wild(u, v) * 0.3
  if (fbm(u * 0.22, v * 0.22, 17) > 0.62) return [P.mossTeal[Math.max(0, Math.min(2, Math.floor(shade * 3.4 + (j - 0.5))))], null]
  const level = Math.max(0, Math.min(4, Math.floor(shade * 5.2 + (j - 0.5) * 0.9)))
  if (hash(px, py, 77) < (clearingDist(u, v) < CLEARING.r ? 0.012 : 0.004)) {
    const c = P.speck[Math.floor(hash(px, py, 78) * 4)]
    return [c, c]
  }
  return [P.moss[level], null]
}

/* ---------- Sprites, drawn by code ---------- */

type Sprite = { canvas: HTMLCanvasElement; glow?: HTMLCanvasElement; ox: number; oy: number; light?: { dx: number; dy: number; c: RGB; r: number } }

function canvasOf(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** A sprite: `draw` paints colour pixels with `put`, and glowing ones with `glow`. */
function sprite(
  w: number,
  h: number,
  ox: number,
  oy: number,
  draw: (put: (x: number, y: number, c: RGB) => void, glow: (x: number, y: number, c: RGB) => void, has: (x: number, y: number) => boolean) => void,
): Sprite {
  const colour = new ImageData(w, h)
  const lit = new ImageData(w, h)
  let glows = false
  const set = (img: ImageData) => (x: number, y: number, c: RGB) => {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const i = (y * w + x) * 4
    img.data[i] = c[0]
    img.data[i + 1] = c[1]
    img.data[i + 2] = c[2]
    img.data[i + 3] = 255
  }
  const put = set(colour)
  const glowSet = set(lit)
  const glow = (x: number, y: number, c: RGB) => {
    put(x, y, c)
    glowSet(x, y, c)
    glows = true
  }
  const has = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && colour.data[(y * w + x) * 4 + 3] > 0
  draw(put, glow, has)
  const canvas = canvasOf(w, h)
  canvas.getContext('2d')!.putImageData(colour, 0, 0)
  let glowCanvas: HTMLCanvasElement | undefined
  if (glows) {
    glowCanvas = canvasOf(w, h)
    glowCanvas.getContext('2d')!.putImageData(lit, 0, 0)
  }
  return { canvas, glow: glowCanvas, ox, oy }
}

/** Dark outline around everything drawn so far (outside pixels only). */
function outline(w: number, h: number, put: (x: number, y: number, c: RGB) => void, has: (x: number, y: number) => boolean, below = h) {
  const edge: [number, number][] = []
  for (let y = 0; y < Math.min(h, below); y++)
    for (let x = 0; x < w; x++) if (!has(x, y) && (has(x - 1, y) || has(x + 1, y) || has(x, y - 1) || has(x, y + 1))) edge.push([x, y])
  for (const [x, y] of edge) put(x, y, P.outline)
}

/** A mushroom tree: a pale stalk under a wide spotted cap, lit from the top left. */
function makeShroom(seed: number, size: number, cap: RGB[]): Sprite {
  const w = size * 2 + 6
  const stalkH = Math.round(size * 0.9) + 3
  const capH = Math.round(size * 0.75)
  const h = capH + stalkH + 3
  const cx = Math.floor(w / 2)
  return sprite(w, h, cx, h - 1, (put, glow, has) => {
    const lean = (hash(seed, 1, 3) - 0.5) * 3
    for (let y = capH - 2; y < h - 1; y++) {
      const t = (y - capH) / stalkH
      const x0 = Math.round(cx + lean * (1 - t))
      for (let dx = -1; dx <= 1; dx++) put(x0 + dx, y, P.stalk[dx === -1 ? 2 : dx === 0 ? 1 : 0])
    }
    // cap: upper half of an ellipse, flattened, with a darker underside band
    const rx = size
    const ry = capH
    const cy = capH
    for (let y = 0; y <= cy + 1; y++)
      for (let x = 0; x < w; x++) {
        const dx = (x + 0.5 - (cx + lean)) / rx
        const dy = (y + 0.5 - cy) / ry
        if (dx * dx + dy * dy > 1 || dy > 0.12) continue
        let lv = Math.round(2.4 - dx * 1.3 - dy * 1.6 + (hash(x, y, seed) - 0.5) * 0.9)
        if (dy > -0.12) lv = 1
        put(x, y, cap[Math.max(0, Math.min(4, lv))])
      }
    // pale spots
    for (let k = 0; k < 3 + (seed % 3); k++) {
      const sx = Math.round(cx + lean + (hash(seed, k, 9) - 0.5) * size * 1.3)
      const sy = Math.round(cy - 2 - hash(seed, k, 10) * capH * 0.7)
      if (!has(sx, sy)) continue
      put(sx, sy, P.stalk[2])
      if (hash(seed, k, 11) < 0.5) put(sx + 1, sy, P.stalk[1])
    }
    // one glowing gill under some caps
    if (seed % 2 === 0) glow(Math.round(cx + lean), cy, P.speck[seed % 4])
    outline(w, h, put, has)
  })
}

/** A cluster of crystal shards with lit and shaded faces; the tips glow. */
function makeCrystals(seed: number, c: RGB[]): Sprite {
  const w = 15
  const h = 20
  const s = sprite(w, h, 7, h - 1, (put, glow, has) => {
    const shards = 3 + (seed % 3)
    for (let k = 0; k < shards; k++) {
      const bx = 3 + Math.round(hash(seed, k, 21) * 8)
      const tall = 7 + Math.round(hash(seed, k, 22) * 11)
      const half = 1 + Math.round(hash(seed, k, 23) * 1.5)
      const tilt = (hash(seed, k, 24) - 0.5) * 0.5
      for (let y = 0; y < tall; y++) {
        const t = y / tall
        const wdt = y < tall * 0.25 ? Math.round(half * (y / (tall * 0.25))) : half
        const x = bx + Math.round(tilt * (tall - y))
        for (let dx = -wdt; dx <= wdt; dx++) {
          const col = dx < 0 ? c[2] : dx === 0 ? c[3] : c[1]
          put(x + dx, h - 1 - tall + y, t < 0.18 ? c[3] : col)
        }
      }
      glow(bx + Math.round(tilt * tall), h - tall, c[3])
      glow(bx + Math.round(tilt * tall), h - tall + 1, c[2])
    }
    outline(w, h, put, has)
  })
  s.light = { dx: 0, dy: -9, c: c[3], r: 14 }
  return s
}

/** A stalk with a glowing orb on top. */
function makeOrb(seed: number): Sprite {
  const h = 16 + Math.round(hash(seed, 0, 31) * 6)
  const s = sprite(9, h, 4, h - 1, (put, glow, has) => {
    const sway = (hash(seed, 1, 31) - 0.5) * 3
    for (let y = 4; y < h; y++) put(4 + Math.round(sway * (1 - (y - 4) / (h - 4))), y, P.frond[3])
    const ox = 4 + Math.round(sway)
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 5) glow(ox + dx, 2 + dy, dx + dy < -1 ? hex('#f4ffd0') : P.lime)
    outline(9, h, put, has)
  })
  s.light = { dx: 0, dy: -(h - 3), c: P.lime, r: 12 }
  return s
}

/** A spiky alien plant: thin curved blades with pale tips. */
function makeFrond(seed: number): Sprite {
  const w = 13
  const h = 12
  return sprite(w, h, 6, h - 1, (put, _glow, has) => {
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k - 2.5) * 0.38 + (hash(seed, k, 41) - 0.5) * 0.2
      const len = 6 + hash(seed, k, 42) * 5
      for (let t = 0; t < len; t++) {
        const bend = (t / len) ** 2 * 2 * Math.sign(Math.cos(a))
        put(6 + Math.cos(a) * t + bend, h - 1 + Math.sin(a) * t, t > len - 2 ? P.speck[3] : P.frond[1 + Math.min(2, Math.floor(t / 3))])
      }
    }
    outline(w, h, put, has)
  })
}

function makeRock(seed: number): Sprite {
  return sprite(10, 7, 5, 6, (put, _g, has) => {
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 10; x++) {
        const dx = (x - 4.5) / 4.6
        const dy = (y - 3.6) / 3
        if (dx * dx + dy * dy > 1) continue
        put(x, y, P.stone[Math.max(0, Math.min(3, Math.round(2.2 - dx - dy + (hash(x, y, seed) - 0.5))))])
      }
    outline(10, 7, put, has)
  })
}

function makeSprout(seed: number): Sprite {
  return sprite(5, 6, 2, 5, (put, glow) => {
    const tall = 2 + Math.floor(hash(seed, 0, 3) * 3)
    for (let k = 0; k < tall; k++) put(2, 5 - k, P.capTeal[3])
    put(1, 5 - tall + 1, P.capTeal[4])
    put(3, 5 - tall + 1, P.capTeal[4])
    glow(2, 5 - tall, hash(seed, 1, 3) < 0.5 ? P.lime : P.cyan)
  })
}

/** The habitat: a metal dome on a ring, with round portholes, a hatch and an antenna. */
function makeDome(): { sprite: Sprite; portholes: { x: number; y: number }[]; antenna: { x: number; y: number } } {
  const w = 46
  const h = 40
  const cx = 23
  const base = 34 // y of the dome's base line
  const rx = 20
  const ry = 18
  const portholes: { x: number; y: number }[] = []
  const s = sprite(w, h, cx, base + 4, (put, glow, has) => {
    // base ring: a short band under the dome
    for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
      const t = (x - cx) / (rx + 1)
      const yb = base + Math.round(Math.sqrt(Math.max(0, 1 - t * t)) * 4)
      for (let y = base - 1; y <= yb; y++) put(x, y, P.metal[t < -0.3 ? 2 : t < 0.4 ? 1 : 0])
      put(x, yb, P.metal[0])
    }
    // dome: upper half ellipsoid, shaded by its normal against light from the top left
    for (let y = base - ry; y < base; y++)
      for (let x = cx - rx; x <= cx + rx; x++) {
        const nx = (x + 0.5 - cx) / rx
        const ny = (y + 0.5 - base) / ry
        const d = nx * nx + ny * ny
        if (d > 1) continue
        const nz = Math.sqrt(1 - d)
        const lit = -nx * 0.55 - ny * 0.35 + nz * 0.7
        const panel = (Math.floor((Math.atan2(ny, nx) + Math.PI) * 3) + (y % 6 === 0 ? 1 : 0)) % 2
        put(x, y, P.metal[Math.max(0, Math.min(4, Math.round(lit * 3.6 + 0.6 - panel * 0.3)))])
      }
    // portholes on the front, glowing warm
    for (const [px, py] of [
      [cx - 10, base - 7],
      [cx + 1, base - 9],
      [cx + 11, base - 6],
    ]) {
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const d = dx * dx + dy * dy
          if (d > 6) continue
          if (d > 3) put(px + dx, py + dy, P.metal[0])
          else glow(px + dx, py + dy, d === 0 ? hex('#fff1c8') : P.amber)
        }
      portholes.push({ x: px, y: py })
    }
    // hatch on the right
    for (let y = base - 9; y < base + 2; y++)
      for (let x = cx + 15; x <= cx + 18; x++) put(x, y, y === base - 9 || x === cx + 15 ? P.metal[0] : P.metal[1])
    // antenna
    for (let y = base - ry - 8; y < base - ry + 1; y++) put(cx - 4, y, P.metal[1])
    glow(cx - 4, base - ry - 9, P.red)
    outline(w, h, put, has)
  })
  return { sprite: s, portholes, antenna: { x: cx - 4, y: base - ry - 9 } }
}

function makeBeacon(): Sprite {
  const s = sprite(5, 16, 2, 15, (put, glow) => {
    for (let y = 4; y < 16; y++) put(2, y, P.metal[y < 6 ? 2 : 0])
    put(1, 15, P.metal[0])
    put(3, 15, P.metal[0])
    for (let dx = -1; dx <= 1; dx++) for (let dy = 1; dy <= 3; dy++) glow(2 + dx, dy, dx === 0 && dy === 2 ? hex('#e6fdff') : P.cyan)
  })
  s.light = { dx: 0, dy: -13, c: P.cyan, r: 22 }
  return s
}

function makeDish(): Sprite {
  return sprite(12, 13, 6, 12, (put, glow, has) => {
    for (let y = 6; y < 13; y++) put(6, y, P.metal[0])
    for (let x = 1; x <= 10; x++) {
      const t = (x - 5.5) / 5
      const y = Math.round(5 + t * t * 3 - 3)
      for (let k = 0; k < 2; k++) put(x, y + k, P.metal[k === 0 ? 3 : 2])
    }
    for (let y = 1; y <= 4; y++) put(6, y, P.metal[1])
    glow(6, 0, P.pink)
    outline(12, 13, put, has)
  })
}

/** The visiting saucer, drawn every frame. */
function makeSaucer(): Sprite {
  const w = 30
  const h = 13
  return sprite(w, h, 15, 9, (put, glow, has) => {
    // glass dome
    for (let y = 0; y < 6; y++)
      for (let x = 9; x <= 20; x++) {
        const dx = (x + 0.5 - 15) / 6
        const dy = (y + 0.5 - 6) / 6
        if (dx * dx + dy * dy <= 1) put(x, y, dx < -0.2 && dy < -0.3 ? hex('#e6fdff') : dx < 0.2 ? hex('#9ff3ff') : hex('#5cc8da'))
      }
    // body
    for (let y = 5; y < 11; y++)
      for (let x = 0; x < w; x++) {
        const dx = (x + 0.5 - 15) / 15
        const dy = (y + 0.5 - 7.5) / 3.2
        if (dx * dx + dy * dy > 1) continue
        put(x, y, P.metal[y < 7 ? 4 : y < 9 ? 3 : 1])
      }
    for (let k = 0; k < 6; k++) glow(4 + k * 4.4, 8, [P.pink, P.cyan, P.lime][k % 3])
    outline(w, h, put, has)
  })
}

/* ---------- Painting the world once ---------- */

interface Placed {
  depth: number
  x: number
  y: number
  sprite: Sprite
  /** Close to the clearing: gets a halo of light at night, not just glowing pixels. */
  near: boolean
}

interface Light {
  x: number
  y: number
  r: number
  c: RGB
  blink?: number
}

interface World {
  base: HTMLCanvasElement
  glow: HTMLCanvasElement
  /** Pool pixels, for glints. */
  pool: number[]
  lights: Light[]
  hover: { x: number; y: number }
  w: number
  h: number
}

function paintWorld(w: number, h: number, focus = { u: 0, v: 0 }): World {
  const base = canvasOf(w, h)
  const glowCanvas = canvasOf(w, h)
  const ctx = base.getContext('2d')!
  const gctx = glowCanvas.getContext('2d')!
  const f = toScreen(focus.u, focus.v)
  const ox = Math.round(w / 2 - f.x)
  const oy = Math.round(h * 0.45 - f.y)

  // Ground, pixel by pixel, with its glow.
  const img = ctx.createImageData(w, h)
  const lit = gctx.createImageData(w, h)
  const pool: number[] = []
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const { u, v } = toWorld(px - ox, py - oy)
      const [c, g] = ground(u, v, px - ox, py - oy)
      const i = (py * w + px) * 4
      img.data[i] = c[0]
      img.data[i + 1] = c[1]
      img.data[i + 2] = c[2]
      img.data[i + 3] = 255
      if (g) {
        lit.data[i] = g[0]
        lit.data[i + 1] = g[1]
        lit.data[i + 2] = g[2]
        lit.data[i + 3] = 255
      }
      if (poolValue(u, v) < 0.85) pool.push(px, py)
    }
  ctx.putImageData(img, 0, 0)
  gctx.putImageData(lit, 0, 0)

  // Things standing on the ground, back to front.
  const placed: Placed[] = []
  const at = (u: number, v: number, s: Sprite) => {
    const p = toScreen(u, v)
    placed.push({ depth: u + v, x: Math.round(ox + p.x - s.ox), y: Math.round(oy + p.y - s.oy), sprite: s, near: clearingDist(u, v) < CLEARING.r + 4 })
  }
  const caps = [P.capTeal, P.capViolet, P.capTeal, P.capPink, P.capViolet, P.capTeal, P.capAmber, P.capTeal]
  const shrooms = Array.from({ length: 12 }, (_, k) => makeShroom(k + 1, 6 + (k % 4) * 2, caps[k % caps.length]))
  const crystals = Array.from({ length: 4 }, (_, k) => makeCrystals(k + 11, k % 2 ? P.crystalP : P.crystalC))
  const orbs = Array.from({ length: 3 }, (_, k) => makeOrb(k + 21))
  const fronds = Array.from({ length: 4 }, (_, k) => makeFrond(k + 31))
  const rocks = Array.from({ length: 3 }, (_, k) => makeRock(k + 41))

  // Visible world range (with a margin so tall flora at the bottom edge still shows).
  const corners = [toWorld(-ox, -oy), toWorld(w - ox, -oy), toWorld(-ox, h - oy + 40), toWorld(w - ox, h - oy + 40)]
  const umin = Math.floor(Math.min(...corners.map((c) => c.u))) - 2
  const umax = Math.ceil(Math.max(...corners.map((c) => c.u))) + 2
  const vmin = Math.floor(Math.min(...corners.map((c) => c.v))) - 2
  const vmax = Math.ceil(Math.max(...corners.map((c) => c.v))) + 2
  const busy = (u: number, v: number) =>
    poolValue(u, v) < 1.4 ||
    distToPath(u, v) < 1.1 ||
    inPlot(u - 0.3, v - 0.3) ||
    inPlot(u + 0.6, v + 0.6) ||
    (u > -11 && u < -4.5 && v > -6 && v < -1)

  for (let u = umin; u <= umax; u++)
    for (let v = vmin; v <= vmax; v++) {
      const ju = u + (hash(u, v, 51) - 0.5) * 0.8
      const jv = v + (hash(u, v, 52) - 0.5) * 0.8
      if (busy(ju, jv)) continue
      const wv = wild(ju, jv)
      const r = hash(u, v, 53)
      const pick = hash(u, v, 54)
      if (r < wv * 0.42) {
        if (pick < 0.72) at(ju, jv, shrooms[Math.floor(pick * 31) % shrooms.length])
        else if (pick < 0.82) at(ju, jv, crystals[Math.floor(pick * 37) % crystals.length])
        else if (pick < 0.86) at(ju, jv, orbs[Math.floor(pick * 41) % orbs.length])
        else at(ju, jv, fronds[Math.floor(pick * 43) % fronds.length])
      } else if (r < wv * 0.42 + 0.06) at(ju, jv, fronds[Math.floor(hash(u, v, 55) * 4)])
      else if (r > 0.988) at(ju, jv, rocks[Math.floor(hash(u, v, 56) * 3)])
      else if (r > 0.982) at(ju, jv, crystals[Math.floor(hash(u, v, 57) * 4)])
    }

  // The clearing, placed by hand.
  const dome = makeDome()
  at(HOME.u, HOME.v, dome.sprite)
  const beacon = makeBeacon()
  const beacons: [number, number][] = [
    [-2.6, 1.9],
    [3.4, 0.0],
    [8.8, 3.6],
  ]
  for (const [u, v] of beacons) at(u, v, beacon)
  at(-3.2, -0.6, makeDish())
  for (let u = PLOT.u0 + 0.3; u < PLOT.u1 - 0.2; u += 0.55)
    for (let v = PLOT.v0 + 0.25; v < PLOT.v1; v += 1 / 3.2) at(u, v + 0.12, makeSprout(Math.floor(u * 10 + v * 100)))
  for (const [u, v, k] of [
    [6.6, -3.0, 0],
    [1.2, -8.2, 1],
    [7.6, -9.5, 2],
  ] as const)
    at(u, v, rocks[k])
  at(-1.5, -4.5, crystals[0])
  at(5.5, 6.2, orbs[1])
  at(-4.8, 3.8, fronds[2])
  at(6.2, -1.2, crystals[1])

  placed.sort((a, b) => a.depth - b.depth)
  // Soft shadows first (under everything), then the sprites and their glow.
  ctx.fillStyle = 'rgba(5,3,14,0.32)'
  for (const p of placed) {
    const s = p.sprite
    if (s.canvas.height < 9) continue
    ctx.beginPath()
    ctx.ellipse(p.x + s.ox + 3, p.y + s.oy, s.canvas.width * 0.42, s.canvas.width * 0.18, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  const lights: Light[] = []
  for (const p of placed) {
    ctx.drawImage(p.sprite.canvas, p.x, p.y)
    if (p.sprite.glow) {
      gctx.drawImage(p.sprite.glow, p.x, p.y)
      // things in front hide the glow of things behind them
    }
    const l = p.sprite.light
    if (l && p.near && p.x > -30 && p.x < w + 30 && p.y > -30 && p.y < h + 30)
      lights.push({ x: p.x + p.sprite.ox + l.dx, y: p.y + p.sprite.oy + l.dy, r: l.r, c: l.c, blink: p.sprite === beacon ? 1.7 : undefined })
  }

  const home = toScreen(HOME.u, HOME.v)
  const hx = Math.round(ox + home.x - dome.sprite.ox)
  const hy = Math.round(oy + home.y - dome.sprite.oy)
  for (const ph of dome.portholes) lights.push({ x: hx + ph.x, y: hy + ph.y, r: 16, c: P.amber })
  lights.push({ x: hx + dome.antenna.x, y: hy + dome.antenna.y, r: 8, c: P.red, blink: 1.1 })
  const hover = toScreen(HOVER.u, HOVER.v)
  return { base, glow: glowCanvas, pool, lights, hover: { x: ox + hover.x, y: oy + hover.y }, w, h }
}

/* ---------- Light and weather ---------- */

const TINT: Record<TimeOfDay, { c: RGB; a: number; glow: number }> = {
  morning: { c: hex('#e9b0d8'), a: 0.34, glow: 0.3 },
  day: { c: hex('#eef6ff'), a: 0.05, glow: 0.18 },
  evening: { c: hex('#b8467e'), a: 0.56, glow: 0.72 },
  night: { c: hex('#140f38'), a: 0.8, glow: 1 },
}

/** The time of day that fits the viewer's clock. */
export function timeFromClock(d = new Date()): TimeOfDay {
  const h = d.getHours() + d.getMinutes() / 60
  if (h >= 5.5 && h < 9.5) return 'morning'
  if (h >= 9.5 && h < 17.5) return 'day'
  if (h >= 17.5 && h < 20.5) return 'evening'
  return 'night'
}

interface Spore {
  x: number
  y: number
  p: number
  c: RGB
}
interface Meteor {
  x: number
  y: number
  vx: number
  vy: number
  life: number
}

const SAUCER_CYCLE = 34 // seconds between visits

/** Where the saucer is at `t`: ground point, height above it, and how strongly its beam shines. */
function saucerAt(t: number, w: number, hover: { x: number; y: number }, still: boolean) {
  if (still) return { x: hover.x, y: hover.y, alt: 30, beam: 1, on: true }
  const p = (t % SAUCER_CYCLE) / SAUCER_CYCLE
  const ease = (k: number) => k * k * (3 - 2 * k)
  if (p < 0.2) {
    const k = ease(p / 0.2)
    return { x: -60 + (hover.x + 60) * k, y: hover.y - 60 + 60 * k, alt: 30, beam: 0, on: true }
  }
  if (p < 0.5) {
    const k = (p - 0.2) / 0.3
    const beam = Math.min(1, k * 6, (1 - k) * 6)
    return { x: hover.x + Math.sin(t * 1.3) * 1.5, y: hover.y, alt: 30 + Math.sin(t * 2) * 1.5, beam, on: true }
  }
  if (p < 0.68) {
    const k = ease((p - 0.5) / 0.18)
    return { x: hover.x + (w + 80 - hover.x) * k, y: hover.y - 40 * k, alt: 30 + 20 * k, beam: 0, on: true }
  }
  return { x: 0, y: 0, alt: 0, beam: 0, on: false }
}

/**
 * Starts drawing into `canvas`, filling its CSS box at `scale` CSS pixels per art pixel.
 * Draws one still frame when `still` is true (reduced motion). `size` and `focus` are for
 * rendering a fixed picture (the hero photo is made this way).
 */
export function startScene(
  canvas: HTMLCanvasElement,
  opts: { time: TimeOfDay; weather: Weather; scale?: number; still?: boolean; size?: { w: number; h: number }; focus?: { u: number; v: number } },
): SceneControls {
  const ctx = canvas.getContext('2d')!
  let state = { time: opts.time, weather: opts.weather }
  // The tint eases between times of day instead of jumping.
  let tint = { ...TINT[state.time], c: [...TINT[state.time].c] as RGB }
  let world: World | null = null
  let spores: Spore[] = []
  let meteors: Meteor[] = []
  const saucer = makeSaucer()
  let raf = 0
  let last = 0
  let t = 0
  let stopped = false

  const resize = () => {
    const scale = opts.scale ?? (window.innerWidth < 640 ? 2 : 3)
    const w = opts.size?.w ?? Math.ceil(window.innerWidth / scale)
    const h = opts.size?.h ?? Math.ceil(window.innerHeight / scale)
    // A hidden page may start without a viewport. Wait for resize before allocating pixels.
    if (w < 1 || h < 1) return
    if (world && world.w === w && world.h === h) return
    canvas.width = w
    canvas.height = h
    world = paintWorld(w, h, opts.focus)
    const colours = [P.cyan, P.pink, P.lime, P.speck[3]]
    spores = Array.from({ length: Math.round((w * h) / 3500) + 10 }, (_, i) => ({
      x: Math.random() * w,
      y: Math.random() * h,
      p: Math.random() * 100,
      c: colours[i % 4],
    }))
  }

  const frame = (now: number) => {
    if (stopped) return
    raf = requestAnimationFrame(frame)
    if (now - last < 1000 / 20 && !opts.still) return // 20 frames a second is plenty for pixels
    const dt = Math.min(0.1, (now - last) / 1000 || 0.05)
    last = now
    t += dt
    draw(dt)
    if (opts.still) cancelAnimationFrame(raf)
  }

  const draw = (dt: number) => {
    if (!world) return
    const { w, h } = world
    const target = TINT[state.time]
    const k = opts.still ? 1 : Math.min(1, dt * 1.5)
    tint = {
      c: tint.c.map((c, i) => c + (target.c[i] - c) * k) as RGB,
      a: tint.a + (target.a - tint.a) * k,
      glow: tint.glow + (target.glow - tint.glow) * k,
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.drawImage(world.base, 0, 0)

    // Pool glints.
    ctx.fillStyle = 'rgba(200,255,250,0.6)'
    for (let i = 0; i < world.pool.length; i += 2) {
      const x = world.pool[i]
      const y = world.pool[i + 1]
      const g = hash(x, y, 91)
      if (g > 0.982 && Math.sin(t * 2 + g * 600) > 0.6) ctx.fillRect(x, y, 2, 1)
    }

    // The saucer's shadow on the ground.
    const s = saucerAt(t, w, world.hover, !!opts.still)
    if (s.on) {
      ctx.fillStyle = 'rgba(5,3,14,0.3)'
      ctx.beginPath()
      ctx.ellipse(s.x, s.y, 12, 4, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    // Mist: slow lavender banks drifting across.
    if (state.weather === 'mist') {
      ctx.fillStyle = 'rgba(20,14,40,0.12)'
      for (let i = 0; i < 4; i++) {
        const cx = ((t * 3 + i * 157) % (w + 160)) - 80
        ctx.beginPath()
        ctx.ellipse(cx, (i * 71) % h, 80, 28, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Time of day: multiply the whole picture by a tint.
    ctx.globalCompositeOperation = 'multiply'
    const dim = state.weather === 'mist' ? 0.14 : state.weather === 'meteors' ? 0.08 : 0
    const mix = (c: number) => 255 - (255 - c) * tint.a
    ctx.fillStyle = css([mix(tint.c[0]) * (1 - dim), mix(tint.c[1]) * (1 - dim), mix(tint.c[2]) * (1 - dim * 0.5)])
    ctx.fillRect(0, 0, w, h)

    // Morning haze.
    if (state.time === 'morning' || state.weather === 'mist') {
      ctx.globalCompositeOperation = 'screen'
      const haze = ctx.createLinearGradient(0, 0, 0, h)
      const c = state.weather === 'mist' ? '190,170,235' : '255,205,235'
      haze.addColorStop(0, `rgba(${c},0.26)`)
      haze.addColorStop(0.6, `rgba(${c},0.07)`)
      haze.addColorStop(1, `rgba(${c},0.02)`)
      ctx.fillStyle = haze
      ctx.fillRect(0, 0, w, h)
    }

    // Everything that glows, brighter as it gets dark.
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = Math.min(1, 0.25 + tint.glow * 0.75)
    ctx.drawImage(world.glow, 0, 0)
    ctx.globalAlpha = 1
    if (tint.glow > 0.05) {
      for (const l of world.lights) {
        const blink = l.blink ? (Math.sin(t * Math.PI * l.blink) > -0.2 ? 1 : 0.15) : 0.92 + Math.sin(t * 5 + l.x) * 0.08
        const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r)
        g.addColorStop(0, css(l.c, 0.5 * tint.glow * blink))
        g.addColorStop(0.35, css(l.c, 0.16 * tint.glow * blink))
        g.addColorStop(1, css(l.c, 0))
        ctx.fillStyle = g
        ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2)
      }
    }

    // Spores drifting up: faint by day, bright at night.
    for (const sp of spores) {
      if (!opts.still) {
        sp.p += dt
        sp.y -= dt * 3
        if (sp.y < -4) {
          sp.y = h + 4
          sp.x = Math.random() * w
        }
      }
      const x = Math.round(sp.x + Math.sin(sp.p * 0.7) * 6)
      const y = Math.round(sp.y)
      const on = (0.5 + Math.max(0, Math.sin(sp.p * 1.9)) * 0.5) * (0.25 + tint.glow * 0.75)
      ctx.fillStyle = css(sp.c, 0.85 * on)
      ctx.fillRect(x, y, 1, 1)
      ctx.fillStyle = css(sp.c, 0.15 * on)
      ctx.fillRect(x - 1, y - 1, 3, 3)
    }

    // The saucer: beam, body, lights.
    if (s.on) {
      const top = s.y - s.alt
      if (s.beam > 0.02) {
        const g = ctx.createLinearGradient(0, top, 0, s.y)
        g.addColorStop(0, `rgba(126,249,255,${0.35 * s.beam})`)
        g.addColorStop(1, `rgba(126,249,255,${0.12 * s.beam})`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.moveTo(s.x - 5, top + 3)
        ctx.lineTo(s.x + 5, top + 3)
        ctx.lineTo(s.x + 13, s.y)
        ctx.lineTo(s.x - 13, s.y)
        ctx.closePath()
        ctx.fill()
        for (let i = 0; i < 6; i++) {
          const life = (t * 0.6 + i / 6) % 1
          ctx.fillStyle = `rgba(230,253,255,${0.8 * s.beam * (1 - life)})`
          ctx.fillRect(Math.round(s.x + Math.sin(i * 2.1 + t) * 7 * (1 - life)), Math.round(s.y - life * s.alt), 1, 1)
        }
      }
      ctx.globalCompositeOperation = 'source-over'
      ctx.drawImage(saucer.canvas, Math.round(s.x - saucer.ox), Math.round(top - saucer.oy))
      if (saucer.glow) {
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = 0.6 + Math.sin(t * 6) * 0.4
        ctx.drawImage(saucer.glow, Math.round(s.x - saucer.ox), Math.round(top - saucer.oy))
        ctx.globalAlpha = 1
      }
    }

    // Meteors: bright streaks with fading tails.
    ctx.globalCompositeOperation = 'lighter'
    if (state.weather === 'meteors') {
      if (!opts.still && Math.random() < dt * 2.2)
        meteors.push({ x: Math.random() * w * 1.2, y: -10, vx: -(60 + Math.random() * 40), vy: 70 + Math.random() * 40, life: 1 })
      if (opts.still && meteors.length === 0)
        meteors = [0.2, 0.55, 0.85].map((f) => ({ x: w * f, y: h * (0.15 + f * 0.3), vx: -80, vy: 90, life: 0.8 }))
      for (const m of meteors) {
        if (!opts.still) {
          m.x += m.vx * dt
          m.y += m.vy * dt
          m.life -= dt * 0.7
        }
        for (let k = 0; k < 14; k++) {
          const a = Math.max(0, m.life) * (1 - k / 14)
          ctx.fillStyle = k < 2 ? `rgba(255,255,255,${a})` : `rgba(180,230,255,${a * 0.6})`
          ctx.fillRect(Math.round(m.x - (m.vx / 110) * k), Math.round(m.y - (m.vy / 110) * k), 1, 1)
        }
      }
      meteors = meteors.filter((m) => m.life > 0 && m.y < h + 20)
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  resize()
  raf = requestAnimationFrame(frame)
  let timer: ReturnType<typeof setTimeout>
  const onResize = () => {
    if (opts.size) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      resize()
      if (opts.still) draw(1)
    }, 150)
  }
  const onVisible = () => {
    if (document.hidden) cancelAnimationFrame(raf)
    else if (!stopped && !opts.still) raf = requestAnimationFrame(frame)
  }
  window.addEventListener('resize', onResize)
  document.addEventListener('visibilitychange', onVisible)

  return {
    set(next) {
      state = { ...state, ...next }
      if (opts.still) {
        tint = { ...TINT[state.time], c: [...TINT[state.time].c] as RGB }
        meteors = []
        draw(1)
      }
    },
    stop() {
      stopped = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisible)
    },
  }
}
