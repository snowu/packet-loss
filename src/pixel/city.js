// City bakers: skyline towers with varied silhouettes and lights grouped into
// rooms and floors, and dense course facades (piers, balconies, pipes) whose
// lower floors fade into the dark below the roofline.
import { PixelBuffer, pack, mix, hash, dither } from './pixels.js'
import { ACCENT } from './palette.js'
import { PPU, FACADE_DEPTH } from './sprites.js'

const CLEAR = 0

// Art direction knobs. Rain thickens the fog on top of FOG (see the view).
export const CITY = {
  fog: 0.5,          // fog settling at the foot of each skyline layer
  rainFog: 0.45,     // extra fog at full rain
  skyWin: 0.4,       // how many skyline floors have lights on
  skyUnlit: 0.5,     // how visible dark skyline windows are
  silhouette: 0.2,   // how far skyline towers sink toward shadow
  rim: 0.4,          // rim light on the sun side of towers
  fade: 0.65,        // how far lower facade floors sink into the dark
  litRate: 0.55,     // how many facade floors have lights on
  holos: 0.2,        // share of skyline towers carrying a billboard
  cars: 10,          // sky traffic
}
const RED = pack(ACCENT)
const RED_DARK = pack(mix(ACCENT, [60, 10, 20], 0.45))
const WHITE = pack([245, 240, 235])
const unpack = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255]
const pickOf = (arr, h) => arr[Math.floor(h * arr.length) % arr.length]

// Lights come on in runs along a floor (rooms), and whole floors stay dark,
// so a tower reads as a lived-in block rather than confetti.
function litRuns(cols, floor, seed, rate) {
  const out = new Uint8Array(cols)
  if (hash(floor, seed, 31) > rate * 1.6) return out
  let on = hash(floor, seed, 32) < 0.5
  for (let c = 0; c < cols; c++) {
    if (hash(c, floor, seed + 33) < 0.22) on = !on
    out[c] = on && hash(c, floor, seed + 34) < 0.92 ? 1 : 0
  }
  return out
}

// ── skyline towers ──────────────────────────────────────────────────────

export function bakeTower(w, h, li, color, winColor, pal, seed) {
  const L = CITY
  const extra = 200
  const H = h + extra
  const b = new PixelBuffer(w, H)
  const depth = li / 2                                   // 0 far … 1 near
  const body = mix(color, pal.shadow, L.silhouette * (0.25 + 0.5 * depth))
  const c = pack(body)
  const sunLeft = pal.sunX < 0.5

  // silhouette: setbacks, crowns, slants and masts
  const kind = Math.floor(hash(seed, 1) * 6)
  b.rect(0, 0, w, H, c)
  if (kind === 0 && w > 20) {                            // two or three setbacks
    const tiers = 2 + Math.floor(hash(seed, 2) * 2)
    const th = 5 + Math.floor(hash(seed, 3) * 8), step = Math.floor(w * 0.13)
    for (let i = 0; i < tiers; i++) {
      const inset = (tiers - i) * step
      b.rect(0, i * th, inset, th, CLEAR)
      b.rect(w - inset, i * th, inset, th, CLEAR)
    }
  } else if (kind === 1) {                               // slanted roof
    const s = 4 + Math.floor(hash(seed, 2) * 10)
    for (let x = 0; x < w; x++) b.rect(x, 0, 1, Math.round(s * (hash(seed, 4) < 0.5 ? x / w : 1 - x / w)), CLEAR)
  } else if (kind === 2) {                               // spire on a crown
    b.rect(0, 0, w, 12, CLEAR)
    b.rect(Math.floor(w * 0.25), 6, Math.ceil(w * 0.5), 6, c)
    b.rect((w >> 1) - 1, 0, 2, 6, c)
  } else if (kind === 3) {                               // rooftop clutter: tank and box
    b.rect(0, 0, w, 8, CLEAR)
    const tx = Math.floor(hash(seed, 5) * (w - 8))
    b.rect(tx, 1, 6, 5, c); b.rect(tx + 1, 6, 1, 2, c); b.rect(tx + 4, 6, 1, 2, c)
    b.rect(Math.floor(w * 0.6), 4, Math.max(4, Math.floor(w * 0.25)), 4, c)
  }
  if (hash(seed, 6) < 0.35) {                            // a mast with a beacon
    const mx = 2 + Math.floor(hash(seed, 7) * (w - 4))
    let top = 0
    while (top < H && !(b.get(mx, top) >>> 24)) top++
    const mh = 6 + Math.floor(hash(seed, 8) * 10)
    for (let y = Math.max(0, top - mh); y < top; y++) b.set(mx, y, c)
  }
  const solid = (x, y) => (b.get(x, y) >>> 24) !== 0

  // windows
  const pitchX = li === 0 ? 3 : 4, pitchY = li === 0 ? 4 : 5
  const size = li === 0 ? 1 : 2
  const cols = Math.floor((w - 3) / pitchX)
  const tint = pickOf(pal.lit, hash(seed, 11))
  const alt = pickOf(pal.lit, hash(seed, 12))
  const fade = L.fog * (1 - depth) * 0.55
  const litC = pack(mix(tint, body, fade))
  const altC = pack(mix(alt, body, fade))
  const dimC = pack(mix(body, winColor, L.skyUnlit * (0.25 + 0.35 * depth)))
  const rate = Math.min(1, L.skyWin * (0.4 + pal.night) * (0.6 + hash(seed, 13) * 0.8))
  for (let fy = 0, f = 0; fy < H; fy += pitchY, f++) {
    const y = 6 + fy
    const runs = litRuns(cols, f, seed, rate)
    for (let ci = 0; ci < cols; ci++) {
      const x = 2 + ci * pitchX
      if (!solid(x, y - 2) || !solid(x + size, y + size)) continue
      if (runs[ci]) b.rect(x, y, size, size, hash(ci, f, seed + 14) < 0.12 ? altC : litC)
      else if (L.skyUnlit) b.rect(x, y, size, size, dimC)
    }
  }

  // rim light on the sun side and along the roofline
  if (L.rim > 0) {
    const rim = pack(mix(body, pal.rim, 0.22 + 0.3 * L.rim * depth))
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < w; x++) {
        if (!solid(x, y)) continue
        const edge = sunLeft ? !solid(x - 1, y) : !solid(x + 1, y)
        if (edge || !solid(x, y - 1)) b.set(x, y, rim)
      }
    }
  } else {
    const edge = pack(mix(body, pal.light, 0.1))
    for (let x = 0; x < w; x++) for (let y = 0; y < 30; y++) if (solid(x, y)) { b.set(x, y, edge); break }
  }

  // a neon strip down some towers
  if (li > 0 && hash(seed, 15) < 0.12 + 0.25 * L.silhouette) {
    const n = pack(pickOf(pal.neon, hash(seed, 16)))
    const sx = hash(seed, 17) < 0.5 ? 1 : w - 2
    let top = 0
    while (top < 40 && !solid(sx, top)) top++
    b.rect(sx, top + 3, 1, Math.floor(h * (0.3 + hash(seed, 18) * 0.4)), n)
  }
  return b
}

// Dithered fog that settles at the foot of each skyline layer.
export function bakeFog(W, h, ramp, pal, amount) {
  const b = new PixelBuffer(W, h)
  const c = pack(mix(pal.haze, pal.sky[pal.sky.length - 1], 0.4))
  for (let y = 0; y < h; y++) {
    const t = Math.min(1, y / ramp) * amount
    for (let x = 0; x < W; x++) if (dither(x, y, t)) b.data[y * W + x] = c
  }
  return b
}

// ── course facades ──────────────────────────────────────────────────────

export function bakeFacade({ w, roofH, style, seed, pal, wall, accentCap, mural }) {
  const L = CITY
  const H = roofH + FACADE_DEPTH * PPU
  const b = new PixelBuffer(w, H)
  const lit = new Uint8Array(w * H)
  const raw = pal.walls[wall % pal.walls.length]
  const t = {
    base: pack(raw), shade: pack(mix(raw, pal.shadow, 0.3)), deep: pack(mix(raw, pal.shadow, 0.6)),
    light: pack(mix(raw, pal.light, 0.25)), raw,
  }
  const roofRaw = pal.roof
  const roof = { base: pack(roofRaw), shade: pack(mix(roofRaw, pal.shadow, 0.32)), light: pack(mix(roofRaw, pal.light, 0.38)) }
  const sunLeft = pal.sunX < 0.5
  const night = pal.night
  const r = (k) => hash(seed, k, 101)

  // rooftop strip with a back parapet
  b.rect(0, 0, w, roofH, roof.base)
  b.rect(0, 0, w, 2, t.shade)
  b.rect(0, 2, w, 1, roof.shade)
  // Large quiet slabs, inset seams and chipped coping. Baked once with the
  // facade; the walkable front edge remains an uninterrupted bright line.
  const seam = pack(mix(roofRaw, pal.shadow, 0.25))
  const lip = pack(mix(roofRaw, pal.light, 0.22))
  for (let x = 16 + Math.floor(r(80) * 20); x < w - 2; x += 37) {
    b.rect(x, 3, 1, Math.max(0, roofH - 5), seam)
    b.rect(x + 1, 4, 1, Math.max(0, roofH - 7), lip)
    if (hash(seed, x, 81) < 0.45) {
      b.rect(x - 3, 3, 4, 1, seam)
      b.rect(x - 2, 4, 1, 1, lip)
    }
  }
  for (let x = 6; x < w - 4; x += 23) {
    b.rect(x, 0, 1, 2, roof.shade)
    if (hash(seed, x, 82) < 0.4) b.rect(x + 2, 1, 3, 1, lip)
  }
  b.rect(0, roofH - 1, w, 1, roof.light)

  // cornice
  const top = roofH
  b.rect(0, top, w, 2, accentCap ? pack(mix(raw, pal.lit[0], 0.55)) : t.light)
  b.rect(0, top + 2, w, 2, t.base)
  b.rect(0, top + 4, w, 2, t.deep)
  const bodyTop = top + 6
  b.rect(0, bodyTop, w, H - bodyTop, t.base)

  // per-building rhythm so neighbours never share a module
  const floorH = [40, 44, 48, 54][Math.floor(r(1) * 4)]
  const ww = style === 1 ? 0 : [10, 12, 14, 16][Math.floor(r(2) * 4)]
  const wh = style === 3 ? 6 : Math.min(Math.round(floorH * 0.42), [12, 16, 20, 24][Math.floor(r(3) * 4)])
  const gap = [7, 8, 10, 12][Math.floor(r(4) * 4)]
  const bay = 2 + Math.floor(r(5) * 3)                  // windows between piers
  const pier = 6
  const tint = pickOf(pal.lit, r(6)), alt = pickOf(pal.lit, r(7))
  const dim = 0.45
  const litC = pack(mix(tint, pal.winDark, dim)), altC = pack(mix(alt, pal.winDark, dim))
  const lampC = pack(mix(tint, [255, 255, 255], 0.35))
  const roomC = pack(mix(tint, pal.glass[1], 0.6))
  const glassL = pack(pal.glass[0]), glassD = pack(pal.glass[1]), winDark = pack(pal.winDark)
  const rate = L.litRate * (0.2 + night) * (0.6 + r(8) * 0.8)

  // Material joins stay subdued; larger structural bays carry the detail.
  const mortar = pack(mix(raw, pal.shadow, 0.13))
  for (let y = bodyTop; y < H; y++) {
    const ry = y - bodyTop
    if (style === 0 && ry % 6 === 5) {
      b.rect(0, y, w, 1, mortar)
      const offset = Math.floor(ry / 6) % 2 ? 8 : 0
      for (let x = offset; x < w; x += 16) b.rect(x, y - 5, 1, 5, mortar)
    }
    if (style === 3) for (let x = 0; x < w; x += 5) b.set(x, y, mortar)
    if (style === 2 && ry % floorH === floorH - 1) b.rect(0, y, w, 1, t.shade)
  }

  // reflections run across the whole facade in one diagonal band, not per window
  const reflect = (x, y) => ((x + y * 0.6 + seed) % 90) < 6

  const margin = 6
  const unit = ww + gap
  const bayW = bay * unit - gap + pier
  const bays = Math.max(1, Math.floor((w - margin * 2 + pier) / bayW))
  const x0 = Math.floor((w - (bays * bayW - pier)) / 2)
  for (let f = 0; ; f++) {
    const fy = bodyTop + 8 + f * floorH
    if (fy > H) break
    if (style === 1) {
      // curtain wall: continuous glass bands with mullions
      const gh = floorH - 12
      b.rect(0, fy + gh, w, 2, t.light)
      const runs = litRuns(Math.ceil(w / 12), f, seed, rate)
      for (let y = fy; y < fy + gh && y < H; y++) {
        for (let x = margin; x < w - margin; x++) {
          const cell = Math.floor(x / 12)
          let c = (y - fy) < 3 || reflect(x, y) ? glassL : glassD
          if (runs[cell]) { c = (y - fy) < 3 ? litC : (y - fy) > gh - 5 ? roomC : c === glassL ? litC : roomC; lit[y * w + x] = 1 }
          if (x % 12 === 0) c = t.deep
          b.set(x, y, c)
        }
      }
      continue
    }
    const wy = fy + Math.floor((floorH - wh) / 2) - 4
    const cols = bays * bay
    const runs = litRuns(cols, f, seed, rate)
    const balcony = hash(f, seed, 41) < 0.35
    for (let k = 0; k < cols; k++) {
      const wx = x0 + Math.floor(k / bay) * bayW + (k % bay) * unit
      if (wx + ww > w - 2) continue
      b.rect(wx - 1, wy + wh, ww + 2, 1, t.light)    // sill
      b.rect(wx, wy, ww, wh, t.deep)
      const on = runs[k]
      const blind = on && hash(k, f, seed + 42) < 0.3
      const pane = on && hash(k, f, seed + 43) < 0.15 ? altC : litC
      for (let y = 1; y < wh; y++) {
        for (let x = 1; x < ww; x++) {
          const px = wx + x, py = wy + y
          let c
          if (on) {
            c = y > wh * 0.65 ? roomC : pane
            if (y === 2 && x > 2 && x < ww - 2) c = lampC
            if (blind && y < wh * 0.4) c = t.deep
            lit[py * w + px] = 1
          } else {
            c = y < 3 || reflect(px, py) ? glassL : y < wh * 0.6 ? glassD : winDark
          }
          b.set(px, py, c)
        }
      }
      // Recessed lintel and jambs, then a projecting sill with a cast shadow.
      b.rect(wx - 1, wy - 1, ww + 2, 1, t.shade)
      b.rect(wx, wy, ww, 1, t.deep)
      b.rect(wx - 1, wy, 1, wh, sunLeft ? t.light : t.shade)
      b.rect(wx + ww, wy, 1, wh, sunLeft ? t.shade : t.light)
      if (ww >= 12) b.rect(wx + Math.floor(ww / 2), wy + 1, 1, wh - 1, t.deep)
      b.rect(wx - 2, wy + wh, ww + 4, 1, t.light)
      b.rect(wx - 1, wy + wh + 1, ww + 2, 1, t.shade)
      b.rect(wx, wy + wh + 2, ww + 1, 1, t.deep)
      if (balcony) {
        b.rect(wx - 2, wy + wh - 6, ww + 4, 1, t.light)
        for (let x = wx - 2; x < wx + ww + 2; x += 4) b.rect(x, wy + wh - 5, 1, 5, t.deep)
        b.rect(wx - 2, wy + wh, ww + 4, 2, t.deep)
      }
    }
    // piers between bays
    for (let i = 1; i < bays; i++) {
      const px = x0 + i * bayW - pier
      b.rect(px + 1, fy - 8, pier - 2, floorH, t.shade)
      b.rect(sunLeft ? px + 1 : px + pier - 2, fy - 8, 1, floorH, t.light)
    }
    if (style === 2) {
      b.rect(0, fy + floorH - 10, w, 1, t.shade)
      b.rect(0, fy + floorH - 9, w, 1, pack(mix(raw, pal.light, 0.1)))
    }
  }

  // clutter: drain pipes and hanging AC units
  const metal = pack(mix(pal.shadow, [40, 40, 50], 0.4))
  const pipes = w > 160 ? 2 : 1
  for (let i = 0; i < pipes; i++) {
    const px = i === 0 ? 3 : w - 6
    b.rect(px, bodyTop, 2, H - bodyTop, metal)
    b.rect(px, bodyTop, 1, H - bodyTop, t.shade)
    for (let y = bodyTop + 10; y < H; y += 26) b.rect(px - 1, y, 4, 1, metal)
  }
  for (let f = 0; f < 4; f++) {
    if (r(20 + f) > 0.55) continue
    const ax = x0 + Math.floor(r(24 + f) * bays) * bayW, ay = bodyTop + 8 + f * floorH + floorH - 10
    b.rect(ax + 1, ay + 2, 17, 10, t.deep)
    b.rect(ax, ay, 17, 9, pack(mix([133, 141, 151], raw, 0.5)))
    b.rect(ax, ay, 17, 1, t.light)
    for (let y = ay + 2; y < ay + 8; y += 2) b.rect(ax + 2, y, 6, 1, t.deep)
    b.disc(ax + 12, ay + 5, 3, metal)
    b.line(ax + 10, ay + 3, ax + 14, ay + 7, t.shade)
    b.line(ax + 14, ay + 3, ax + 10, ay + 7, t.shade)
    b.set(ax + 11, ay + 3, t.light)
    b.rect(ax + 2, ay + 9, 2, 2, metal)
    b.rect(ax + 13, ay + 9, 2, 2, metal)
  }

  // mural: the red chevron band used by wall-run walls
  if (mural) {
    const [m0, m1] = mural
    b.rect(0, m0, w, m1 - m0, WHITE)
    for (let y = m0 + 2; y < m1 - 2; y++) {
      const off = Math.abs(y - (m0 + m1) / 2)
      for (let x = 0; x < w; x++) if ((x + off) % 22 < 9) b.set(x, y, RED)
    }
    b.rect(0, m0, w, 2, RED_DARK)
    b.rect(0, m1 - 2, w, 2, RED_DARK)
    for (let y = m0; y < m1; y++) lit.fill(1, y * w, y * w + w)
  }

  // light falls across the corners
  b.rect(sunLeft ? w - 2 : 0, top, 2, H - top, t.deep)
  b.rect(sunLeft ? 0 : w - 1, top, 1, H - top, L.rim ? pack(mix(raw, pal.rim, 0.45)) : t.light)

  // lower floors sink into the dark so the roofline lane reads first
  if (L.fade > 0) {
    const sink = mix(pal.shadow, pal.haze, 0.25)
    const start = bodyTop + 16, span = 110
    // a facade only uses a few dozen colours, so each darkened colour is
    // worked out once instead of once per pixel
    const sunk = new Map()
    for (let y = start; y < H; y++) {
      const step = Math.round(Math.min(1, (y - start) / span) * L.fade * 6)
      if (!step) continue
      let lastKey = -1, out = 0
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        const key = b.data[i] * 16 + step * 2 + lit[i]
        if (key !== lastKey) {
          lastKey = key
          out = sunk.get(key)
          if (out === undefined) sunk.set(key, out = pack(mix(unpack(b.data[i]), sink, (step / 6) * (lit[i] ? 0.6 : 0.9))))
        }
        b.data[i] = out
      }
    }
  }
  return b
}

// Haze over the lava streets, with the glow rising out of it.
export function bakeMist(W, pal) {
  const h = 20 * PPU
  const b = new PixelBuffer(W, h)
  const haze = pack(pal.haze), lava = pack(pal.lava), lavaD = pack(mix(pal.lava, pal.haze, 0.5))
  for (let y = 0; y < h; y++) {
    const t = y / h
    for (let x = 0; x < W; x++) {
      let c = 0
      if (dither(x, y, t * 2.2)) c = haze
      if (t > 0.55 && dither(x, y, (t - 0.55) * 2.6)) c = lavaD
      if (t > 0.75 && dither(x, y, (t - 0.75) * 4)) c = lava
      b.data[y * W + x] = c
    }
  }
  return b
}
