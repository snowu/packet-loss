import { describe, it, expect } from 'vitest'
import { drawBlock, drawPipe, drawSpring, drawMast, BLEED, RED } from '../src/pixel/courseArt.js'

// A stand-in 2D context that records what is filled.
function recorder() {
  const rects = []
  return { rects, fillStyle: '', fillRect(x, y, w, h) { rects.push({ x, y, w, h, color: this.fillStyle }) } }
}
const bounds = rects => ({
  left: Math.min(...rects.map(r => r.x)), right: Math.max(...rects.map(r => r.x + r.w)),
  top: Math.min(...rects.map(r => r.y)), bottom: Math.max(...rects.map(r => r.y + r.h)),
})
// The fraction of the span x0..x1 at height y that rects of one colour cover.
function covered(rects, color, y, x0, x1) {
  let n = 0
  for (let x = x0; x < x1; x += 0.5) if (rects.some(r => r.color === color && r.x <= x && r.x + r.w > x && r.y <= y && r.y + r.h > y)) n++
  return n / ((x1 - x0) * 2)
}

const BLOCKS = [['vent', 11, 8], ['vent', 25, 16], ['highbox', 11, 20], ['highbox', 20, 28], ['housing', 56, 34], ['housing', 126, 50]]

describe('course art', () => {
  it('draws every block inside its collision box, standing on the roof', () => {
    for (const [sub, w, h] of BLOCKS) for (const seed of [1, 7, 12]) {
      const c = recorder(); drawBlock(c, sub, w, h, seed)
      const b = bounds(c.rects)
      expect(b.left, sub).toBeGreaterThanOrEqual(-BLEED); expect(b.right, sub).toBeLessThanOrEqual(w + BLEED)
      expect(b.top, sub).toBeGreaterThanOrEqual(0)          // nothing above the top you land on
      expect(b.bottom, sub).toBeCloseTo(h, 6)               // and it reaches the roof exactly
    }
  })

  it('gives everything you go over a red lid across its whole top', () => {
    for (const [sub, w, h] of BLOCKS) {
      const c = recorder(); drawBlock(c, sub, w, h, 3)
      expect(covered(c.rects, RED, 1.25, 1, w - 1), sub).toBeGreaterThan(0.95)
      // The lid is the only large red on the object.
      expect(covered(c.rects, RED, h / 2 + 2, 0, w), sub).toBeLessThan(0.3)
    }
  })

  it('wraps the slide pipe in red and white tape, on legs that reach the roof', () => {
    for (const [w, drop] of [[7, 14], [18, 15], [31, 16]]) {
      const c = recorder(); drawPipe(c, w, 6, drop, 5)
      const b = bounds(c.rects)
      expect(b.top).toBeGreaterThanOrEqual(-1)              // the pipe is the obstacle: nothing stands above it
      expect(b.bottom).toBeCloseTo(6 + drop, 6)
      expect(b.left).toBeGreaterThanOrEqual(-BLEED); expect(b.right).toBeLessThanOrEqual(w + BLEED)
      const red = covered(c.rects, RED, 2.75, 1, w - 1)
      expect(red).toBeGreaterThan(0.2); expect(red).toBeLessThan(0.85)  // bands, not a solid bar: that is the lid's signal
      // The gap under the pipe is open: legs take up little of it.
      const legs = c.rects.filter(r => r.y >= 7 && r.y + r.h <= 6 + drop - 2)
      const blocked = new Set(legs.flatMap(r => Array.from({ length: Math.ceil(r.w * 2) }, (_, i) => Math.floor(r.x * 2) + i))).size / 2
      expect(blocked / w).toBeLessThan(0.75)
    }
  })

  it('keeps the launch ramp rising the way the runner travels', () => {
    const c = recorder(); drawSpring(c, 22, 7, 2)
    const top = x => Math.min(...c.rects.filter(r => r.x <= x && r.x + r.w > x).map(r => r.y))
    expect(top(20)).toBeLessThan(top(3) - 3)
    expect(bounds(c.rects).bottom).toBeCloseTo(7, 6)
    expect(bounds(c.rects).top).toBeGreaterThanOrEqual(-BLEED)
  })

  it('is the same every time for the same obstacle', () => {
    const draw = seed => { const c = recorder(); drawBlock(c, 'housing', 80, 40, seed); drawPipe(c, 20, 6, 15, seed); drawMast(c, 30); return JSON.stringify(c.rects) }
    expect(draw(9)).toBe(draw(9))
    expect(draw(9)).not.toBe(draw(10))
  })
})
