// The pixel-art renderer: a low-resolution canvas scaled up crisp.
import { toCanvas, pack, mix, css, dither, hash, PixelBuffer } from './pixels.js'
import { paletteAt, districtName, ACCENT } from './palette.js'
import { RunnerSprite, ORIGIN_X, ORIGIN_Y } from './runner.js'
import { RoofWater } from './water.js'
import { drawLightHalo, drawSteam, ParkourFX } from './effects.js'
import { drawRoofSurface, drawContactShadow, drawRunnerContact, equipmentLight } from './roof.js'
import { PPU, bakeDecor, bakeBird, bakeCloud, bakeCar, recede, outlined } from './sprites.js'
import { CITY } from './city.js'
import { Baker } from './baker.js'
import { runJob } from './bakes.js'
import { bakeBillboard, specFor, inks, billboardLight, drawTicker } from './billboard.js'
import { drawBig, bigW } from './art.js'
import { bakeObstacle, lipOf, pipeFrame, bakeFence, drawFenceLive } from './obstacles.js'
import { drawDrone, drawWreck, drawLaser, drawLaserSpill, drawShard, SHARD, SECURITY as LASER } from './security.js'
import { PHYS, HEIST } from '../sim/config.js'
import { createRng } from '../sim/rng.js'
import { FocusFilter } from './focus.js'

// Internal resolution: 270px tall in landscape; portrait screens get a taller
// canvas instead of a letterboxed strip. Module-level so the bakers share it.
let H = 270
const HULL = [26, 24, 38]
// how far roof equipment that isn't an obstacle fades toward the skyline
const DECOR_RECEDE = 0.5
const CUE = [41, 243, 255]
const CUE_IDLE = [150, 146, 176]
const DROP_NEAR_RGB = [210, 235, 245], DROP_FAR_RGB = [170, 200, 215]
const DROP_NEAR = css(DROP_NEAR_RGB, 0.75), DROP_FAR = css(DROP_FAR_RGB, 0.45)
const ZIP_UNDER = css(mix(ACCENT, [40, 6, 14], 0.5))
const ZIP_CABLE = css(ACCENT)
const ZIP_GLINT = css(mix(ACCENT, [255, 241, 215], 0.6))

const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt))
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

const LAYERS = [
  { f: 0.08, fy: 0.06, w: [16, 44], h: [60, 150], gap: [0, 6], color: 'far', win: 'farWin', offset: -4 },
  { f: 0.2, fy: 0.14, w: [24, 60], h: [40, 120], gap: [0, 10], color: 'mid', win: 'midWin', offset: 18 },
  { f: 0.4, fy: 0.28, w: [34, 86], h: [26, 96], gap: [2, 18], color: 'near', win: 'midWin', offset: 40 },
]

export class PixelView {
  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'pixel-canvas'
    document.getElementById('app').appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d', { alpha: false })
    this.W = 480

    this.setRunner('courier')
    this.runnerCanvas = document.createElement('canvas')
    this.haloCanvas = document.createElement('canvas')
    this.haloTinted = document.createElement('canvas')
    this.rasterClock = 0
    this.after = []
    this.afterClock = 0
    this.afterPool = Array.from({ length: 4 }, () => document.createElement('canvas'))
    this.afterIndex = 0

    this.cam = { x: 0, y: 0, lead: 6, floor: -Infinity, trauma: 0, time: 0 }
    this.cache = new Map()
    this.budget = 0
    // facades, fog and mist bake on a worker so a frame never waits on one
    this.baker = new Baker((key, version, buf) => {
      const hit = this.cache.get(key)
      if (hit?.version !== version) this.cache.set(key, { canvas: toCanvas(buf, hit?.canvas), version })
    })
    this.views = new Map()
    this.birds = []
    this.particles = []
    this.water = new RoofWater()
    this.effects = new ParkourFX()
    this.lines = []
    this.drops = []
    this.lightning = 0
    this.lightningClock = 8
    this.weather = { rain: 0, wet: 0, target: 0, clock: 0, ready: false }
    this.layers = LAYERS.map((L) => ({ ...L, items: [], cursor: null, rng: createRng(Math.floor(L.f * 1e4)) }))
    this.lightKeys = new Map()
    this.clouds = { items: [], cursor: null, rng: createRng(77) }
    this.cars = []
    this.carRng = createRng(404)
    this.birdFrames = [0, 1, 2].map((i) => toCanvas(bakeBird(i)))
    this.onStep = null
    this.ghostCanvas = document.createElement('canvas')
    this.ghostClock = 0
    this.passed = 0
    this.glitchAmt = 0
    this.wrecks = []
    this.popups = []
    this.blend = 0
    this.rebakeAll = false
    // clarity checks (dev and art lab): leave out the runner or everything
    // the runner interacts with, to measure how each stands off the scene
    this.hide = { runner: false, course: false, decor: false }
    // classic: the look before the clarity pass, for side-by-side checks
    this.classic = false

    window.addEventListener('resize', () => this.resize())
    this.resize()
  }

  resize() {
    const aspect = window.innerWidth / window.innerHeight
    if (aspect >= 1.2) {
      H = 270
      this.W = clamp(Math.round(H * aspect), 320, 720)
    } else {
      this.W = 360
      H = clamp(Math.round(this.W / aspect), 270, 800)
    }
    this.canvas.width = this.W
    this.canvas.height = H
    const scale = Math.min(window.innerWidth / this.W, window.innerHeight / H)
    this.canvas.style.width = `${Math.round(this.W * scale)}px`
    this.canvas.style.height = `${Math.round(H * scale)}px`
    this.ctx.imageSmoothingEnabled = false
    this.cache.delete('sky')
    this.cache.delete('haze')
    this.cache.delete('mist')
    this.cache.delete('vignette')
    this.cache.delete('alarm')
    for (const key of [...this.cache.keys()]) if (key.startsWith('fog')) this.cache.delete(key)
    for (const L of this.layers) L.fog = null
  }

  // ── cached sprites, re-baked when the palette steps ─────────────────────

  sprite(key, version, bake) {
    const hit = this.cache.get(key)
    if (hit && (hit.version === version || this.budget <= 0)) return hit.canvas
    this.budget--
    const canvas = toCanvas(bake(), hit?.canvas)
    this.cache.set(key, { canvas, version })
    return canvas
  }

  // A sprite baked on the worker: the cached canvas when it's current;
  // otherwise the bake is queued and the stale canvas (or null, if there is
  // none yet) comes back meanwhile. A crossfade re-bakes everything at once
  // here, and so does a browser without workers.
  later(key, version, job) {
    const hit = this.cache.get(key)
    if (hit?.version === version) return hit.canvas
    if (!this.baker.ready || this.budget === Infinity) return this.sprite(key, version, () => runJob(job()))
    if (this.baker.pending.get(key) === version) return hit?.canvas ?? null
    this.baker.want(key, version, job())
    return hit?.canvas ?? null
  }

  // the same, but bakes here and now if there is nothing to show yet
  now(key, version, job) {
    return this.later(key, version, job) ?? this.sprite(key, version, () => runJob(job()))
  }

  // Light the building's signs throw on its roof, in screen pixels.
  chunkLights(c, v, pal) {
    const lights = v.signs.map((sg) => ({ x: this.sx(c.x0) + sg.dx + sg.spec.w / 2, w: sg.spec.w, color: billboardLight(sg.spec, pal), strength: 0.35 }))
    if (v.roofAd) lights.push({ x: this.sx(c.x0) + v.roofAd.dx + v.roofAd.spec.w / 2, w: v.roofAd.spec.w, color: billboardLight(v.roofAd.spec, pal, this.cam.time), strength: 1 })
    return lights
  }

  // An overhead pipe bank: where it sits, the light on it, and its two
  // layers (the whole bank, and the run that's drawn over the runner).
  pipeOf(c, sd, pal, lights) {
    const w = Math.max(2, Math.round((sd.x1 - sd.x0) * PPU)), h = Math.max(2, Math.round((sd.y1 - sd.y0) * PPU))
    const drop = this.sy(c.roof) - this.sy(sd.y0) - 2
    const material = equipmentLight(pal, this.sx(sd.x0) + w / 2, lights)
    const args = ['beam', w, h, drop, material, sd.id, { legacy: this.classic }]
    return {
      w, h, drop, version: `${pal.version}:${material.light}`,
      back: () => ['pipe', args], front: () => ['pipeFront', args],
    }
  }

  facadeJob(c, v, pal) {
    return ['facade', [{ w: Math.round((c.x1 - c.x0) * PPU), roofH: v.roofH, style: c.style, seed: c.seed, pal, wall: v.wall, accentCap: v.cap }]]
  }

  wallJob(c, e, pal) {
    const panel = c.wallruns[0]
    const rh = 6
    const m0 = rh + 5 + Math.round((e.top - panel.y1) * PPU)
    const m1 = rh + 5 + Math.round((e.top - panel.y0 + 0.4) * PPU)
    return ['facade', [{ w: Math.round((e.x1 - e.x0) * PPU), roofH: rh, style: (c.seed >> 3) % 2 === 0 ? 0 : 2, seed: c.seed + 5, pal, wall: 2, mural: [m0, m1] }]]
  }

  // ── course binding ──────────────────────────────────────────────────────

  bind(level) {
    this.water = new RoofWater()
    this.effects = new ParkourFX()
    // Course keys are c<id>:..., unlike clouds (cl...) and traffic (car...).
    // Keep those city sprites when restarting instead of rebaking them.
    const courseKey = key => /^c\d+:/.test(key)
    for (const key of [...this.cache.keys()]) if (courseKey(key) || key.startsWith('L') || key.startsWith('bb')) this.cache.delete(key)
    this.baker.drop((key) => courseKey(key) || key.startsWith('L') || key.startsWith('bb'))
    this.views.clear()
    this.birds = []
    this.particles = []
    this.wrecks = []
    this.glitchAmt = 0
    this.weather.ready = false
    level.on('add', (c) => this.addChunk(c))
    level.on('remove', (c) => this.removeChunk(c))
    for (const c of level.chunks) this.addChunk(c)
    for (const L of this.layers) { L.items = []; L.cursor = null }
  }

  addChunk(c) {
    const rng = createRng(c.seed)
    const view = {
      wall: rng.int(0, 4),
      cap: rng.chance(0.3),
      roofH: clamp(Math.round(c.depth * 0.55), 8, 16),
      decor: [...c.decor].sort((a, b) => a.z - b.z),
      signs: [],
    }
    // advertising bolted to the facade, spaced out along the wall
    const wpx = (c.x1 - c.x0) * PPU
    for (let dx = rng.int(24, 72); dx < wpx - 30;) {
      const spec = specFor(rng.int(1, 1e6), 'facade')
      if (dx + spec.w > wpx - 4) break
      view.signs.push({ spec, dx, dy: view.roofH + rng.int(30, 64) })
      dx += spec.w + rng.int(100, 190)
    }
    // sometimes a big billboard stands at the back of the roof
    if (wpx > 180 && rng.chance(0.24)) {
      const spec = specFor(rng.int(1, 1e6), 'roof')
      if (spec.w < wpx - 40) view.roofAd = { spec, dx: rng.int(16, Math.round(wpx - spec.w - 16)) }
    }
    for (const e of c.extras) {
      if (e.type !== 'birds') continue
      for (let i = 0; i < e.count; i++) {
        this.birds.push({ chunk: c, x: e.x + rng.range(-2.5, 2.5), y: c.roof, back: view.roofH, vx: 0, vy: 0, flying: false, t: rng() * 5, rng })
      }
    }
    this.views.set(c, view)
  }

  removeChunk(c) {
    this.views.delete(c)
    for (const key of [...this.cache.keys()]) if (key.startsWith(`c${c.id}:`)) this.cache.delete(key)
    this.baker.drop((key) => key.startsWith(`c${c.id}:`))
    this.birds = this.birds.filter((b) => b.chunk !== c)
  }

  // ── camera ──────────────────────────────────────────────────────────────

  snap(x, y) {
    this.cam.x = x + 6
    this.cam.y = y + 2
    this.cam.floor = -Infinity
    this.runner.chains = null
  }

  setFloor(y) { this.cam.floor = y }
  glitch(a) { this.glitchAmt = Math.min(1, this.glitchAmt + a) }
  shake(a) { this.cam.trauma = Math.min(1, this.cam.trauma + a) }

  sx(x) { return Math.round(x * PPU) - this.camPX + (this.W >> 1) }
  sy(y) { return (H >> 1) - (Math.round(y * PPU) - this.camPY) }

  updateCamera(dt, s) {
    const c = this.cam
    c.time += dt
    const W = this.W
    const lead = s.mode === 'title' ? -(W * 0.12) / PPU : (W * 0.22) / PPU + s.p.speed * 0.25
    c.lead = damp(c.lead, lead, 2.5, dt)
    let ty = s.ry + 1.6
    const ahead = s.level.roofAt(s.rx + 10 + s.p.speed * 0.5)
    if (ahead !== null && s.p.state !== 'dead') ty = ty * 0.7 + (ahead + 1.6) * 0.3
    ty = Math.max(ty, c.floor)
    c.x = damp(c.x, s.rx + c.lead, 8, dt)
    c.y = damp(c.y, ty, 2.6 + Math.abs(ty - c.y) * 0.6, dt)
    c.trauma = Math.max(0, c.trauma - dt * 1.8)
    const k = c.trauma * c.trauma * 4
    this.shakeX = Math.round(Math.sin(c.time * 53) * k)
    this.shakeY = Math.round(Math.sin(c.time * 71 + 1) * k)
    this.camPX = Math.round(c.x * PPU) + this.shakeX
    this.camPY = Math.round(c.y * PPU) + this.shakeY
  }

  // ── events → effects ────────────────────────────────────────────────────

  burst(x, y, n, { spread = 1.2, up = 1.5, forward = 0, life = 0.6, color = null } = {}) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 0.6, y: y + Math.random() * 0.15,
        vx: forward + (Math.random() - 0.5) * spread * 2, vy: Math.random() * up,
        life: life * (0.6 + Math.random() * 0.6), max: life, color, size: Math.random() < 0.3 ? 2 : 1,
      })
    }
  }

  event(e, p) {
    this.effects.event(e.type, p, e)
    if (['land', 'hardland', 'landslide'].includes(e.type)) this.water.splash(p.x, p.y, p.speed, this.weather.wet, e.impact ?? 12)
    switch (e.type) {
      case 'land':
        this.runner.land(e.impact ?? 0)
        this.burst(p.x, p.y, Math.min(10, 2 + Math.floor((e.impact ?? 0) / 3)), { up: 1.2, forward: p.speed * 0.3 })
        if ((e.impact ?? 0) > 12) this.shake(0.15)
        break
      case 'hardland':
        this.runner.land(18)
        this.burst(p.x, p.y, 18, { spread: 2, up: 2.5 })
        this.shake(0.6)
        break
      case 'roll':
        this.burst(p.x, p.y, 12, { spread: 1.4, up: 1.4, forward: p.speed * 0.6 })
        this.shake(0.15)
        break
      case 'slide':
        this.burst(p.x, p.y, 8, { up: 0.8, forward: p.speed * 0.8 })
        // a missed landing slide says why
        if (e.quality !== undefined) this.popup(e.slow ? 'TOO SLOW' : e.side === 'early' ? 'EARLY' : 'LATE', [150, 146, 176], p)
        break
      case 'landslide': {
        const perfect = e.quality >= 0.9
        this.burst(p.x, p.y, perfect ? 22 : 14, { spread: 1.6, up: 1, forward: p.speed * 0.9 })
        this.burst(p.x, p.y, perfect ? 12 : 5, { spread: 2.2, up: 1.4, forward: p.speed * 0.6, color: CUE, life: 0.45 })
        if (perfect) this.shake(0.12)
        this.popup(perfect ? 'PERFECT' : e.quality >= 0.75 ? 'GREAT' : 'GOOD', perfect ? CUE : [235, 240, 255], p)
        break
      }
      case 'vault': case 'clamber':
        this.burst(p.x + 0.3, p.y, 4, { up: 1, forward: p.speed * 0.4 })
        break
      case 'bonk':
        this.shake(0.5)
        break
      case 'shock':
        this.burst(e.x, p.y + 0.5, 16, { spread: 2.2, up: 2, color: [125, 248, 255], life: 0.45 })
        this.burst(e.x, p.y + 0.5, 6, { spread: 1.4, up: 1.5, color: [255, 255, 255], life: 0.3 })
        this.glitch(0.35)
        this.shake(0.35)
        break
      case 'trip':
        this.shake(0.35)
        this.burst(p.x + 0.3, p.y, 8, { spread: 1.4, up: 1.4 })
        break
      case 'spring':
        this.shake(0.25)
        this.burst(p.x, p.y, 10, { up: 3, color: ACCENT })
        break
      case 'padjump':
        this.shake(0.2)
        this.burst(p.x, p.y, 14, { spread: 1, up: 4, color: ACCENT, life: 0.5 })
        this.burst(p.x, p.y, 8, { up: 1.2, forward: p.speed * 0.4 })
        break
      case 'grab':
        this.burst(p.x + 0.3, p.y + PHYS.H, 4, { up: 0.6, spread: 0.6 })
        break
      case 'airjump':
        this.burst(p.x, p.y, 8, { spread: 1.6, up: -0.5, color: SHARD, life: 0.35 })
        break
      case 'shard':
        this.burst(e.x, e.y, 6, { spread: 1.5, up: 1.5, color: SHARD, life: 0.4 })
        break
      case 'zap':
        this.burst(p.x, e.y, 10, { spread: 1.5, up: 1.5, color: LASER, life: 0.4 })
        this.glitch(0.4)
        this.shake(0.2)
        break
      case 'spotted':
        this.glitch(0.2)
        break
      case 'takedown':
        this.wrecks.push({ x: e.x, y: e.y, vx: p.speed * 0.6, vy: 3, life: 3 })
        this.burst(e.x, e.y + 0.2, 14, { spread: 2.5, up: 2.5, color: [255, 200, 90], life: 0.5 })
        this.shake(0.35)
        break
      case 'traced':
        this.glitch(1)
        this.shake(0.6)
        break
    }
  }

  districtName(d) { return districtName(d) }

  // Which runner outfit to draw.
  setClassic(on) {
    if (on === this.classic) return
    this.classic = on
    this.cache.clear()
    this.baker.drop(() => true)
    this.rebakeAll = true
  }

  setRunner(id) {
    if (id === this.runnerId) return
    this.runnerId = id
    this.runner = new RunnerSprite(id)
    this.runner.onStep = (k) => {
      this.onStep?.(k)
      if (k === 'run' && this.stepPoint) {
        const foot = this.runner.joints?.[(this.runner.lastStep & 1) ? 'ankleB' : 'ankleA']
        this.water.splash(this.stepPoint.x + (foot?.[0] ?? 0) / PPU, this.stepPoint.y, this.stepPoint.speed, this.weather.wet)
      }
    }
    this.ghostRunner = new RunnerSprite(id)
    this.rasterClock = 0
  }

  // Floating move labels over the runner.
  popup(text, color, p) {
    this.popups.push({ text, color, x: p.x, y: p.y + PHYS.H + 0.4, t: 0 })
  }

  drawPopups(dt) {
    const { ctx } = this
    this.popups = this.popups.filter((q) => {
      q.t += dt
      if (q.t > 0.9) return false
      const cv = this.sprite(`pop:${q.text}:${q.color}`, 0, () => {
        const b = new PixelBuffer(bigW(q.text) + 2, 9)
        drawBig(b, q.text, 1, 1, pack(q.color), null, pack([12, 10, 20]))
        return b
      })
      ctx.globalAlpha = q.t > 0.6 ? (0.9 - q.t) / 0.3 : 1
      ctx.drawImage(cv, this.sx(q.x) - (cv.width >> 1), this.sy(q.y) - Math.round(Math.min(1, q.t * 4) * 8) - cv.height)
      ctx.globalAlpha = 1
      return true
    })
  }

  // Touchdown marker while falling: brackets close in on the landing spot and
  // light up inside the timing window (cyan: landing slide, red: roll).
  drawLandCue(s) {
    const c = s.landCue
    if (!c) return
    const { ctx } = this
    const win = c.hard ? PHYS.ROLL_WINDOW : PHYS.LANDSLIDE_PRE
    const inWindow = c.t <= win
    const color = c.hard ? ACCENT : c.fast ? CUE : CUE_IDLE
    const x = this.sx(c.x), y = this.sy(c.y)
    const gap = 3 + Math.round(Math.min(c.t, 0.6) * 50)
    ctx.globalAlpha = c.armed ? 0.35 : inWindow ? 1 : 0.55
    ctx.fillStyle = css(color)
    for (const dir of [-1, 1]) {
      const bx = x + dir * gap
      ctx.fillRect(dir < 0 ? bx - 2 : bx, y - 7, 2, 8)
      ctx.fillRect(dir < 0 ? bx - 2 : bx - 3, y - 1, 5, 2)
    }
    ctx.globalAlpha *= 0.5
    ctx.fillRect(x - gap, y + 1, gap * 2, 1)
    ctx.globalAlpha = c.armed ? 0.35 : 1
    if (inWindow && !c.armed) {
      // press now: a diamond over the spot
      ctx.fillRect(x - 2, y - 11, 5, 1)
      ctx.fillRect(x - 1, y - 12, 3, 3)
      ctx.fillRect(x, y - 13, 1, 5)
    }
    ctx.globalAlpha = 1
  }

  // Cross-fade from the current picture after a palette swap, and re-bake
  // everything at once so old and new colors never mix on screen.
  crossfade() {
    this.blendCanvas ??= document.createElement('canvas')
    this.blendCanvas.width = this.W
    this.blendCanvas.height = H
    this.blendCanvas.getContext('2d').drawImage(this.focusFilter?.source ? this.focusFilter.canvas : this.canvas, 0, 0)
    this.blend = 1
    this.rebakeAll = true
  }

  // ── frame ───────────────────────────────────────────────────────────────

  frame(s) {
    const pal = paletteAt(s.paletteD ?? s.distance)
    this.pal = pal
    this.budget = this.rebakeAll ? Infinity : 2
    this.budget -= this.baker.flush(1)
    this.rebakeAll = false
    const { ctx } = this
    const W = this.W
    this.runner.rim = pal.rim
    this.runner.rimDir = pal.sunX < 0.5 ? [-1, 1] : [1, 1]
    if (s.mode !== 'paused') {
      this.stepPoint = { x: s.rx, y: s.ry, speed: s.p.speed }
      this.runner.update(s.dt, s.p, s.rx * PPU, s.ry * PPU, s.idle ? 'idle' : null)
      this.updateCamera(s.raw, s)
      const roof = s.level.roofAt(s.rx)
      if (roof !== null) this.laneRoof = this.laneRoof === undefined ? roof : damp(this.laneRoof, roof, 6, s.raw)
    }

    if (s.mode !== 'paused') this.updateWeather(s.raw, pal)
    this.lamps = []
    this.drawSky(pal, s.time)
    this.drawClouds(pal, s.time)
    this.drawLayers(pal)
    ctx.drawImage(this.now('haze', `${pal.version}:${W}x${H}`, () => ['haze', [W, H, pal]]), 0, Math.round(H * 0.62))
    this.drawLaneHaze(pal)
    this.drawCourse(pal, s)
    this.drawHeist(s, pal)
    this.drawBirds(s.dt, s.rx)
    this.drawGates(s, pal)
    this.effects.update(s.dt, s.p, s.rx, s.ry)
    this.effects.draw(ctx, (x) => this.sx(x), (y) => this.sy(y))
    this.drawGhost(s)
    this.drawRunner(s, pal)
    this.water.update(s.dt)
    this.water.draw(ctx, (x) => this.sx(x), (y) => this.sy(y), pal)
    this.drawLandCue(s)
    this.drawBeams()
    this.drawLasers(s)
    this.drawParticles(s.dt, pal)
    this.drawPopups(s.raw)
    this.drawMist(pal, s.time)
    this.drawWeather(s, pal)
    this.drawSpeedLines(s, pal)
    // vignette and scanlines in one pass (the alarm carries its own scanlines)
    ctx.drawImage(this.now('vignette', `${pal.version}:${W}x${H}`, () => ['vignette', [W, H, pal]]), 0, 0)
    if (s.trace > 0.7) {
      ctx.globalAlpha = Math.min(1, (s.trace - 0.7) / 0.3) * (0.55 + 0.45 * Math.sin(s.time * 9))
      ctx.drawImage(this.now('alarm', `${W}x${H}`, () => ['alarm', [W, H]]), 0, 0)
      ctx.globalAlpha = 1
    }
    // Present focus directly from the GPU, avoiding a GPU -> 2D round trip.
    // Interference/crossfades retain the CPU path to preserve their ordering.
    const flash = Math.max(s.flash, this.lightning)
    let gpuFocus = false
    if (s.focusVis > 0.02 && this.glitchAmt <= 0.01 && this.blend <= 0) {
      this.focusFilter ??= new FocusFilter()
      gpuFocus = this.focusFilter.draw(ctx, s.focusVis, { present: true, flash: Math.min(0.9, flash), fade: s.fade })
    }
    if (!gpuFocus) {
      this.focusFilter?.hide()
      if (s.focusVis > 0.02) this.postFocus(s.focusVis)
    }
    if (this.glitchAmt > 0.01) this.postGlitch(this.glitchAmt)
    this.glitchAmt = Math.max(0, this.glitchAmt - s.raw * 2.2)
    if (!gpuFocus && flash > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(0.9, flash)})`; ctx.fillRect(0, 0, W, H) }
    if (!gpuFocus && s.fade > 0) { ctx.fillStyle = `rgba(8,6,16,${s.fade})`; ctx.fillRect(0, 0, W, H) }
    if (this.blend > 0) {
      ctx.globalAlpha = Math.min(1, this.blend)
      ctx.drawImage(this.blendCanvas, 0, 0)
      ctx.globalAlpha = 1
      this.blend -= s.raw * 2.5
    }
  }

  // Weather comes and goes on its own during a run. Districts that tend to
  // rain (palette 'rain') start wet more often and stay dry for less time.
  updateWeather(dt, pal) {
    const w = this.weather
    if (!w.ready) {
      w.ready = true
      w.target = w.rain = Math.random() < pal.rain * 0.5 ? 0.6 + Math.random() * 0.4 : 0
      w.wet = w.rain
      w.clock = 10 + Math.random() * 30
    }
    w.clock -= dt
    if (w.clock <= 0) {
      if (w.target > 0) {
        w.target = 0
        w.clock = (35 + Math.random() * 60) * (1 - pal.rain * 0.5)
      } else {
        w.target = 0.6 + Math.random() * 0.4
        w.clock = (25 + Math.random() * 35) * (0.6 + pal.rain)
      }
    }
    w.rain += clamp(w.target - w.rain, -dt / 8, dt / 8)
    w.wet = damp(w.wet, w.rain, w.rain > w.wet ? 0.3 : 0.025, dt)
  }

  drawSky(pal, time) {
    const { ctx } = this
    ctx.drawImage(this.now('sky', `${pal.version}:${this.W}x${H}`, () => ['sky', [this.W, H, pal]]), 0, 0)
    const wet = this.weather.rain
    if (wet > 0.02) {
      // overcast: the sky dulls toward the haze
      ctx.fillStyle = css(mix(pal.haze, pal.sky[0], 0.3), wet * 0.45)
      ctx.fillRect(0, 0, this.W, H)
    }
    const stars = pal.stars * (1 - wet)
    if (stars > 0.05) {
      // one pass per colour; stars never overlap, so the order is free
      for (const bright of [false, true]) {
        ctx.fillStyle = bright ? '#ffffff' : '#c9c3ff'
        for (let i = 0; i < 70; i++) {
          const tw = Math.sin(time * (1 + hash(i, 3) * 3) + i)
          if (tw < 0.2 - stars * 0.6 || (tw > 0.8) !== bright) continue
          ctx.fillRect(Math.floor(hash(i, 1) * this.W), Math.floor(hash(i, 2) * H * 0.5), 1, 1)
        }
      }
    }
  }

  drawClouds(pal, time) {
    const density = Math.max(pal.clouds, this.weather.rain)
    if (density < 0.05) return
    const C = this.clouds
    const f = 0.03
    const off = this.camPX * f + time * 2
    if (C.cursor === null || C.cursor < off - 200) C.cursor = off - 60
    while (C.items.length && C.items[0].u + C.items[0].w - off < -40) this.cache.delete(`cl${C.items.shift().seed}`)
    while (C.cursor - off < this.W + 40) {
      const w = C.rng.int(30, 80), h = C.rng.int(10, 22)
      C.cursor += C.rng.range(30, 140) / density
      C.items.push({ u: C.cursor, w, h, y: C.rng.int(8, Math.round(H * 0.42)), seed: C.rng.int(1, 1e6) })
      C.cursor += w
    }
    for (const it of C.items) {
      if (it.u - off > this.W) break
      const cv = this.sprite(`cl${it.seed}`, pal.version, () => bakeCloud(it.w, it.h, pal, it.seed))
      this.ctx.drawImage(cv, Math.round(it.u - off), it.y)
    }
  }

  drawLayers(pal) {
    for (let li = 0; li < this.layers.length; li++) {
      const L = this.layers[li]
      const off = this.camPX * L.f
      const base = Math.round(H * 0.7 + L.offset + (this.camPY / PPU - 8) * PPU * L.fy)
      if (L.cursor === null || L.cursor < off - 200) L.cursor = off - 40
      // towers that scroll off take their sprites with them, or a long run
      // keeps a canvas for every building it ever passed
      while (L.items.length && L.items[0].u + L.items[0].w - off < -20) this.forgetTower(li, L.items.shift().seed)
      while (L.cursor - off < this.W + 80) {
        const w = L.rng.int(...L.w)
        L.cursor += L.rng.int(...L.gap)
        L.items.push({ u: L.cursor, w, h: L.rng.int(...L.h), seed: L.rng.int(1, 1e6) })
        L.cursor += w
      }
      for (const it of L.items) {
        const key = `L${li}:${it.seed}`
        const job = () => ['tower', [it.w, it.h, li, pal[L.color], pal[L.win], pal, it.seed]]
        const cv = it.u - off <= this.W ? this.now(key, pal.version, job) : this.later(key, pal.version, job)
        it.canvas = cv
        if (it.u - off > this.W) continue
        const x = Math.round(it.u - off)
        this.ctx.drawImage(cv, x, base - it.h)
        if (li > 0 && hash(it.seed, 77) < CITY.holos) this.drawBillboard(it, x, base, li, pal)
      }
      // rain thickens the fog between layers, washing the skyline into haze
      const wet = Math.round(this.weather.rain * 4) / 4
      // while a new density bakes, the last one stays up
      const fogKey = `fog${li}:${wet}`, fogVer = `${pal.version}:${this.W}x${H}`
      const fogJob = () => ['fog', [this.W, H, 70, pal, (CITY.fog + CITY.rainFog * wet) * (1 - li * 0.3)]]
      L.fog = this.later(fogKey, fogVer, fogJob) ?? L.fog ?? this.now(fogKey, fogVer, fogJob)
      this.ctx.drawImage(L.fog, 0, base - 60)
      if (li === 0) this.drawCars(pal)
    }
    // in the rain the whole skyline recedes behind a veil; the course stays crisp
    if (this.weather.rain > 0.02) {
      this.ctx.fillStyle = css(mix(pal.haze, pal.sky[pal.sky.length - 1], 0.4), this.weather.rain * 0.32)
      this.ctx.fillRect(0, 0, this.W, H)
    }
  }

  forgetTower(li, seed) {
    this.cache.delete(`L${li}:${seed}`)
    this.baker.drop((key) => key === `L${li}:${seed}`)
    for (const f of ['halo', 0, 1, 2]) this.cache.delete(`bb${seed}:${f}`)
  }

  // Billboards on skyline towers: on top, hung off a side, or across the face.
  drawBillboard(it, x, base, li, pal) {
    const s = (it.ad ??= specFor(it.seed, li === 2 ? 'near' : 'far'))
    const top = base - it.h
    let ax = x + ((it.w - s.w) >> 1), ay = top - s.h + 2
    if (s.kind === 'board' && s.w > it.w + 16) return                 // too heavy for a slim tower
    if (s.kind === 'holo') ay = top - s.h - 5
    else if (s.kind === 'banner') { ax = hash(it.seed, 80) < 0.5 ? x - 2 : x + it.w - s.w + 2; ay = top + 8 }
    else if (s.kind === 'screen' || s.kind === 'ticker') {
      if (s.w > it.w - 4) return
      ay = top + 6
    }
    this.drawAd(`bb${it.seed}`, s, ax, ay, pal)
  }

  // One billboard of any kind, animated: ads rotate with a top-down refresh,
  // holos spin and flicker, tickers scroll.
  drawAd(key, s, x, y, pal) {
    if (x > this.W || x + s.w < 0 || y > H || y + s.h + 8 < 0) return
    const { ctx } = this
    const t = this.cam.time
    const color = billboardLight(s, pal, t)
    const panelH = s.ph ?? Math.min(s.h, 24)
    // The halo depends on size and ink alone, so signs with the same ink
    // share it. Palette transitions no longer rebuild unchanged lights.
    const haloKey = `light:${s.w}:${panelH}:${color}`
    this.lightKeys.delete(haloKey)
    this.lightKeys.set(haloKey, true)
    if (this.lightKeys.size > 16) {
      const old = this.lightKeys.keys().next().value
      this.lightKeys.delete(old)
      this.cache.delete(old)
      this.baker.drop(key => key === old)
    }
    const halo = this.now(haloKey, 0, () => ['lightHalo', [s.w + 64, panelH + 52, color]])
    const strength = pal.night * (s.place === 'far' || s.place === 'near' ? 0.48 : 0.95) * (0.65 + this.weather.rain * 0.35)
    if (s.place === 'facade' || s.place === 'roof') this.lamps.push({ x: x + s.w / 2, y: y + panelH / 2, w: s.w / 2 + 18, h: panelH / 2 + 24, color })
    drawLightHalo(ctx, halo, x + s.w / 2, y + panelH / 2, strength * (0.95 + 0.05 * Math.sin(t * 1.2 + s.seed)))
    const get = (f) => this.sprite(`${key}:${f}`, pal.version, () => bakeBillboard(s, pal, f))
    const h1 = hash(s.seed, 79)
    // Signs attached to the running building read as fixtures. Keep their
    // panels steady while the distant city carries the animated advertising.
    if (s.place === 'facade') {
      ctx.drawImage(get(0), x, y)
      return
    }
    if (s.kind === 'ticker') { drawTicker(ctx, s, get, x, y, t); return }
    if (s.kind === 'holo') {
      if (hash(Math.floor(t * 12), s.seed) < 0.03) return
      const period = 8, u = (t + h1 * period) % period
      const frame = Math.floor((t + h1 * period) / period) & 1
      const cv = get(frame)
      const spin = u < 1.2 ? Math.abs(Math.cos((u / 1.2) * Math.PI)) : 1
      const dw = Math.max(1, Math.round(s.w * spin))
      const c = inks(s.ads[frame], pal)
      // emitter and light cone
      ctx.fillStyle = css(mix(pal.shadow, [46, 44, 60], 0.5))
      ctx.fillRect(x + (s.w >> 1) - 3, y + s.h + 3, 7, 2)
      ctx.fillStyle = css(c.hue, 0.12)
      for (let i = 0; i < 4; i++) ctx.fillRect(x + (s.w >> 1) - 1 - i * 3, y + s.h + 2 - i, 3 + i * 6, 1)
      ctx.globalAlpha = 0.85
      ctx.drawImage(cv, x + ((s.w - dw) >> 1), y, dw, s.h)
      ctx.globalAlpha = 1
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      ctx.fillRect(x + ((s.w - dw) >> 1), y + Math.floor(t * 14) % s.h, dw, 1)
      return
    }
    // Boards, round signs and banners rotate between two ads.
    const period = 12 + hash(s.seed, 78) * 6
    const phase = t / period + h1
    const frame = Math.floor(phase) & 1
    const since = (phase % 1) * period
    const cv = get(frame)
    if (since < 0.3) {
      // refresh: the new ad rolls down over the old one
      const old = get(frame ^ 1)
      const rows = Math.floor((since / 0.3) * cv.height)
      if (rows < old.height) ctx.drawImage(old, 0, rows, old.width, old.height - rows, x, y + rows, old.width, old.height - rows)
      if (rows > 0) ctx.drawImage(cv, 0, 0, cv.width, rows, x, y, cv.width, rows)
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.fillRect(x + 2, y + rows, cv.width - 4, 1)
    } else {
      ctx.drawImage(cv, x, y)
    }
  }

  // Sky traffic between the far and mid skyline.
  drawCars(pal) {
    const f = 0.15
    const off = this.camPX * f
    const dt = Math.min(0.1, this.cam.time - (this.carTime ?? this.cam.time))
    this.carTime = this.cam.time
    const r = this.carRng
    while (this.cars.length < CITY.cars) {
      const dir = r.chance(0.5) ? 1 : -1
      this.cars.push({ u: off + r.range(-60, this.W + 60), y: Math.round(H * r.range(0.14, 0.42)), v: dir * r.range(25, 90), dir, seed: r.int(1, 1e6) })
    }
    for (const c of this.cars) {
      c.u += c.v * dt
      const x = Math.round(c.u - off)
      if (x < -80 || x > this.W + 80) {
        c.u = off + (c.dir > 0 ? -40 : this.W + 40) + r.range(-20, 20)
        continue
      }
      const cv = this.sprite(`car${c.seed}`, pal.version, () => bakeCar(c.dir, pal, c.seed))
      this.ctx.drawImage(cv, x, c.y)
      this.ctx.fillStyle = 'rgba(255,60,60,0.35)'
      this.ctx.fillRect(c.dir > 0 ? x - 6 : x + 9, c.y + 1, 6, 1)
    }
  }

  drawCourse(pal, s) {
    const { ctx } = this
    const level = s.level
    const left = this.cam.x - this.W / 2 / PPU - 4
    const right = this.cam.x + this.W / 2 / PPU + 4
    const ver = pal.version
    const visible = []
    for (const c of level.chunksIn(left, right)) {
      const v = this.views.get(c)
      if (v) visible.push([c, v])
    }
    // the next screen of buildings bakes in the background before it shows
    if (this.baker.ready && this.budget !== Infinity) {
      for (const c of level.chunksIn(right, right + this.W / PPU)) {
        const v = this.views.get(c)
        if (!v) continue
        this.later(`c${c.id}:b`, ver, () => this.facadeJob(c, v, pal))
        for (const e of c.extras) if (e.type === 'wallrunWall') this.later(`c${c.id}:wall`, ver, () => this.wallJob(c, e, pal))
        if (this.hide.course || !c.solids.some((sd) => sd.kind === 'beam')) continue
        const lights = this.chunkLights(c, v, pal)
        for (const sd of c.solids) {
          if (sd.kind !== 'beam') continue
          const pipe = this.pipeOf(c, sd, pal, lights)
          this.later(`c${c.id}:p${sd.id}`, pipe.version, pipe.back)
          this.later(`c${c.id}:pf${sd.id}`, pipe.version, pipe.front)
        }
      }
    }
    // wall-run walls behind the gap
    for (const [c] of visible) {
      for (const e of c.extras) {
        if (e.type !== 'wallrunWall') continue
        const cv = this.now(`c${c.id}:wall`, ver, () => this.wallJob(c, e, pal))
        ctx.drawImage(cv, this.sx(e.x0), this.sy(e.top) - 6)
      }
    }
    // zipline poles behind everything in the lane
    ctx.fillStyle = css(mix(pal.shadow, [20, 20, 30], 0.4))
    for (const [c] of visible) {
      for (const z of c.ziplines) {
        for (const [x, top, base] of [[z.ax, z.ay, c.roof], [z.bx, z.by, c.roof + c.gap.dh]]) {
          const px = this.sx(x)
          ctx.fillRect(px - 1, this.sy(top) - 3, 2, this.sy(base) - this.sy(top) + 3)
          ctx.fillRect(px - 3, this.sy(top) - 3, 6, 2)
        }
      }
    }
    // buildings, then what stands on them
    for (const [c, v] of visible) {
      const w = Math.round((c.x1 - c.x0) * PPU)
      const cv = this.now(`c${c.id}:b`, ver, () => this.facadeJob(c, v, pal))
      ctx.drawImage(cv, this.sx(c.x0), this.sy(c.roof) - v.roofH)
      const lights = (v.lights = this.chunkLights(c, v, pal))
      drawRoofSurface(ctx, { x: this.sx(c.x0), y: this.sy(c.roof), w, depth: v.roofH, seed: c.seed, pal, wet: this.weather.wet, rain: this.weather.rain, time: this.cam.time, lights })
    }
    // advertising on the facades, and billboards standing on the roofs
    const t = this.cam.time
    for (const [c, v] of visible) {
      const x0 = this.sx(c.x0), top = this.sy(c.roof) - v.roofH
      v.signs.forEach((sg, i) => this.drawAd(`c${c.id}:a${i}`, sg.spec, x0 + sg.dx, top + sg.dy, pal))
      if (v.roofAd) {
        const ad = v.roofAd.spec, ax = x0 + v.roofAd.dx, ay = top - ad.h + 3
        this.drawAd(`c${c.id}:r`, ad, ax, ay, pal)
        // boards at the back of the roof stand right behind the runner: a
        // veil of haze keeps them lit but behind the lane
        if (!this.classic) {
          this.ctx.fillStyle = css(pal.haze, 0.3)
          this.ctx.fillRect(ax, ay, ad.w, ad.h)
        }
      }
    }
    this.shadeFacades(visible, pal)
    this.beams = []
    for (const [c, v] of visible) {
      const depth = Math.max(4, c.depth - 6)
      for (const d of this.hide.decor ? [] : v.decor) {
        const bucket = Math.floor(d.v * 8) / 8
        const material = equipmentLight(pal, this.sx(d.x), v.lights)
        const cv = this.sprite(`c${c.id}:d:${d.x}:${d.type}:${bucket}`, `${ver}:${material.light}`, () => this.classic ? recede(bakeDecor(d.type, bucket, material, { classic: true }), pal.mid, 0.32) : recede(bakeDecor(d.type, bucket, material), mix(pal.mid, pal.haze, 0.5), DECOR_RECEDE))
        const back = clamp((-d.z - 4) / depth, 0, 1)
        const bx = this.sx(d.x) - (cv.width >> 1)
        const by = this.sy(c.roof) - Math.round(back * (v.roofH - 3)) - cv.height
        if (bx > this.W || bx + cv.width < 0) continue
        drawContactShadow(ctx, bx + 2, by + cv.height, cv.width - 4, pal, 2)
        ctx.drawImage(cv, bx, by)
        if (['vents', 'ac'].includes(d.type) && hash(c.seed, Math.floor(d.x * PPU), 52) < 0.4) drawSteam(ctx, bx + cv.width / 2, by + 2, c.seed + Math.floor(d.x), this.cam.time, pal)
        if (d.type === 'antenna' && Math.sin(this.cam.time * 3 + d.x) > 0.4) {
          ctx.fillStyle = css(ACCENT)
          ctx.fillRect(bx + 5, by - 1, 3, 3)
        }
      }
      if (this.hide.course) continue
      // overhead pipes: the whole pipe (up out of the roof, across, down or
      // into its vent) goes down first; the run over the lane is redrawn in
      // front of the runner later
      for (const sd of c.solids) {
        if (sd.kind !== 'beam') continue
        const pipe = this.pipeOf(c, sd, pal, v.lights)
        const f = pipeFrame('beam', pipe.w, pipe.h, pipe.drop, sd.id)
        const cv = this.now(`c${c.id}:p${sd.id}`, pipe.version, pipe.back)
        const x = this.sx(sd.x0) - f.ox, y = this.sy(sd.y1) - f.oy
        drawContactShadow(ctx, this.sx(sd.x0), this.sy(c.roof), pipe.w, pal)
        ctx.drawImage(cv, x, y)
        const front = this.now(`c${c.id}:pf${sd.id}`, pipe.version, pipe.front)
        this.beams.push({ cv: front, x, y })
      }
      for (const sd of c.solids) {
        if (sd.kind === 'roof') continue
        const w = Math.max(2, Math.round((sd.x1 - sd.x0) * PPU))
        const h = Math.max(2, Math.round((sd.y1 - sd.y0) * PPU))
        if (sd.kind === 'beam') continue
        const material = equipmentLight(pal, this.sx(sd.x0) + w / 2, v.lights)
        const cv = this.sprite(`c${c.id}:o${sd.id}`, `${ver}:${material.light}`, () => bakeObstacle(sd.sub, w, h, material, sd.id))
        const lip = lipOf(sd.sub)
        const ox = this.sx(sd.x0), oy = this.sy(sd.y1) - lip
        // A contact shadow seats equipment on the roof.
        drawContactShadow(ctx, ox, this.sy(c.roof), w, pal)
        ctx.drawImage(cv, ox - 1, oy - 1)
      }
      for (const e of c.extras) {
        if (e.type !== 'ledge') continue
        ctx.fillStyle = css(ACCENT)
        ctx.fillRect(this.sx(e.x), this.sy(e.y), 5, 2)
      }
      for (const q of c.pads ?? []) this.drawPad(q, s.p, t)
    }
    if (this.hide.course) return
    // live fences across the roof
    for (const [c, v] of visible) for (const f of c.fences ?? []) this.drawFence(f, t, pal, v.roofH - 3)
    // zip cables
    for (const [c] of visible) {
      for (const z of c.ziplines) {
        const x0 = this.sx(z.ax), y0 = this.sy(z.ay), x1 = this.sx(z.bx), y1 = this.sy(z.by)
        const n = Math.max(1, x1 - x0)
        const at = (i) => Math.round(y0 + (y1 - y0) * (i / n))
        if (this.classic) {
          ctx.fillStyle = css(ACCENT)
          for (let i = 0; i <= n; i++) {
            const x = x0 + i
            if (x < -2 || x > this.W + 2) continue
            ctx.fillRect(x, at(i), 1, 1)
          }
          continue
        }
        // One pixel of red reads as a scratch at speed: the cable gets a
        // dark underside, light running down it toward the far end, and a
        // glow while it's the next thing in the runner's path.
        const ahead = (z.ax - s.p.x) / Math.max(6, s.p.speed)
        const near = s.mode !== 'title' && s.p.x < z.bx - 2 && ahead < 1.6
        const pulse = near ? 0.5 + 0.5 * Math.sin(t * 12) : 0
        // Drawn in layers, one rect per stretch of cable at the same height:
        // the columns don't overlap, so this paints the same pixels as going
        // pixel by pixel, for a few calls instead of hundreds.
        const i0 = Math.max(0, -2 - x0), i1 = Math.min(n, this.W + 2 - x0)
        if (i1 < i0) continue
        const spans = (dy, h) => {
          for (let i = i0; i <= i1;) {
            const y = at(i)
            let j = i + 1
            while (j <= i1 && at(j) === y) j++
            ctx.fillRect(x0 + i, y + dy, j - i, h)
            i = j
          }
        }
        if (near) { ctx.fillStyle = css(ACCENT, 0.12 + 0.12 * pulse); spans(-2, 5) }
        ctx.fillStyle = ZIP_UNDER
        spans(1, 1)
        ctx.fillStyle = ZIP_CABLE
        spans(0, 1)
        // light running down the cable
        ctx.fillStyle = ZIP_GLINT
        for (let i = i0; i <= i1; i++) {
          if (((i - t * 60) % 26 + 26) % 26 < 3) ctx.fillRect(x0 + i, at(i), 1, 1)
        }
      }
    }
  }

  drawFence(f, t, pal, depth) {
    const x = this.sx(f.x0) + 2, base = this.sy(f.y0), h = base - this.sy(f.y1)
    if (x < -20 || x > this.W + 4) return
    const cv = this.sprite(`fence:${h}:${depth}`, pal.version, () => bakeFence(h, depth, pal))
    this.ctx.drawImage(cv, x - 2, base - cv.height + 1)
    drawFenceLive(this.ctx, x, base, h, depth, t, f.x0)
  }

  // Jump pad at a tall wall's edge: a red plate with chevrons rising off it,
  // white-hot while the runner is on it (that's the moment to jump).
  drawPad(q, p, t) {
    const { ctx } = this
    const x0 = this.sx(q.x0), x1 = this.sx(q.x1), y = this.sy(q.y)
    if (x1 < 0 || x0 > this.W) return
    const on = p.x >= q.x0 && p.x <= q.x1 && Math.abs(p.y - q.y) < 0.05
    const w = x1 - x0
    const hot = on ? '#ffffff' : css(ACCENT)
    // a column of light marks the spot from a distance
    ctx.fillStyle = css(ACCENT, on ? 0.3 : 0.12 + 0.06 * Math.sin(t * 6))
    ctx.fillRect(x0 + 2, y - 34, w - 4, 30)
    ctx.fillStyle = css(ACCENT, on ? 0.2 : 0.08)
    ctx.fillRect(x0 - 1, y - 20, w + 2, 16)
    // the plate: dark steel, lit edge, hazard ticks
    ctx.fillStyle = css(HULL)
    ctx.fillRect(x0 - 2, y - 4, w + 4, 4)
    ctx.fillStyle = hot
    ctx.fillRect(x0 - 1, y - 5, w + 2, 2)
    for (let x = x0 + 1; x < x1 - 1; x += 4) ctx.fillRect(x, y - 2, 2, 1)
    // chevrons drifting up
    const cx = (x0 + x1) >> 1
    for (let i = 0; i < 3; i++) {
      const k = (t * 1.4 + i / 3) % 1
      ctx.globalAlpha = (on ? 1 : 0.8) * (1 - k * 0.8)
      const cy = y - 9 - Math.round(k * 22)
      ctx.fillRect(cx - 5, cy + 3, 2, 2); ctx.fillRect(cx - 3, cy + 1, 2, 2); ctx.fillRect(cx - 1, cy - 1, 2, 2)
      ctx.fillRect(cx + 1, cy + 1, 2, 2); ctx.fillRect(cx + 3, cy + 3, 2, 2)
    }
    ctx.globalAlpha = 1
  }


  // Checkpoint pylons and the finish gate, standing at the front edge of the roof.
  drawGates(s, pal) {
    const { ctx } = this
    const left = this.cam.x - this.W / 2 / PPU - 4, right = this.cam.x + this.W / 2 / PPU + 4
    const t = this.cam.time
    for (const c of s.level.chunksIn(left, right)) {
      const gate = c.checkpoint || c.finish
      if (!gate) continue
      const finish = !!c.finish
      const passed = !finish && c.checkpoint.index <= this.passed
      const key = finish ? 'gate:finish' : `gate:${passed ? 'on' : 'off'}`
      const cv = this.sprite(key, pal.version, () => bakeGate(finish, passed))
      const x = this.sx(gate.x), y = this.sy(gate.y)
      // light column
      const col = finish ? [255, 47, 160] : passed ? [93, 255, 138] : [41, 243, 255]
      ctx.fillStyle = css(col)
      const h = 64 + Math.round(Math.sin(t * 3) * 3)
      for (let yy = 0; yy < h; yy++) {
        for (let xx = -2; xx <= 2; xx++) {
          if (dither(x + xx, y - yy + Math.floor(t * 20), (1 - yy / h) * (xx === 0 ? 0.9 : 0.35))) ctx.fillRect(x + xx, y - yy, 1, 1)
        }
      }
      ctx.drawImage(cv, x - (cv.width >> 1), y - cv.height)
    }
  }

  // Heist layer behind the runner: data shards, security drones, wrecks,
  // and the light laser grids throw on the roof.
  drawHeist(s, pal) {
    const { ctx } = this
    const left = this.cam.x - this.W / 2 / PPU - 4, right = this.cam.x + this.W / 2 / PPU + 4
    const t = this.cam.time
    for (const c of s.level.chunksIn(left, right)) {
      if (!c.shards) continue
      const floor = this.sy(c.roof)
      for (const l of c.lasers) {
        const x0 = this.sx(l.x0), x1 = this.sx(l.x1)
        if (x1 < -8 || x0 > this.W + 8) continue
        drawLaserSpill(ctx, x0, x1, this.sy((l.y0 + l.y1) / 2), floor, t, { tripped: l.tripped, seed: l.x0 })
      }
      for (const d of c.drones) {
        if (d.down) continue
        const x = this.sx(d.x)
        if (x < -30 || x > this.W + 30) continue
        drawDrone(ctx, x, this.sy(d.y), floor, t, { seed: d.x, alarm: d.spotted, cleared: d.passed && !d.spotted })
      }
      for (const sh of c.shards) {
        if (sh.taken) continue
        const x = this.sx(sh.x)
        if (x < -6 || x > this.W + 6) continue
        drawShard(ctx, x, this.sy(sh.y), t, sh.x)
      }
    }
    // shot-down drones tumble into the street
    this.wrecks = this.wrecks.filter((w) => {
      w.life -= s.dt
      w.vy -= 30 * s.dt
      w.x += w.vx * s.dt
      w.y += w.vy * s.dt
      const x = this.sx(w.x), y = this.sy(w.y)
      if (w.life <= 0 || y > H + 10) return false
      drawWreck(ctx, x, y, w.life)
      if (Math.random() < 0.5) this.particles.push({ x: w.x, y: w.y, vx: -1 + Math.random() * 2, vy: 1 + Math.random(), life: 0.5, max: 0.5, color: Math.random() < 0.5 ? [255, 200, 90] : [60, 56, 70], size: Math.random() < 0.4 ? 2 : 1 })
      return true
    })
  }

  // Laser grids sit in front of the runner so the beam reads across the body.
  drawLasers(s) {
    const left = this.cam.x - this.W / 2 / PPU - 4, right = this.cam.x + this.W / 2 / PPU + 4
    for (const c of s.level.chunksIn(left, right)) {
      if (!c.lasers) continue
      for (const l of c.lasers) {
        const x0 = this.sx(l.x0), x1 = this.sx(l.x1)
        if (x1 < -8 || x0 > this.W + 8) continue
        drawLaser(this.ctx, x0, x1, this.sy((l.y0 + l.y1) / 2), this.sy(c.roof), this.cam.time, { tripped: l.tripped, seed: l.x0 })
      }
    }
  }

  drawGhost(s) {
    const gst = s.ghost
    if (!gst) return
    const r = this.ghostRunner
    r.update(s.dt, gst, gst.x * PPU, gst.y * PPU, null)
    this.ghostClock -= s.raw
    if (this.ghostClock <= 0 && r.joints) {
      this.ghostClock = 1 / r.style.fps
      this.ghostBuf = tint(r.raster(), [41, 243, 255], this.ghostBuf)
      toCanvas(this.ghostBuf, this.ghostCanvas)
    }
    if (!r.joints) return
    this.ctx.globalAlpha = 0.45
    this.ctx.drawImage(this.ghostCanvas, this.sx(gst.x) - ORIGIN_X, this.sy(gst.y) - ORIGIN_Y)
    this.ctx.globalAlpha = 1
  }

  drawBeams() {
    for (const b of this.beams || []) this.ctx.drawImage(b.cv, b.x, b.y)
  }

  drawBirds(dt, px) {
    for (const b of this.birds) {
      b.t += dt
      if (!b.flying) {
        if (px > b.x - 10 && px < b.x + 4) {
          b.flying = true
          b.vx = b.rng.range(4, 9)
          b.vy = b.rng.range(3, 6)
        }
      } else {
        b.vy += dt * 0.8
        b.x += b.vx * dt
        b.y += b.vy * dt
      }
      const frame = b.flying ? 1 + (Math.floor(b.t * 14) & 1) : 0
      const x = this.sx(b.x), y = this.sy(b.y) - (b.flying ? 0 : b.back + 2)
      if (x < -6 || x > this.W + 6 || y < -6 || y > H) continue
      this.ctx.drawImage(this.birdFrames[frame], x, y)
    }
  }

  // The halo mask, coloured. Recoloured into a second canvas so the mask is
  // only rebuilt when the runner rasterizes.
  haloTint(color) {
    const src = this.haloCanvas, out = this.haloTinted
    // only recolour when the runner re-rasterizes or the district shifts
    const key = css(color)
    if (key === this.haloKey) return out
    this.haloKey = key
    if (out.width !== src.width || out.height !== src.height) { out.width = src.width; out.height = src.height }
    const c = out.getContext('2d')
    c.globalCompositeOperation = 'copy'
    c.drawImage(src, 0, 0)
    c.globalCompositeOperation = 'source-in'
    c.fillStyle = css(color)
    c.fillRect(0, 0, out.width, out.height)
    c.globalCompositeOperation = 'source-over'
    return out
  }

  // The skyline just above the roofline washes toward the haze, so the band
  // the runner moves through is the calmest part of the picture.
  drawLaneHaze(pal) {
    if (this.laneRoof === undefined || this.classic) return
    const y = this.sy(this.laneRoof)
    // the gradient is built once per palette at the origin and moved into place
    const g = this.gradient('lane', pal, 64, css(pal.haze, 0), css(pal.haze, 0.42))
    this.ctx.translate(0, y)
    this.ctx.fillStyle = g
    this.ctx.fillRect(0, -64, this.W, 64)
    this.ctx.translate(0, -y)
  }

  // A vertical gradient from 0 to h, cached per palette.
  gradient(name, pal, h, from, to) {
    this.gradients ??= new Map()
    const hit = this.gradients.get(name)
    if (hit && hit.pal === pal) return hit.g
    const g = this.ctx.createLinearGradient(0, name === 'lane' ? -h : 0, 0, name === 'lane' ? 0 : h)
    g.addColorStop(0, from)
    g.addColorStop(1, to)
    this.gradients.set(name, { pal, g })
    return g
  }

  // Lower floors sink into shadow below the lane, so lit windows and facade
  // ads stay atmosphere instead of pulling the eye off the rooftops. Walls
  // that rise above the runner's roof keep their light until lane level.
  shadeFacades(visible, pal) {
    if (this.classic) return
    const { ctx } = this
    const lane = this.laneRoof === undefined ? -Infinity : this.sy(this.laneRoof)
    const solid = css(pal.shadow, 0.4)
    const grad = this.gradient('facade', pal, 48, css(pal.shadow, 0), solid)
    for (const [c, v] of visible) {
      const x = this.sx(c.x0), w = Math.round((c.x1 - c.x0) * PPU)
      if (x > this.W || x + w < 0) continue
      const top = Math.max(this.sy(c.roof), lane) + 6
      if (top >= H) continue
      ctx.translate(0, top)
      ctx.fillStyle = grad
      ctx.fillRect(x, 0, w, 48)
      ctx.translate(0, -top)
      ctx.fillStyle = solid
      ctx.fillRect(x, top + 48, w, H - top - 48)
    }
  }

  drawRunner(s, pal) {
    const { ctx } = this
    const r = this.runner
    if (s.mode !== 'paused') {
      this.rasterClock -= s.raw
      if (this.rasterClock <= 0 || !r.joints) {
        this.rasterClock = 1 / r.style.fps
        if (r.joints) {
          const buf = r.raster()
          toCanvas(buf, this.runnerCanvas)
          this.haloBuf = halo(buf, this.haloBuf)
          toCanvas(this.haloBuf, this.haloCanvas)
          this.haloKey = null
          this.lastBuf = buf
        }
      }
    }
    if (!r.joints || this.hide.runner) return
    const roof = s.level.roofAt(s.rx)
    const chunk = s.level.chunks.find((c) => s.rx >= c.x0 && s.rx <= c.x1)
    if (roof !== null) drawRunnerContact(ctx, { x: this.sx(s.rx), y: this.sy(s.ry), floor: this.sy(roof), pal, joints: r.joints, span: chunk && [this.sx(chunk.x0), this.sx(chunk.x1)] })
    const x = this.sx(s.rx) - ORIGIN_X
    const y = this.sy(s.ry) - ORIGIN_Y
    // afterimages at speed and in focus
    const streak = (s.p.speed > 14 && s.mode === 'run') || s.focusVis > 0.3
    this.afterClock -= s.raw
    if (streak && this.afterClock <= 0 && this.lastBuf) {
      this.afterClock = 0.045
      const cv = this.afterPool[this.afterIndex++ % this.afterPool.length]
      this.afterBuf = tint(this.lastBuf, s.focusVis > 0.3 ? [120, 210, 255] : ACCENT, this.afterBuf)
      toCanvas(this.afterBuf, cv)
      this.after.unshift({ cv, wx: s.rx, wy: s.ry })
      if (this.after.length > 3) this.after.pop()
    }
    if (!streak) this.after.length = 0
    this.after.forEach((a, i) => {
      ctx.globalAlpha = 0.32 - i * 0.09
      ctx.drawImage(a.cv, this.sx(a.wx) - ORIGIN_X, this.sy(a.wy) - ORIGIN_Y)
    })
    // a thin halo off the outline keeps the silhouette clear of whatever
    // the city puts behind it: light on dark districts, dark on bright ones
    if (!this.classic) {
      const bright = lum(pal.haze) > 110
      ctx.globalAlpha = bright ? 0.45 : 0.6
      ctx.drawImage(this.haloTint(bright ? pal.shadow : mix(pal.rim, [255, 255, 255], 0.55)), x, y)
      ctx.globalAlpha = 1
    }
    ctx.drawImage(this.runnerCanvas, x, y)
    if (s.p.state === 'zip') {
      ctx.fillStyle = css(mix(pal.shadow, [20, 20, 30], 0.5))
      ctx.fillRect(this.sx(s.rx) - 1, this.sy(s.ry + PHYS.ZIP_HANG) - 1, 4, 3)
    }
    if (s.p.state === 'wallrun' && Math.random() < 0.6) {
      this.particles.push({ x: s.rx - 0.2, y: s.ry + 0.1, vx: -2 - Math.random() * 2, vy: Math.random() * 1.5, life: 0.25, max: 0.25, color: [255, 200, 90], size: 1 })
    }
  }

  drawParticles(dt, pal) {
    const { ctx } = this
    const keep = []
    const dust = css(pal.dust)
    for (const q of this.particles) {
      q.life -= dt
      if (q.life <= 0) continue
      q.x += q.vx * dt
      q.y += q.vy * dt
      q.vx *= 1 - dt * 3
      q.vy = q.vy * (1 - dt * 2) - dt * 2
      const style = q.color ? (q.style ??= css(q.color)) : dust
      ctx.fillStyle = style
      if (q.life / q.max < 0.35 && dither(Math.round(q.x * 7), Math.round(q.y * 7), 0.5)) continue
      ctx.fillRect(this.sx(q.x), this.sy(q.y), q.size, q.size)
      keep.push(q)
    }
    this.particles = keep.length > 400 ? keep.slice(-400) : keep
  }

  drawMist(pal, time) {
    const top = this.sy(-4)
    // asked for every frame, so it's baked before the camera ever drops to it
    const version = `${pal.version}:${this.W}`
    if (top >= H) { this.later('mist', version, () => ['mist', [this.W, pal]]); return }
    const cv = this.now('mist', version, () => ['mist', [this.W, pal]])
    this.ctx.drawImage(cv, 0, top)
    const bottom = top + cv.height
    if (bottom < H) {
      this.ctx.fillStyle = css(pal.lava)
      this.ctx.fillRect(0, bottom, this.W, H - bottom)
    }
    // heat shimmer sparks rising from the lava streets
    this.ctx.fillStyle = css(mix(pal.lava, [255, 230, 160], 0.5))
    for (let i = 0; i < 24; i++) {
      const x = Math.floor((hash(i, 9) * this.W + time * 10 * (0.5 + hash(i, 4))) % this.W)
      const rise = (time * (8 + hash(i, 5) * 10) + hash(i, 6) * 60) % 60
      const y = top + cv.height - rise
      if (y < H && y > top + cv.height * 0.4) this.ctx.fillRect(x, Math.round(y), 1, 1)
    }
  }

  drawWeather(s, pal) {
    const { ctx } = this
    const rain = this.weather.rain
    if (rain < 0.05) { this.drops.length = 0; this.lightning = 0; return }
    const n = Math.floor(160 * rain)
    if (this.drops.length > n) this.drops.length = n
    while (this.drops.length < n) this.drops.push({ x: Math.random() * this.W, y: Math.random() * H, v: 260 + Math.random() * 160, near: Math.random() < 0.3 })
    const drift = -(s.p.speed * PPU * 0.5 + 30)
    // Most drops are nowhere near a sign: those go out in two batches, and
    // only drops inside a lamp's glow get a colour of their own.
    for (const d of this.drops) {
      d.y += d.v * s.dt
      d.x += drift * s.dt * (d.near ? 1.4 : 1)
      if (d.y > H || d.x < -4) { d.y = -4; d.x = Math.random() * (this.W + 60) }
    }
    const lit = []
    for (let pass = 0; pass < 2; pass++) {
      const near = pass === 1
      ctx.fillStyle = near ? DROP_NEAR : DROP_FAR
      for (const d of this.drops) {
        if (d.near !== near) continue
        let color = null
        for (const lamp of this.lamps) {
          if (Math.abs(d.x - lamp.x) >= lamp.w || Math.abs(d.y - lamp.y) >= lamp.h) continue
          const distance = Math.hypot((d.x - lamp.x) / lamp.w, (d.y - lamp.y) / lamp.h)
          if (distance < 1) color = mix(color ?? (near ? DROP_NEAR_RGB : DROP_FAR_RGB), lamp.color, (1 - distance) * pal.night * 0.7)
        }
        if (color) lit.push(d, color)
        else ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, near ? 4 : 3)
      }
    }
    for (let i = 0; i < lit.length; i += 2) {
      const d = lit[i]
      ctx.fillStyle = css(lit[i + 1], d.near ? 0.75 : 0.45)
      ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, d.near ? 4 : 3)
    }
    this.lightningClock -= s.raw
    if (this.lightningClock <= 0 && rain > 0.7) {
      this.lightningClock = 5 + Math.random() * 9
      this.lightning = 0.55
    }
    this.lightning = Math.max(0, this.lightning - s.raw * 3)
  }

  drawSpeedLines(s, pal) {
    const { ctx } = this
    const k = s.mode === 'run' ? s.speedK : 0
    if (k > 0 && Math.random() < k * 0.9) this.lines.push({ x: this.W + 4, y: Math.floor(Math.random() * H * 0.85), len: 8 + Math.random() * 26 })
    ctx.fillStyle = css(pal.light, 0.55)
    const v = s.p.speed * PPU * 2.2
    this.lines = this.lines.filter((l) => {
      l.x -= v * s.raw
      if (l.x + l.len < 0) return false
      ctx.fillRect(Math.round(l.x), l.y, Math.round(l.len), 1)
      return true
    })
  }

  // Signal interference: torn scanlines and a chromatic smear.
  postGlitch(a) {
    const { ctx } = this
    const n = 2 + Math.floor(a * 10)
    for (let i = 0; i < n; i++) {
      const y = Math.floor(Math.random() * H)
      const h = 1 + Math.floor(Math.random() * 10 * a)
      const dx = Math.round((Math.random() - 0.5) * a * 28)
      ctx.drawImage(this.canvas, 0, y, this.W, h, dx, y, this.W, h)
    }
    ctx.fillStyle = `rgba(255,47,160,${0.12 * a})`
    ctx.fillRect(0, Math.floor(Math.random() * H), this.W, 2 + Math.floor(Math.random() * 14 * a))
    ctx.fillStyle = `rgba(41,243,255,${0.12 * a})`
    ctx.fillRect(0, Math.floor(Math.random() * H), this.W, 2 + Math.floor(Math.random() * 14 * a))
  }

  // Focus drains color from everything that isn't runner-vision red.
  postFocus(amount) {
    this.focusFilter ??= new FocusFilter()
    if (this.focusFilter.draw(this.ctx, amount)) return
    const img = this.ctx.getImageData(0, 0, this.W, H)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2]
      if (r > 150 && r > g * 1.6 && r > b * 1.6) continue
      const l = r * 0.3 + g * 0.59 + b * 0.11
      d[i] = r + (l * 0.85 - r) * amount
      d[i + 1] = g + (l * 0.92 - g) * amount
      d[i + 2] = b + (l * 1.15 - b) * amount
    }
    this.ctx.putImageData(img, 0, 0)
  }
}

const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

// One pixel around a sprite's silhouette, as an opaque mask.
function halo(buf, out) {
  if (!out || out.w !== buf.w || out.h !== buf.h) out = new PixelBuffer(buf.w, buf.h)
  else out.data.fill(0)
  const on = pack([255, 255, 255])
  const solid = (x, y) => x >= 0 && y >= 0 && x < buf.w && y < buf.h && buf.data[y * buf.w + x] >>> 24
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      if (solid(x, y)) continue
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) out.data[y * buf.w + x] = on
    }
  }
  return out
}

function tint(buf, color, out) {
  if (!out || out.w !== buf.w || out.h !== buf.h) out = new PixelBuffer(buf.w, buf.h)
  const c = pack(color)
  for (let i = 0; i < buf.data.length; i++) out.data[i] = buf.data[i] >>> 24 ? c : 0
  return out
}

function bakeGate(finish, passed) {
  const b = new PixelBuffer(finish ? 22 : 13, finish ? 74 : 26)
  const post = pack([30, 28, 44]), dark = pack([12, 10, 20])
  if (finish) {
    b.rect(1, 0, 3, 74, post)
    b.rect(18, 0, 3, 74, post)
    for (let y = 2; y < 22; y++) for (let x = 4; x < 18; x++) b.set(x, y, ((x >> 1) + (y >> 1)) & 1 ? dark : pack([245, 245, 250]))
    b.rect(4, 22, 14, 2, pack([255, 47, 160]))
    b.rect(0, 72, 22, 2, dark)
    return b
  }
  const c = pack(passed ? [93, 255, 138] : [41, 243, 255])
  b.rect(5, 6, 3, 18, post)
  b.rect(2, 24, 9, 2, dark)
  // a hovering diamond beacon
  for (let i = 0; i < 4; i++) b.rect(6 - i, i, 1 + i * 2, 1, c)
  for (let i = 0; i < 3; i++) b.rect(4 + i, 4 + i, 5 - i * 2, 1, c)
  b.rect(5, 12, 3, 1, c)
  return b
}
