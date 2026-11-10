import { describe, it, expect, afterEach } from 'vitest'
import { Level } from '../src/sim/level.js'
import { createPlayer } from '../src/sim/player.js'
import { PHYS, HEIST, setPhysMods } from '../src/sim/config.js'
import { createRng } from '../src/sim/rng.js'
import { CHROME, SETS, SET_SIZE, activeSets, chromeEffects } from '../src/sim/chrome.js'
import { HeistState, heistOptions, LOADOUTS, atThreat, threatScore } from '../src/sim/heist.js'
import { ROUTES, STANDARD, rollRoutes, routeById } from '../src/sim/routes.js'
import { CONTRACTS, rollContract, trackContract, contractDone } from '../src/sim/contracts.js'
import { dailyHeist, dailyTrack } from '../src/sim/tracks.js'
import { DEALS } from '../src/sim/deals.js'
import { UNLOCKS, repFor } from '../src/sim/unlocks.js'
import { stepPlayer } from '../src/sim/player.js'
import { simulateHeist } from '../src/sim/heistSim.js'

afterEach(() => setPhysMods({}))

const FULL = HEIST.SECTORS * HEIST.SECTOR_LEN + 120
const quiet = { chunksIn: () => [] }

describe('routes', () => {
  it('offers two different ways on, never two easy ones', () => {
    const rng = createRng(9)
    for (let i = 0; i < 200; i++) {
      const [a, b] = rollRoutes(rng)
      expect(a).not.toBe(b)
      expect(a.heat).toBeLessThanOrEqual(b.heat)
      expect(b.heat).toBeGreaterThan(0)
    }
    expect(routeById('standard')).toBe(STANDARD)
  })

  it('leaves the buildings alone and changes only the security over them', () => {
    const plain = new Level(77, heistOptions())
    const routed = new Level(77, heistOptions({ routed: true }))
    plain.ensure(FULL)
    routed.ensure(FULL)
    expect(routed.chunks.map((c) => [c.x0, c.x1, c.roof])).toEqual(plain.chunks.map((c) => [c.x0, c.x1, c.roof]))
    // the first sector is secured from the start, the rest waits for a route
    expect(routed.sectorContents(0)).toEqual(plain.sectorContents(0))
    expect(routed.sectorContents(1)).toEqual({ shards: 0, drones: 0, lasers: 0 })
    routed.setRoute(1, STANDARD)
    expect(routed.sectorContents(1)).toEqual(plain.sectorContents(1))
  })

  it('lays more or less security by route, averaged over many cities', () => {
    const total = (route) => {
      const sum = { shards: 0, drones: 0, lasers: 0 }
      for (let seed = 1; seed <= 12; seed++) {
        const level = new Level(seed, heistOptions({ routed: true }))
        level.ensure(FULL)
        level.setRoute(2, route)
        const c = level.sectorContents(2)
        for (const k of Object.keys(sum)) sum[k] += c[k]
      }
      return sum
    }
    const base = total(STANDARD)
    expect(total(routeById('lockdown')).lasers).toBeGreaterThan(base.lasers * 1.4)
    expect(total(routeById('sweep')).drones).toBeGreaterThan(base.drones * 1.5)
    expect(total(routeById('vault')).shards).toBeGreaterThan(base.shards * 1.15)
    const alleys = total(routeById('alleys'))
    expect(alleys.lasers).toBeLessThan(base.lasers * 0.75)
    expect(alleys.shards).toBeLessThan(base.shards * 0.8)
  })

  it('keeps the roof under a checkpoint with the sector before it', () => {
    const level = new Level(5, heistOptions({ routed: true }))
    level.ensure(FULL)
    for (const c of level.chunks) if (c.checkpoint) expect(c.sector).toBe(c.checkpoint.index - 1)
  })

  it('takes a route at the uplink: its security, its pay and a contract', () => {
    const level = new Level(21, heistOptions({ routed: true }))
    level.ensure(FULL)
    const net = new HeistState(21)
    net.advance()
    net.openShop()
    expect(net.routeOffer).toHaveLength(2)
    net.routeOffer = [routeById('lockdown'), routeById('redline')]
    expect(net.takeRoute(0, level)).toBe(true)
    expect(net.route.id).toBe('lockdown')
    expect(net.contract).not.toBeNull()
    expect(level.sectorContents(1).lasers).toBeGreaterThan(0)
    // lockdown: shards are worth double
    const p = createPlayer(0, 0)
    const creds = net.creds
    net.step(0.01, p, { chunksIn: () => [{ shards: [{ x: 0, y: 1, taken: false }], lasers: [], drones: [] }] }, [])
    expect(net.creds - creds).toBe(HEIST.SHARD_EDDIES * 2)
    // red line triples the sector bonuses
    net.route = routeById('redline')
    net.contract = null
    p.speed = 16
    net.step(1, p, quiet, [])
    expect(net.settle()).toMatchObject({ cleanPay: HEIST.CLEAN_BONUS * 3, fastPay: HEIST.FAST_BONUS * 3 })
  })
})

describe('contracts', () => {
  it('only offers what the sector can give', () => {
    const rng = createRng(3)
    for (let i = 0; i < 100; i++) {
      const job = rollContract(rng, { shards: 4, drones: 1, lasers: 0 }, 50)
      expect(['takedowns', 'shards']).not.toContain(job.id)
    }
    const all = new Set()
    for (let i = 0; i < 300; i++) all.add(rollContract(rng, { shards: 30, drones: 5, lasers: 3 }, 50).id)
    expect(all.size).toBe(CONTRACTS.length)
  })

  it('counts up, completes once, and pays at the uplink', () => {
    const net = new HeistState(8)
    net.contract = { id: 'landslides', text: '3 LANDING SLIDES', avoid: false, target: 3, progress: 0, failed: false, pay: 50 }
    expect(net.move('landslide')).toBe(false)
    expect(net.move('landslide')).toBe(false)
    expect(net.move('landslide')).toBe(true)     // done: said once
    expect(net.move('landslide')).toBe(false)
    const pay = net.advance()
    expect(pay.contract).toEqual({ text: '3 LANDING SLIDES', done: true, pay: 50 })
    expect(net.stats.contracts).toBe(1)
    expect(net.contract).toBeNull()
  })

  it('fails the ones that ask you to avoid something', () => {
    const quietly = { id: 'untouched', avoid: true, target: 1, progress: 0, failed: false }
    expect(contractDone(quietly)).toBe(true)
    expect(trackContract(quietly, 'stumble')).toBe(true)
    expect(contractDone(quietly)).toBe(false)
    const ghost = { id: 'ghost', avoid: true, target: 1, progress: 0, failed: false }
    trackContract(ghost, 'trace', 0.3)
    expect(contractDone(ghost)).toBe(true)
    trackContract(ghost, 'trace', 0.55)
    expect(contractDone(ghost)).toBe(false)
  })

  it('times the seconds spent at speed and remembers the biggest combo', () => {
    const flow = { id: 'flow', avoid: false, target: 2, progress: 0, failed: false }
    trackContract(flow, 'speed', 11, 5)
    expect(flow.progress).toBe(0)
    trackContract(flow, 'speed', 16, 1.5)
    expect(trackContract(flow, 'speed', 16, 1)).toBe(true)
    const combo = { id: 'combo', avoid: false, target: 6, progress: 0, failed: false }
    trackContract(combo, 'bank', 4)
    trackContract(combo, 'bank', 2)
    expect(combo.progress).toBe(4)
    expect(trackContract(combo, 'bank', 7)).toBe(true)
  })
})

describe('maker sets', () => {
  it('gives every maker a set and every piece a maker with one', () => {
    for (const c of CHROME) expect(SETS[c.maker], c.id).toBeDefined()
    // every set can be completed: its maker sells at least two pieces' worth
    for (const maker of Object.keys(SETS)) {
      const room = CHROME.filter((c) => c.maker === maker).reduce((n, c) => n + c.max, 0)
      expect(room, maker).toBeGreaterThanOrEqual(SET_SIZE)
    }
  })

  it('switches a set on at two pieces, stacks included', () => {
    expect(activeSets(['calves'])).toEqual([])
    expect(activeSets(['calves', 'calves'])).toEqual(['VOLT'])
    expect(activeSets(['tendons', 'pneumatic', 'ghost'])).toEqual(['KITE'])
    const pre = PHYS.LANDSLIDE_PRE
    setPhysMods(chromeEffects(['tendons', 'pneumatic']).phys)
    expect(PHYS.LANDSLIDE_PRE).toBeGreaterThan(pre)
  })

  it('makes the sets do what they say', () => {
    // Bulwark: stumbles make no noise
    const strata = new HeistState(1)
    strata.owned = ['dampers', 'jammer']
    strata.fx = chromeEffects(strata.owned)
    strata.move('trip')
    expect(strata.trace).toBe(0)
    // Hardened: the first burn of a sector is free
    const nova = new HeistState(1)
    nova.owned = ['plating', 'insulated']
    nova.fx = chromeEffects(nova.owned)
    const p = createPlayer(0, 0)
    const events = []
    nova.trace = 1
    nova.step(0.01, p, quiet, events)
    expect(events.at(-1)).toMatchObject({ type: 'traced', free: true })
    const integrity = nova.integrity
    nova.trace = 1
    nova.step(0.01, p, quiet, events)
    expect(nova.integrity).toBe(integrity - 1)
    // Ghost Market: free rerolls, and the uplink pays
    const zen = new HeistState(1)
    zen.owned = ['ghost', 'siphon']
    zen.fx = chromeEffects(zen.owned)
    expect(zen.rerollCost).toBe(0)
    expect(zen.advance().extra).toBe(30)
    // Reflex: a banked combo jams the trace
    const pulse = new HeistState(1)
    pulse.owned = ['synapse', 'synapse']
    pulse.fx = chromeEffects(pulse.owned)
    pulse.trace = 0.5
    pulse.banked(10)
    expect(pulse.trace).toBeLessThan(0.4)
    // Live Wire: full speed hides more
    const volt = new HeistState(1), plain = new HeistState(1)
    volt.owned = ['calves', 'adrenal']
    volt.fx = chromeEffects(volt.owned)
    p.speed = 17
    volt.step(1, p, quiet, [])
    plain.step(1, p, quiet, [])
    expect(volt.trace).toBeLessThan(plain.trace * 0.5)
  })
})

describe('threat, runners and the daily', () => {
  it('makes each threat level hotter and worth more', () => {
    expect(threatScore(0)).toBe(1)
    expect(threatScore(2)).toBeGreaterThan(threatScore(1))
    expect(atThreat(STANDARD, 0)).toBe(STANDARD)
    expect(atThreat(STANDARD, 3).laser).toBeGreaterThan(1)
    const p = createPlayer(0, 0)
    const calm = new HeistState(1), hot = new HeistState(1, { threat: 3 })
    calm.step(1, p, quiet, [])
    hot.step(1, p, quiet, [])
    expect(hot.trace).toBeCloseTo(calm.trace * (1 + HEIST.THREAT_TRACE * 3))
  })

  it('starts each runner differently', () => {
    expect(Object.keys(LOADOUTS)).toEqual(['courier', 'windbreaker', 'techwear'])
    const courier = new HeistState(1)
    expect([courier.integrity, courier.owned, courier.creds]).toEqual([HEIST.INTEGRITY, [], 0])
    const wind = new HeistState(1, { loadout: 'windbreaker' })
    expect(wind.integrity).toBe(HEIST.INTEGRITY - 1)
    expect(PHYS.AIR_JUMPS).toBe(1)
    // plating still adds on top of the lower start
    wind.creds = 500
    wind.openShop()
    wind.freePick = false
    expect(wind.install('plating')).toBe(true)
    expect(wind.maxIntegrity).toBe(HEIST.INTEGRITY)
    wind.dispose()
    const tech = new HeistState(1, { loadout: 'techwear' })
    expect(tech.creds).toBe(100)
    expect(tech.owned).toEqual(['optics'])
    const p = createPlayer(0, 0)
    const plain = new HeistState(1)
    tech.step(1, p, quiet, [])
    plain.step(1, p, quiet, [])
    expect(tech.trace).toBeGreaterThan(plain.trace)
  })

  it('raises the alarm over the last stretch', () => {
    const net = new HeistState(1)
    net.exfilX = 100
    const p = createPlayer(50, 0)
    const events = []
    net.step(1, p, quiet, events)
    const before = net.trace
    expect(events).toEqual([])
    p.x = 101
    net.step(1, p, quiet, events)
    net.step(1, p, quiet, events)
    expect(events.filter((e) => e.type === 'exfil')).toHaveLength(1)
    expect(net.trace - before).toBeCloseTo(before * 2 * HEIST.EXFIL_TRACE)
  })

  it('seeds one heist a day, apart from the daily trial', () => {
    const a = dailyHeist(new Date(2026, 10, 10)), b = dailyHeist(new Date(2026, 10, 11))
    expect(a.seed).toBe(dailyHeist(new Date(2026, 10, 10)).seed)
    expect(a.seed).not.toBe(b.seed)
    expect(a.seed).not.toBe(dailyTrack(new Date(2026, 10, 10)).seed)
    // the same day gives the same doc and the same ways on
    const one = new HeistState(a.seed), two = new HeistState(a.seed)
    one.openShop()
    two.openShop()
    expect(one.offer).toEqual(two.offer)
    expect(one.routeOffer).toEqual(two.routeOffer)
  })
})

describe('routed heists', () => {
  // whichever way a clean runner goes, the city can be crossed
  it('extracts by the safe ways and by the hot ones', () => {
    for (const route of ['safe', 'hot']) {
      for (const seed of [1000, 8919]) {
        const run = simulateHeist(seed, { route })
        expect(run.extracted, `${route} ${seed}`).toBe(true)
        expect(run.falls).toBeLessThanOrEqual(1)
        expect(run.routes).toHaveLength(HEIST.SECTORS - 1)
      }
    }
  }, 240000)

  it('pays more for the hot ways, and threat makes the same city harder', () => {
    const seeds = [1000, 8919, 16838]
    const mean = (options, f) => seeds.reduce((sum, seed) => sum + f(simulateHeist(seed, options)), 0) / seeds.length
    expect(mean({ route: 'hot' }, (r) => r.creds)).toBeGreaterThan(mean({ route: 'safe' }, (r) => r.creds))
    const late = (r) => Math.max(0, ...r.samples.filter((s) => s.sector === 3).map((s) => s.trace))
    expect(mean({ threat: 4 }, late)).toBeGreaterThan(mean({}, late) + 0.15)
  }, 300000)
})

describe('the fixer', () => {
  it('sells only things that exist, and keeps them out of a heist until bought', () => {
    for (const u of UNLOCKS) {
      if (u.kind === 'chrome') expect(CHROME.find((c) => c.id === u.id)?.unlock, u.id).toBe(true)
      if (u.kind === 'route') expect(ROUTES.find((r) => r.id === u.id)?.unlock, u.id).toBe(true)
    }
    const locked = (things) => things.filter((t) => t.unlock).map((t) => t.id).sort()
    expect([...locked(CHROME), ...locked(ROUTES)].sort()).toEqual(UNLOCKS.filter((u) => u.kind !== 'perk').map((u) => u.id).sort())
    const base = new HeistState(3), stocked = new HeistState(3, { unlocked: UNLOCKS.map((u) => u.id) })
    const seen = (net) => {
      const ids = new Set()
      for (let i = 0; i < 80; i++) { net.openShop(); for (const c of net.offer) ids.add(c.id); for (const r of net.routeOffer) ids.add(r.id) }
      return ids
    }
    const plain = seen(base), full = seen(stocked)
    for (const id of ['shocksoles', 'glide', 'deadman', 'phase', 'blackout', 'goldrush']) {
      expect(plain.has(id), id).toBe(false)
      expect(full.has(id), id).toBe(true)
    }
    base.creds = 999
    base.freePick = false
    expect(base.install('phase')).toBe(false)
  })

  it('applies standing perks', () => {
    const net = new HeistState(3, { unlocked: ['pockets', 'favor', 'medic'] })
    expect(net.creds).toBe(60)
    expect(net.repairCost).toBe(HEIST.REPAIR_COST - 30)
    net.openShop()
    expect(net.rerollCost).toBe(0)
    net.reroll()
    expect(net.rerollCost).toBe(HEIST.REROLL_COST)
  })

  it('pays rep for getting further, doing jobs and getting out', () => {
    expect(repFor({ sector: 0, extracted: false, contracts: 0 })).toBe(0)
    expect(repFor({ sector: 2, extracted: false, contracts: 1 })).toBe(25)
    const out = repFor({ sector: 5, extracted: true, contracts: 3 })
    expect(out).toBeGreaterThan(repFor({ sector: 4, extracted: false, contracts: 3 }) + 30)
    expect(repFor({ sector: 5, extracted: true, contracts: 3, threat: 2 })).toBeGreaterThan(out)
  })
})

describe('deals', () => {
  const deal = (id) => ({ ...DEALS.find((d) => d.id === id), taken: false })

  it('offers one at every uplink, good once', () => {
    const net = new HeistState(6)
    net.openShop()
    expect(net.deal).not.toBeNull()
    net.deal = deal('blood')
    expect(net.takeDeal()).toBe(true)
    expect([net.integrity, net.creds]).toEqual([HEIST.INTEGRITY - 1, 150])
    expect(net.takeDeal()).toBe(false)
  })

  it('never takes the last point of integrity or creds you do not have', () => {
    const net = new HeistState(6)
    net.integrity = 1
    net.deal = deal('blood')
    expect(net.canDeal).toBe(false)
    net.deal = deal('crate')
    expect(net.canDeal).toBe(false)
    net.creds = 50
    const name = net.takeDeal()
    expect(typeof name).toBe('string')
    expect(net.owned).toHaveLength(1)
    expect(net.creds).toBe(0)
  })

  it('scrubs the trace, burns it for creds, and triples the next contract', () => {
    const net = new HeistState(6)
    const level = new Level(6, heistOptions({ routed: true }))
    level.ensure(FULL)
    net.creds = 100
    net.trace = 0.5
    net.deal = deal('scrub')
    net.takeDeal()
    expect([net.trace, net.creds]).toEqual([0, 40])
    net.deal = deal('burner')
    net.takeDeal()
    expect(net.trace).toBeCloseTo(0.3)
    expect(net.creds).toBe(150)
    net.deal = deal('tipoff')
    net.takeDeal()
    expect(net.startSector(level).pay).toBe(HEIST.CONTRACT_PAY * 3)
    expect(net.startSector(level).pay).toBe(HEIST.CONTRACT_PAY)
  })
})

describe('chrome that changes what you do', () => {
  const laser = () => ({ id: 'L', x0: -1, x1: 1, y0: 0.05, y1: 0.27, low: true, tripped: false })
  const withChrome = (ids) => {
    const net = new HeistState(2, { unlocked: ids })
    for (const id of ids) net.grant(id)
    return net
  }

  it('shorts a laser grid out with a slide', () => {
    const net = withChrome(['shocksoles'])
    const chunk = { shards: [], lasers: [laser()], drones: [] }
    const p = createPlayer(0, 0)
    p.state = 'slide'
    const events = []
    net.step(0.01, p, { chunksIn: () => [chunk] }, events)
    expect(events.map((e) => e.type)).toEqual(['short'])
    expect(chunk.lasers).toHaveLength(0)
    expect(net.creds).toBe(HEIST.SHORT_CREDS)
    expect(net.stats.zaps).toBe(0)
    // running into one still trips it
    const again = { shards: [], lasers: [laser()], drones: [] }
    p.state = 'run'
    net.step(0.01, p, { chunksIn: () => [again] }, events)
    expect(again.lasers[0].tripped).toBe(true)
  })

  it('hides you from security while Focus is on, with a Phase Shifter', () => {
    const net = withChrome(['phase'])
    const chunk = { shards: [], lasers: [laser()], drones: [{ id: 'D', x: -2, y: 2.75, down: false, spotted: false, passed: false }] }
    const p = createPlayer(0, 0)
    net.cloaked = true
    const events = []
    net.step(0.01, p, { chunksIn: () => [chunk] }, events)
    expect(events).toEqual([])
    expect(chunk.lasers[0].tripped).toBe(false)
    expect(chunk.drones[0]).toMatchObject({ passed: true, spotted: false })
    net.cloaked = false
    net.step(0.01, p, { chunksIn: () => [chunk] }, events)
    expect(chunk.lasers[0].tripped).toBe(true)
  })

  it('comes back once from a flatline with a Deadman Switch', () => {
    const net = withChrome(['deadman'])
    net.integrity = 1
    expect(net.hurt()).toBe(1)
    expect(net.notices).toEqual(['deadman'])
    expect(net.hurt()).toBe(0)
  })

  it('glides while jump is held, and drops when it is let go', () => {
    const level = { solidsIn: () => [], wallrunsIn: () => [], fencesIn: () => [], padsIn: () => [], ziplinesIn: () => [], roofAt: () => null, killY: () => -1000, lowestRoofAhead: () => -1000, chunksIn: () => [] }
    const fall = (hold, glide) => {
      const net = glide ? withChrome(['glide']) : new HeistState(2)
      const p = createPlayer(0, 100)
      p.state = 'air'
      for (let i = 0; i < 240; i++) stepPlayer(p, { jump: hold, jumpPressed: false, down: false, downPressed: false }, PHYS.FIXED_DT, level, [])
      net.dispose()
      return 100 - p.y
    }
    const plain = fall(true, false)
    expect(fall(true, true)).toBeLessThan(plain * 0.3)
    expect(fall(false, true)).toBeCloseTo(fall(false, false))
    expect(PHYS.GLIDE_FALL).toBe(0)
  })
})

describe('sector par', () => {
  it('sets the fast bonus from how long the sector really is, with slack for the standing start', () => {
    const level = new Level(1000, heistOptions({ routed: true }))
    level.ensure(FULL)
    const net = new HeistState(1000)
    net.startSector(level)
    const length = level.checkpoints[0].x
    expect(net.leg.par).toBeCloseTo(length / HEIST.FIRST_PAR_SPEED)
    // the autopilot makes par in the first sector on every one of these cities
    for (const seed of [1000, 8919, 16838]) expect(simulateHeist(seed).payouts[0].fast, seed).toBe(true)
  }, 240000)

  it('does not offer a quiet-trace job when the trace is already up', () => {
    const rng = createRng(4)
    for (let i = 0; i < 200; i++) expect(rollContract(rng, { shards: 30, drones: 5, lasers: 3 }, 50, 0.45).id).not.toBe('ghost')
  })
})
