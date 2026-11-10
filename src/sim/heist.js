// Heist: the roguelike run. Five sectors of city, one per district, with a
// street doc at every uplink between them. Corp security traces you while you
// run; flow pulls the trace back down, mistakes and hazards push it up, and
// when it fills, ICE burns a point of integrity. Pure state, no DOM.

import { HEIST, PHYS, setPhysMods } from './config.js'
import { createRng } from './rng.js'
import { bodyHeight, isGrounded } from './player.js'
import { CHROME, chromeEffects, rollOffer, countOf } from './chrome.js'
import { STANDARD, rollRoutes } from './routes.js'
import { rollContract, trackContract, contractDone } from './contracts.js'

// Moves that jam the trace: the ones the city hands you. Slide jumps feed a
// combo but can be repeated on any flat roof, so they don't jam.
const JAMMING = new Set(['vault', 'roll', 'wallrun', 'walljump', 'zip', 'spring', 'padjump', 'grab', 'climb', 'landslide', 'airjump', 'clamber'])
// Mistakes make noise: each one feeds the trace.
const STUMBLES = new Set(['trip', 'bonk', 'hardland', 'shock'])

// 0 at the minimum running speed, 1 at the speed that fully counts as flow.
export function flowOf(speed) {
  return Math.max(0, Math.min(1, (speed - PHYS.SPEED_MIN) / (HEIST.TRACE_FLOW_SPEED - PHYS.SPEED_MIN)))
}

// Trace per second at a sector and speed, before chrome. hide: how much more
// of it full speed covers than the standard share.
export function traceRate(sector, speed, hide = 0) {
  return HEIST.TRACE_RATE * (1 + HEIST.TRACE_PER_SECTOR * sector) * (1 - Math.min(0.95, HEIST.TRACE_FLOW_HIDE + hide) * flowOf(speed))
}

// Who is running: each runner starts a heist differently.
export const LOADOUTS = {
  courier: { perk: 'Three integrity, no strings.' },
  windbreaker: { perk: 'Starts with an air jump. Two integrity.', chrome: ['tendons'], integrity: -1 },
  techwear: { perk: 'Starts with Tachyon Optics and ¢100. Trace builds 15% faster.', chrome: ['optics'], creds: 100, trace: 1.15 },
}

// A route as a threat level meets it: denser security.
export function atThreat(route, threat) {
  const k = 1 + HEIST.THREAT_SECURITY * threat
  return threat ? { ...route, laser: route.laser * k, drone: route.drone * k } : route
}

export const threatScore = (threat) => 1 + HEIST.THREAT_SCORE * threat

// What the hazards would do to a runner, without touching them: the
// autopilot uses it to look ahead. Returns a cost per step (lasers and drone
// scans cost, takedowns don't) and remembers what it has judged.
export class HazardProbe {
  constructor() { this.seen = new Set() }

  cost(p, level) {
    if (!p.alive) return 0
    const h = bodyHeight(p)
    const bx0 = p.x - 0.3, bx1 = p.x + 0.3, by0 = p.y, by1 = p.y + h
    let cost = 0
    for (const c of level.chunksIn(p.x - 3, p.x + 3)) {
      for (const l of c.lasers ?? []) {
        if (l.tripped || this.seen.has(l.id)) continue
        if (l.x1 < bx0 || l.x0 > bx1 || l.y1 < by0 || l.y0 > by1) continue
        this.seen.add(l.id)
        cost += 3
      }
      for (const d of c.drones ?? []) {
        if (d.down || d.passed || this.seen.has(d.id)) continue
        const touching = bx1 > d.x - HEIST.DRONE_W / 2 && bx0 < d.x + HEIST.DRONE_W / 2 && by1 > d.y && by0 < d.y + HEIST.DRONE_H
        if (touching && !isGrounded(p)) this.seen.add(d.id)
        else if (p.x > d.x + 0.6) {
          this.seen.add(d.id)
          if (by0 < d.y + HEIST.DRONE_H) cost += 2
        }
      }
    }
    return cost
  }
}

// routed: only the first sector's security is laid at the start; the rest
// waits for the route the runner picks at each uplink (Level.setRoute).
export function heistOptions({ threat = 0, routed = false } = {}) {
  const options = {
    tutorial: false,
    length: HEIST.SECTORS * HEIST.SECTOR_LEN,
    checkpointEvery: HEIST.SECTOR_LEN,
    difficulty: { start: Math.min(0.6, 0.15 + 0.07 * threat), ramp: HEIST.SECTORS * HEIST.SECTOR_LEN * 0.9 },
    heist: true,
  }
  const standard = atThreat(STANDARD, threat)
  options.routes = routed ? [standard] : Array.from({ length: HEIST.SECTORS + 1 }, () => standard)
  return options
}

export class HeistState {
  // threat: 0 and up, each level hotter. loadout: a key of LOADOUTS.
  constructor(seed, { threat = 0, loadout = 'courier' } = {}) {
    this.seed = seed >>> 0
    this.rng = createRng(this.seed ^ 0xc0ffee)
    this.jobs = createRng(this.seed ^ 0x10b5)   // contracts: their own rolls, so rerolls don't shift them
    this.threat = threat
    this.loadout = LOADOUTS[loadout] ?? LOADOUTS.courier
    this.sector = 0
    this.trace = 0
    this.creds = this.loadout.creds ?? 0
    this.owned = [...(this.loadout.chrome ?? [])]
    this.offer = []
    this.route = STANDARD       // the way across the current sector
    this.routeOffer = []        // the ways on, at an uplink
    this.contract = null
    this.exfilX = Infinity      // where the last stretch starts
    this.exfil = false
    this.repairs = 0
    this.bought = 0             // chrome paid for this run
    this.freePick = false       // the free piece at the current uplink is still unclaimed
    this.leg = { time: 0, dirty: false, falls: 0, burns: 0 }   // the sector being run
    this.stats = { shards: 0, takedowns: 0, zaps: 0, spotted: 0, burns: 0, falls: 0, clean: 0, contracts: 0 }
    this.fx = chromeEffects(this.owned)
    setPhysMods(this.fx.phys)
    this.maxIntegrity = this.integrityCap
    this.integrity = this.maxIntegrity
  }

  get integrityCap() { return Math.max(1, HEIST.INTEGRITY + this.fx.run.maxIntegrity + (this.loadout.integrity ?? 0)) }
  get mods() { return this.fx.run }
  get repairCost() { return HEIST.REPAIR_COST + HEIST.REPAIR_STEP * this.repairs }
  get rerollCost() { return this.mods.freeRerolls ? 0 : HEIST.REROLL_COST }
  get canRepair() { return this.integrity < this.maxIntegrity && this.creds >= this.repairCost }
  get canReroll() { return this.creds >= this.rerollCost }

  // What a piece on offer costs right now: nothing while the uplink's free
  // pick is unclaimed.
  priceOf(c) {
    if (this.freePick) return 0
    return (c.rare ? HEIST.CHROME_COST_RARE : HEIST.CHROME_COST) + HEIST.CHROME_COST_STEP * this.bought
  }

  canInstall(c) {
    return !!c && countOf(this.owned, c.id) < c.max && this.creds >= this.priceOf(c)
  }

  // ── street doc ──────────────────────────────────────────────────────────

  openShop() {
    this.offer = rollOffer(this.rng, this.owned)
    this.routeOffer = rollRoutes(this.rng)
    this.freePick = true
    return this.offer
  }

  // Leave the uplink by one of the ways on offer: the sector ahead gets that
  // route's security and a contract to go with it.
  takeRoute(i, level) {
    const route = this.routeOffer[i]
    if (!route) return false
    this.route = route
    this.routeOffer = []
    level.setRoute(this.sector, atThreat(route, this.threat))
    this.startSector(level)
    return true
  }

  // Roll the contract for the sector about to be run.
  startSector(level) {
    this.contract = rollContract(this.jobs, level.sectorContents(this.sector), HEIST.CONTRACT_PAY)
    if (level.finish) this.exfilX = level.finish.x - HEIST.EXFIL_LEN
    return this.contract
  }

  reroll() {
    if (!this.canReroll) return false
    this.creds -= this.rerollCost
    this.offer = rollOffer(this.rng, this.owned)
    return true
  }

  repair() {
    if (!this.canRepair) return false
    this.creds -= this.repairCost
    this.repairs++
    this.integrity++
    return true
  }

  // Install a piece: the first at each uplink is free, the rest cost creds.
  // What's left of the offer stays on the table.
  install(id) {
    const c = CHROME.find((x) => x.id === id)
    if (!this.canInstall(c)) return false
    if (this.freePick) this.freePick = false
    else {
      this.creds -= this.priceOf(c)
      this.bought++
    }
    this.owned.push(id)
    this.fx = chromeEffects(this.owned)
    setPhysMods(this.fx.phys)
    const max = this.integrityCap
    if (max > this.maxIntegrity) this.integrity += max - this.maxIntegrity
    this.maxIntegrity = max
    this.integrity = Math.max(1, Math.min(this.integrity, max))
    const i = this.offer.findIndex((o) => o?.id === id)
    if (i >= 0) this.offer[i] = null
    return true
  }

  // What the sector just run pays: bonuses for a clean and a fast one (as
  // the route weighs them) and the contract. Closes the sector's books.
  settle() {
    const leg = this.leg
    const clean = !leg.dirty && leg.falls === 0
    const fast = leg.time <= HEIST.SECTOR_LEN / HEIST.SECTOR_PAR_SPEED
    const k = this.route.payout
    const job = this.contract
    const done = contractDone(job)
    const contract = job ? { text: job.text, done, pay: done ? job.pay : 0 } : null
    const cleanPay = clean ? HEIST.CLEAN_BONUS * k : 0, fastPay = fast ? HEIST.FAST_BONUS * k : 0
    const creds = cleanPay + fastPay + (contract?.pay ?? 0) + this.mods.uplinkCreds
    if (clean) this.stats.clean++
    if (done) this.stats.contracts++
    this.creds += creds
    this.contract = null
    this.leg = { time: 0, dirty: false, falls: 0, burns: 0 }
    return { clean, fast, cleanPay, fastPay, creds, time: leg.time, contract, extra: this.mods.uplinkCreds }
  }

  // Reached the uplink at the end of the current sector: the sector pays out,
  // and only part of the trace follows you through. Returns the payout.
  advance() {
    const pay = this.settle()
    this.sector++
    this.trace *= HEIST.TRACE_CARRY
    return pay
  }

  // Leave PHYS as we found it.
  dispose() { setPhysMods({}) }

  // ── per step ───────────────────────────────────────────────────────────

  // A scored move or event from the runner.
  // Returns true when the move settled the sector's contract either way.
  move(type) {
    const m = this.mods
    if (JAMMING.has(type)) {
      this.trace = Math.max(0, this.trace - HEIST.TRACE_MOVE * m.moveJam * (type === 'grab' ? m.grabJam : 1))
      return trackContract(this.contract, type)
    }
    if (STUMBLES.has(type)) {
      if (!m.quietStumbles) this.trace += HEIST.TRACE_STUMBLE
      return trackContract(this.contract, 'stumble')
    }
    return false
  }

  // A combo went to the bank at this multiplier.
  banked(mult) {
    this.trace = Math.max(0, this.trace - this.mods.bankJam * mult)
    return trackContract(this.contract, 'bank', mult)
  }

  hurt() {
    this.integrity = Math.max(0, this.integrity - 1)
    return this.integrity
  }

  // Fell off the city. Returns true when chrome caught it for free.
  fall() {
    this.stats.falls++
    const free = this.leg.falls++ < this.mods.freeFalls
    if (!free) this.hurt()
    return free
  }

  // Advance trace and resolve pickups and hazards against the runner. Events
  // are pushed in the same shape the player emits.
  step(dt, p, level, events) {
    const m = this.mods
    // the last stretch: security knows where you're going
    if (!this.exfil && p.x >= this.exfilX) {
      this.exfil = true
      events.push({ type: 'exfil', x: p.x, y: p.y })
    }
    const heat = m.traceRate * this.route.trace * (this.loadout.trace ?? 1) * (1 + HEIST.THREAT_TRACE * this.threat) * (this.exfil ? HEIST.EXFIL_TRACE : 1)
    this.trace += traceRate(this.sector, p.speed, m.flowHide) * heat * dt
    this.leg.time += dt
    if (!p.alive) return
    const job = this.contract
    if (job && (trackContract(job, 'speed', p.speed, dt) || trackContract(job, 'trace', this.trace))) events.push({ type: 'contract', failed: job.failed })

    const hw = 0.3
    const h = bodyHeight(p)
    const bx0 = p.x - hw, bx1 = p.x + hw, by0 = p.y, by1 = p.y + h
    for (const c of level.chunksIn(p.x - 3, p.x + 3)) {
      const r = HEIST.SHARD_RADIUS + m.magnet
      for (const s of c.shards) {
        if (s.taken) continue
        if (s.x < bx0 - r || s.x > bx1 + r || s.y < by0 - r || s.y > by1 + r) continue
        s.taken = true
        if (trackContract(job, 'shard')) events.push({ type: 'contract', failed: false })
        this.creds += HEIST.SHARD_EDDIES * m.shardValue * this.route.shardValue
        this.stats.shards++
        this.trace = Math.max(0, this.trace - HEIST.TRACE_SHARD)
        events.push({ type: 'shard', x: s.x, y: s.y, focus: m.shardFocus })
      }
      for (const l of c.lasers) {
        if (l.tripped) continue
        if (l.x1 < bx0 || l.x0 > bx1 || l.y1 < by0 || l.y0 > by1) continue
        l.tripped = true
        this.leg.dirty = true
        this.stats.zaps++
        this.trace += HEIST.TRACE_ZAP * m.zapTrace
        events.push({ type: 'zap', x: p.x, y: (l.y0 + l.y1) / 2, keepsCombo: m.zapKeepsCombo })
      }
      for (const d of c.drones) {
        if (d.down) continue
        const dx0 = d.x - HEIST.DRONE_W / 2, dx1 = d.x + HEIST.DRONE_W / 2
        const touching = bx1 > dx0 && bx0 < dx1 && by1 > d.y && by0 < d.y + HEIST.DRONE_H
        if (touching && !isGrounded(p)) {
          d.down = true
          this.stats.takedowns++
          this.creds += this.route.takedownCreds
          if (trackContract(job, 'takedown')) events.push({ type: 'contract', failed: false })
          this.trace = Math.max(0, this.trace - HEIST.TRACE_TAKEDOWN)
          if (p.state === 'air') {
            p.vy = Math.max(p.vy, HEIST.TAKEDOWN_VY)
            p.jumpHoldActive = false
          }
          if (m.takedownSpeed) p.speed = Math.min(PHYS.SPEED_MAX, p.speed + m.takedownSpeed)
          events.push({ type: 'takedown', x: d.x, y: d.y, focus: m.takedownFocus })
        } else if (!d.passed && p.x > d.x + 0.6) {
          // judged once, as you go by: under the scanner you're seen,
          // clear over the top you're not
          d.passed = true
          if (by0 < d.y + HEIST.DRONE_H) {
            d.spotted = true
            this.leg.dirty = true
            this.stats.spotted++
            this.trace += HEIST.TRACE_SPOT * m.spotTrace
            events.push({ type: 'spotted', x: d.x, y: d.y })
          }
        }
      }
    }

    if (this.trace >= 1) {
      this.trace = HEIST.TRACE_AFTER_BURN
      this.leg.dirty = true
      this.stats.burns++
      const free = this.leg.burns++ < m.freeBurns
      if (!free) this.hurt()
      events.push({ type: 'traced', x: p.x, y: p.y, free })
    }
  }
}
