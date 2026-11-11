import { PixelView } from './view.js'
import { conceptArt, KIT } from './conceptArt.js'
import { paletteAt } from './palette.js'
import { css, hash, mix, pack, PixelBuffer, toCanvas } from './pixels.js'
import { roofDecor } from './roofDecor.js'
import { ADS } from './billboard.js'
import { artSize, artColors, drawArt, drawBig, bigW } from './art.js'
import { PPU } from './sprites.js'
import { FocusFilter } from './focus.js'
import { RunGait, RUN_STRIDE, STANCE } from './runGait.js'
import { RunnerRig, RUN_ORIGIN } from './rig/index.js'
import { FRAME } from './runnerModel.js'

const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt))
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// Same world coordinates and collision geometry, twice the raster resolution.
// The approved artwork is drawn directly, rather than traced into stick sprites.
export class ConceptView extends PixelView {
  constructor() {
    super()
    this.art = conceptArt()
    this.gait = new RunGait()
    this.ghostGait = new RunGait()
    // One rig each for the player and the ghost. The skeleton and its
    // animation are shared by every outfit; the outfit is only its painted parts.
    this.rig = new RunnerRig(this.runnerId)
    this.ghostRig = new RunnerRig(this.runnerId)
    this.backgrounds = new Map()
    this.materials = new Map()
    this.kitCache = new Map()
    // Material tiles are kept at 4x, the sharpest the canvas ever gets.
    this.facadeTiles = [KIT.concrete, KIT.industrial].map(id => {
      const cv = document.createElement('canvas'); cv.width = 420; cv.height = 328
      const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(this.art.kit[id], 0, 0, 420, 328)
      return cv
    })
    this.roofTile = this.paving()
    this.decor = new WeakMap()
    document.body.classList.add('concept-art')
  }

  // Backing pixels per logical pixel. The artwork is far larger than the
  // 270-line logical screen, so at full quality the canvas is as sharp as
  // the display it is shown on (up to 4x) instead of a fixed 2x that the
  // browser then stretches. Lower quality levels stay at 2x.
  resolution() {
    if (this.quality > 0) return 2
    const shown = parseFloat(this.canvas.style.width) / this.W || 2
    return clamp(Math.ceil(shown * (window.devicePixelRatio || 1) - 0.05), 2, 4)
  }

  resize() {
    super.resize()
    this.logicalH = this.canvas.height
    this.res = this.resolution(); this.resQuality = this.quality
    this.canvas.width = this.W * this.res; this.canvas.height = this.logicalH * this.res
    this.ctx.imageSmoothingEnabled = false
    this.ctx.setTransform(this.res, 0, 0, this.res, 0, 0)
    if (this.materials) { for (const cv of this.materials.values()) cv.width = cv.height = 0; this.materials.clear() }
    if (this.backgrounds) { for (const cv of this.backgrounds.values()) cv.width = cv.height = 0; this.backgrounds.clear() }
    if (this.kitCache) { for (const cv of this.kitCache.values()) cv.width = cv.height = 0; this.kitCache.clear() }
  }

  snap(x, y) { super.snap(x, y); this.cam.x = x + this.W * 0.18 / PPU; this.cam.y = y + 3.8 }
  crossfade() { this.stale = true }
  setRunner(id) {
    super.setRunner(id)
    this.rig?.setSkin(id); this.ghostRig?.setSkin(id)
  }

  bind(level) {
    this.gait?.reset(); this.ghostGait?.reset(); this.rig?.reset(); this.ghostRig?.reset()
    if (this.materials) { for (const cv of this.materials.values()) cv.width = cv.height = 0; this.materials.clear() }
    super.bind(level)
  }

  updateCamera(dt, s) {
    const c = this.cam
    c.time += dt
    c.trauma = Math.max(0, c.trauma - dt * 1.8)
    const ahead = s.level.roofAt(s.rx + 8)
    const ty = Math.max(s.ry + 3.8 + (ahead === null ? 0 : clamp(ahead - s.ry, -3, 3) * 0.2), c.floor)
    c.x = damp(c.x, s.rx + this.W * 0.18 / PPU, 8, dt)
    c.y = damp(c.y, ty, 4, dt)
    const shake = c.trauma * c.trauma * 2
    this.camPX = Math.round(c.x * PPU + Math.sin(c.time * 53) * shake)
    this.camPY = Math.round(c.y * PPU + Math.sin(c.time * 71) * shake)
  }

  frame(s) {
    const pal = paletteAt(s.paletteD ?? s.distance), ctx = this.ctx
    if (this.quality !== this.resQuality) this.resize()
    const res = this.res
    this.pal = pal; this.stale = false; this.budget = 2
    ctx.setTransform(res, 0, 0, res, 0, 0)
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
    if (s.mode !== 'paused') {
      // The visible contact and its sound share one distance-driven clock.
      this.stepPoint = { x: s.rx, y: s.ry, speed: s.p.speed }
      const contact = this.gait.update(s.p, s.rx, s.dt, s.idle)
      if (contact !== null) {
        this.onStep?.('run')
        this.water.splash(s.rx + RUN_STRIDE * STANCE / 2, s.ry, s.p.speed, this.weather.wet)
      }
      if (s.p.state !== 'run' || s.idle) this.runner.update(s.dt, s.p, s.rx * PPU, s.ry * PPU, s.idle ? 'idle' : null)
      if (s.ghost) this.ghostGait.update(s.ghost, s.ghost.x, s.dt)
      else this.ghostGait.reset()
      this.updateCamera(s.raw, s)
      this.updateWeather(s.raw, pal)
    }
    this.drawBackdrop(pal)
    this.drawConceptCourse(s, pal)
    this.drawConceptSecurity(s)
    this.drawGates(s, pal)
    if (s.ghost) {
      ctx.save(); ctx.globalAlpha = 0.4
      this.drawActor(s.ghost, this.sx(s.ghost.x), this.sy(s.ghost.y), s.time, false, true, this.ghostGait.phase)
      ctx.restore()
    }
    if (!this.hide.runner) this.drawActor(s.p, this.sx(s.rx), this.sy(s.ry), this.cam.time, s.idle, false, this.gait.phase)
    this.effects.update(s.dt, s.p, s.rx, s.ry)
    this.effects.draw(ctx, x => this.sx(x), y => this.sy(y))
    this.drawLandCue(s)
    this.drawLasers(s)
    this.drawParticles(s.dt, pal)
    this.drawPopups(s.raw)
    this.drawConceptRain(s, pal)
    if (s.focusVis > 0.02) {
      ctx.fillStyle = css([18, 65, 87], s.focusVis * 0.15); ctx.fillRect(0, 0, this.W, this.logicalH)
      ctx.fillStyle = css([80, 240, 255], s.focusVis * 0.5)
      ctx.fillRect(0, 0, this.W, 1); ctx.fillRect(0, this.logicalH - 1, this.W, 1)
    }
    this.glitchAmt = Math.max(0, this.glitchAmt - s.raw * 2.2)
    if (this.glitchAmt > 0.02) {
      ctx.fillStyle = css([255, 47, 160], this.glitchAmt * 0.35)
      for (let i = 0; i < 4; i++) ctx.fillRect(hash(i, Math.floor(s.time * 18)) * this.W, hash(i, 17) * this.logicalH, 40, 2)
    }
    if (s.flash > 0) { ctx.fillStyle = css([255, 255, 255], Math.min(0.9, s.flash)); ctx.fillRect(0, 0, this.W, this.logicalH) }
    if (s.fade > 0) { ctx.fillStyle = css([8, 6, 16], s.fade); ctx.fillRect(0, 0, this.W, this.logicalH) }
    if (s.focusVis > 0.02) {
      this.focusFilter ??= new FocusFilter()
      if (!this.focusFilter.draw(ctx, s.focusVis, { present: true })) this.focusFilter.hide()
    } else this.focusFilter?.hide()
  }

  drawBackdrop(pal) {
    const ctx = this.ctx, H = this.logicalH
    let bg = this.backgrounds.get(pal.name)
    if (!bg) {
      bg = document.createElement('canvas'); bg.width = H * 4; bg.height = H * 2
      const c = bg.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(this.art.backgrounds.get(pal.name) || this.art.skyline, 0, 0, bg.width, bg.height)
      const fog = c.createLinearGradient(0, H * 0.38 * 2, 0, H * 0.82 * 2)
      fog.addColorStop(0, css(pal.haze, 0)); fog.addColorStop(0.65, css(pal.haze, 0.26)); fog.addColorStop(1, css(pal.shadow, 0.15))
      c.fillStyle = fog; c.fillRect(0, 0, bg.width, bg.height)
      this.backgrounds.set(pal.name, bg)
    }
    const w = H * 2, offset = ((this.cam.x * PPU * 0.1) % w + w) % w
    for (let i = -1; i < Math.ceil(this.W / w) + 1; i++) {
      const x = i * w - offset
      // Alternating mirrored repeats keep the skyline continuous at its edges.
      const segment = Math.floor(this.cam.x * PPU * 0.1 / w) + i
      if (segment & 1) { ctx.setTransform(-this.res, 0, 0, this.res, (x + w) * this.res, 0); ctx.drawImage(bg, 0, 0, w, H); ctx.setTransform(this.res, 0, 0, this.res, 0, 0) }
      else ctx.drawImage(bg, x, 0, w, H)
    }
    if (pal.moon) {
      const x = this.W * 0.82, y = H * 0.16, r = 10
      ctx.fillStyle = pal.name === 'Blackout' ? '#f37769' : '#d3e9ea'
      for (let dy = -r; dy <= r; dy++) { const half = Math.floor(Math.sqrt(r * r - dy * dy)); ctx.fillRect(Math.round(x - half), Math.round(y + dy), half * 2, 1) }
      ctx.fillStyle = pal.name === 'Blackout' ? '#b25157' : '#a4bdcd'
      ctx.fillRect(Math.round(x - 5), Math.round(y - 2), 5, 3); ctx.fillRect(Math.round(x + 2), Math.round(y + 4), 3, 2)
    }
  }

  // The roof study's paving, without the coloured reflections painted into
  // it. Those were the same pink and amber streaks on every roof, under no
  // light at all; reflections are now cast by the lights that are there.
  paving() {
    const roof = this.art.kit[KIT.roof], sy = Math.floor(roof.height * 0.64), sh = roof.height - sy
    const cv = document.createElement('canvas'); cv.width = 380; cv.height = 52
    const c = cv.getContext('2d', { willReadFrequently: true }); c.imageSmoothingEnabled = false
    c.drawImage(roof, 0, sy, roof.width, sh, 0, 0, 380, 52)
    const image = c.getImageData(0, 0, 380, 52), d = image.data
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2], max = Math.max(r, g, b), min = Math.min(r, g, b)
      if (max - min < 46) continue
      // Keep the shading, drop the colour: a lit streak becomes plain stone.
      const l = Math.min(118, (max + min) / 2 * 0.8 + 18)
      d[i] = l * 0.93; d[i + 1] = l * 0.86; d[i + 2] = l * 1.08
    }
    c.putImageData(image, 0, 0)
    return cv
  }

  // A light's reflection on the roof under it: a streak of its own colour,
  // broken where the paving is rough, strong on a wet roof and faint on a
  // dry one. Painted into `overlay`, the roof's one-pixel-per-unit light layer.
  reflect(overlay, seed, x, w, color, strength) {
    if (strength < 0.02) return
    for (let i = 0; i < w; i++) {
      const edge = Math.min(1, Math.min(i, w - 1 - i) / (w * 0.28) + 0.15)
      const column = (0.35 + 0.65 * hash(seed, Math.floor((x + i) / 2), 91)) * edge * strength
      for (let row = 1; row < 12; row++) {
        if (hash(seed, x + i, 92 + row) < 0.22) continue
        overlay.add(x + i, row, color, column * (1 - row / 15))
      }
    }
  }

  // One advert on the painted billboard frame: a mascot and a brand name in
  // the billboard's own light colour.
  billboard(item, pal) {
    const key = `ad:${item.ad}:${item.color.join()}:${item.w}:${item.h}`
    let im = this.kitCache.get(key)
    if (im) return im
    const res = this.res, ad = ADS[item.ad % ADS.length]
    im = document.createElement('canvas'); im.width = item.w * res; im.height = item.h * res
    const c = im.getContext('2d'); this.shrink(c, this.art.kit[KIT.sign], im.width, im.height)
    // The panel inside the painted frame.
    const px = Math.round(item.w * 0.15), py = Math.round(item.h * 0.235), pw = Math.round(item.w * 0.77), ph = Math.round(item.h * 0.475)
    c.setTransform(res, 0, 0, res, 0, 0)
    c.fillStyle = css(mix([18, 12, 24], item.color, 0.1)); c.fillRect(px, py, pw, ph)
    const b = new PixelBuffer(pw, ph), ink = pack(item.color), dim = pack(mix(item.color, [14, 10, 22], 0.6))
    const lines = ad.brand.split(' '), textW = Math.max(...lines.map(bigW))
    const art = ad.art, [aw, ah] = art ? artSize(art) : [0, 0]
    const beside = art && aw + 3 + textW <= pw - 2 && ah <= ph - 2
    if (art && (beside || ah + 9 <= ph)) {
      const ax = beside ? Math.max(1, Math.floor((pw - aw - 3 - textW) / 2)) : Math.floor((pw - aw) / 2)
      drawArt(b, art, ax, beside ? Math.floor((ph - ah) / 2) : 1, artColors(item.color, pal, [60, 40, 90]))
    }
    const tx = beside ? Math.floor((pw - aw - 3 - textW) / 2) + aw + 3 : 0, tw = beside ? textW : pw
    const top = beside ? Math.floor((ph - lines.length * 9 + 2) / 2) : ph - (art ? 8 : Math.floor((ph + lines.length * 9) / 2))
    const shown = beside || !art ? lines : [lines[0]]
    shown.forEach((line, n) => { if (bigW(line) <= pw) drawBig(b, line, tx + Math.floor((tw - bigW(line)) / 2), top + n * 9, ink, dim) })
    c.imageSmoothingEnabled = false; c.drawImage(toCanvas(b), px, py)
    // Light spilling off the panel onto its frame.
    c.globalCompositeOperation = 'source-atop'; c.fillStyle = css(item.color, 0.12); c.fillRect(0, 0, item.w, item.h)
    this.cacheKit(key, im)
    return im
  }

  cacheKit(key, im) {
    if (this.kitCache.size >= 160) { const oldest = this.kitCache.keys().next().value; const old = this.kitCache.get(oldest); old.width = old.height = 0; this.kitCache.delete(oldest) }
    this.kitCache.set(key, im)
  }

  decorFor(c, w) {
    let items = this.decor.get(c)
    if (!items) { items = roofDecor(c.seed, w, ADS.length); this.decor.set(c, items) }
    return items
  }

  // Reduce artwork onto `c`. At 2x the source's own pixels are sampled
  // directly, as before; above that there is room to filter properly, in
  // halving steps so every source pixel contributes.
  shrink(c, image, w, h) {
    if (this.res < 3) { c.imageSmoothingEnabled = false; c.drawImage(image, 0, 0, w, h); return }
    let src = image
    while (src.width > w * 2 && src.height > h * 2) {
      const half = document.createElement('canvas'); half.width = Math.ceil(src.width / 2); half.height = Math.ceil(src.height / 2)
      const hc = half.getContext('2d'); hc.imageSmoothingQuality = 'high'; hc.drawImage(src, 0, 0, half.width, half.height)
      src = half
    }
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(src, 0, 0, w, h)
  }

  // shade: 0..2 weathers the prop a little darker; flip mirrors it.
  kit(id, x, y, w, h, shade = 0, flip = false) {
    const n = typeof id === 'string' ? KIT[id] : id
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h))
    const key = `${n}:${w}:${h}:${shade}`
    let im = this.kitCache.get(key)
    if (!im) {
      im = document.createElement('canvas'); im.width = w * this.res; im.height = h * this.res
      const c = im.getContext('2d'); this.shrink(c, this.art.kit[n], im.width, im.height)
      if (shade) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = shade === 1 ? '#0a061838' : '#2a140a30'; c.fillRect(0, 0, im.width, im.height) }
      this.cacheKit(key, im)
    }
    this.blit(im, x, y, w, h, flip)
  }

  blit(im, x, y, w, h, flip = false) {
    const ctx = this.ctx, res = this.res
    x = Math.round(x); y = Math.round(y)
    if (!flip) { ctx.drawImage(im, x, y, w, h); return }
    ctx.setTransform(-res, 0, 0, res, (x + w) * res, y * res); ctx.drawImage(im, 0, 0, w, h); ctx.setTransform(res, 0, 0, res, 0, 0)
  }

  building(c, pal) {
    const key = `${c.id}:${pal.name}:${Math.round(this.weather.wet * 3)}`
    let cv = this.materials.get(key)
    if (cv) return cv
    for (const [old, image] of this.materials) if (old.startsWith(`${c.id}:`)) { image.width = image.height = 0; this.materials.delete(old) }
    // Each facade is cached once, and released after its chunk leaves view.
    const w = Math.max(1, Math.round((c.x1 - c.x0) * PPU)), h = Math.min(440, this.logicalH + 60)
    cv = document.createElement('canvas'); cv.width = w * this.res; cv.height = h * this.res
    const ctx = cv.getContext('2d'); ctx.scale(this.res, this.res); ctx.imageSmoothingEnabled = false
    const im = this.facadeTiles[hash(c.seed, 4) < 0.5 ? 0 : 1]
    ctx.fillStyle = '#1b172a'; ctx.fillRect(0, 0, w, h)
    const tw = 105, th = 82
    for (let y = 0; y < h; y += th) for (let x = 0; x < w; x += tw) ctx.drawImage(im, x, y, tw, th)
    const fade = ctx.createLinearGradient(0, 0, 0, h * 0.65)
    fade.addColorStop(0, '#0b081520'); fade.addColorStop(1, '#090712ef')
    ctx.fillStyle = fade; ctx.fillRect(0, 0, w, h)
    // Paving: each building starts the slab pattern somewhere else and lays
    // alternate slabs mirrored, so no two roofs crack in the same places.
    const start = -Math.floor(hash(c.seed, 61) * 95)
    for (let x = start, n = Math.floor(hash(c.seed, 62) * 2); x < w; x += 95, n++) {
      if (n & 1) { ctx.save(); ctx.translate(x + 95, 0); ctx.scale(-1, 1); ctx.drawImage(this.roofTile, 0, 0, 95, 13); ctx.restore() }
      else ctx.drawImage(this.roofTile, x, 0, 95, 13)
    }
    const wet = this.weather.wet
    if (wet < 0.3) { ctx.fillStyle = css(pal.roof, 0.45); ctx.fillRect(0, 1, w, 11) }
    // Everything laid over the paving goes into one small image, composited
    // in a single draw however many patches and lights the roof has.
    const overlay = new ImageData(w, 13), px = overlay.data
    overlay.add = (ox, oy, color, alpha) => {
      if (ox < 0 || ox >= w || oy < 0 || oy >= 13 || alpha <= 0) return
      const i = (oy * w + ox) * 4, a0 = px[i + 3] / 255, a = alpha + a0 * (1 - alpha)
      for (let k = 0; k < 3; k++) px[i + k] = (color[k] * alpha + px[i + k] * a0 * (1 - alpha)) / a
      px[i + 3] = a * 255
    }
    // Worn patches and standing water, placed per building.
    const sheen = mix(pal.haze, [200, 205, 225], 0.4)
    for (let i = 0, n = Math.floor(w / 70); i < n; i++) {
      const bx = Math.floor(hash(c.seed, i, 63) * w), bw = 10 + Math.floor(hash(c.seed, i, 64) * 26), by = 2 + Math.floor(hash(c.seed, i, 65) * 7)
      const worn = hash(c.seed, i, 66) < 0.5, color = worn ? [11, 8, 26] : sheen, alpha = worn ? 0.25 : 0.05 + wet * 0.12
      for (let k = 0; k < bw; k++) { overlay.add(bx + k, by, color, alpha); overlay.add(bx + k, by + 1, color, alpha); if (k >= 3 && k < bw - 5) overlay.add(bx + k, by + 2, color, alpha) }
    }
    // Reflections come from the lights standing on this roof: each billboard
    // in its own colour, and the warm lamps over it.
    const gloss = 0.16 + wet * 0.6
    for (const item of this.decorFor(c, w)) {
      if (item.id !== 'sign') continue
      this.reflect(overlay, c.seed, item.x + 4, item.w - 8, item.color, gloss)
      this.reflect(overlay, c.seed + 1, item.x + Math.round(item.w * 0.2), 5, [255, 200, 120], gloss * 0.8)
      this.reflect(overlay, c.seed + 2, item.x + Math.round(item.w * 0.68), 5, [255, 200, 120], gloss * 0.8)
    }
    if (pal.moon && wet > 0.2) this.reflect(overlay, c.seed + 3, Math.floor(hash(c.seed, 67) * Math.max(1, w - 30)), 22, [200, 220, 235], wet * 0.16)
    const lit = document.createElement('canvas'); lit.width = w; lit.height = 13
    lit.getContext('2d').putImageData(overlay, 0, 0)
    ctx.drawImage(lit, 0, 0, w, 13); lit.width = lit.height = 0
    ctx.fillStyle = '#120e22'; ctx.fillRect(0, 13, w, 3)
    ctx.fillStyle = '#b5a5c0'; ctx.fillRect(0, 12, w, 1)
    ctx.fillStyle = '#8c7e9d'; ctx.fillRect(0, 0, w, 1)
    for (let x = 0; x < w; x += 32) { ctx.fillStyle = '#1c182b'; ctx.fillRect(x, 13, 1, 3) }
    this.materials.set(key, cv)
    return cv
  }

  drawConceptCourse(s, pal) {
    const ctx = this.ctx, half = this.W / (2 * PPU)
    const visible = s.level.chunksIn(this.cam.x - half - 8, this.cam.x + half + 8)
    const live = new Set(visible.map(c => `${c.id}:`))
    for (const [key, cv] of this.materials) if (![...live].some(prefix => key.startsWith(prefix))) { cv.width = cv.height = 0; this.materials.delete(key) }
    for (const c of visible) {
      const x = this.sx(c.x0), y = this.sy(c.roof), w = Math.round((c.x1 - c.x0) * PPU)
      for (const e of c.extras) if (e.type === 'wallrunWall') {
        const wx = this.sx(e.x0), wy = this.sy(e.top), ww = this.sx(e.x1) - wx
        this.kit('industrial', wx, wy, ww, Math.max(36, y - wy + 70))
      }
      for (const panel of c.wallruns) this.kit('wallrun', this.sx(panel.x0), this.sy(panel.y1), this.sx(panel.x1) - this.sx(panel.x0), this.sy(panel.y0) - this.sy(panel.y1))
      const facade = this.building(c, pal)
      ctx.drawImage(facade, x, y - 13, w, facade.height / this.res)
      if (!this.hide.decor) {
        // Props stand behind the play lane, laid out per building.
        for (const item of this.decorFor(c, w)) {
          const px = x + item.x, top = y - 14 - item.h
          if (px + item.w < -4 || px > this.W + 4) continue
          ctx.fillStyle = '#09061180'; ctx.fillRect(px - 2, y - 14, item.w + 4, 3)
          if (item.id === 'sign') this.blit(this.billboard(item, pal), px, top, item.w, item.h)
          else this.kit(item.id, px, top, item.w, item.h, item.shade, item.flip)
        }
      }
      if (this.hide.course) continue
      for (const sd of c.solids) {
        if (sd.kind === 'roof') continue
        const ox = this.sx(sd.x0), oy = this.sy(sd.y1), ow = Math.max(3, this.sx(sd.x1) - ox), oh = Math.max(3, this.sy(sd.y0) - oy)
        ctx.fillStyle = '#090611a0'; ctx.fillRect(ox - 2, this.sy(sd.y0) - 1, ow + 4, 2)
        if (sd.kind === 'beam') {
          ctx.fillStyle = '#544a60'
          for (const px of [ox + 2, ox + ow - 3]) ctx.fillRect(px, oy + oh, 2, Math.max(1, y - oy - oh))
          const pipe = this.art.kit[KIT.pipe]
          ctx.drawImage(pipe, 0, 0, pipe.width, Math.floor(pipe.height * 0.43), ox - 1, oy - 1, ow + 2, oh + 2)
        }
        else if (sd.kind === 'spring') this.kit('spring', ox - 2, oy - 3, ow + 4, oh + 3)
        else this.kit('crate', ox, oy, ow, oh)
      }
      for (const q of c.pads ?? []) {
        const qx = this.sx(q.x0), qw = this.sx(q.x1) - qx
        this.kit('spring', qx, this.sy(q.y) - 9, qw, 9)
        this.drawPad(q, s.p, this.cam.time)
      }
      for (const e of c.extras) if (e.type === 'ledge') { ctx.fillStyle = '#ff493d'; ctx.fillRect(this.sx(e.x), this.sy(e.y), 5, 2) }
      for (const f of c.fences ?? []) this.drawFence(f, this.cam.time, pal, 9)
      for (const z of c.ziplines) {
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#ff5147'; ctx.beginPath(); ctx.moveTo(this.sx(z.ax), this.sy(z.ay)); ctx.lineTo(this.sx(z.bx), this.sy(z.by)); ctx.stroke()
        ctx.fillStyle = '#62556b'
        ctx.fillRect(this.sx(z.ax) - 1, this.sy(z.ay), 2, Math.max(2, y - this.sy(z.ay)))
      }
    }
  }

  drawConceptSecurity(s) {
    const ctx = this.ctx, half = this.W / (2 * PPU), t = this.cam.time
    for (const c of s.level.chunksIn(this.cam.x - half - 4, this.cam.x + half + 4)) {
      for (const sh of c.shards ?? []) if (!sh.taken) this.kit('shard', this.sx(sh.x) - 4, this.sy(sh.y) - 7 + Math.sin(t * 3 + sh.x), 8, 13)
      for (const d of c.drones ?? []) {
        if (d.down) continue
        const x = this.sx(d.x), bottom = this.sy(d.y) + Math.round(Math.sin(t * 2 + d.x)), floor = this.sy(c.roof)
        const color = d.spotted ? [255, 170, 40] : [255, 47, 160]
        if (!d.passed || d.spotted) {
          // Match the actual scan footprint, rather than suggesting a wider hitbox.
          ctx.fillStyle = css(color, 0.16); ctx.beginPath(); ctx.moveTo(x, bottom); ctx.lineTo(x - 12, floor); ctx.lineTo(x + 12, floor); ctx.closePath(); ctx.fill()
          ctx.fillStyle = css(color, 0.75); ctx.fillRect(x - 11, floor - 1, 22, 1)
        }
        this.kit('drone', x - 18, bottom - 19, 36, 19)
        if (d.spotted) { ctx.fillStyle = '#ffb342'; ctx.fillRect(x - 2, bottom - 7, 4, 3) }
      }
    }
    this.wrecks = this.wrecks.filter(w => { w.life -= s.dt; w.vy -= 30 * s.dt; w.x += w.vx * s.dt; w.y += w.vy * s.dt; if (w.life <= 0) return false; ctx.save(); ctx.globalAlpha = Math.min(1, w.life * 2); this.kit('drone', this.sx(w.x) - 12, this.sy(w.y), 24, 13); ctx.restore(); return true })
  }

  drawActor(p, x, y, time, idle = false, ghost = false, phase = (p.x ?? time * 12) / RUN_STRIDE) {
    const rig = ghost ? this.ghostRig : this.rig, ctx = this.ctx
    rig.update(p, time, phase, idle, p.x ?? 0, p.y ?? 0)
    const im = rig.image()
    ctx.save()
    if (ghost) { ctx.globalAlpha *= 0.5; ctx.filter = 'grayscale(1) sepia(1) hue-rotate(125deg) saturate(4)' }
    // The sprite is drawn at twice the screen's resolution and averaged down
    // onto whole device pixels, so its edges are clean and it does not shimmer.
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
    const res = this.res
    ctx.drawImage(im, Math.round((x - RUN_ORIGIN[0]) * res) / res, Math.round((y - RUN_ORIGIN[1]) * res) / res, FRAME.width / FRAME.scale, FRAME.height / FRAME.scale)
    ctx.restore()
  }

  drawConceptRain(s, pal) {
    const rain = this.weather.rain, ctx = this.ctx, H = this.logicalH
    if (rain < 0.05 || this.quality > 1) return
    ctx.strokeStyle = css(mix(pal.light, [165, 204, 215], 0.5), rain * 0.45); ctx.lineWidth = 0.5
    ctx.beginPath()
    const count = Math.floor(rain * (this.quality === 0 ? 75 : 35))
    for (let i = 0; i < count; i++) {
      const y = (hash(i, 22) * H + this.cam.time * (95 + hash(i, 25) * 90)) % H
      const x = (hash(i, 23) * (this.W + 60) - this.cam.time * 24 % (this.W + 60) + this.W + 60) % (this.W + 60) - 20
      ctx.moveTo(x, y); ctx.lineTo(x - 2, y + 5)
    }
    ctx.stroke()
  }
}
