// A tiny scanline rasterizer that writes material indices, not colours.
// Shapes are drawn layer by layer (far limbs, body, near limbs); each layer
// is outlined against what is already there, so a near arm keeps a crisp
// edge over the torso. Colour only appears at the end, through a palette:
// that is what lets a skin be nothing more than a recolour.
//
// Index byte: bits 0-1 tone (0 base, 1 shade, 2 light), bits 2-6 material,
// bit 7 far side (darker). 0 is empty.
export const TONE = Object.freeze({ base: 0, shade: 1, light: 2 })
export const FAR = 0x80
export const OUTLINE_MAT = 1
export const code = (mat, tone = 0, far = false) => (mat << 2) | tone | (far ? FAR : 0)

// Light from in front and above (model y is down).
const LIGHT = (() => { const l = Math.hypot(0.55, 0.83); return [0.55 / l, -0.83 / l] })()

export class Raster {
  constructor(w, h, scale) {
    this.w = w; this.h = h; this.scale = scale
    this.final = new Uint8Array(w * h)
    this.layer = new Uint8Array(w * h)
    this.ox = 0; this.oy = 0
    this.box = [w, h, -1, -1]
  }

  // Model-space origin, in model units from the top-left of the image.
  begin(origin) {
    this.ox = origin[0] * this.scale; this.oy = origin[1] * this.scale
    this.final.fill(0)
    this.startLayer()
  }

  startLayer() { this.layer.fill(0); this.box = [this.w, this.h, -1, -1] }

  touch(x0, y0, x1, y1) {
    const b = this.box
    b[0] = Math.min(b[0], x0); b[1] = Math.min(b[1], y0); b[2] = Math.max(b[2], x1); b[3] = Math.max(b[3], y1)
  }

  // Pixel centre of (px, py) back in model space.
  bounds(xs, ys, pad) {
    const s = this.scale
    const x0 = Math.max(0, Math.floor(Math.min(...xs) * s + this.ox - pad * s))
    const x1 = Math.min(this.w - 1, Math.ceil(Math.max(...xs) * s + this.ox + pad * s))
    const y0 = Math.max(0, Math.floor(Math.min(...ys) * s + this.oy - pad * s))
    const y1 = Math.min(this.h - 1, Math.ceil(Math.max(...ys) * s + this.oy + pad * s))
    return [x0, y0, x1, y1]
  }

  // Tapered capsule from a (radius ra) to b (radius rb), shaded as a cylinder.
  // `tone` may be a fixed tone instead of lit shading.
  capsule(a, b, ra, rb, mat, far = false, tone = null) {
    const s = this.scale, [x0, y0, x1, y1] = this.bounds([a[0], b[0]], [a[1], b[1]], Math.max(ra, rb) + 0.5)
    const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy || 1e-9
    let hit = false
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const mx = (px + 0.5 - this.ox) / s, my = (py + 0.5 - this.oy) / s
      const t = Math.max(0, Math.min(1, ((mx - a[0]) * dx + (my - a[1]) * dy) / len2))
      const cx = a[0] + dx * t, cy = a[1] + dy * t, r = ra + (rb - ra) * t
      const nx = mx - cx, ny = my - cy, d2 = nx * nx + ny * ny
      if (d2 > r * r) continue
      let tn = tone
      if (tn === null) {
        const d = Math.sqrt(d2) || 1e-9, lit = (nx * LIGHT[0] + ny * LIGHT[1]) / d * Math.min(1, d / r * 1.6)
        tn = lit < -0.42 ? TONE.shade : lit > 0.62 ? TONE.light : TONE.base
      }
      this.layer[py * this.w + px] = code(mat, tn, far); hit = true
    }
    if (hit) this.touch(x0, y0, x1, y1)
  }

  // Filled polygon (even-odd). `toneAt(mx, my)` picks the tone per pixel.
  poly(pts, mat, far = false, toneAt = null) {
    const s = this.scale, [x0, y0, x1, y1] = this.bounds(pts.map(p => p[0]), pts.map(p => p[1]), 0.5)
    let hit = false
    for (let py = y0; py <= y1; py++) {
      const my = (py + 0.5 - this.oy) / s, xs = []
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [ax, ay] = pts[j], [bx, by] = pts[i]
        if ((ay <= my) !== (by <= my)) xs.push(ax + (my - ay) / (by - ay) * (bx - ax))
      }
      xs.sort((p, q) => p - q)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const from = Math.max(x0, Math.ceil(xs[k] * s + this.ox - 0.5)), to = Math.min(x1, Math.floor(xs[k + 1] * s + this.ox - 0.5))
        for (let px = from; px <= to; px++) {
          const tn = toneAt ? toneAt((px + 0.5 - this.ox) / s, my) : TONE.base
          if (tn < 0) continue
          this.layer[py * this.w + px] = code(mat, tn, far); hit = true
        }
      }
    }
    if (hit) this.touch(x0, y0, x1, y1)
  }

  // Overwrite already-drawn pixels of this layer (details: seams, laces, eyes).
  // Never adds coverage, so details cannot change the silhouette.
  paint(pts, mat, far = false, tone = TONE.base) {
    const s = this.scale, [x0, y0, x1, y1] = this.bounds(pts.map(p => p[0]), pts.map(p => p[1]), 0.5)
    for (let py = y0; py <= y1; py++) {
      const my = (py + 0.5 - this.oy) / s, xs = []
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [ax, ay] = pts[j], [bx, by] = pts[i]
        if ((ay <= my) !== (by <= my)) xs.push(ax + (my - ay) / (by - ay) * (bx - ax))
      }
      xs.sort((p, q) => p - q)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const from = Math.max(x0, Math.ceil(xs[k] * s + this.ox - 0.5)), to = Math.min(x1, Math.floor(xs[k + 1] * s + this.ox - 0.5))
        for (let px = from; px <= to; px++) if (this.layer[py * this.w + px]) this.layer[py * this.w + px] = code(mat, tone, far)
      }
    }
  }

  // Recolour drawn pixels within a capsule (cuffs, sleeves, bands).
  paintCapsule(a, b, ra, rb, mat, far = false, keepTone = true) {
    const s = this.scale, [x0, y0, x1, y1] = this.bounds([a[0], b[0]], [a[1], b[1]], Math.max(ra, rb) + 0.5)
    const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy || 1e-9
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const i = py * this.w + px, v = this.layer[i]
      if (!v) continue
      const mx = (px + 0.5 - this.ox) / s, my = (py + 0.5 - this.oy) / s
      const t = Math.max(0, Math.min(1, ((mx - a[0]) * dx + (my - a[1]) * dy) / len2))
      const nx = mx - a[0] - dx * t, ny = my - a[1] - dy * t, r = ra + (rb - ra) * t
      if (nx * nx + ny * ny <= r * r) this.layer[i] = code(mat, keepTone ? v & 3 : 0, far)
    }
  }

  dot(p, mat, far = false, tone = TONE.base) {
    const px = Math.floor(p[0] * this.scale + this.ox), py = Math.floor(p[1] * this.scale + this.oy)
    if (px < 0 || py < 0 || px >= this.w || py >= this.h) return
    const i = py * this.w + px
    if (this.layer[i]) this.layer[i] = code(mat, tone, far)
  }

  // Composite this layer with a one-pixel outline around it.
  endLayer(far = false) {
    const [bx0, by0, bx1, by1] = this.box
    if (bx1 < 0) return
    const w = this.w, L = this.layer, F = this.final, line = code(OUTLINE_MAT, 0, far)
    for (let y = Math.max(0, by0 - 1); y <= Math.min(this.h - 1, by1 + 1); y++) for (let x = Math.max(0, bx0 - 1); x <= Math.min(w - 1, bx1 + 1); x++) {
      const i = y * w + x
      if (L[i]) { F[i] = L[i]; continue }
      if ((x > 0 && L[i - 1]) || (x < w - 1 && L[i + 1]) || (y > 0 && L[i - w]) || (y < this.h - 1 && L[i + w])) F[i] = line
    }
    this.startLayer()
  }
}
