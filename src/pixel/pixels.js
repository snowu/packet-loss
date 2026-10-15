// Low-level pixel helpers: colors, an RGBA pixel buffer, ordered dithering.
// Pure (no DOM) so sprites can be previewed outside the browser.

export function hex(h) {
  return [(h >> 16) & 255, (h >> 8) & 255, h & 255]
}

export function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

// Colors are asked for every frame, often with an alpha that drifts a little
// each time. A canvas keeps 8 bits of alpha, so rounding to that loses
// nothing, and handing back the same string for the same color lets the
// browser skip parsing it and reuse its paint: a color that is new every
// frame costs several times one it has seen before.
const cssCache = new Map()

export function css(c, a = 1) {
  const r = Math.round(c[0]), g = Math.round(c[1]), b = Math.round(c[2])
  const a8 = a >= 1 ? 255 : a > 0 ? Math.round(a * 255) : 0
  if ((r | g | b) & ~255) return a8 === 255 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a8 / 255})`
  const key = (a8 * 16777216) + (b << 16) + (g << 8) + r
  let s = cssCache.get(key)
  if (s === undefined) {
    if (cssCache.size >= 4096) cssCache.clear()
    s = a8 === 255 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${+(a8 / 255).toFixed(4)})`
    cssCache.set(key, s)
  }
  return s
}

// Little-endian RGBA packed into a Uint32 (what ImageData expects).
export function pack(c, a = 255) {
  return ((a & 255) << 24 | (Math.round(c[2]) & 255) << 16 | (Math.round(c[1]) & 255) << 8 | (Math.round(c[0]) & 255)) >>> 0
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

// True when a pixel at (x, y) should take the "on" color for coverage t (0..1).
export function dither(x, y, t) {
  return t > (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16
}

export function hash(a, b = 0, c = 0) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export class PixelBuffer {
  constructor(w, h) {
    this.w = w
    this.h = h
    this.data = new Uint32Array(w * h)
  }

  set(x, y, c) {
    x |= 0; y |= 0
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    this.data[y * this.w + x] = c
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0
    return this.data[y * this.w + x]
  }

  rect(x, y, w, h, c) {
    const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0)
    const x1 = Math.min(this.w, (x + w) | 0), y1 = Math.min(this.h, (y + h) | 0)
    for (let yy = y0; yy < y1; yy++) this.data.fill(c, yy * this.w + x0, yy * this.w + x1)
  }

  line(x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    for (;;) {
      this.set(x0, y0, c)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 >= dy) { err += dy; x0 += sx }
      if (e2 <= dx) { err += dx; y0 += sy }
    }
  }

  disc(cx, cy, r, c) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy
        if (dx * dx + dy * dy <= r * r) this.set(x, y, c)
      }
    }
  }

  // Draw another buffer on top (transparent pixels skipped).
  blit(src, ox, oy) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const c = src.data[y * src.w + x]
        if (c >>> 24) this.set(ox + x, oy + y, c)
      }
    }
  }
}

// Browser-only: turn a buffer into a canvas (or redraw into an existing one).
export function toCanvas(buf, canvas) {
  const c = canvas || document.createElement('canvas')
  if (c.width !== buf.w || c.height !== buf.h) { c.width = buf.w; c.height = buf.h }
  const ctx = c.getContext('2d')
  // putImageData copies the pixels, so the buffer can be handed over as is
  const img = new ImageData(new Uint8ClampedArray(buf.data.buffer, buf.data.byteOffset, buf.data.byteLength), buf.w, buf.h)
  ctx.putImageData(img, 0, 0)
  return c
}
