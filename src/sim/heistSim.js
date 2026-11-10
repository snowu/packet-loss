// A whole heist driven by the autopilot, for balance checks: the tests use
// it to prove careful play extracts, the art lab charts the trace with it.
// No chrome and no repairs, so it shows the raw economy.

import { PHYS, HEIST } from './config.js'
import { Level } from './level.js'
import { Bot } from './bot.js'
import { createPlayer, stepPlayer } from './player.js'
import { HeistState, heistOptions } from './heist.js'
import { createRng } from './rng.js'

// careful: the autopilot steers around lasers and drone scans; otherwise it
// runs the course as if they weren't there. chrome: ids installed one per
// uplink, in order. every: seconds between samples.
// slip: share of roofs (picked by seed) on which a careful autopilot stops
// watching for security, to stand in for a player who isn't perfect.
// route: which of the two ways on to take at each uplink: 'safe' (the cooler
// one), 'hot', or nothing to stay on the main line throughout.
export function simulateHeist(seed, { careful = true, chrome = [], every = 0.25, maxTime = 600, slip = 0, route = null, threat = 0, loadout = 'courier' } = {}) {
  const level = new Level(seed, heistOptions({ threat, routed: !!route }))
  level.ensure(HEIST.SECTORS * HEIST.SECTOR_LEN + 120)
  const net = new HeistState(seed, { threat, loadout })
  net.startSector(level)
  const bot = new Bot(level, { heist: careful })
  let p = createPlayer(0, level.roofAt(0))
  const events = []
  const samples = [], marks = []
  const sectors = [0, ...level.checkpoints.map((c) => c.x), level.finish.x]
  let t = 0, nextSample = 0, falls = 0
  const slips = createRng((seed ^ 0x51f) >>> 0)
  let roof = null
  const payouts = [], routes = []
  while (p.x < level.finish.x && t < maxTime && net.integrity > 0) {
    if (slip > 0 && careful) {
      const here = level.roofStartBehind(p.x + 6).x
      if (here !== roof) { roof = here; bot.heist = !slips.chance(slip) }
    }
    events.length = 0
    stepPlayer(p, bot.input(p), PHYS.FIXED_DT, level, events)
    net.step(PHYS.FIXED_DT, p, level, events)
    t += PHYS.FIXED_DT
    for (const e of events) {
      net.move(e.type)
      if (e.type === 'zap' || e.type === 'spotted' || e.type === 'traced' || e.type === 'takedown') marks.push({ type: e.type, x: p.x, t })
    }
    if (net.sector < level.checkpoints.length && p.x >= level.checkpoints[net.sector].x) {
      payouts.push(net.advance())
      net.openShop()
      if (chrome[net.sector - 1]) net.install(chrome[net.sector - 1])
      if (route) net.takeRoute(route === 'hot' ? 1 : 0, level)
      else net.startSector(level)
      routes.push(net.route.id)
    }
    if (!p.alive) {
      falls++
      net.fall()
      const r = level.roofStartBehind(p.x)
      p = createPlayer(r.x, r.y)
      p.speed = PHYS.SPEED_MIN
    }
    level.prune(p.x - 90)
    if (t >= nextSample) {
      samples.push({ x: p.x, t, trace: Math.min(1, net.trace), speed: p.speed, sector: net.sector })
      nextSample += every
    }
  }
  net.dispose()
  return {
    seed, careful, time: t, falls, sectors, samples, marks,
    stats: { ...net.stats }, integrity: net.integrity, maxIntegrity: net.maxIntegrity, creds: net.creds, payouts, routes, sector: net.sector,
    extracted: p.x >= level.finish.x && net.integrity > 0,
  }
}
