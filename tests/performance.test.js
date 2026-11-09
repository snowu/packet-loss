import { afterEach, expect, it, vi } from 'vitest'
import { FrameMeter, Governor } from '../src/ui/performance.js'

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

// Feed the governor `windows` verdicts' worth of frames.
function feed(g, windows, interval, work, drewEvery = 1) {
  let changed = 0
  for (let i = 0; i < windows * 120; i++) if (g.sample(interval, work, i % drewEvery === 0)) changed++
  return changed
}

it('leaves a device that holds its frame rate alone', () => {
  const g = new Governor()
  expect(feed(g, 40, 1000 / 60, 4)).toBe(0)
  expect([g.level, g.stride]).toEqual([0, 1])
})

it('sheds ornament a step at a time when a 60 Hz device starts missing frames, and drops to half rate last', () => {
  const g = new Governor()
  feed(g, 4, 1000 / 60, 4)
  // heated up: every other frame now misses its vsync
  const slow = (windows) => { for (let i = 0; i < windows * 120; i++) g.sample(i % 2 ? 1000 / 30 : 1000 / 60, 14) }
  slow(1)
  expect(g.level).toBe(0)                 // one bad window is not a trend
  slow(1)
  expect([g.level, g.stride]).toEqual([1, 1])
  slow(2)
  expect([g.level, g.stride]).toEqual([2, 1])
  slow(2)
  expect([g.level, g.stride]).toEqual([2, 2])
  slow(6)
  expect([g.level, g.stride]).toEqual([2, 2])   // nothing left to shed
})

it('halves the draw rate first on a fast display', () => {
  const g = new Governor()
  feed(g, 2, 1000 / 120, 3)
  feed(g, 2, 1000 / 80, 7.5)
  expect([g.level, g.stride]).toEqual([0, 2])
})

it('takes work back when there is room, and waits longer after a failed try', () => {
  const g = new Governor()
  feed(g, 2, 1000 / 60, 4)
  feed(g, 2, 25, 14)
  expect(g.level).toBe(1)
  const patience = g.patience
  feed(g, patience, 1000 / 60, 3)
  expect(g.level).toBe(0)
  // it didn't hold: back down, and slower to try again
  feed(g, 2, 25, 14)
  expect(g.level).toBe(1)
  expect(g.patience).toBe(patience * 2)
  feed(g, patience, 1000 / 60, 3)
  expect(g.level).toBe(1)
  feed(g, patience, 1000 / 60, 3)
  expect(g.level).toBe(0)
})

it('ignores hitches, reads CPU load before frames are missed, and can be pinned', () => {
  const g = new Governor()
  for (let w = 0; w < 10; w++) for (let i = 0; i < 120; i++) g.sample(i === 7 ? 180 : 1000 / 60, 4)
  expect(g.level).toBe(0)
  // on time, but the loop is eating most of the frame
  feed(g, 2, 1000 / 60, 13)
  expect(g.level).toBe(1)
  const pinned = new Governor({ pin: 2 })
  feed(pinned, 10, 40, 30)
  expect([pinned.level, pinned.stride]).toEqual([2, 1])
})
