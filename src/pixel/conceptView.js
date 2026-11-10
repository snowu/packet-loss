import { PixelView } from './view.js'
import { conceptArt, KIT, poseFor } from './conceptArt.js'
import { paletteAt } from './palette.js'
import { css, hash, mix } from './pixels.js'
import { PPU } from './sprites.js'
import { FocusFilter } from './focus.js'

const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt))
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// Same world coordinates and collision geometry, twice the raster resolution.
// The approved artwork is drawn directly, rather than traced into stick sprites.
export class ConceptView extends PixelView {
  constructor() {
    super()
    this.art = conceptArt()
    this.backgrounds = new Map()
    this.materials = new Map()
    this.kitCache = new Map()
    this.facadeTiles = [KIT.concrete, KIT.industrial].map(id => {
      const cv = document.createElement('canvas'); cv.width = 210; cv.height = 164
      const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(this.art.kit[id], 0, 0, 210, 164)
      return cv
    })
    this.roofTile = document.createElement('canvas'); this.roofTile.width = 190; this.roofTile.height = 26
    const roof = this.art.kit[KIT.roof], sy = Math.floor(roof.height * 0.64)
    const roofCtx = this.roofTile.getContext('2d'); roofCtx.imageSmoothingEnabled = false
    roofCtx.drawImage(roof, 0, sy, roof.width, roof.height - sy, 0, 0, 190, 26)
    this.preparedActors = Object.fromEntries(Object.entries(this.art.outfits).map(([name, frames]) => [name, frames.map(im => {
      const cv = document.createElement('canvas')
      const scale = 37 / Math.max(...frames.slice(0, 6).map(c => c.height), frames[15].height)
      cv.width = Math.max(1, Math.round(im.width * scale * 2))
      cv.height = Math.max(1, Math.round(im.height * scale * 2))
      const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(im, 0, 0, cv.width, cv.height)
      return cv
    })]))
    document.body.classList.add('concept-art')
  }

  resize() {
    super.resize()
    this.logicalH = this.canvas.height
    this.canvas.width *= 2; this.canvas.height *= 2
    this.ctx.imageSmoothingEnabled = false
    this.ctx.setTransform(2, 0, 0, 2, 0, 0)
    if (this.materials) { for (const cv of this.materials.values()) cv.width = cv.height = 0; this.materials.clear() }
    if (this.backgrounds) { for (const cv of this.backgrounds.values()) cv.width = cv.height = 0; this.backgrounds.clear() }
  }

  snap(x, y) { super.snap(x, y); this.cam.x = x + this.W * 0.18 / PPU; this.cam.y = y + 3.8 }
  crossfade() { this.stale = true }
  bind(level) {
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
    this.pal = pal; this.stale = false; this.budget = 2
    ctx.setTransform(2, 0, 0, 2, 0, 0)
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
    if (s.mode !== 'paused') {
      // Retain the movement-driven footstep/event hooks, but render the atlas.
      this.stepPoint = { x: s.rx, y: s.ry, speed: s.p.speed }
      this.runner.update(s.dt, s.p, s.rx * PPU, s.ry * PPU, s.idle ? 'idle' : null)
      this.updateCamera(s.raw, s)
      this.updateWeather(s.raw, pal)
    }
    this.drawBackdrop(pal)
    this.drawConceptCourse(s, pal)
    this.drawConceptSecurity(s)
    this.drawGates(s, pal)
    if (s.ghost) {
      ctx.save(); ctx.globalAlpha = 0.4
      this.drawActor(s.ghost, this.sx(s.ghost.x), this.sy(s.ghost.y), s.time, false, true)
      ctx.restore()
    }
    if (!this.hide.runner) this.drawActor(s.p, this.sx(s.rx), this.sy(s.ry), this.cam.time, s.idle)
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
      if (segment & 1) { ctx.setTransform(-2, 0, 0, 2, (x + w) * 2, 0); ctx.drawImage(bg, 0, 0, w, H); ctx.setTransform(2, 0, 0, 2, 0, 0) }
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

  kit(id, x, y, w, h) {
    const n = typeof id === 'string' ? KIT[id] : id
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h))
    const key = `${n}:${w}:${h}`
    let im = this.kitCache.get(key)
    if (!im) {
      im = document.createElement('canvas'); im.width = w * 2; im.height = h * 2
      const c = im.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(this.art.kit[n], 0, 0, im.width, im.height)
      if (this.kitCache.size >= 96) { const oldest = this.kitCache.keys().next().value; const old = this.kitCache.get(oldest); old.width = old.height = 0; this.kitCache.delete(oldest) }
      this.kitCache.set(key, im)
    }
    this.ctx.drawImage(im, Math.round(x), Math.round(y), w, h)
  }

  building(c, pal) {
    const key = `${c.id}:${pal.name}:${Math.round(this.weather.wet * 3)}`
    let cv = this.materials.get(key)
    if (cv) return cv
    for (const [old, image] of this.materials) if (old.startsWith(`${c.id}:`)) { image.width = image.height = 0; this.materials.delete(old) }
    // Each facade is cached once, and released after its chunk leaves view.
    const w = Math.max(1, Math.round((c.x1 - c.x0) * PPU)), h = Math.min(440, this.logicalH + 60)
    cv = document.createElement('canvas'); cv.width = w * 2; cv.height = h * 2
    const ctx = cv.getContext('2d'); ctx.scale(2, 2); ctx.imageSmoothingEnabled = false
    const im = this.facadeTiles[hash(c.seed, 4) < 0.5 ? 0 : 1]
    ctx.fillStyle = '#1b172a'; ctx.fillRect(0, 0, w, h)
    const tw = 105, th = 82
    for (let y = 0; y < h; y += th) for (let x = 0; x < w; x += tw) ctx.drawImage(im, x, y, tw, th)
    const fade = ctx.createLinearGradient(0, 0, 0, h * 0.65)
    fade.addColorStop(0, '#0b081520'); fade.addColorStop(1, '#090712ef')
    ctx.fillStyle = fade; ctx.fillRect(0, 0, w, h)
    // Use only the material surface of the roof study, excluding its scenery.
    for (let x = 0; x < w; x += 95) ctx.drawImage(this.roofTile, x, 0, 95, 13)
    if (this.weather.wet < 0.3) { ctx.fillStyle = css(pal.roof, 0.45); ctx.fillRect(0, 1, w, 11) }
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
      ctx.drawImage(facade, x, y - 13, w, facade.height / 2)
      if (!this.hide.decor) {
        // The curated kit replaces all miniature generated roof equipment.
        // A deterministic sparse arrangement leaves the play lane uncluttered.
        const slots = Math.max(1, Math.floor(w / 135))
        for (let i = 0; i < slots; i++) {
          const px = x + 28 + i * 135 + hash(c.seed, i, 18) * 20
          const variant = i === 0 && w > 175 && hash(c.seed, 21) < 0.6 ? 3 : Math.floor(hash(c.seed, i, 19) * 4)
          const id = ['tank', 'ac', 'vent', 'sign'][variant]
          const [dw, dh] = { tank: [42, 68], ac: [37, 27], vent: [35, 31], sign: [58, 66] }[id]
          if (px + dw > x + w - 6) continue
          ctx.fillStyle = '#09061180'; ctx.fillRect(Math.round(px - 2), y - 14, dw + 4, 3)
          this.kit(id, px, y - 14 - dh, dw, dh)
          if (id === 'sign' && this.weather.wet > 0.15) {
            ctx.fillStyle = css([255, 104, 173], this.weather.wet * 0.28)
            ctx.fillRect(Math.round(px + 8), y - 10, 12, 1); ctx.fillRect(Math.round(px + 28), y - 5, 18, 1)
          }
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

  drawActor(p, x, y, time, idle = false, ghost = false) {
    const index = poseFor(p, time, idle), im = (this.preparedActors[this.runnerId] || this.preparedActors.courier)[index], ctx = this.ctx
    const w = im.width / 2, h = im.height / 2
    ctx.save()
    if (ghost) ctx.globalAlpha *= 0.5
    if (ghost) ctx.filter = 'grayscale(1) sepia(1) hue-rotate(125deg) saturate(4)'
    if (p.state === 'roll') {
      ctx.translate(x, y - h / 2); ctx.rotate((p.t ?? time) * 12)
      ctx.drawImage(im, -w / 2, -h / 2, w, h)
    } else ctx.drawImage(im, Math.round(x - w * (index === 8 ? 0.38 : 0.54)), Math.round(y - h), Math.round(w), Math.round(h))
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
