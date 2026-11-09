import { describe, it, expect } from 'vitest'
import { CourseGenerator, fastLanding, LAND_READ, RUNWAY, walkOffGap, maxGap } from '../src/sim/generator.js'
import { Level } from '../src/sim/level.js'
import { createPlayer, stepPlayer } from '../src/sim/player.js'
import { heistOptions } from '../src/sim/heist.js'
import { PHYS, HEIST } from '../src/sim/config.js'

// Fair: nothing on a course asks for more than the physics gives a runner who
// is slow, or fast, or just fluffed a landing. Dynamic: it keeps changing height
// and keeps giving you something to do.

const NONE = { jump: false, jumpPressed: false, down: false, downPressed: false }

// Consecutive chunk pairs of a generated course, after the opening roof.
function pairs(seed, count, options = {}) {
  const gen = new CourseGenerator(seed, { tutorial: false, ...options })
  const list = Array.from({ length: count + 1 }, () => gen.next())
  return list.slice(1, -1).map((c, i) => [c, list[i + 2]])
}

// Everything on a roof a runner has to deal with, by where it starts.
const hazards = (c) => [...c.solids.filter((s) => s.kind === 'block' || s.kind === 'beam'), ...c.fences, ...c.lasers]

// Run from `start` at the given speed (stumbling, if asked), hold a jump from
// `takeoff`, and report whether the runner comes down on the next roof.
function makesIt(level, c, n, { start, takeoff, speed, stumble = false }) {
  const p = createPlayer(start, c.roof)
  p.speed = speed
  p.momentum = stumble ? PHYS.SPEED_MAX : speed
  if (stumble) p.state = 'stumble'
  let pressed = false, held = 0
  for (let i = 0; i < 900 && p.alive; i++) {
    let input = NONE
    if (!pressed && p.x >= takeoff) { input = { ...NONE, jump: true, jumpPressed: true }; pressed = true }
    else if (pressed && held++ < 40) input = { ...NONE, jump: true }
    const events = []
    stepPlayer(p, input, PHYS.FIXED_DT, level, events)
    if (pressed && events.some((e) => e.type === 'land' || e.type === 'hardland' || e.type === 'grab')) {
      return p.x >= n.x0 - 0.5 && p.y >= n.roof - 0.05
    }
    if (p.state === 'wallslide') return false
  }
  return false
}

// Seconds of takeoff positions that clear the gap.
function window(level, c, n, opts) {
  let ok = 0
  const step = 0.2
  for (let t = Math.max(c.x1 - 12, opts.start ?? -Infinity); t <= c.x1 + 2; t += step) {
    if (makesIt(level, c, n, { ...opts, takeoff: t, start: opts.start ?? Math.min(t, c.x1) - 0.4 })) ok++
  }
  return (ok * step) / (opts.speed ?? PHYS.SPEED_MIN)
}

describe('fair courses', () => {
  it('sizes every plain jump between a walk-off and the slowest runner’s reach', () => {
    for (const seed of [2, 4, 6]) {
      for (const [c] of pairs(seed, 150)) {
        if (c.gap.type !== 'jump') continue
        const reach = maxGap(c.gap.dh, PHYS.SPEED_MIN)
        expect(c.gap.width).toBeLessThanOrEqual(reach * 0.8 + 0.01)
        // a real jump at running pace, unless that would get too tight
        expect(c.gap.width).toBeGreaterThanOrEqual(Math.min(walkOffGap(c.gap.dh) + 0.5, reach * 0.65) - 0.01)
      }
    }
  })

  it('gives every jump a generous takeoff window at the slowest running speed', { timeout: 60000 }, () => {
    for (const difficulty of [null, { start: 1 }]) {
      const level = new Level(31, { tutorial: false, difficulty })
      level.ensure(1500)
      const cs = level.chunks
      for (let i = 1; i < cs.length - 1; i += 2) {
        if (cs[i].gap.type !== 'jump') continue
        expect(window(level, cs[i], cs[i + 1], { speed: PHYS.SPEED_MIN })).toBeGreaterThan(0.25)
      }
    }
  })

  it('keeps the fastest runner’s landing clear, with time to read the roof', () => {
    for (const seed of [1, 3, 5, 7]) {
      for (const difficulty of [null, { start: 1 }]) {
        for (const [c, n] of pairs(seed, 120, { difficulty })) {
          if (c.gap.type === 'jump') {
            expect(c.gap.entryClear).toBeGreaterThanOrEqual(fastLanding(c.gap.dh, c.gap.width) + LAND_READ * PHYS.SPEED_MAX - 1e-6)
          }
          for (const h of hazards(n)) expect(h.x0).toBeGreaterThanOrEqual(n.x0 + c.gap.entryClear - 0.01)
        }
      }
    }
  })

})

describe('fair courses: recovering from a bad landing', () => {
  it('leaves a run-up after every landing zone', () => {
    for (const seed of [1, 3, 5, 7]) {
      for (const [c, n] of pairs(seed, 120, { difficulty: { start: 1 } })) {
        expect(n.x1 - (n.x0 + c.gap.entryClear)).toBeGreaterThanOrEqual(RUNWAY - 1e-6)
      }
    }
  })

  it('still clears the next gap after stumbling at the worst moment', { timeout: 60000 }, () => {
    const level = new Level(53, { tutorial: false, difficulty: { start: 1 } })
    level.ensure(1500)
    const cs = level.chunks
    let checked = 0
    for (let i = 2; i < cs.length - 1; i++) {
      const [prev, c, n] = [cs[i - 1], cs[i], cs[i + 1]]
      if (c.gap.type !== 'jump') continue
      // touched down hard as late as the landing zone allows, or tripped on
      // the last obstacle: stumbling, slow
      const start = Math.max(c.x0 + prev.gap.entryClear - LAND_READ * PHYS.SPEED_MAX, ...hazards(c).map((h) => h.x1 + PHYS.W))
      expect(window(level, c, n, { start, speed: PHYS.STUMBLE_SPEED, stumble: true })).toBeGreaterThan(0.1)
      checked++
    }
    expect(checked).toBeGreaterThan(5)
  })

  it('gives a live fence a clear run-up to jump it from', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const [c, n] of pairs(seed, 120, { difficulty: { start: 1 } })) {
        for (const f of n.fences) {
          const before = n.solids.filter((s) => (s.kind === 'block' || s.kind === 'beam') && s.x1 <= f.x0)
          const from = Math.max(n.x0 + c.gap.entryClear - 4, ...before.map((s) => s.x1))
          expect(f.x0 - from).toBeGreaterThanOrEqual(0.6 * PHYS.SPEED_MAX - 0.5)
        }
      }
    }
  })

  it('never puts a drone where taking it out throws you into the gap', () => {
    const v = HEIST.TAKEDOWN_VY
    const flight = (v + Math.sqrt(v * v + 2 * PHYS.G * 2.9)) / PHYS.G * PHYS.SPEED_MAX
    let drones = 0
    for (const seed of [1, 2, 3, 4]) {
      for (const [c, n] of pairs(seed, 80, heistOptions())) {
        for (const d of n.drones) {
          drones++
          expect(n.gap.runwayStart - d.x).toBeGreaterThan(flight)
        }
        for (const l of n.lasers) expect(l.x0).toBeGreaterThanOrEqual(n.x0 + c.gap.entryClear - 0.5)
      }
    }
    expect(drones).toBeGreaterThan(40)
  })
})

describe('dynamic courses', () => {
  const course = (seed, count = 200) => pairs(seed, count).map(([c]) => c)

  it('rises and falls across the whole height range', () => {
    const roofs = [1, 2, 3, 4, 5, 6].flatMap((seed) => course(seed).map((c) => c.roof)).sort((a, b) => a - b)
    const at = (q) => roofs[Math.floor(q * (roofs.length - 1))]
    expect(at(0.1)).toBeLessThan(5)
    expect(at(0.9)).toBeGreaterThan(15)
    // few roofs sit on the lowest height the city allows
    expect(roofs.filter((r) => r <= -1.9).length / roofs.length).toBeLessThan(0.05)
  })

  it('makes plain jumps step up or drop, never a string of flat hops', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      let flat = 0, plain = 0
      for (const c of course(seed)) {
        flat = c.gap.type === 'jump' && Math.abs(c.gap.dh) < 1 ? flat + 1 : 0
        plain = c.gap.type === 'jump' ? plain + 1 : 0
        expect(flat).toBeLessThanOrEqual(2)
        expect(plain).toBeLessThanOrEqual(6)
      }
    }
  })

  it('mixes in every kind of gap', () => {
    const counts = {}
    for (const c of course(9, 300)) counts[c.gap.type] = (counts[c.gap.type] ?? 0) + 1
    for (const type of ['jump', 'climb', 'wallrun', 'zip', 'spring']) expect(counts[type]).toBeGreaterThan(300 * 0.05)
    expect(counts.jump).toBeLessThan(300 * 0.6)
  })

  it('never leaves a long stretch of roof with nothing to do', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const difficulty of [null, { start: 1 }]) {
        for (const [c, n] of pairs(seed, 120, { difficulty })) {
          // from the end of the landing zone to the run-up of the next gap
          const marks = [n.x0 + c.gap.entryClear, ...hazards(n).flatMap((h) => [h.x0, h.x1]), n.gap.runwayStart - RUNWAY]
            .sort((a, b) => a - b)
          for (let i = 1; i < marks.length; i++) expect(marks[i] - marks[i - 1]).toBeLessThan(26)
        }
      }
    }
  })
})
