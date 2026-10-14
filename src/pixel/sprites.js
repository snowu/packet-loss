// Procedural pixel-art sprites: rooftop obstacles and props, signage, sky
// traffic, clouds. Facades and skyline towers live in city.js. Everything is drawn into PixelBuffers with the current palette.
import { PixelBuffer, pack, mix, hash, dither } from './pixels.js'
import { ACCENT, BASE_PALETTE } from './palette.js'
import { defineArt, fromArt } from './artPng.js'

export const PPU = 14              // pixels per meter
export const FACADE_DEPTH = 26     // meters of facade below a roof line


function tones(base, pal) {
  return {
    base: pack(base),
    shade: pack(mix(base, pal.shadow, 0.32)),
    deep: pack(mix(base, pal.shadow, 0.62)),
    light: pack(mix(base, pal.light, 0.38)),
    raw: base,
  }
}

// ── tiny bitmap font (3x5) for signage ──────────────────────────────────

const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111', M: '101111111101101',
  N: '110101101101101', O: '010101101101010', P: '110101110100100', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101101111101', Q: '010101101111011',
  X: '101101010101101', Y: '101101010010010', Z: '111001010100111', ' ': '000000000000000', '%': '101001010100101', '+': '000010111010000', '!': '010010010000010', '-': '000000111000000', '/': '001001010100100', '.': '000000000000010',
  0: '111101101101111', 1: '010110010010111', 3: '110001010001110', 5: '111100110001110', 6: '011100111101111', 8: '111101111101111', 2: '110001010100111', 4: '101101111001001', 7: '111001010010010', 9: '111101111001110',
}

export function drawText(buf, text, x, y, c, scale = 1) {
  let cx = x
  for (const ch of text) {
    const g = GLYPHS[ch] || GLYPHS[' ']
    for (let i = 0; i < 15; i++) if (g[i] === '1') buf.rect(cx + (i % 3) * scale, y + Math.floor(i / 3) * scale, scale, scale, c)
    cx += 4 * scale
  }
}

export const BRANDS = ['NOVA', 'HELIX', 'PULSE', 'ORBIT', 'KITE', 'VOLT', 'ZEN 24', 'STRATA']

const INK = pack([10, 8, 16])

// A hard dark outline around a sprite (grows it by 1px on every side).
export function outlined(src, color = INK) {
  const b = new PixelBuffer(src.w + 2, src.h + 2)
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      if (!(src.data[y * src.w + x] >>> 24)) continue
      for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) b.set(x + dx, y + dy, color)
    }
  }
  b.blit(src, 1, 1)
  return b
}

export function bakeCar(dir, pal, seed) {
  return fromArt(dir > 0 ? 'car_right' : 'car_left', drawCar(dir, pal, seed))
}

function drawCar(dir, pal, seed) {
  const b = new PixelBuffer(9, 4)
  const body = pack(mix([40, 40, 56], pal.shadow, 0.3))
  const under = pack(pal.neon[Math.floor(hash(seed, 2) * pal.neon.length)])
  b.rect(1, 1, 7, 2, body)
  b.rect(3, 0, 3, 1, body)
  b.rect(2, 3, 5, 1, under)
  b.set(dir > 0 ? 8 : 0, 1, pack([255, 250, 220]))
  b.set(dir > 0 ? 0 : 8, 1, pack([255, 40, 40]))
  return b
}
defineArt('car_right', 'sky', () => drawCar(1, BASE_PALETTE, 3))
defineArt('car_left', 'sky', () => drawCar(-1, BASE_PALETTE, 4))

// Push decor colors toward the backdrop so foreground obstacles read first.
export function recede(b, color, t) {
  for (let i = 0; i < b.data.length; i++) {
    const v = b.data[i]
    if (!(v >>> 24)) continue
    const r = v & 255, g = (v >> 8) & 255, bl = (v >> 16) & 255
    b.data[i] = pack([r + (color[0] - r) * t, g + (color[1] - g) * t, bl + (color[2] - bl) * t])
  }
  return b
}

// ── decor standing on roofs ─────────────────────────────────────────────

// classic: the sign as it was before the clarity pass (panel at torso height)
// Decor drawn from PNGs (fixed size whatever the variant). The antenna's
// height varies, so it stays code-only.
const DECOR_ART = ['tank', 'ac', 'dish', 'skylight', 'vents', 'solar']
export const signArtId = (brand) => 'sign_' + brand.toLowerCase().replace(/\W+/g, '')
for (const type of DECOR_ART) defineArt(type, 'decor', () => drawDecor(type, 0.5, BASE_PALETTE))
BRANDS.forEach((brand, i) => defineArt(signArtId(brand), 'decor', () => drawDecor('sign', (i + 0.5) / BRANDS.length, BASE_PALETTE)))

export function bakeDecor(type, variant, pal, opts = {}) {
  const b = drawDecor(type, variant, pal, opts)
  if (DECOR_ART.includes(type)) return fromArt(type, b)
  if (type === 'sign' && !opts.classic) return fromArt(signArtId(BRANDS[Math.floor(variant * BRANDS.length)]), b)
  return b
}

function drawDecor(type, variant, pal, { classic = false } = {}) {
  const metal = tones(mix(pal.roof, [120, 130, 145], 0.45), pal)
  const dark = pack(mix(pal.shadow, [25, 25, 35], 0.3))
  if (type === 'tank') {
    const b = new PixelBuffer(30, 52)
    const wood = tones(mix(pal.walls[1], [150, 110, 80], 0.55), pal)
    for (const x of [4, 13, 22]) b.rect(x, 28, 2, 24, dark)
    b.line(4, 50, 22, 32, dark); b.line(4, 32, 22, 50, dark)
    b.rect(2, 10, 26, 20, wood.base)
    for (let x = 4; x < 28; x += 4) b.rect(x, 10, 1, 20, wood.shade)
    b.rect(2, 14, 26, 1, dark); b.rect(2, 24, 26, 1, dark)
    b.rect(25, 10, 3, 20, wood.deep)
    for (let y = 0; y < 10; y++) b.rect(15 - y * 1.4, y, y * 2.8, 1, dark)
    return b
  }
  if (type === 'antenna') {
    const h = 34 + Math.floor(variant * 26)
    const b = new PixelBuffer(13, h)
    b.rect(6, 2, 1, h - 2, dark)
    b.rect(2, Math.floor(h * 0.35), 9, 1, dark)
    b.rect(3, Math.floor(h * 0.55), 7, 1, dark)
    b.line(6, h - 1, 1, h - 1, dark); b.line(6, h - 8, 1, h - 1, dark); b.line(6, h - 8, 11, h - 1, dark)
    return b
  }
  if (type === 'ac') {
    const b = new PixelBuffer(24, 15)
    b.rect(0, 2, 24, 13, metal.base)
    b.rect(0, 2, 24, 1, metal.light)
    b.rect(0, 0, 24, 2, metal.light)
    b.disc(15, 8.5, 4.5, metal.deep)
    b.disc(15, 8.5, 3, metal.shade)
    b.rect(14, 5, 2, 7, metal.deep); b.rect(11, 8, 8, 1, metal.deep)
    for (let y = 5; y < 13; y += 2) b.rect(2, y, 6, 1, metal.shade)
    b.rect(22, 2, 2, 13, metal.deep)
    return b
  }
  if (type === 'dish') {
    const b = new PixelBuffer(16, 18)
    b.rect(7, 10, 2, 8, dark)
    for (let i = 0; i < 9; i++) b.rect(2 + i * 0.4, 1 + i, 12 - i * 1.1, 1, i < 2 ? metal.light : metal.base)
    b.line(8, 5, 13, 1, dark)
    return b
  }
  if (type === 'skylight') {
    const b = new PixelBuffer(30, 10)
    const glassL = pack(pal.glass[0]), glassD = pack(pal.glass[1])
    b.rect(0, 6, 30, 4, metal.base)
    for (let y = 0; y < 6; y++) b.rect(3 + y, y, 24 - y * 2, 1, y < 2 ? glassL : glassD)
    return b
  }
  if (type === 'vents') {
    const b = new PixelBuffer(20, 14)
    for (const [x, h] of [[1, 12], [8, 9], [14, 13]]) {
      b.rect(x, 14 - h, 4, h, metal.base)
      b.rect(x - 1, 14 - h, 6, 2, metal.light)
      b.rect(x + 3, 14 - h + 2, 1, h - 2, metal.deep)
    }
    return b
  }
  if (type === 'solar') {
    const b = new PixelBuffer(40, 12)
    const panel = pack(mix([30, 45, 90], pal.glass[1], 0.3))
    const shine = pack(mix([90, 130, 200], pal.glass[0], 0.5))
    for (let i = 0; i < 3; i++) {
      for (let y = 0; y < 7; y++) b.rect(i * 13 + y * 0.6, 1 + y, 11, 1, y === 0 ? shine : panel)
      b.rect(i * 13 + 6, 8, 1, 4, dark)
    }
    return b
  }
  if (type === 'sign') {
    const brand = BRANDS[Math.floor(variant * BRANDS.length)]
    const w = brand.length * 8 + 12
    // The panel stands on tall posts so its bottom clears the runner's head
    // (25 px): lettering never sits behind her torso. Action red is kept for
    // things she can use, so no red boards.
    const H = classic ? 34 : 48
    const b = new PixelBuffer(w, H)
    const bgs = classic ? [[20, 18, 30], ACCENT, [240, 236, 228], [30, 90, 140]] : [[20, 18, 30], [70, 34, 58], [200, 196, 188], [30, 90, 140]]
    const bg = bgs[Math.floor(variant * 97) % bgs.length]
    const fg = bg === bgs[2] ? [20, 18, 30] : classic ? [255, 248, 240] : [222, 216, 210]
    b.rect(4, 18, 2, H - 18, dark); b.rect(w - 6, 18, 2, H - 18, dark)
    if (!classic) { b.rect(3, 26, w - 6, 1, dark) }
    b.rect(0, 0, w, 20, dark)
    b.rect(1, 1, w - 2, 18, pack(bg))
    drawText(b, brand, 6, 5, pack(fg), 2)
    return b
  }
  return new PixelBuffer(1, 1)
}

export function bakeBird(frame) {
  return fromArt(`bird_${frame}`, drawBird(frame))
}

function drawBird(frame) {
  const b = new PixelBuffer(5, 3)
  const c = pack([25, 20, 30])
  if (frame === 0) { b.rect(1, 1, 3, 1, c); b.set(4, 0, c) }
  else if (frame === 1) { b.set(0, 0, c); b.set(1, 1, c); b.set(2, 1, c); b.set(3, 0, c); b.set(4, 0, c) }
  else { b.set(0, 2, c); b.set(1, 1, c); b.set(2, 1, c); b.set(3, 2, c) }
  return b
}
for (const f of [0, 1, 2]) defineArt(`bird_${f}`, 'sky', () => drawBird(f))

export function bakeCloud(w, h, pal, seed) {
  const b = new PixelBuffer(w, h)
  const light = pack(pal.cloudLight), dark = pack(pal.cloudDark)
  const blobs = []
  const n = 3 + Math.floor(hash(seed, 1) * 4)
  for (let i = 0; i < n; i++) {
    const r = h * (0.3 + hash(seed, i, 2) * 0.25)
    blobs.push([w * (0.15 + 0.7 * (i + 0.5) / n) + (hash(seed, i, 3) - 0.5) * 6, h - r - 1, r])
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let inside = false
      for (const [cx, cy, r] of blobs) if ((x - cx) ** 2 + (y - cy) ** 2 * 1.6 < r * r) { inside = true; break }
      if (!inside) continue
      b.set(x, y, dither(x, y, (y / h - 0.35) * 1.8) ? dark : light)
    }
  }
  return b
}
