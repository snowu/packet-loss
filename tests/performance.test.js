import { afterEach, expect, it, vi } from 'vitest'
import { FrameMeter } from '../src/ui/performance.js'

afterEach(() => vi.unstubAllGlobals())

function meter() {
  vi.stubGlobal('document', { hidden: false })
  const m = Object.create(FrameMeter.prototype)
  Object.assign(m, { intervals: new Float32Array(120), work: new Float32Array(120), sorted: new Float32Array(120), el: { hidden: false } })
  m.reset()
  return m
}

it('measures refresh cadence separately from CPU work, even after a late startup', () => {
  const m = meter()
  let now = 10000
  m.sample(now, 3)
  for (let i = 0; i < 180; i++) m.sample(now += 1000 / 120, 3)
  expect(m.stats.fps).toBeCloseTo(120, 2)
  expect(m.stats.p95).toBeCloseTo(1000 / 120, 2)
  expect(m.stats.work).toBe(3)
})

it('reports dropped frames and forgets them when they leave the rolling window', () => {
  const m = meter()
  let now = 10000
  m.sample(now, 2)
  for (let i = 0; i < 120; i++) m.sample(now += i % 5 === 0 ? 50 : 1000 / 60, 2)
  expect(m.stats.fps).toBeLessThan(50)
  expect(m.stats.p95).toBe(50)
  for (let i = 0; i < 180; i++) m.sample(now += 1000 / 60, 2)
  expect(m.stats.fps).toBeCloseTo(60, 2)
  expect(m.stats.p95).toBeCloseTo(1000 / 60, 2)
})

it('does not count the time spent hidden or in the art lab as a slow frame', () => {
  const m = meter()
  m.sample(10000, 2)
  m.reset()
  m.sample(100000, 2)
  expect(m.count).toBe(0)
  m.sample(100000 + 1000 / 60, 2)
  expect(m.stats.fps).toBeCloseTo(60, 2)
})

it('keeps a genuine long stall visible in the frame statistics', () => {
  const m = meter()
  m.sample(10000, 2)
  m.sample(12000, 2)
  expect(m.stats.fps).toBe(0.5)
  expect(m.stats.p95).toBe(2000)
})
