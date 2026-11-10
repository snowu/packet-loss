// Streams generated chunks around the player and answers collision queries.

import { WORLD } from './config.js'
import { CourseGenerator, secureChunk } from './generator.js'

export class Level {
  constructor(seed, options = {}) {
    this.seed = seed
    // options.routes: the route each sector's security follows, by sector.
    // Sectors without one yet get theirs from setRoute.
    this.routes = options.routes ?? null
    this.generator = new CourseGenerator(seed, this.routes ? { ...options, routeFor: (sector) => this.routes[sector] } : options)
    this.chunks = []
    this.checkpoints = []
    this.finish = null
    this.listeners = { add: [], remove: [] }
  }

  on(type, fn) { this.listeners[type].push(fn) }

  // Generate until the course extends past x.
  ensure(x) {
    if (this.spawnY === undefined && !this.chunks.length) this.spawnY = this.generator.roof
    while (!this.chunks.length || this.chunks[this.chunks.length - 1].xEnd < x) {
      const chunk = this.generator.next()
      this.chunks.push(chunk)
      if (chunk.checkpoint) this.checkpoints.push(chunk.checkpoint)
      if (chunk.finish) this.finish = chunk.finish
      for (const fn of this.listeners.add) fn(chunk)
    }
  }

  // Choose a sector's route: its roofs get their security now, and any
  // still to be generated get it as they appear.
  setRoute(sector, route) {
    this.routes[sector] = route
    for (const c of this.chunks) if (c.sector === sector) secureChunk(c, route)
  }

  // What a sector holds, for contracts that count on it.
  sectorContents(sector) {
    const out = { shards: 0, drones: 0, lasers: 0 }
    for (const c of this.chunks) {
      if (c.sector !== sector) continue
      out.shards += c.shards.length
      out.drones += c.drones.length
      out.lasers += c.lasers.length
    }
    return out
  }

  // Drop chunks that end well behind x.
  prune(x) {
    while (this.chunks.length > 1 && this.chunks[0].span[1] < x) {
      const chunk = this.chunks.shift()
      for (const fn of this.listeners.remove) fn(chunk)
    }
  }

  // Prune behind a runner at x. With keepCheckpoint, a fall returns to the
  // last checkpoint, so the city from there on has to stay: pruned by
  // distance alone, a fall far past a checkpoint would respawn in thin air.
  pruneBehind(x, keepCheckpoint = false, margin = 90) {
    this.prune(keepCheckpoint ? Math.min(x - margin, this.respawnPoint(x).x - 20) : x - margin)
  }

  // Chunks are in order along x, so the scan stops at the first one past
  // the range. Asked for many times a physics step: a plain array, not a
  // generator.
  chunksIn(x0, x1) {
    const out = []
    const chunks = this.chunks
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i]
      if (c.span[1] < x0) continue
      if (c.span[0] > x1) break
      out.push(c)
    }
    return out
  }

  solidsIn(x0, x1) {
    const out = []
    for (const c of this.chunksIn(x0, x1)) {
      for (const s of c.solids) if (s.x1 >= x0 && s.x0 <= x1) out.push(s)
    }
    return out
  }

  wallrunsIn(x0, x1) {
    const out = []
    for (const c of this.chunksIn(x0, x1)) for (const w of c.wallruns) if (w.x1 >= x0 && w.x0 <= x1) out.push(w)
    return out
  }

  fencesIn(x0, x1) {
    const out = []
    for (const c of this.chunksIn(x0, x1)) for (const f of c.fences ?? []) if (f.x1 >= x0 && f.x0 <= x1) out.push(f)
    return out
  }

  padsIn(x0, x1) {
    const out = []
    for (const c of this.chunksIn(x0, x1)) for (const q of c.pads ?? []) if (q.x1 >= x0 && q.x0 <= x1) out.push(q)
    return out
  }

  ziplinesIn(x0, x1) {
    const out = []
    for (const c of this.chunksIn(x0, x1)) for (const z of c.ziplines) if (z.bx >= x0 && z.ax <= x1) out.push(z)
    return out
  }

  roofAt(x) {
    const chunks = this.chunks
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i]
      if (c.x0 > x) break
      if (x <= c.x1) return c.roof
    }
    return null
  }

  lowestRoofAhead(x, range = 45) {
    let low = Infinity
    const chunks = this.chunks
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i]
      if (c.x0 > x + range) break
      if (c.x1 >= x - 1) low = Math.min(low, c.roof)
    }
    return low === Infinity ? WORLD.ROOF_MIN : low
  }

  killY(x) {
    let low = Infinity
    const chunks = this.chunks
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i]
      if (c.x0 > x + 30) break
      if (c.x1 >= x - 30) low = Math.min(low, c.roof)
    }
    if (low === Infinity) low = WORLD.ROOF_MIN
    return low - WORLD.KILL_DEPTH
  }

  // Where to respawn after a fall: the last checkpoint behind x (or the start).
  respawnPoint(x) {
    let best = { x: 0, y: this.spawnY ?? 8, index: 0 }
    for (const c of this.checkpoints) if (c.x <= x && c.x > best.x) best = c
    return best
  }

  // Back on the roof you fell from: the last building that starts behind x.
  roofStartBehind(x) {
    let best = null
    for (const c of this.chunks) if (c.x0 <= x && (!best || c.x0 > best.x0)) best = c
    if (!best) return this.respawnPoint(x)
    return { x: best.x0 + (best.id === 0 ? 30 : 1.5), y: best.roof }
  }

  hintsIn(x0, x1) {
    const out = []
    for (const c of this.chunksIn(x0, x1)) for (const h of c.hints) if (h.x >= x0 && h.x <= x1) out.push(h)
    return out
  }
}
