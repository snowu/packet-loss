// Art sheets for the rigged runner, rendered by the game's own rig code.
//   node bench/rig-sheet.js [--out=docs/screenshots/runner-rig]
// Writes:
//   model-sheet.png  skeleton, skins and palettes, every move, run contacts
//   run-cycle.png    animated (APNG): every skin running in place
//   moves.png        animated (APNG): a scripted run through every move,
//                    showing the crossfades between them
// The static sheet needs Chromium for its text; the animations are pure Node.
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync, crc32 } from 'node:zlib'
import { Animator } from '../src/pixel/rig/animator.js'
import { drawRunner, newRaster, colorize, paletteFor } from '../src/pixel/rig/paint.js'
import { SKINS } from '../src/pixel/rig/skins.js'
import { FRAME } from '../src/pixel/runnerModel.js'
import { RUN_STRIDE } from '../src/pixel/runGait.js'
import { PHYS } from '../src/sim/config.js'

const output = process.argv.find(arg => arg.startsWith('--out='))?.slice('--out='.length) || 'docs/screenshots/runner-rig'
mkdirSync(output, { recursive: true })

// ---- APNG ---------------------------------------------------------------------
function chunk(type, data) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0)
  return Buffer.concat([head, data, crc])
}
function scanlines(w, h, rgba) {
  const raw = Buffer.alloc(h * (w * 4 + 1))
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1)
  return deflateSync(raw, { level: 9 })
}
function apng(w, h, frames, fps) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  const actl = Buffer.alloc(8); actl.writeUInt32BE(frames.length, 0)
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('acTL', actl)]
  let seq = 0
  frames.forEach((rgba, i) => {
    const fc = Buffer.alloc(26)
    fc.writeUInt32BE(seq++, 0); fc.writeUInt32BE(w, 4); fc.writeUInt32BE(h, 8)
    fc.writeUInt16BE(1, 20); fc.writeUInt16BE(fps, 22)
    parts.push(chunk('fcTL', fc))
    const data = scanlines(w, h, rgba)
    if (i === 0) parts.push(chunk('IDAT', data))
    else { const sq = Buffer.alloc(4); sq.writeUInt32BE(seq++); parts.push(chunk('fdAT', Buffer.concat([sq, data]))) }
  })
  parts.push(chunk('IEND', Buffer.alloc(0)))
  return Buffer.concat(parts)
}

// ---- Node rendering --------------------------------------------------------------
const BG = 0xff1f1520, ROOF = 0xff5a4560, ROOF_LIT = 0xff7d6386
const hex = c => { const n = parseInt(c.slice(1), 16); return (0xff << 24 | (n & 255) << 16 | (n >> 8 & 255) << 8 | n >> 16) >>> 0 }

class Canvas {
  constructor(w, h, bg = BG) { this.w = w; this.h = h; this.px = new Uint32Array(w * h).fill(bg) }
  // Blit a rendered runner at an integer zoom of its 2x raster.
  sprite(pixels, x, y, zoom) {
    for (let sy = 0; sy < FRAME.height; sy++) for (let sx = 0; sx < FRAME.width; sx++) {
      const c = pixels[sy * FRAME.width + sx]
      if (!(c >>> 24)) continue
      for (let dy = 0; dy < zoom; dy++) for (let dx = 0; dx < zoom; dx++) {
        const px = x + sx * zoom + dx, py = y + sy * zoom + dy
        if (px >= 0 && py >= 0 && px < this.w && py < this.h) this.px[py * this.w + px] = c
      }
    }
  }
  rect(x, y, w, h, c) { for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++) this.px.fill(c, j * this.w + Math.max(0, x), j * this.w + Math.min(this.w, x + w)) }
}

function render(animator, skin) {
  return colorize(drawRunner(newRaster(), animator.joints, animator.hairPoints, skin), paletteFor(skin))
}

// Every skin running in place, the stride driven by distance as in the game.
function runCycle() {
  const zoom = 2, skins = Object.values(SKINS), cell = FRAME.width * zoom, h = Math.round(FRAME.height * zoom * 0.62)
  const top = Math.round(FRAME.height * zoom * 0.3), ground = FRAME.origin[1] * FRAME.scale * zoom - top
  const anims = skins.map(() => new Animator()), speed = 14, frames = []
  const N = 48, dt = RUN_STRIDE / speed / N * 2
  for (let i = -90; i < N; i++) {
    const phase = (i * dt * speed) / RUN_STRIDE
    const c = new Canvas(cell * skins.length, h)
    skins.forEach((skin, k) => {
      anims[k].update({ state: 'run', speed }, dt, phase, false, i * dt * speed, 0)
      if (i < 0) return
      c.rect(k * cell, ground, cell, 2, ROOF_LIT); c.rect(k * cell, ground + 2, cell, h - ground, ROOF)
      // Roof seams scroll at running speed so planted feet can be judged.
      for (let s = 0; s < 8; s++) {
        const x = Math.round(((s * 40 - i * dt * speed * 14 * zoom) % 320 + 320) % 320)
        if (x < cell) c.rect(k * cell + x, ground + 2, 2, h - ground, ROOF_LIT)
      }
      const shifted = new Canvas(cell, h, 0)
      shifted.sprite(render(anims[k], skin), -FRAME.origin[0] * FRAME.scale * zoom + cell / 3, -top, zoom)
      for (let y = 0; y < h; y++) for (let x = 0; x < cell; x++) { const v = shifted.px[y * cell + x]; if (v) c.px[y * c.w + k * cell + x] = v }
    })
    if (i >= 0) frames.push(c.px)
  }
  return apng(cell * skins.length, h, frames.map(f => new Uint8Array(f.buffer)), Math.round(1 / dt))
}

// A scripted sequence of simulation states, played through the animator at
// 60 fps exactly as the game would feed it.
const SCRIPT = [
  ['run', 0.6], ['air', 0.62, t => ({ vy: PHYS.JUMP_V - PHYS.G * t * 0.85 })], ['run', 0.5],
  ['slide', PHYS.SLIDE_TIME], ['run', 0.45], ['vault', 0.3, t => ({ kin: { t, T: 0.3 } })], ['run', 0.4],
  ['air', 0.5, t => ({ vy: 6 - PHYS.G * t })], ['roll', PHYS.ROLL_TIME], ['run', 0.5],
  ['stumble', PHYS.STUMBLE_TIME], ['run', 0.5], ['blocked', 0.7], ['idle', 1.2],
]
function moves(skin = SKINS.courier) {
  const zoom = 2, w = 360, h = 300, fps = 60, dt = 1 / fps, a = new Animator(), speed = 13, frames = []
  let x = 0, phase = 0
  for (const [state, duration, extra] of SCRIPT) {
    for (let t = 0; t < duration - 1e-9; t += dt) {
      const moving = state !== 'blocked' && state !== 'idle'
      if (moving) x += speed * dt
      if (state === 'run') phase += speed * dt / RUN_STRIDE
      const p = { state: state === 'idle' ? 'run' : state, t, speed, vy: 0, ...(extra ? extra(t) : {}) }
      a.update(p, dt, phase, state === 'idle', x, 0)
      const c = new Canvas(w, h), ground = 236
      c.rect(0, ground, w, 3, ROOF_LIT); c.rect(0, ground + 3, w, h - ground, ROOF)
      for (let s = 0; s < 10; s++) { const sx = Math.round(((s * 48 - x * 14 * zoom * 2) % 480 + 480) % 480); c.rect(sx, ground + 3, 3, h - ground, ROOF_LIT) }
      c.sprite(render(a, skin), Math.round(w / 2 - FRAME.origin[0] * FRAME.scale * zoom), ground - FRAME.origin[1] * FRAME.scale * zoom, zoom)
      frames.push(new Uint8Array(c.px.buffer))
    }
  }
  return apng(w, h, frames, fps / 2)
}

writeFileSync(`${output}/run-cycle.png`, runCycle())
writeFileSync(`${output}/moves.png`, moves())

// ---- Static model sheet (Chromium for text) --------------------------------------
const server = await createServer({ logLevel: 'error', server: { port: 0 } }); await server.listen()
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
try {
  const page = await browser.newPage()
  page.on('pageerror', e => { throw e })
  await page.goto(`${server.resolvedUrls.local[0]}lab.html`)
  const png = await page.evaluate(async () => {
    const { Animator } = await import('/packet-loss/src/pixel/rig/animator.js')
    const { drawRunner, newRaster, colorize, paletteFor } = await import('/packet-loss/src/pixel/rig/paint.js')
    const { SKINS, MATERIALS, ramp } = await import('/packet-loss/src/pixel/rig/skins.js')
    const { BONES } = await import('/packet-loss/src/pixel/rig/skeleton.js')
    const { FRAME } = await import('/packet-loss/src/pixel/runnerModel.js')
    const W = 1600, H = 1580, cv = document.createElement('canvas'); cv.width = W; cv.height = H
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = false
    c.fillStyle = '#17111f'; c.fillRect(0, 0, W, H)
    const INK = '#efe7da', DIM = '#a99bb8', ACCENT = '#ff5a4a'
    const text = (s, x, y, size = 16, color = INK, weight = '') => { c.fillStyle = color; c.font = `${weight} ${size}px ui-monospace, monospace`; c.fillText(s, x, y) }
    const sprite = (anim, skin) => {
      const px = colorize(drawRunner(newRaster(), anim.joints, anim.hairPoints, skin), paletteFor(skin))
      const im = new ImageData(new Uint8ClampedArray(px.buffer.slice(0)), FRAME.width, FRAME.height)
      const t = document.createElement('canvas'); t.width = FRAME.width; t.height = FRAME.height; t.getContext('2d').putImageData(im, 0, 0)
      return t
    }
    const posed = (p, { idle = false, phase = 0, frames = 40 } = {}) => {
      const a = new Animator()
      for (let i = 0; i <= frames; i++) a.update(p, 1 / 60, phase, idle, (p.speed || 0) * i / 60, 0)
      return a
    }
    // Draw at the sprite's roof contact point (gx, gy), integer zoom of the 2x raster.
    const place = (im, gx, gy, zoom) => c.drawImage(im, gx - FRAME.origin[0] * 2 * zoom, gy - FRAME.origin[1] * 2 * zoom, FRAME.width * zoom, FRAME.height * zoom)
    const ground = (x, y, w) => { c.fillStyle = '#4a3a55'; c.fillRect(x, y, w, 2) }

    text('PACKET LOSS / RUNNER RIG', 40, 56, 30, INK, 'bold')
    text('One skeleton, one set of animations. A skin is a palette: every outfit covers exactly the same pixels in every frame.', 40, 88, 15, DIM)

    // 1. Skeleton
    text('SKELETON', 40, 140, 18, ACCENT, 'bold')
    const neutral = posed({ state: 'run' }, { idle: true, frames: 90 })
    const zoom = 4, gx = 200, gy = 560
    ground(60, gy, 300)
    c.globalAlpha = 0.35; place(sprite(neutral, SKINS.courier), gx, gy, zoom); c.globalAlpha = 1
    const P = p => [gx + p[0] * 2 * zoom, gy + p[1] * 2 * zoom], j = neutral.joints
    const chains = [[j.near.hip, j.near.knee, j.near.ankle], [j.far.hip, j.far.knee, j.far.ankle], [j.hip, j.waist, j.neck, j.head.o],
      [j.shoulder, j.nearArm.elbow, j.nearArm.wrist, j.nearArm.knuckles], [j.shoulder, j.farArm.elbow, j.farArm.wrist, j.farArm.knuckles], neutral.hairPoints]
    chains.forEach((ch, i) => {
      c.strokeStyle = ['#55ddeb', '#2f8a94', '#efe7da', '#ffcf66', '#a8843a', '#d38bff'][i]; c.lineWidth = 3
      c.beginPath(); ch.forEach((p, k) => k ? c.lineTo(...P(p)) : c.moveTo(...P(p))); c.stroke()
      for (const p of ch) { c.beginPath(); c.arc(...P(p), 4, 0, Math.PI * 2); c.fillStyle = c.strokeStyle; c.fill() }
    })
    const rows = [['abdomen + chest', `${BONES.abdomen} + ${BONES.chest.toFixed(1)}`], ['thigh / shin', `${BONES.thigh} / ${BONES.shin}`], ['upper / forearm / fist', `${BONES.upper} / ${BONES.fore} / ${BONES.hand}`], ['ponytail', '5 spring segments'], ['height', '≈ 7 heads, 41 px']]
    rows.forEach(([k, v], i) => { text(k, 400, 200 + i * 30, 15, DIM); text(v, 620, 200 + i * 30, 15) })
    text('Lengths in logical pixels. Bones never stretch;', 400, 370, 14, DIM)
    text('knees and elbows cannot bend backwards;', 400, 392, 14, DIM)
    text('planted soles move exactly with the roof.', 400, 414, 14, DIM)

    // 2. Skins and palettes
    text('SKINS', 860, 140, 18, ACCENT, 'bold')
    const skins = Object.entries(SKINS)
    skins.forEach(([id, skin], k) => {
      const x = 900 + k * 230
      ground(x - 70, 470, 180)
      place(sprite(neutral, skin), x, 470, 3)
      text(skin.name.toUpperCase(), x - 60, 500, 15, INK, 'bold')
      const used = MATERIALS.filter(m => m !== 'outline' && m !== 'eye')
      used.forEach((m, i) => {
        const r = ramp(skin.colors[m]); const row = Math.floor(i / 2), col = i % 2
        r.forEach((rgb, t) => { c.fillStyle = `rgb(${rgb})`; c.fillRect(x - 64 + col * 92 + t * 14, 520 + row * 18, 14, 14) })
        text(m, x - 64 + col * 92 + 46, 532 + row * 18, 11, DIM)
      })
    })

    // 3. Moves
    const states = [
      ['IDLE', { state: 'run' }, { idle: true }], ['RUN', { state: 'run', speed: 15 }, { phase: 0.1 }], ['JUMP', { state: 'air', vy: 9 }], ['APEX', { state: 'air', vy: 0 }], ['FALL', { state: 'air', vy: -10 }],
      ['SLIDE', { state: 'slide', t: 0.4 }], ['VAULT', { state: 'vault', t: 0.12, kin: { t: 0.12, T: 0.3 } }], ['MANTLE', { state: 'mantle', t: 0.24, kin: { t: 0.24, T: 0.32 } }],
      ['CLIMB', { state: 'climb', t: 0.1 }], ['WALL SLIDE', { state: 'wallslide', t: 0.3 }], ['WALL RUN', { state: 'wallrun', t: 0.25, speed: 14 }], ['ZIPLINE', { state: 'zip', t: 0.4 }],
      ['ROLL', { state: 'roll', t: 0.22 }], ['STUMBLE', { state: 'stumble', t: 0.18 }], ['BRACED', { state: 'blocked', t: 0.3 }], ['DOWN', { state: 'dead', t: 0.4 }],
    ]
    text('MOVES', 40, 700, 18, ACCENT, 'bold')
    states.forEach(([label, p, o = {}], i) => {
      const col = i % 8, row = Math.floor(i / 8), x = 110 + col * 190, y = 920 + row * 230
      ground(x - 80, y, 170)
      // A zipline hangs the runner below the cable, which sits ZIP_HANG above the feet.
      const cable = 27.3 * 4, lift = label === 'ZIPLINE' ? 150 - cable : 0
      if (lift) { c.fillStyle = ACCENT; c.fillRect(x - 80, y - 150, 170, 2) }
      place(sprite(posed(p, o), skins[row % 3][1]), x, y - lift, 2)
      text(label, x - 70, y + 26, 14, DIM)
    })

    // 4. Run contacts
    text('RUN CYCLE / ALTERNATING CONTACTS (RED: A FOOT LANDS)', 40, 1220, 18, ACCENT, 'bold')
    skins.forEach(([, skin], row) => {
      for (let col = 0; col < 8; col++) {
        const phase = col / 8, x = 110 + col * 190, y = 1335 + row * 100
        const anim = posed({ state: 'run', speed: 14 }, { phase, frames: 30 })
        c.fillStyle = col === 0 || col === 4 ? ACCENT : '#4a3a55'; c.fillRect(x - 70, y, 150, 2)
        place(sprite(anim, skin), x, y, 1)
        if (row === 2) text(String(col + 1), x - 4, y + 22, 13, DIM)
      }
    })
    return cv.toDataURL('image/png').split(',')[1]
  })
  writeFileSync(`${output}/model-sheet.png`, Buffer.from(png, 'base64'))
  console.log(`Wrote ${output}/model-sheet.png, run-cycle.png and moves.png`)
} finally { await browser.close(); await server.close() }
