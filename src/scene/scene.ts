/**
 * The living backdrop: a small isometric pixel-art world drawn by code (no image files), with a
 * day/night cycle and weather. Drawn at a low resolution and scaled up with `pixelated`, so every
 * art pixel is a crisp square.
 *
 * The world is procedural and endless (value noise decides grass, forest and flowers), with a hand-
 * placed clearing in the middle: a cabin, a pond, a garden plot, a path and lanterns. The ground and
 * everything on it is painted once into a buffer; each frame adds water glints, chimney smoke,
 * the time-of-day tint, lights, fireflies and rain on top.
 */

export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night'
export type Weather = 'clear' | 'cloudy' | 'rain'

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

const P = {
  grass: ['#2f4a25', '#3a5a2c', '#466b33', '#537a3a', '#628a43'].map(hex),
  grassDry: ['#55693a', '#637842'].map(hex),
  flower: ['#e8d7a8', '#d98f8f', '#e6c35c', '#b9a3d9'].map(hex),
  path: ['#8c7a5a', '#a8946c', '#bba77d', '#cbb98f'].map(hex),
  soil: ['#4a3322', '#5a3e29', '#6b4b31'].map(hex),
  water: ['#24414d', '#2b4e5b', '#335c69', '#3e6c78'].map(hex),
  mud: ['#4b3f2c', '#5b4c34'].map(hex),
  leaf: ['#16281a', '#1f3a22', '#2c4f2c', '#3d6a37', '#558a45', '#6fa152'].map(hex),
  leafWarm: ['#1c2814', '#2b3d1b', '#3f5624', '#55702e', '#6c8a38', '#86a146'].map(hex),
  leafCool: ['#122219', '#1b3426', '#264a34', '#336042', '#447a52', '#5a9264'].map(hex),
  pine: ['#122219', '#1a3123', '#24432c', '#2f5636', '#3d6b41'].map(hex),
  bark: ['#2e2016', '#4a3423', '#634632'].map(hex),
  stone: ['#3f4246', '#5a5e60', '#767a78', '#9a9c94'].map(hex),
  wallLit: ['#8c6440', '#a3784e', '#b48a5d'].map(hex),
  wallShade: ['#5c4029', '#6e4e33'].map(hex),
  roof: ['#2c4247', '#36535a', '#42656b', '#527a7d'].map(hex),
  outline: hex('#141c14'),
  lamp: hex('#ffd27a'),
  window: hex('#ffc861'),
}

/* ---------- The world ---------- */

/** World (u, v) in tiles → art pixels. A tile is 16 × 8. */
const toScreen = (u: number, v: number) => ({ x: (u - v) * 8, y: (u + v) * 4 })
const toWorld = (x: number, y: number) => ({ u: (x / 8 + y / 4) / 2, v: (y / 4 - x / 8) / 2 })

const POND = { u: 4.2, v: -6.5, ru: 3.6, rv: 2.6 }
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

function pondValue(u: number, v: number) {
  const du = (u - POND.u) / POND.ru
  const dv = (v - POND.v) / POND.rv
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
    const eu = au + du * t - u
    const ev = av + dv * t - v
    best = Math.min(best, Math.hypot(eu, ev))
  }
  return best
}

const inPlot = (u: number, v: number) => u > PLOT.u0 && u < PLOT.u1 && v > PLOT.v0 && v < PLOT.v1
const clearingDist = (u: number, v: number) => Math.hypot(u - CLEARING.u, (v - CLEARING.v) * 1.1)

/** How wooded a spot is: 0 in the clearing, rising into the forest. */
function forest(u: number, v: number) {
  const edge = (clearingDist(u, v) - CLEARING.r) / 3
  return Math.max(0, Math.min(1, edge)) * (0.55 + fbm(u * 0.18, v * 0.18, 3) * 0.6)
}

function groundColour(u: number, v: number, px: number, py: number): RGB {
  const j = hash(px, py, 5) // per-pixel jitter for dithering
  const p = pondValue(u, v)
  if (p < 1) {
    const depth = Math.min(1, (1 - p) * 2.2)
    const i = Math.min(3, Math.floor(depth * 3 + j * 0.9))
    return P.water[3 - i]
  }
  if (p < 1.16) return P.mud[j < 0.5 ? 0 : 1]
  const d = distToPath(u, v)
  const pathEdge = 0.55 + (noise(u * 2, v * 2, 9) - 0.5) * 0.35
  if (d < pathEdge) {
    // Cobbles: cells of half a tile, darker in the gaps between them.
    const cu = u * 2.3 + noise(u * 3, v * 3, 2) * 0.6
    const cv = v * 2.3 + noise(u * 3, v * 3, 4) * 0.6
    const fu = cu - Math.floor(cu)
    const fv = cv - Math.floor(cv)
    const gap = Math.min(fu, 1 - fu, fv, 1 - fv)
    if (gap < 0.09) return P.path[0]
    const tone = hash(Math.floor(cu), Math.floor(cv), 8)
    return P.path[1 + Math.min(2, Math.floor(tone * 2.2 + j * 0.8))]
  }
  if (inPlot(u, v)) {
    const row = Math.floor((v - PLOT.v0) * 3.2)
    const inRow = ((v - PLOT.v0) * 3.2) % 1
    return inRow < 0.35 ? P.soil[0] : P.soil[row % 2 === 0 ? 2 : 1]
  }
  // Grass: smooth value noise picks a band, per-pixel jitter dithers between neighbours.
  const shade = fbm(u * 0.35, v * 0.35, 1) * 0.75 + fbm(u * 1.6, v * 1.6, 2) * 0.25 - forest(u, v) * 0.35
  const level = Math.max(0, Math.min(4, Math.floor(shade * 5.2 + (j - 0.5) * 0.9)))
  if (clearingDist(u, v) < CLEARING.r && hash(px, py, 77) < 0.012) return P.flower[Math.floor(hash(px, py, 78) * 4)]
  if (hash(px >> 1, py >> 1, 11) < 0.02 && level > 1) return P.grassDry[j < 0.5 ? 0 : 1]
  return P.grass[level]
}

/* ---------- Sprites, drawn by code ---------- */

type Sprite = { canvas: HTMLCanvasElement; ox: number; oy: number }

function sprite(w: number, h: number, ox: number, oy: number, draw: (img: ImageData) => void): Sprite {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(w, h)
  draw(img)
  ctx.putImageData(img, 0, 0)
  return { canvas: c, ox, oy }
}

function put(img: ImageData, x: number, y: number, c: RGB, a = 255) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return
  const i = (y * img.width + x) * 4
  img.data[i] = c[0]
  img.data[i + 1] = c[1]
  img.data[i + 2] = c[2]
  img.data[i + 3] = a
}
const filled = (img: ImageData, x: number, y: number) =>
  x >= 0 && y >= 0 && x < img.width && y < img.height && img.data[(y * img.width + x) * 4 + 3] > 0

/** A round-canopy tree: a cluster of blobs shaded from the top left, outlined, on a short trunk. */
function makeTree(seed: number, size: number, leaf: RGB[] = P.leaf): Sprite {
  const w = size * 2 + 6
  const trunkH = Math.round(size * 0.45) + 3
  const h = size * 2 + trunkH + 4
  const cx = w / 2
  const cy = size + 2
  return sprite(w, h, Math.round(cx), h - 2, (img) => {
    // trunk
    for (let y = cy + size * 0.5; y < h - 1; y++)
      for (let x = Math.round(cx) - 1; x <= Math.round(cx) + 1; x++) put(img, x, Math.round(y), P.bark[x === Math.round(cx) + 1 ? 0 : x === Math.round(cx) ? 1 : 2])
    const blobs: [number, number, number][] = [[cx, cy, size * 0.82]]
    for (let k = 0; k < 5; k++) {
      const a = hash(seed, k, 31) * Math.PI * 2
      const r = size * (0.32 + hash(seed, k, 32) * 0.3)
      blobs.push([cx + Math.cos(a) * size * 0.45, cy + Math.sin(a) * size * 0.38 - 1, r])
    }
    const inside = (x: number, y: number) => blobs.some(([bx, by, br]) => (x - bx) ** 2 + ((y - by) * 1.12) ** 2 < br * br)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!inside(x + 0.5, y + 0.5)) continue
        // light from the top left; blob centres give a lumpy surface
        let lit = 0
        for (const [bx, by, br] of blobs) {
          const dx = (x - bx) / br
          const dy = (y - by) / br
          const dd = dx * dx + dy * dy
          if (dd < 1) lit = Math.max(lit, (1 - dd) * 0.35 + (-dx * 0.5 - dy * 0.75) * 0.5 + 0.35)
        }
        const level = Math.max(1, Math.min(5, Math.floor(lit * 5 + (hash(x, y, seed) - 0.5) * 1.1)))
        put(img, x, y, leaf[level])
      }
    // dark outline on the outer edge
    const edge: [number, number][] = []
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (!filled(img, x, y) && (filled(img, x - 1, y) || filled(img, x + 1, y) || filled(img, x, y - 1) || filled(img, x, y + 1)))
          edge.push([x, y])
    for (const [x, y] of edge) if (y < cy + size + 1) put(img, x, y, leaf[0])
  })
}

/** A pine: stacked, shaded tiers. */
function makePine(seed: number, size: number): Sprite {
  const w = size + 4
  const h = Math.round(size * 1.9) + 5
  const cx = Math.floor(w / 2)
  return sprite(w, h, cx, h - 1, (img) => {
    for (let y = h - 5; y < h; y++) put(img, cx, y, P.bark[1])
    const tiers = 3
    for (let t = 0; t < tiers; t++) {
      const top = Math.round(t * (h - 6) * 0.28)
      const bottom = Math.round(top + (h - 6) * 0.48)
      for (let y = top; y <= bottom; y++) {
        const half = ((y - top) / (bottom - top)) * (size / 2) * (0.75 + t * 0.15)
        for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
          const side = (x - cx) / Math.max(1, half)
          const lv = Math.max(1, Math.min(4, Math.round(2.6 - side * 1.4 - (y - top) / (bottom - top) + (hash(x, y, seed) - 0.5))))
          put(img, x, y, P.pine[lv])
        }
        put(img, Math.round(cx + half) + 1, y, P.pine[0])
      }
    }
  })
}

function makeStump(): Sprite {
  return sprite(7, 6, 3, 5, (img) => {
    for (let y = 1; y < 6; y++) for (let x = 1; x < 6; x++) put(img, x, y, P.bark[x < 3 ? 2 : x < 5 ? 1 : 0])
    for (let x = 1; x < 6; x++) put(img, x, 1, hex('#b8945e'))
    put(img, 3, 1, hex('#8a6a40'))
    put(img, 0, 5, P.bark[0])
    put(img, 6, 5, P.bark[0])
  })
}

function makeLog(): Sprite {
  return sprite(16, 8, 8, 6, (img) => {
    for (let t = 0; t < 13; t++)
      for (let k = 0; k < 3; k++) put(img, 1 + t, 2 + Math.round(t * 0.4) + k, P.bark[k === 0 ? 2 : k === 1 ? 1 : 0])
    for (let k = 0; k < 3; k++) put(img, 14, 7 - k, hex(k === 1 ? '#8a6a40' : '#b8945e'))
  })
}

function makeTuft(seed: number): Sprite {
  return sprite(5, 4, 2, 3, (img) => {
    for (let k = 0; k < 4; k++) {
      const x = Math.floor(hash(seed, k, 61) * 5)
      const tall = 1 + Math.floor(hash(seed, k, 62) * 3)
      for (let y = 0; y < tall; y++) put(img, x, 3 - y, P.grass[y === tall - 1 ? 4 : 3])
    }
  })
}

function makeMushrooms(): Sprite {
  return sprite(6, 4, 3, 3, (img) => {
    for (const [x, c] of [
      [1, '#c8553d'],
      [4, '#d9a441'],
    ] as const) {
      put(img, x, 3, hex('#e8dcc0'))
      put(img, x - 1, 2, hex(c))
      put(img, x, 2, hex(c))
      put(img, x + 1, 2, hex(c))
      put(img, x, 2, hex('#f0e6cf'))
    }
  })
}

function makeRock(seed: number): Sprite {
  const w = 9
  const h = 6
  return sprite(w, h, 4, 5, (img) => {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = (x - 4) / 4.4
        const dy = (y - 3.2) / 2.8
        if (dx * dx + dy * dy > 1) continue
        const lv = Math.max(0, Math.min(3, Math.round(2.2 - dx - dy + (hash(x, y, seed) - 0.5))))
        put(img, x, y, P.stone[lv])
      }
  })
}

function makeBush(seed: number): Sprite {
  const w = 11
  const h = 8
  return sprite(w, h, 5, 7, (img) => {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = (x - 5) / 5.3
        const dy = (y - 4.5) / 3.6
        if (dx * dx + dy * dy > 1 - hash(x, y, seed) * 0.25) continue
        const lv = Math.max(1, Math.min(4, Math.round(3 - dx * 1.2 - dy * 1.4 + (hash(x, y, seed + 1) - 0.5))))
        put(img, x, y, P.leaf[lv])
      }
    if (hash(seed, 1, 5) < 0.5) for (let k = 0; k < 4; k++) put(img, 2 + Math.floor(hash(seed, k, 6) * 7), 1 + Math.floor(hash(seed, k, 7) * 4), P.flower[1 + (k % 3)])
  })
}

/** The cabin: an isometric box with plank walls, two windows, a door and a gabled slate roof. */
function makeCabin(): { sprite: Sprite; windows: { x: number; y: number }[]; chimney: { x: number; y: number } } {
  const A = 3 // footprint along u (tiles)
  const B = 2 // along v
  const wallH = 15
  const roofH = 12
  const w = (A + B) * 8 + 2
  const h = (A + B) * 4 + wallH + roofH + 8
  // corners of the footprint on screen, with the back (u=0, v=0) corner at (B*8+1, roofH+wallH+2)
  const bx = B * 8 + 1
  const by = roofH + wallH + 4
  const corner = (u: number, v: number) => ({ x: bx + (u - v) * 8, y: by + (u + v) * 4 })
  const windows: { x: number; y: number }[] = []
  const front = corner(A, B)
  const s = sprite(w, h, front.x, front.y, (img) => {
    // left face: along u at v = B (lit), right face: along v at u = A (shade)
    for (let t = 0; t <= A * 16; t++) {
      const p = corner(t / 16, B)
      for (let k = 0; k < wallH; k++) {
        const plank = Math.floor(k / 3) % 2
        const c = P.wallLit[k % 3 === 2 ? 0 : 1 + plank]
        put(img, Math.round(p.x), Math.round(p.y - k), c)
      }
    }
    for (let t = 0; t <= B * 16; t++) {
      const p = corner(A, B - t / 16)
      for (let k = 0; k < wallH; k++) put(img, Math.round(p.x), Math.round(p.y - k), P.wallShade[k % 3 === 2 ? 0 : 1])
    }
    // corner posts
    for (const q of [corner(0, B), corner(A, B), corner(A, 0)])
      for (let k = 0; k < wallH; k++) put(img, Math.round(q.x), Math.round(q.y - k), P.bark[0])
    // windows on the left face, a door on the right face
    for (const f of [0.28, 0.72]) {
      const p = corner(A * f, B)
      for (let dx = -2; dx <= 2; dx++)
        for (let dy = 0; dy < 5; dy++) {
          const x = Math.round(p.x + dx)
          const y = Math.round(p.y - 5 - dy + dx * 0.5)
          const frame = Math.abs(dx) === 2 || dy === 0 || dy === 4
          put(img, x, y, frame ? P.bark[0] : hex('#2a2a2e'))
        }
      windows.push({ x: Math.round(p.x) - front.x, y: Math.round(p.y - 7) - front.y })
    }
    const door = corner(A, B * 0.45)
    for (let dx = -2; dx <= 2; dx++)
      for (let dy = 0; dy < 9; dy++) put(img, Math.round(door.x + dx), Math.round(door.y - dy - dx * 0.5), dy === 8 || Math.abs(dx) === 2 ? P.bark[0] : P.bark[1])
    // gabled roof: ridge along u above the middle of v
    const eave = 2
    for (let t = -eave * 2; t <= A * 16 + eave * 2; t++) {
      const u = t / 16
      const ridge = corner(u, B / 2)
      const rx = ridge.x
      const ry = ridge.y - wallH - roofH
      // front slope (towards +v) down to the eave
      const low = corner(u, B + 0.25)
      const steps = 40
      for (let k = 0; k <= steps; k++) {
        const f = k / steps
        const x = Math.round(rx + (low.x - rx) * f)
        const y = Math.round(ry + (low.y - wallH + 1 - ry) * f)
        const shingle = Math.floor(f * 6) % 2
        put(img, x, y, P.roof[t < -eave || t > A * 16 + eave - 1 ? 0 : 2 + shingle])
        put(img, x, y + 1, P.roof[1 + shingle])
      }
      // back slope peeks above the ridge only at the gable end
      put(img, Math.round(rx), Math.round(ry) - 1, P.roof[3])
    }
    // gable end triangle on the right face
    const g0 = corner(A, B + 0.25)
    const g1 = corner(A, -0.25)
    const gr = corner(A, B / 2)
    for (let k = 0; k <= roofH; k++) {
      const f = k / roofH
      const xa = g0.x + (gr.x - g0.x) * f
      const xb = g1.x + (gr.x - g1.x) * f
      const ya = g0.y - wallH - k
      for (let x = Math.round(Math.min(xa, xb)); x <= Math.round(Math.max(xa, xb)); x++) {
        const y = Math.round(ya + (x - xa) * -0.5 * (xb > xa ? 1 : -1) * 0)
        if (!filled(img, x, y)) put(img, x, y, P.wallShade[k % 2])
      }
    }
    // chimney
    const ch = corner(A * 0.25, B * 0.3)
    for (let dy = 0; dy < 9; dy++) for (let dx = 0; dx < 4; dx++) put(img, Math.round(ch.x) + dx, Math.round(ch.y - wallH - roofH - 2 - dy + 6), P.stone[dx < 2 ? 2 : 1])
  })
  const ch = corner(A * 0.25, B * 0.3)
  return { sprite: s, windows, chimney: { x: Math.round(ch.x) + 2 - front.x, y: Math.round(ch.y - wallH - roofH - 4) - front.y } }
}

function makeLamp(): Sprite {
  return sprite(5, 15, 2, 14, (img) => {
    for (let y = 4; y < 15; y++) put(img, 2, y, P.bark[0])
    for (let x = 1; x <= 3; x++) for (let y = 1; y <= 3; y++) put(img, x, y, x === 2 && y === 2 ? hex('#e8c06a') : P.stone[0])
    put(img, 2, 0, P.stone[0])
  })
}

function makeFence(len: number): Sprite {
  // along u: posts every 4 px, two rails
  const w = len * 8 + 2
  const h = len * 4 + 8
  return sprite(w, h, 1, 6, (img) => {
    for (let t = 0; t <= len * 8; t++) {
      const x = 1 + t
      const y = 6 + t * 0.5
      put(img, x, Math.round(y - 3), P.bark[2])
      put(img, x, Math.round(y - 5), P.bark[1])
      if (t % 6 === 0) for (let k = 0; k < 7; k++) put(img, x, Math.round(y) - k, P.bark[k === 6 ? 2 : 0])
    }
  })
}

function makeCrop(seed: number): Sprite {
  return sprite(5, 5, 2, 4, (img) => {
    const tall = 2 + Math.floor(hash(seed, 0, 3) * 3)
    for (let k = 0; k < tall; k++) put(img, 2, 4 - k, P.leaf[3])
    put(img, 1, 4 - tall + 1, P.leaf[4])
    put(img, 3, 4 - tall + 1, P.leaf[4])
    if (hash(seed, 1, 3) < 0.35) put(img, 2, 4 - tall, P.flower[2])
  })
}

function makeMailbox(): Sprite {
  return sprite(6, 12, 3, 11, (img) => {
    for (let y = 5; y < 12; y++) put(img, 3, y, P.bark[0])
    for (let x = 1; x <= 4; x++) for (let y = 1; y <= 4; y++) put(img, x, y, y === 1 ? hex('#d8c27a') : hex(x < 3 ? '#c9ad5c' : '#a88d43'))
    put(img, 5, 2, hex('#b24a3a'))
    put(img, 5, 3, hex('#b24a3a'))
  })
}

/* ---------- Painting the world once ---------- */

interface Placed {
  depth: number
  x: number
  y: number
  sprite: Sprite
}

interface World {
  base: HTMLCanvasElement
  /** Pixels that are water, for glints. */
  water: number[]
  lights: { x: number; y: number; r: number; kind: 'window' | 'lamp' }[]
  smoke: { x: number; y: number }
  w: number
  h: number
}

function paintWorld(w: number, h: number): World {
  const base = document.createElement('canvas')
  base.width = w
  base.height = h
  const ctx = base.getContext('2d')!
  const ox = Math.round(w / 2)
  const oy = Math.round(h * 0.45)

  // Ground, pixel by pixel.
  const img = ctx.createImageData(w, h)
  const water: number[] = []
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const { u, v } = toWorld(px - ox, py - oy)
      const c = groundColour(u, v, px - ox, py - oy)
      const i = (py * w + px) * 4
      img.data[i] = c[0]
      img.data[i + 1] = c[1]
      img.data[i + 2] = c[2]
      img.data[i + 3] = 255
      if (pondValue(u, v) < 0.85) water.push(px, py)
    }
  ctx.putImageData(img, 0, 0)

  // Things standing on the ground, back to front.
  const placed: Placed[] = []
  const at = (u: number, v: number, s: Sprite) => {
    const p = toScreen(u, v)
    placed.push({ depth: u + v, x: Math.round(ox + p.x - s.ox), y: Math.round(oy + p.y - s.oy), sprite: s })
  }
  const leaves = [P.leaf, P.leaf, P.leafWarm, P.leafCool]
  const trees = Array.from({ length: 12 }, (_, k) => makeTree(k + 1, 6 + (k % 4) * 2, leaves[k % leaves.length]))
  const stump = makeStump()
  const log = makeLog()
  const tufts = Array.from({ length: 4 }, (_, k) => makeTuft(k + 71))
  const shrooms = makeMushrooms()
  const pines = Array.from({ length: 4 }, (_, k) => makePine(k + 11, 9 + (k % 2) * 3))
  const rocks = Array.from({ length: 3 }, (_, k) => makeRock(k + 21))
  const bushes = Array.from({ length: 3 }, (_, k) => makeBush(k + 31))

  // Visible world range (with a margin so tall trees at the bottom edge still show).
  const corners = [toWorld(-ox, -oy), toWorld(w - ox, -oy), toWorld(-ox, h - oy + 40), toWorld(w - ox, h - oy + 40)]
  const umin = Math.floor(Math.min(...corners.map((c) => c.u))) - 2
  const umax = Math.ceil(Math.max(...corners.map((c) => c.u))) + 2
  const vmin = Math.floor(Math.min(...corners.map((c) => c.v))) - 2
  const vmax = Math.ceil(Math.max(...corners.map((c) => c.v))) + 2
  const busy = (u: number, v: number) =>
    pondValue(u, v) < 1.4 || distToPath(u, v) < 1.1 || inPlot(u - 0.3, v - 0.3) || inPlot(u + 0.6, v + 0.6) || (u > -10.5 && u < -5 && v > -5.5 && v < -1.5)

  for (let u = umin; u <= umax; u++)
    for (let v = vmin; v <= vmax; v++) {
      const ju = u + (hash(u, v, 51) - 0.5) * 0.8
      const jv = v + (hash(u, v, 52) - 0.5) * 0.8
      if (busy(ju, jv)) continue
      const f = forest(ju, jv)
      const r = hash(u, v, 53)
      if (r < f * 0.62) {
        const pick = hash(u, v, 54)
        at(ju, jv, pick < 0.25 ? pines[Math.floor(pick * 13) % pines.length] : trees[Math.floor(pick * 47) % trees.length])
      } else if (r < f * 0.62 + 0.05) at(ju, jv, bushes[Math.floor(hash(u, v, 55) * 3)])
      else if (r > 0.988) at(ju, jv, rocks[Math.floor(hash(u, v, 56) * 3)])
      else if (r > 0.978) at(ju, jv, f > 0.2 ? stump : shrooms)
      else if (r > 0.972 && f > 0.15) at(ju, jv, log)
      // grass tufts everywhere outside the path and pond
      if (hash(u, v, 57) < 0.5) at(u + hash(u, v, 58) - 0.5, v + hash(u, v, 59) - 0.5, tufts[Math.floor(hash(u, v, 60) * 4)])
    }

  // The clearing, placed by hand.
  const cabin = makeCabin()
  at(-6.5, -2.5, cabin.sprite)
  // The sprite's anchor is the cabin's front corner, placed at (-6.5, -2.5).
  const cabinPos = toScreen(-6.5, -2.5)
  const cabinX = Math.round(ox + cabinPos.x)
  const cabinY = Math.round(oy + cabinPos.y)
  const lamp = makeLamp()
  const lamps: [number, number][] = [
    [-2.6, 1.9],
    [3.4, 0.0],
    [8.8, 3.6],
  ]
  for (const [u, v] of lamps) at(u, v, lamp)
  at(-3.2, -0.6, makeMailbox())
  for (let u = PLOT.u0 + 0.3; u < PLOT.u1 - 0.2; u += 0.55)
    for (let v = PLOT.v0 + 0.25; v < PLOT.v1; v += 1 / 3.2) at(u, v + 0.12, makeCrop(Math.floor(u * 10 + v * 100)))
  at(PLOT.u0 - 0.2, PLOT.v1 + 0.2, makeFence(Math.round(PLOT.u1 - PLOT.u0 + 0.6)))
  for (const [u, v, k] of [
    [6.6, -3.0, 0],
    [1.2, -8.2, 1],
    [7.6, -9.5, 2],
  ] as const)
    at(u, v, rocks[k])
  for (const [u, v, k] of [
    [-1.5, -4.5, 0],
    [5.5, 6.2, 1],
    [-4.8, 3.8, 2],
  ] as const)
    at(u, v, bushes[k])

  placed.sort((a, b) => a.depth - b.depth)
  // Soft shadows first (under everything), then the sprites.
  ctx.fillStyle = 'rgba(10,20,10,0.28)'
  for (const p of placed) {
    const s = p.sprite
    if (s.canvas.height < 9) continue
    const sx = p.x + s.ox
    const sy = p.y + s.oy
    ctx.beginPath()
    ctx.ellipse(sx + 3, sy, s.canvas.width * 0.42, s.canvas.width * 0.18, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  for (const p of placed) ctx.drawImage(p.sprite.canvas, p.x, p.y)

  const lights: World['lights'] = []
  for (const wdw of cabin.windows) lights.push({ x: cabinX + wdw.x, y: cabinY + wdw.y, r: 16, kind: 'window' })
  for (const [u, v] of lamps) {
    const p = toScreen(u, v)
    lights.push({ x: Math.round(ox + p.x), y: Math.round(oy + p.y - 12), r: 26, kind: 'lamp' })
  }
  return { base, water, lights, smoke: { x: cabinX + cabin.chimney.x, y: cabinY + cabin.chimney.y }, w, h }
}

/* ---------- Light and weather ---------- */

const TINT: Record<TimeOfDay, { c: RGB; a: number; glow: number }> = {
  morning: { c: hex('#f2c9a8'), a: 0.38, glow: 0.2 },
  day: { c: hex('#fff6e6'), a: 0.06, glow: 0 },
  evening: { c: hex('#b8653a'), a: 0.62, glow: 0.7 },
  night: { c: hex('#1d2850'), a: 0.78, glow: 1 },
}

/** The time of day that fits the viewer's clock. */
export function timeFromClock(d = new Date()): TimeOfDay {
  const h = d.getHours() + d.getMinutes() / 60
  if (h >= 5.5 && h < 9.5) return 'morning'
  if (h >= 9.5 && h < 17.5) return 'day'
  if (h >= 17.5 && h < 20.5) return 'evening'
  return 'night'
}

interface Drop {
  x: number
  y: number
  v: number
}
interface Fly {
  x: number
  y: number
  p: number
}

/**
 * Starts drawing into `canvas`, filling its CSS box at `scale` CSS pixels per art pixel.
 * Draws one still frame when `still` is true (reduced motion).
 */
export function startScene(
  canvas: HTMLCanvasElement,
  opts: { time: TimeOfDay; weather: Weather; scale?: number; still?: boolean },
): SceneControls {
  const ctx = canvas.getContext('2d')!
  let state = { time: opts.time, weather: opts.weather }
  // The tint eases between times of day instead of jumping.
  let tint = { ...TINT[state.time], c: [...TINT[state.time].c] as RGB }
  let world: World | null = null
  let drops: Drop[] = []
  let flies: Fly[] = []
  let raf = 0
  let last = 0
  let t = 0
  let stopped = false

  const resize = () => {
    const scale = opts.scale ?? (window.innerWidth < 640 ? 2 : 3)
    const w = Math.ceil(window.innerWidth / scale)
    const h = Math.ceil(window.innerHeight / scale)
    if (world && world.w === w && world.h === h) return
    canvas.width = w
    canvas.height = h
    world = paintWorld(w, h)
    drops = Array.from({ length: Math.round((w * h) / 500) }, () => ({ x: Math.random() * w, y: Math.random() * h, v: 2 + Math.random() * 1.5 }))
    flies = Array.from({ length: 18 }, () => ({ x: Math.random() * w, y: h * (0.3 + Math.random() * 0.6), p: Math.random() * 100 }))
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
    ctx.drawImage(world.base, 0, 0)

    // Water glints: a few pixels light up and fade.
    ctx.fillStyle = 'rgba(200,225,230,0.55)'
    for (let i = 0; i < world.water.length; i += 2) {
      const x = world.water[i]
      const y = world.water[i + 1]
      const g = hash(x, y, 91)
      if (g > 0.985 && Math.sin(t * 2 + g * 600) > 0.6) ctx.fillRect(x, y, 2, 1)
    }

    // Chimney smoke: a few grey puffs drifting up and right.
    for (let i = 0; i < 6; i++) {
      const life = (t * 0.25 + i / 6) % 1
      const x = world.smoke.x + life * 10 + Math.sin(t + i) * 1.5
      const y = world.smoke.y - life * 26
      ctx.fillStyle = `rgba(200,200,195,${0.35 * (1 - life)})`
      const s = 1 + Math.round(life * 3)
      ctx.fillRect(Math.round(x), Math.round(y), s, s)
    }

    // Cloud shadows drift across on cloudy and rainy days.
    if (state.weather !== 'clear') {
      ctx.fillStyle = state.weather === 'rain' ? 'rgba(15,22,30,0.1)' : 'rgba(15,22,30,0.18)'
      for (let i = 0; i < 4; i++) {
        const cx = ((t * 4 + i * 157) % (w + 160)) - 80
        const cy = (i * 71) % h
        ctx.beginPath()
        ctx.ellipse(cx, cy, 70, 26, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Time of day: multiply the whole picture by a tint.
    ctx.globalCompositeOperation = 'multiply'
    const wet = state.weather === 'rain' ? 0.38 : state.weather === 'cloudy' ? 0.16 : 0
    const mix = (c: number) => 255 - (255 - c) * tint.a
    ctx.fillStyle = css([mix(tint.c[0]) * (1 - wet * 0.6), mix(tint.c[1]) * (1 - wet * 0.5), mix(tint.c[2]) * (1 - wet * 0.3)])
    ctx.fillRect(0, 0, w, h)

    // Morning haze: a pale wash over the top of the picture.
    if (state.time === 'morning') {
      ctx.globalCompositeOperation = 'screen'
      const haze = ctx.createLinearGradient(0, 0, 0, h)
      haze.addColorStop(0, 'rgba(255,226,196,0.28)')
      haze.addColorStop(0.6, 'rgba(255,226,196,0.06)')
      haze.addColorStop(1, 'rgba(255,226,196,0)')
      ctx.fillStyle = haze
      ctx.fillRect(0, 0, w, h)
    }

    // Lights: windows and lanterns glow as it gets dark.
    if (tint.glow > 0.02) {
      ctx.globalCompositeOperation = 'lighter'
      for (const l of world.lights) {
        const flicker = 0.92 + Math.sin(t * 7 + l.x) * 0.04 + Math.sin(t * 13 + l.y) * 0.04
        const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r)
        const c = l.kind === 'lamp' ? P.lamp : P.window
        g.addColorStop(0, css(c, 0.55 * tint.glow * flicker))
        g.addColorStop(0.35, css(c, 0.18 * tint.glow * flicker))
        g.addColorStop(1, css(c, 0))
        ctx.fillStyle = g
        ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2)
        ctx.fillStyle = css([255, 236, 190], 0.9 * tint.glow)
        ctx.fillRect(l.x - (l.kind === 'lamp' ? 1 : 1), l.y - 1, 2, 2)
      }
      // Fireflies on clear nights and evenings.
      if (state.weather !== 'rain') {
        for (const f of flies) {
          f.p += dt
          const x = Math.round(f.x + Math.sin(f.p * 0.7) * 14)
          const y = Math.round(f.y + Math.sin(f.p * 1.1 + 1) * 6)
          const on = Math.max(0, Math.sin(f.p * 2.3)) * tint.glow
          if (on < 0.05) continue
          ctx.fillStyle = css([210, 255, 140], 0.9 * on)
          ctx.fillRect(x, y, 1, 1)
          ctx.fillStyle = css([210, 255, 140], 0.18 * on)
          ctx.fillRect(x - 1, y - 1, 3, 3)
        }
      }
    }

    // Rain: short diagonal streaks.
    ctx.globalCompositeOperation = 'source-over'
    if (state.weather === 'rain') {
      ctx.fillStyle = 'rgba(205,222,235,0.6)'
      for (const d of drops) {
        if (!opts.still) {
          d.y += d.v * dt * 60
          d.x -= d.v * dt * 18
          if (d.y > h) {
            d.y = -4
            d.x = Math.random() * (w + 40)
          }
        }
        ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 4)
        ctx.fillRect(Math.round(d.x) - 1, Math.round(d.y) + 4, 1, 1)
      }
      // splashes: little marks that blink where drops land
      ctx.fillStyle = 'rgba(205,222,235,0.5)'
      for (let i = 0; i < 40; i++) {
        const x = Math.floor(hash(i, Math.floor(t * 6), 97) * w)
        const y = Math.floor(hash(i, Math.floor(t * 6), 98) * h)
        ctx.fillRect(x - 1, y, 1, 1)
        ctx.fillRect(x + 1, y, 1, 1)
      }
    }
  }

  resize()
  raf = requestAnimationFrame(frame)
  let timer: ReturnType<typeof setTimeout>
  const onResize = () => {
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
