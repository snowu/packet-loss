// Heist security, drawn in one corporate livery so it reads apart from the
// city. The colours carry the rules: magenta is armed security (stay out of
// it), amber is an alarm you already set off, cyan is data you want. Action
// red stays reserved for things the runner uses. The game and the art lab
// both draw through these functions.
import { PixelBuffer, toCanvas, pack, mix, css, dither, hash } from './pixels.js'
import { outlined } from './sprites.js'
import { defineArt, fromArt } from './artPng.js'

export const SECURITY = [255, 47, 160]
export const ALARM = [255, 170, 40]
export const SHARD = [41, 243, 255]
const HULL = [30, 28, 44]
const INK = [8, 6, 14]

// ── drone ────────────────────────────────────────────────────────────────

// A quad-rotor security drone seen side-on, facing the runner (left). 25×12
// with its outline; the body's underside lines up with the hitbox bottom.
export const DRONE_W = 25
export const DRONE_BOTTOM = 9   // rows from the sprite top to the hitbox bottom

export function bakeDrone(frame, alarm) {
  return fromArt(`drone${alarm ? '_alarm' : ''}_${frame & 1}`, droneArt(frame, alarm))
}

function droneArt(frame, alarm) {
  const eye = alarm ? ALARM : SECURITY
  const b = new PixelBuffer(23, 10)
  const hl = pack(mix(HULL, [170, 168, 200], 0.45)), base = pack(mix(HULL, [120, 118, 150], 0.22))
  const dark = pack(HULL), ink = pack(INK)
  const blade = pack([214, 220, 236], 150), bladeHi = pack([240, 244, 255], 220)
  // rotors: a long blur on one frame, a crossing blade on the other
  for (const cx of [4, 18]) {
    if (frame & 1) { b.rect(cx - 2, 0, 5, 1, bladeHi); b.set(cx - 4, 0, blade); b.set(cx + 4, 0, blade) }
    else b.rect(cx - 4, 0, 9, 1, blade)
    b.set(cx, 1, dark)
  }
  b.rect(2, 2, 19, 1, dark)                       // arms
  b.set(2, 2, base); b.set(20, 2, base)
  // hull: rounded box with a top light, the security stripe and a dark belly
  b.rect(6, 2, 11, 6, base)
  b.rect(7, 2, 9, 1, hl)
  b.set(6, 2, dark); b.set(16, 2, dark)
  b.rect(6, 5, 11, 1, pack(mix(SECURITY, HULL, 0.25)))
  b.rect(6, 6, 11, 2, dark)
  b.set(6, 7, 0); b.set(16, 7, 0)
  for (const x of [12, 14]) b.set(x, 3, dark)
  // the eye, looking ahead
  b.rect(5, 3, 3, 3, ink)
  b.rect(6, 3, 2, 2, pack(eye))
  b.set(6, 3, pack([255, 245, 250]))
  // antenna with a blinking tip
  b.set(14, 1, dark)
  if (frame & 1) b.set(14, 0, pack(eye))
  // scanner under the belly
  b.rect(10, 8, 3, 1, dark)
  b.set(11, 9, pack(eye))
  return outlined(b, ink)
}
for (const alarm of [false, true]) for (const f of [0, 1]) defineArt(`drone${alarm ? '_alarm' : ''}_${f}`, 'security', () => droneArt(f, alarm))

const droneCache = new Map()
function droneCanvas(frame, alarm) {
  const key = `${frame & 1}${alarm ? 1 : 0}`
  if (!droneCache.has(key)) droneCache.set(key, toCanvas(bakeDrone(frame, alarm)))
  return droneCache.get(key)
}

// A drone hovering with its scan cone sweeping the roof below. `bottom` is
// the screen row of the hitbox bottom, `floor` the roof row under it.
// alarm: it spotted you. cleared: you went over it, so it has lost you.
export function drawDrone(ctx, x, bottom, floor, t, { seed = 0, alarm = false, cleared = false } = {}) {
  const bob = Math.round(Math.sin(t * 2.3 + seed) * 1.5)
  const top = bottom - DRONE_BOTTOM + bob
  const color = alarm ? ALARM : SECURITY
  // scan cone from the belly lens to the roof
  const y0 = top + 11, span = Math.max(1, floor - y0)
  const sweep = Math.sin(t * 1.4 + seed) * 6
  const flash = alarm ? (Math.floor(t * 8) & 1 ? 1 : 0.55) : 1
  const density = (cleared ? 0.08 : alarm ? 0.3 : 0.2) * flash
  ctx.fillStyle = css(color)
  for (let y = y0; y < floor; y++) {
    const u = (y - y0) / span
    const cx = x + sweep * u, half = 1 + u * 10
    for (let xx = Math.round(cx - half); xx <= Math.round(cx + half); xx++) {
      const edge = !cleared && Math.abs(xx - cx) > half - 1.2
      if (dither(xx, y + Math.floor(t * 14), density + (edge ? 0.25 * flash : 0))) ctx.fillRect(xx, y, 1, 1)
    }
  }
  // where the scan lands: the stretch of roof to stay out of
  if (!cleared) {
    const cx = x + sweep, half = 11
    ctx.fillStyle = css(color, 0.35 * flash)
    ctx.fillRect(Math.round(cx - half), floor - 2, half * 2 + 1, 2)
    ctx.fillStyle = css(mix(color, [255, 255, 255], 0.35), 0.85 * flash)
    ctx.fillRect(Math.round(cx - half), floor - 1, half * 2 + 1, 1)
  }
  ctx.drawImage(droneCanvas(Math.floor(t * 30), alarm), x - 12, top)
  // running lights: they blink in sync, like aircraft strobes
  if (Math.sin(t * 6 + seed) > 0.4) {
    ctx.fillStyle = css(color)
    ctx.fillRect(x - 10, top + 3, 1, 1)
    ctx.fillRect(x + 10, top + 3, 1, 1)
  }
}

// A drone knocked out of the air, tumbling and smoking.
export function drawWreck(ctx, x, y, life) {
  const tilt = Math.floor(life * 8) & 1
  ctx.fillStyle = css(INK)
  ctx.fillRect(x - 7, y - 3 - tilt, 15, 6 + tilt * 2)
  ctx.fillStyle = css(mix(HULL, [120, 118, 150], 0.22))
  ctx.fillRect(x - 6, y - 2 - tilt, 13, 4 + tilt * 2)
  ctx.fillStyle = css([255, 140, 40])
  ctx.fillRect(x - 1, y - 1, 2, 2)
}

// ── laser grid ───────────────────────────────────────────────────────────

// An emitter post: a base plate on the roof, a mast and a lens housing at
// beam height facing along the beam. h is the beam height above the roof.
export function bakeEmitter(h, facing, tripped) {
  const lens = tripped ? ALARM : SECURITY
  const H = Math.max(6, h + 2)
  const b = new PixelBuffer(6, H)
  const base = pack(mix(HULL, [120, 118, 150], 0.22)), hl = pack(mix(HULL, [170, 168, 200], 0.45)), dark = pack(HULL)
  b.rect(2, 2, 2, H - 2, base)                    // mast
  b.rect(2, 2, 1, H - 2, hl)
  b.rect(0, H - 2, 6, 2, dark)                    // base plate
  b.rect(1, H - 2, 4, 1, base)
  b.rect(1, 0, 4, 5, dark)                        // lens housing
  b.rect(1, 0, 4, 1, hl)
  const lx = facing > 0 ? 4 : 1
  b.rect(lx, 1, 1, 3, pack(lens))
  b.set(lx, 2, pack([255, 245, 250]))
  return outlined(b, pack(INK))
}

const emitterCache = new Map()
function emitterCanvas(h, facing, tripped) {
  const key = `${h}:${facing}:${tripped ? 1 : 0}`
  if (!emitterCache.has(key)) emitterCache.set(key, toCanvas(bakeEmitter(h, facing, tripped)))
  return emitterCache.get(key)
}

// Light the beam throws on the roof, drawn before the runner.
export function drawLaserSpill(ctx, x0, x1, y, floor, t, { tripped = false, seed = 0 } = {}) {
  const color = tripped ? ALARM : SECURITY
  const h = floor - y
  const k = Math.max(0, 1 - h / 24)               // nearer the roof, brighter
  if (k <= 0) return
  const pulse = 0.75 + 0.25 * Math.sin(t * 14 + seed)
  ctx.fillStyle = css(color)
  for (let yy = floor - 3; yy < floor; yy++) {
    for (let xx = x0 - 4; xx < x1 + 4; xx++) {
      const edge = Math.min(xx - (x0 - 4), x1 + 4 - xx) / 6
      if (dither(xx, yy, Math.min(1, edge) * k * pulse * (0.55 - (floor - 1 - yy) * 0.15))) ctx.fillRect(xx, yy, 1, 1)
    }
  }
}

// The grid itself: two posts and the beam, drawn in front of the runner so
// the beam reads across the body. y is the beam's screen row.
export function drawLaser(ctx, x0, x1, y, floor, t, { tripped = false, seed = 0 } = {}) {
  const color = tripped ? ALARM : SECURITY
  const h = floor - y
  const left = emitterCanvas(h, 1, tripped), right = emitterCanvas(h, -1, tripped)
  ctx.drawImage(left, x0 - 6, y - 3)
  ctx.drawImage(right, x1 - 2, y - 3)
  // a tripped grid stutters; an armed one holds with the odd flicker
  const on = tripped ? Math.floor(t * 6) & 1 : hash(Math.floor(t * 20), seed) > 0.06
  if (!on) return
  const w = x1 - x0
  const pulse = 0.5 + 0.5 * Math.sin(t * 14 + seed)
  ctx.fillStyle = css(color, 0.14 + 0.1 * pulse)
  ctx.fillRect(x0, y - 3, w, 7)
  ctx.fillStyle = css(color, 0.5)
  ctx.fillRect(x0, y - 1, w, 4)
  ctx.fillStyle = css(color)
  ctx.fillRect(x0, y, w, 2)
  ctx.fillStyle = 'rgba(255,240,250,0.95)'
  ctx.fillRect(x0, y, w, 1)
  // energy running along the beam
  for (let i = 0; i < 2; i++) {
    const sx = x0 + Math.floor(((t * 90 + i * w / 2 + seed * 7) % w + w) % w)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(sx, y - 1, 2, 4)
  }
}

// ── data shard ───────────────────────────────────────────────────────────

// A spinning cyan diamond with a soft halo. Spin is faked by squashing.
export function drawShard(ctx, x, y, t, seed = 0) {
  y += Math.round(Math.sin(t * 3 + seed * 1.7) * 1.5)
  const k = 0.35 + 0.65 * Math.abs(Math.cos(t * 3.2 + seed))
  ctx.fillStyle = css(SHARD, 0.28)
  for (let dy = -5; dy <= 5; dy++) {
    const hw = Math.round((5 - Math.abs(dy)) * k)
    ctx.fillRect(x - hw, y + dy, hw * 2 + 1, 1)
  }
  ctx.fillStyle = css(SHARD)
  for (let dy = -3; dy <= 3; dy++) {
    const hw = Math.round((3 - Math.abs(dy)) * k)
    ctx.fillRect(x - hw, y + dy, hw * 2 + 1, 1)
  }
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x, y - 1, 1, 2)
}
