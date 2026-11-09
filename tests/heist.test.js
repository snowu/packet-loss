import { describe, it, expect, afterEach } from 'vitest'
import { CourseGenerator } from '../src/sim/generator.js'
import { Level } from '../src/sim/level.js'
import { Bot } from '../src/sim/bot.js'
import { createPlayer, stepPlayer } from '../src/sim/player.js'
import { PHYS, HEIST, setPhysMods } from '../src/sim/config.js'
import { createRng } from '../src/sim/rng.js'
import { CHROME, rollOffer, chromeEffects, countOf } from '../src/sim/chrome.js'
import { HeistState, heistOptions, HazardProbe, traceRate } from '../src/sim/heist.js'
import { ScoreKeeper } from '../src/sim/score.js'
import { simulateHeist } from '../src/sim/heistSim.js'

const NONE = { jump: false, jumpPressed: false, down: false, downPressed: false }

function chunks(seed, count, opts) {
  const gen = new CourseGenerator(seed, opts)
  return Array.from({ length: count }, () => gen.next())
}

afterEach(() => setPhysMods({}))

describe('heist course', () => {
  it('keeps the buildings of a seed, only swapping some obstacles for lasers and drones', () => {
    const strip = (c) => JSON.stringify({ x0: c.x0, x1: c.x1, roof: c.roof, gap: c.gap, ziplines: c.ziplines, wallruns: c.wallruns })
    const plain = chunks(77, 60, { tutorial: false })
    const net = chunks(77, 60, { tutorial: false, heist: true })
    expect(net.map(strip)).toEqual(plain.map(strip))
    net.forEach((c, i) => {
      const ids = new Set(plain[i].solids.map((s) => s.id))
      for (const s of c.solids) expect(ids.has(s.id)).toBe(true)
      const removed = plain[i].solids.filter((s) => !c.solids.some((o) => o.id === s.id))
      expect(removed.every((s) => s.sub === 'vent' || s.sub === 'beam')).toBe(true)
    })
    expect(net.some((c) => c.shards.length)).toBe(true)
    expect(plain.every((c) => !c.shards.length && !c.lasers.length && !c.drones.length)).toBe(true)
  })

  it('is deterministic per seed', () => {
    const a = JSON.stringify(chunks(5, 50, heistOptions()))
    expect(JSON.stringify(chunks(5, 50, heistOptions()))).toBe(a)
  })

  it('keeps lasers and drones clear of obstacles and on the roof', () => {
    for (const seed of [1, 2, 3, 4]) {
      for (const c of chunks(seed, 80, heistOptions())) {
        const blocks = c.solids.filter((s) => s.kind !== 'roof')
        for (const l of c.lasers) {
          expect(l.x0).toBeGreaterThan(c.x0)
          expect(l.x1).toBeLessThan(c.gap.runwayStart)
          for (const s of blocks) expect(l.x1 < s.x0 - 2 || l.x0 > s.x1 + 2).toBe(true)
          // high grids leave room to slide, low ones to jump
          if (l.low) expect(l.y1 - c.roof).toBeLessThan(0.5)
          else expect(l.y0 - c.roof).toBeGreaterThan(PHYS.H_LOW)
        }
        for (const d of c.drones) {
          expect(d.y - c.roof).toBeGreaterThan(PHYS.H)
          for (const s of blocks) expect(d.x < s.x0 - 1 || d.x > s.x1 + 1).toBe(true)
        }
      }
    }
  })

  it('splits into five sectors with an uplink between each', () => {
    const level = new Level(9, heistOptions())
    level.ensure(HEIST.SECTORS * HEIST.SECTOR_LEN + 120)
    expect(level.checkpoints).toHaveLength(HEIST.SECTORS - 1)
    expect(level.finish).not.toBeNull()
  })
})

describe('chrome', () => {
  it('offers distinct pieces that can still be installed', () => {
    const rng = createRng(3)
    const owned = ['tendons', 'dilator', 'insulated']
    for (let i = 0; i < 50; i++) {
      const offer = rollOffer(rng, owned)
      expect(offer).toHaveLength(3)
      expect(new Set(offer.map((c) => c.id)).size).toBe(3)
      for (const c of offer) expect(countOf(owned, c.id)).toBeLessThan(c.max)
    }
    const maxed = CHROME.flatMap((c) => Array(c.max).fill(c.id))
    expect(rollOffer(rng, maxed)).toHaveLength(0)
  })

  it('applies physics overrides for the run and restores them', () => {
    const jumps = PHYS.AIR_JUMPS, top = PHYS.SPEED_MAX
    setPhysMods(chromeEffects(['tendons', 'calves', 'calves']).phys)
    expect(PHYS.AIR_JUMPS).toBe(jumps + 1)
    expect(PHYS.SPEED_MAX).toBeCloseTo(top + 2.2)
    setPhysMods(chromeEffects(['calves']).phys)
    expect(PHYS.AIR_JUMPS).toBe(jumps)
    expect(PHYS.SPEED_MAX).toBeCloseTo(top + 1.1)
    setPhysMods({})
    expect(PHYS.SPEED_MAX).toBe(top)
  })

  it('gives a mid-air jump with tendons', () => {
    const net = new HeistState(1)
    net.install('tendons')
    const solids = [{ id: 1, kind: 'roof', x0: -10, x1: 1000, y0: -70, y1: 0 }]
    const level = { solidsIn: () => solids, wallrunsIn: () => [], ziplinesIn: () => [], killY: () => -20, roofAt: () => 0, lowestRoofAhead: () => -5 }
    const p = createPlayer(0, 0)
    const events = []
    const tap = { ...NONE, jump: true, jumpPressed: true }
    for (let i = 0; i < 200; i++) stepPlayer(p, i === 10 || i === 70 ? tap : NONE, PHYS.FIXED_DT, level, events)
    expect(events.map((e) => e.type)).toContain('airjump')
    net.dispose()
    expect(PHYS.AIR_JUMPS).toBe(0)
  })
})

describe('heist state', () => {
  const flat = (extra = {}) => ({
    chunksIn: () => [{ shards: [], lasers: [], drones: [], ...extra }],
  })

  it('collects shards for creds', () => {
    const net = new HeistState(1)
    const shards = [{ id: 'a', x: 1, y: 1, taken: false }, { id: 'b', x: 1, y: 6, taken: false }]
    const events = []
    net.step(0.01, createPlayer(1, 0), flat({ shards }), events)
    expect(events.map((e) => e.type)).toEqual(['shard'])
    expect(net.creds).toBe(HEIST.SHARD_EDDIES)
    expect(shards[1].taken).toBe(false)
  })

  it('trips a laser once, and a standing runner trips a high grid', () => {
    const net = new HeistState(1)
    const lasers = [{ id: 'l', x0: 0.5, x1: 2, y0: 1.05, y1: 1.27, tripped: false }]
    const events = []
    const p = createPlayer(1, 0)
    net.step(0.01, p, flat({ lasers }), events)
    net.step(0.01, p, flat({ lasers }), events)
    expect(events.filter((e) => e.type === 'zap')).toHaveLength(1)
    // sliding fits under
    const slider = createPlayer(1, 0)
    slider.state = 'slide'
    const fresh = [{ ...lasers[0], tripped: false }]
    const ev2 = []
    net.step(0.01, slider, flat({ lasers: fresh }), ev2)
    expect(ev2).toHaveLength(0)
  })

  it('takes down drones from the air and gets spotted from below', () => {
    const net = new HeistState(1)
    const drones = [{ id: 'd', x: 1, y: 2.75, down: false, spotted: false }]
    const air = createPlayer(1, 1.2)
    air.state = 'air'
    air.vy = -2
    const events = []
    net.step(0.01, air, flat({ drones }), events)
    expect(events.map((e) => e.type)).toEqual(['takedown'])
    expect(air.vy).toBe(HEIST.TAKEDOWN_VY)

    const other = [{ id: 'e', x: 1, y: 2.75, down: false, spotted: false }]
    const runner = createPlayer(2, 0)
    const ev2 = []
    net.step(0.01, runner, flat({ drones: other }), ev2)
    expect(ev2.map((e) => e.type)).toEqual(['spotted'])
    net.step(0.01, runner, flat({ drones: other }), ev2)
    expect(ev2).toHaveLength(1)   // judged once per drone
  })

  it('does not spot a runner who clears the drone overhead', () => {
    const net = new HeistState(1)
    const drones = [{ id: 'd', x: 1, y: 2.75, down: false, spotted: false }]
    const high = createPlayer(2, 3.4)
    high.state = 'air'
    const events = []
    net.step(0.01, high, flat({ drones }), events)
    expect(events).toHaveLength(0)
    expect(drones[0].passed).toBe(true)
    // and once judged, landing back down past it changes nothing
    net.step(0.01, createPlayer(2.5, 0), flat({ drones }), events)
    expect(events).toHaveLength(0)
  })

  it('burns integrity when the trace fills', () => {
    const net = new HeistState(1)
    net.trace = 0.999
    const events = []
    net.step(1, createPlayer(0, 0), flat(), events)
    expect(events.map((e) => e.type)).toEqual(['traced'])
    expect(net.integrity).toBe(HEIST.INTEGRITY - 1)
    expect(net.trace).toBeCloseTo(HEIST.TRACE_AFTER_BURN)
  })

  it('builds trace slower at speed, and clean moves knock it back', () => {
    expect(traceRate(0, HEIST.TRACE_FLOW_SPEED)).toBeCloseTo(traceRate(0, PHYS.SPEED_MIN) * (1 - HEIST.TRACE_FLOW_HIDE))
    expect(traceRate(4, PHYS.SPEED_MIN)).toBeGreaterThan(traceRate(0, PHYS.SPEED_MIN))
    const net = new HeistState(1)
    net.trace = 0.5
    net.move('vault')
    expect(net.trace).toBeCloseTo(0.5 - HEIST.TRACE_MOVE)
    // repeatable on any flat roof, so no jam
    net.move('slidejump')
    net.move('jump')
    expect(net.trace).toBeCloseTo(0.5 - HEIST.TRACE_MOVE)
  })

  it('probes hazards without tripping them', () => {
    const lasers = [{ id: 'l', x0: 0.5, x1: 2, y0: 1.05, y1: 1.27, tripped: false }]
    const drones = [{ id: 'd', x: 1, y: 2.75, down: false, passed: false }]
    const level = { chunksIn: () => [{ lasers, drones }] }
    const probe = new HazardProbe()
    expect(probe.cost(createPlayer(1, 0), level)).toBe(3)
    expect(probe.cost(createPlayer(2, 0), level)).toBe(2)   // ran under the scan
    expect(probe.cost(createPlayer(2, 0), level)).toBe(0)   // each judged once
    expect(lasers[0].tripped).toBe(false)
    expect(drones[0].passed).toBe(false)
  })

  it('runs a street doc: repair, reroll and install', () => {
    const net = new HeistState(4)
    net.integrity = 1
    expect(net.repair()).toBe(false)
    net.creds = 200
    expect(net.repair()).toBe(true)
    expect(net.integrity).toBe(2)
    expect(net.creds).toBe(200 - HEIST.REPAIR_COST)
    net.openShop()
    expect(net.reroll()).toBe(true)
    expect(net.install('plating')).toBe(true)
    expect(net.maxIntegrity).toBe(HEIST.INTEGRITY + 1)
    expect(net.integrity).toBe(3)
  })

  it('lets shards extend a combo without growing the multiplier', () => {
    const s = new ScoreKeeper()
    s.event('shard', 10)
    expect(s.mult).toBe(0)
    s.event('vault', 10)
    s.event('shard', 10)
    expect(s.mult).toBe(1)
    expect(s.timer).toBe(s.window)
  })
})

describe('chrome balance', () => {
  it('lets Ghost Protocol ease the trace without switching it off', () => {
    // a careful runner with two Ghosts still feels the trace late in the run.
    // One course's layout swings the trace a lot, so it's averaged over a few.
    const late = (run) => Math.max(...run.samples.filter((s) => s.sector >= 3).map((s) => s.trace))
    const seeds = [1, 3, 5]
    const mean = (chrome) => seeds.reduce((sum, seed) => sum + late(simulateHeist(seed, { chrome })), 0) / seeds.length
    const plain = mean([])
    const ghosted = mean(['ghost', 'ghost'])
    expect(ghosted).toBeLessThan(plain - 0.15)
    expect(ghosted).toBeGreaterThan(0.2)
  }, 180000)
})

describe('heist traversal', () => {
  it('a careful autopilot extracts from a full heist with no chrome', () => {
    const run = simulateHeist(31337)
    expect(run.extracted).toBe(true)
    expect(run.falls).toBeLessThanOrEqual(2)
    expect(run.stats.shards).toBeGreaterThan(20)
    // flow, not luck: dodging the hazards keeps the trace from ever burning
    expect(run.stats.zaps + run.stats.spotted).toBeLessThanOrEqual(4)
    expect(run.stats.takedowns).toBeGreaterThan(5)
    expect(run.stats.burns).toBe(0)
  }, 90000)
})
