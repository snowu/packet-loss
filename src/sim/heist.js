// Heist: the roguelike run. Five sectors of city, one per district, with a
// street doc at every uplink between them. Corp security traces you while you
// run; flow pulls the trace back down, mistakes and hazards push it up, and
// when it fills, ICE burns a point of integrity. Pure state, no DOM.

import { HEIST, PHYS, setPhysMods } from './config.js'
import { createRng } from './rng.js'
import { bodyHeight, isGrounded } from './player.js'
import { CHROME, chromeEffects, rollOffer, countOf } from './chrome.js'

// Moves that jam the trace: the ones the city hands you. Slide jumps feed a
// combo but can be repeated on any flat roof, so they don't jam.
const JAMMING = new Set(['vault', 'roll', 'wallrun', 'walljump', 'zip', 'spring', 'padjump', 'grab', 'climb', 'landslide', 'airjump', 'clamber'])
// Mistakes make noise: each one feeds the trace.
const STUMBLES = new Set(['trip', 'bonk', 'hardland', 'shock'])

// 0 at the minimum running speed, 1 at the speed that fully counts as flow.
export function flowOf(speed) {
  return Math.max(0, Math.min(1, (speed - PHYS.SPEED_MIN) / (HEIST.TRACE_FLOW_SPEED - PHYS.SPEED_MIN)))
}

// Trace per second at a sector and speed, before chrome.
export function traceRate(sector, speed) {
  return HEIST.TRACE_RATE * (1 + HEIST.TRACE_PER_SECTOR * sector) * (1 - HEIST.TRACE_FLOW_HIDE * flowOf(speed))
}

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

export function heistOptions() {
  return {
    tutorial: false,
    length: HEIST.SECTORS * HEIST.SECTOR_LEN,
    checkpointEvery: HEIST.SECTOR_LEN,
    difficulty: { start: 0.15, ramp: HEIST.SECTORS * HEIST.SECTOR_LEN * 0.9 },
    heist: true,
  }
}

export class HeistState {
  constructor(seed) {
    this.seed = seed >>> 0
    this.rng = createRng(this.seed ^ 0xc0ffee)
    this.sector = 0
    this.trace = 0
    this.integrity = HEIST.INTEGRITY
    this.maxIntegrity = HEIST.INTEGRITY
    this.creds = 0
    this.owned = []
    this.offer = []
    this.repairs = 0
    this.bought = 0             // chrome paid for this run
    this.freePick = false       // the free piece at the current uplink is still unclaimed
    this.leg = { time: 0, dirty: false, falls: 0 }   // the sector being run
    this.stats = { shards: 0, takedowns: 0, zaps: 0, spotted: 0, burns: 0, falls: 0, clean: 0 }
    this.fx = chromeEffects([])
    setPhysMods({})
  }

  get mods() { return this.fx.run }
  get repairCost() { return HEIST.REPAIR_COST + HEIST.REPAIR_STEP * this.repairs }
  get rerollCost() { return HEIST.REROLL_COST }
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
    this.freePick = true
    return this.offer
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
    const max = Math.max(1, HEIST.INTEGRITY + this.fx.run.maxIntegrity)
    if (max > this.maxIntegrity) this.integrity += max - this.maxIntegrity
    this.maxIntegrity = max
    this.integrity = Math.max(1, Math.min(this.integrity, max))
    const i = this.offer.findIndex((o) => o?.id === id)
    if (i >= 0) this.offer[i] = null
    return true
  }

  // Reached the uplink at the end of the current sector: the sector pays out,
  // and only part of the trace follows you through. Returns the payout.
  advance() {
    const leg = this.leg
    const clean = !leg.dirty && leg.falls === 0
    const fast = leg.time <= HEIST.SECTOR_LEN / HEIST.SECTOR_PAR_SPEED
    const creds = (clean ? HEIST.CLEAN_BONUS : 0) + (fast ? HEIST.FAST_BONUS : 0)
    if (clean) this.stats.clean++
    this.creds += creds
    this.sector++
    this.trace *= HEIST.TRACE_CARRY
    this.leg = { time: 0, dirty: false, falls: 0 }
    return { clean, fast, creds, time: leg.time }
  }

  // Leave PHYS as we found it.
  dispose() { setPhysMods({}) }

  // ── per step ───────────────────────────────────────────────────────────

  // A scored move or event from the runner.
  move(type) {
    if (JAMMING.has(type)) this.trace = Math.max(0, this.trace - HEIST.TRACE_MOVE * this.mods.moveJam)
    else if (STUMBLES.has(type)) this.trace += HEIST.TRACE_STUMBLE
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
    this.trace += traceRate(this.sector, p.speed) * m.traceRate * dt
    this.leg.time += dt
    if (!p.alive) return

    const hw = 0.3
    const h = bodyHeight(p)
    const bx0 = p.x - hw, bx1 = p.x + hw, by0 = p.y, by1 = p.y + h
    for (const c of level.chunksIn(p.x - 3, p.x + 3)) {
      const r = HEIST.SHARD_RADIUS + m.magnet
      for (const s of c.shards) {
        if (s.taken) continue
        if (s.x < bx0 - r || s.x > bx1 + r || s.y < by0 - r || s.y > by1 + r) continue
        s.taken = true
        this.creds += HEIST.SHARD_EDDIES * m.shardValue
        this.stats.shards++
        this.trace = Math.max(0, this.trace - HEIST.TRACE_SHARD)
        events.push({ type: 'shard', x: s.x, y: s.y })
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
      this.hurt()
      events.push({ type: 'traced', x: p.x, y: p.y })
    }
  }
}
