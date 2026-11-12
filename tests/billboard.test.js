import { describe, it, expect } from 'vitest'
import { specFor, bakeBillboard, CHANNELS } from '../src/pixel/billboard.js'
import { paletteAt } from '../src/pixel/palette.js'

const pal = paletteAt(0)
const lit = (b, x0, y0, w, h) => {
  let n = 0
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (b.get(x, y) >>> 24) n++
  return n
}

describe('billboards', () => {
  it('bakes every mount in every placement', () => {
    for (const place of ['far', 'near', 'roof', 'facade']) {
      for (let seed = 1; seed < 300; seed++) {
        const s = specFor(seed, place)
        for (const f of [0, 1]) {
          const b = bakeBillboard(s, pal, f)
          expect(b.w).toBeGreaterThan(0)
        }
      }
    }
  }, 30000)

  it('fills small skyline boards with more than a single word', () => {
    for (let seed = 1; seed < 200; seed++) {
      const s = specFor(seed, 'far')
      if (s.kind !== 'board') continue
      const b = bakeBillboard(s, pal, 0)
      // the panel is fully painted, not a flat field with some letters on it
      const colors = new Set()
      for (let y = 5; y < 5 + s.ph; y++) for (let x = 2; x < 2 + s.pw; x++) colors.add(b.get(x, y))
      expect(colors.size).toBeGreaterThan(8)
    }
  })

  it('gives tickers a channel, a crawl and a glass overlay that fit the housing', () => {
    const seen = new Set()
    for (let seed = 1; seed < 2000 && seen.size < CHANNELS.length; seed++) {
      const s = specFor(seed, 'near')
      if (s.kind !== 'ticker') continue
      seen.add(s.channel)
      const [sx, sy, sw, sh] = s.screen
      expect(sx + sw).toBeLessThanOrEqual(s.w)
      expect(sy + sh).toBeLessThanOrEqual(s.h)
      const strip = bakeBillboard(s, pal, 1)
      expect(strip.h).toBe(7)
      expect(lit(strip, sw, 0, strip.w - sw, 7)).toBeGreaterThan(40)
      expect(lit(strip, 0, 0, sw, 7)).toBe(0)                          // text enters from the right
      expect(bakeBillboard(s, pal, 2).w).toBe(s.w)
    }
    expect(seen.size).toBe(CHANNELS.length)
  })
})
