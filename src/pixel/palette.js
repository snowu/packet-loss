// Hand-picked district palettes for the pixel city. The player either picks
// one, or lets the run drift through them all; blends are quantized into steps
// so baked sprites can be refreshed.
import { hex, mix } from './pixels.js'

const NUMERIC = new Set(['sunX', 'sunY', 'sunSize', 'clouds', 'night', 'stars', 'rain'])

// Convert hex numbers to [r, g, b]; leave plain numbers, flags and names alone.
const P = (o) => {
  const out = {}
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'number' && !NUMERIC.has(k)) out[k] = hex(v)
    else if (Array.isArray(v)) out[k] = v.map(hex)
    else out[k] = v
  }
  return out
}

export const ACCENT = hex(0xff3b30)

const KEYS = [
  P({
    name: 'Neon Dusk',
    sky: [0x1a0b2e, 0x2e0f45, 0x52145c, 0x86205f, 0xc23a5c, 0xf06a4f, 0xffa24a],
    sun: 0xffd36b, sunX: 0.7, sunY: 0.46, sunSize: 26, moon: false,
    clouds: 0.5, cloudLight: 0xff6f91, cloudDark: 0x6a1f5c,
    far: 0x5a1f5f, mid: 0x3a1648, near: 0x240f33,
    farWin: 0xff8fb3, midWin: 0xffb36b,
    walls: [0x3b2a4f, 0x2f2342, 0x463257, 0x2a2a48, 0x533049],
    shadow: 0x0c0614, light: 0xff9ec4,
    roof: 0x4f3a66, glass: [0x7a4a9a, 0x241434], winDark: 0x1c1028,
    lit: [0xff4fa3, 0x3ff5ff, 0xffd36b, 0xfff1c9],
    neon: [0xff2fa0, 0x29f3ff, 0xffe14d, 0x9d4dff],
    haze: 0x5a2050, lava: 0xff3d2e, rim: 0xff9ec4, dust: 0xff9ec4,
    night: 0.7, stars: 0.2, rain: 0,
  }),
  P({
    name: 'Kowloon Night',
    sky: [0x04030c, 0x080718, 0x0f0c28, 0x181238, 0x261848, 0x3a1d5a, 0x5a2368],
    sun: 0xd9f6ff, sunX: 0.82, sunY: 0.18, sunSize: 12, moon: true,
    clouds: 0.35, cloudLight: 0x2c2357, cloudDark: 0x150f33,
    far: 0x1f1945, mid: 0x16123a, near: 0x0e0b26,
    farWin: 0x29f3ff, midWin: 0xff2fa0,
    walls: [0x2a2550, 0x221e45, 0x302a5c, 0x1f2a50, 0x352452],
    shadow: 0x05040e, light: 0x7f6bff,
    roof: 0x332e62, glass: [0x2a3d8a, 0x0e1236], winDark: 0x0c0c22,
    lit: [0xff2fa0, 0x29f3ff, 0xffe14d, 0xb5ff4d, 0xfff3c9],
    neon: [0xff2fa0, 0x29f3ff, 0xb5ff4d, 0xffe14d],
    haze: 0x1e1440, lava: 0xff2d55, rim: 0x29f3ff, dust: 0x7f6bff,
    night: 1, stars: 1, rain: 0.35,
  }),
  P({
    name: 'Acid Rain',
    sky: [0x07120f, 0x0b1c17, 0x10281f, 0x173528, 0x1f4430, 0x2a5636, 0x3a6b3a],
    sun: 0xd9ffd0, sunX: 0.3, sunY: 0.2, sunSize: 0, moon: false,
    clouds: 1, cloudLight: 0x2c4a33, cloudDark: 0x14241b,
    far: 0x1e3a2c, mid: 0x152b21, near: 0x0d1d17,
    farWin: 0xb5ff4d, midWin: 0x3ff5c8,
    walls: [0x2c3d38, 0x23332f, 0x34433d, 0x283a40, 0x3a3a34],
    shadow: 0x040a08, light: 0x9dffb0,
    roof: 0x3a5047, glass: [0x2f6b5a, 0x0e211b], winDark: 0x0b1612,
    lit: [0xb5ff4d, 0x3ff5c8, 0xffe14d, 0xff4fa3],
    neon: [0xb5ff4d, 0x3ff5c8, 0xff4fa3, 0xffe14d],
    haze: 0x18352a, lava: 0x9dff3a, rim: 0xb5ff4d, dust: 0x9dffb0,
    night: 0.85, stars: 0, rain: 1,
  }),
  P({
    name: 'Smog Noon',
    sky: [0x5a4a2a, 0x7a6334, 0x977a3c, 0xb08f45, 0xc8a04f, 0xd9b05e, 0xe6c272],
    sun: 0xfff2c0, sunX: 0.25, sunY: 0.2, sunSize: 18, moon: false,
    clouds: 0.8, cloudLight: 0xe6c98a, cloudDark: 0x9a7f4a,
    far: 0x8a7448, mid: 0x6a5838, near: 0x4a3d2a,
    farWin: 0xd9c08a, midWin: 0xffe0a0,
    walls: [0x5a5048, 0x4a4440, 0x645a4e, 0x3f4450, 0x6a4a40],
    shadow: 0x1a1410, light: 0xffe6b0,
    roof: 0x766a56, glass: [0x9aa69a, 0x3a3f3a], winDark: 0x2a2620,
    lit: [0xffe0a0, 0xff6a2e],
    neon: [0xff2fa0, 0x29f3ff, 0xffe14d, 0xff6a2e],
    haze: 0xb89a5a, lava: 0xff7a2e, rim: 0xffe6b0, dust: 0xe6d0a0,
    night: 0.15, stars: 0, rain: 0,
  }),
  P({
    name: 'Blackout',
    sky: [0x020205, 0x05050c, 0x090914, 0x0e0e1c, 0x141426, 0x1c1a30, 0x26203a],
    sun: 0xff5a4a, sunX: 0.3, sunY: 0.22, sunSize: 16, moon: true,
    clouds: 0.6, cloudLight: 0x231d33, cloudDark: 0x0f0c18,
    far: 0x15121f, mid: 0x0f0d18, near: 0x0a0810,
    farWin: 0xff3b30, midWin: 0xffd36b,
    walls: [0x23202e, 0x1b1922, 0x282533, 0x1e222e, 0x2e2026],
    shadow: 0x020103, light: 0x8a7aa8,
    roof: 0x2c2936, glass: [0x26304a, 0x0a0c16], winDark: 0x07070c,
    lit: [0xff3b30, 0xffd36b],
    neon: [0xff3b30, 0x29f3ff],
    haze: 0x140d1c, lava: 0xff3b30, rim: 0xff5a4a, dust: 0x8a7aa8,
    night: 0.5, stars: 0.5, rain: 0.6,
  }),
]

const CYCLE = 1500
const BLEND = 360
const STEPS = 12

function lerpValue(a, b, t) {
  if (typeof a === 'number') return a + (b - a) * t
  if (typeof a === 'boolean' || typeof a === 'string') return t < 0.5 ? a : b
  if (Array.isArray(a) && Array.isArray(a[0])) {
    const n = Math.max(a.length, b.length)
    return Array.from({ length: n }, (_, i) => mix(a[i % a.length], b[i % b.length], t))
  }
  return mix(a, b, t)
}

export const PALETTE_NAMES = KEYS.map((k) => k.name)

// The first district as paletteAt(0) gives it unpinned: the palette the
// sprite PNGs in public/art start out in (see artPng.js).
export const BASE_PALETTE = { version: 0, ...KEYS[0], accent: ACCENT }

// null drifts through every district; an index pins one for the whole run.
let pinned = null
export function pinPalette(i) { pinned = i === null ? null : i % KEYS.length }

const cache = new Map()

// Palette for a distance, quantized: `version` changes only when colors do.
export function paletteAt(distance) {
  if (pinned !== null) distance = pinned * CYCLE
  const d = Math.max(0, distance)
  const i = Math.floor(d / CYCLE) % KEYS.length
  const local = d % CYCLE
  const raw = Math.min(1, Math.max(0, (local - (CYCLE - BLEND)) / BLEND))
  const t = Math.round(raw * STEPS) / STEPS
  const version = i * (STEPS + 1) + Math.round(t * STEPS)
  let pal = cache.get(version)
  if (!pal) {
    const a = KEYS[i], b = KEYS[(i + 1) % KEYS.length]
    pal = { version }
    for (const k of Object.keys(a)) pal[k] = t === 0 ? a[k] : lerpValue(a[k], b[k], t)
    pal.accent = ACCENT
    cache.set(version, pal)
    if (cache.size > 40) cache.delete(cache.keys().next().value)
  }
  return pal
}

export function districtName(distance) {
  if (pinned !== null) return KEYS[pinned].name
  const d = Math.max(0, distance)
  return KEYS[Math.floor((d + BLEND / 2) / CYCLE) % KEYS.length].name
}
