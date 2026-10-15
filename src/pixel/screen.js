// Whole-screen bakes: sky, haze, vignette and the trace alarm. Pure, so the
// bake worker can make them while the frame keeps drawing.
import { PixelBuffer, pack, mix, dither, hash } from './pixels.js'

// overcast: rain dulling the sky toward a color, as { color, alpha } (or null)
export function bakeSky(W, H, pal, overcast = null) {
  const b = new PixelBuffer(W, H)
  const horizon = Math.round(H * 0.66)
  const bands = pal.sky
  const n = bands.length
  const packed = bands.map((c) => pack(c))
  for (let y = 0; y < H; y++) {
    const t = Math.min(0.9999, y / horizon) * (n - 1)
    const i = Math.floor(t), f = t - i
    for (let x = 0; x < W; x++) {
      b.data[y * W + x] = y >= horizon ? packed[n - 1] : dither(x, y, (f - 0.55) / 0.45) ? packed[Math.min(n - 1, i + 1)] : packed[i]
    }
  }
  if (pal.sunSize > 0) {
    const cx = pal.sunX * W, cy = pal.sunY * H, r = pal.sunSize
    for (let y = Math.floor(cy - r * 3); y < cy + r * 3; y++) {
      for (let x = Math.floor(cx - r * 3); x < cx + r * 3; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
        const idx = y * W + x
        if (x < 0 || y < 0 || x >= W || y >= H) continue
        if (d < r) {
          let c = pal.sun
          if (pal.moon && hash(Math.floor(x / 3), Math.floor(y / 3)) < 0.18) c = mix(pal.sun, pal.sky[2], 0.35)
          // sunsets slice the disc with horizontal gaps
          if (!pal.moon && y > cy + r * 0.25 && ((y - Math.floor(cy)) % 5 === 0)) continue
          b.data[idx] = pack(c)
        } else if (d < r * 1.6 && dither(x, y, 0.5 * (1 - (d - r) / (r * 0.6)))) {
          b.data[idx] = pack(mix(pal.sun, pal.sky[Math.min(n - 1, Math.floor(y / horizon * (n - 1)))], 0.55))
        } else if (d < r * 3) {
          const c = b.data[idx], air = [c & 255, (c >>> 8) & 255, (c >>> 16) & 255]
          b.data[idx] = pack(mix(air, pal.sun, (1 - (d - r) / (r * 2)) ** 2 * 0.16))
        }
      }
    }
  }
  if (overcast) {
    // what filling the screen with the color at that alpha would leave,
    // worked out once here instead of blended over every frame
    const [or, og, ob] = overcast.color, a = Math.round(overcast.alpha * 255) / 255
    const blended = new Map()
    for (let i = 0; i < b.data.length; i++) {
      const c = b.data[i]
      let out = blended.get(c)
      if (out === undefined) {
        out = pack([(c & 255) + (or - (c & 255)) * a, ((c >>> 8) & 255) + (og - ((c >>> 8) & 255)) * a, ((c >>> 16) & 255) + (ob - ((c >>> 16) & 255)) * a])
        blended.set(c, out)
      }
      b.data[i] = out
    }
  }
  return b
}

export function bakeHaze(W, H, pal) {
  const h = H - Math.round(H * 0.62)
  const b = new PixelBuffer(W, h)
  const c = pack(pal.haze)
  for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) if (dither(x, y, (y / h) * 1.3 - 0.15)) b.data[y * W + x] = c
  return b
}


// Every other row is darkened by 7% (the CRT scanlines). Baked into the
// full-screen overlays so they cost one draw instead of a rect per row.
const SCAN_ALPHA = 18
const SCAN = pack([0, 0, 0], SCAN_ALPHA)
const scanned = (c) => pack(mix(c, [0, 0, 0], SCAN_ALPHA / 255))

export function bakeVignette(W, H, pal) {
  const b = new PixelBuffer(W, H)
  const shade = mix(pal.shadow, [0, 0, 0], 0.4)
  const c = pack(shade), cs = scanned(shade)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x / W - 0.5) * 2, dy = (y / H - 0.5) * 2
      const r = Math.sqrt(dx * dx * 0.7 + dy * dy)
      if (dither(x, y, (r - 1.05) * 1.6)) b.data[y * W + x] = y & 1 ? cs : c
      else if (y & 1) b.data[y * W + x] = SCAN
    }
  }
  return b
}

// Red alarm edges for a trace about to fill. It goes over the scanlines, so
// it darkens its own odd rows to match.
export function bakeAlarm(W, H) {
  const b = new PixelBuffer(W, H)
  const red = [255, 40, 30]
  const c = pack(red), cs = scanned(red)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const e = Math.min(x, W - 1 - x, y, H - 1 - y)
      if (dither(x, y, 0.7 - e / 26)) b.data[y * W + x] = y & 1 ? cs : c
    }
  }
  return b
}
