// Procedural rooftop course. Pure and deterministic for a given seed.
//
// The course is a chain of chunks. Each chunk is one building plus the gap
// that follows it; the gap type decides how the next roof is reached.
//
// Two rules shape it. Fair: every gap is sized from the jump physics at the
// slowest running speed, the roof after it leaves room to land at top speed
// and read what's next, and a runner who fluffs that landing still has the
// run-up to make the following gap. Dynamic: roof heights follow a seeded
// skyline of rises and valleys instead of wandering, plain jumps always step
// up or drop (or are a real leap), and roofs don't go quiet for long.

import { PHYS, WORLD, HEIST } from './config.js'
import { createRng } from './rng.js'

// Bump when the same seed starts producing a different course: records and
// ghosts saved against the old layout no longer line up with it.
export const COURSE_VERSION = 2

export const GAP_TYPES = ['jump', 'climb', 'wallrun', 'zip', 'spring']
export const OBSTACLE_TYPES = ['vent', 'highbox', 'beam', 'housing']

// Scripted onboarding: each entry introduces one move.
const TUTORIAL = [
  { obstacles: ['vent'], gap: 'jump', dh: [0, 0.5], hints: { vent: 'vault', gap: 'jump' } },
  { obstacles: ['beam'], gap: 'jump', dh: [-5.5, -5], hints: { beam: 'slide', gap: 'roll' } },
  { obstacles: ['housing'], gap: 'climb', hints: { housing: 'grab' } },  // the pad hint covers the wall
  { obstacles: [], gap: 'wallrun', hints: { gap: 'wallrun' } },
  { obstacles: ['highbox'], gap: 'zip', hints: { gap: 'zip' } },
  { obstacles: ['vent'], gap: 'spring', hints: { gap: 'spring' } },
]

const DECOR_TYPES = [
  ['ac', 5], ['antenna', 2], ['tank', 1.2], ['dish', 1.2], ['skylight', 1.5],
  ['vents', 2], ['solar', 1.5], ['sign', 0.6],
]

const profiles = new Map()

// Trajectory of a held jump launched at vy0 (a plain jump by default), sampled finely.
function jumpProfile(vy0 = PHYS.JUMP_V) {
  if (profiles.has(vy0)) return profiles.get(vy0)
  const dt = 1 / 480
  const pts = []
  let y = 0, vy = vy0, t = 0, hold = 0
  while (t < 4) {
    let g = PHYS.G
    if (vy > 0 && hold < PHYS.JUMP_HOLD_TIME) { g *= PHYS.JUMP_HOLD_GRAVITY; hold += dt }
    vy -= g * dt
    y += vy * dt
    t += dt
    pts.push({ t, y, vy })
    if (y < -30) break
  }
  profiles.set(vy0, pts)
  return pts
}

export function jumpApex() {
  return jumpProfile().reduce((m, p) => Math.max(m, p.y), 0)
}

// Horizontal distance covered before a held jump descends through height dh.
export function jumpDistance(dh, speed = PHYS.SPEED_MIN, vy0 = PHYS.JUMP_V) {
  const pts = jumpProfile(vy0)
  for (const p of pts) {
    if (p.vy < 0 && p.y <= dh) return p.t * speed
  }
  return 0
}

// Widest gap clearable when taking off right at the edge.
export function maxGap(dh, speed = PHYS.SPEED_MIN) {
  if (dh > jumpApex() - 0.3) return 0
  return jumpDistance(dh, speed) + PHYS.W - 0.3
}

// Widest gap a runner clears by just running off the edge: a roof top up to
// half a meter above the feet is still stepped onto.
export function walkOffGap(dh, speed = PHYS.SPEED_MIN) {
  return speed * Math.sqrt(2 * (Math.max(0, -dh) + 0.5) / PHYS.G) + PHYS.W
}

// How far past the far edge the fastest runner comes down: a held jump off
// the very edge at top speed. (Pressed late in coyote time it lands a little
// further, eating into the read margin below but leaving most of it.)
export function fastLanding(dh, width) {
  return Math.max(0, jumpDistance(dh, PHYS.SPEED_MAX) + PHYS.W / 2 - width)
}

// Seconds a runner gets after touching down before the first obstacle, at
// top speed (slower runners land sooner and get longer).
export const LAND_READ = 0.35
// After the long, second-plus arc of a wall kick or a cable jump the roof
// has been in view the whole way down, so the margin past it can be shorter.
const ARC_READ = 0.2
// Obstacle-free run-up before every gap. It also covers a botched landing:
// a stumble and the recovery back up to running speed fit inside it.
export const RUNWAY = 10
// Plain jumps never go below this share of their reach, nor above `JUMP_FRAC_MAX`.
const JUMP_FRAC_MIN = 0.35
const JUMP_FRAC_MAX = 0.8

// A seeded skyline: the height roofs drift toward at each point of the course.
// A long swell and a shorter ripple give climbs to a high district, long
// descents by cable and jump, and valleys to climb back out of.
function createSkyline(rng) {
  const waves = [
    { amp: rng.range(6, 8), len: rng.range(700, 1000), phase: rng.range(0, Math.PI * 2) },
    { amp: rng.range(3, 5), len: rng.range(180, 300), phase: rng.range(0, Math.PI * 2) },
  ]
  return (x) => {
    let y = 12
    for (const w of waves) y += w.amp * Math.sin((2 * Math.PI * x) / w.len + w.phase)
    return Math.max(WORLD.ROOF_MIN + 3, Math.min(WORLD.ROOF_MAX - 5, y))
  }
}

export function difficultyAt(x) {
  return Math.max(0, Math.min(1, x / WORLD.DIFFICULTY_DISTANCE))
}

const round = (v) => Math.round(v * 100) / 100

export class CourseGenerator {
  // options.tutorial: open with the scripted onboarding chunks
  // options.length: place a finish line once the course reaches this distance
  // options.checkpointEvery: spacing of respawn checkpoints
  // options.difficulty: { start, ramp } — difficulty grows from start to 1 over ramp meters
  // options.heist: add data shards, laser grids and drones (from their own rng,
  //   so the buildings are identical to the same seed without them)
  constructor(seed, { tutorial = true, length = Infinity, checkpointEvery = 250, difficulty = null, heist = false } = {}) {
    this.seed = seed >>> 0
    this.rng = createRng(this.seed)
    this.index = 0
    this.cursor = -30
    this.roof = 8
    this.entryClear = 0
    this.lastGap = null
    this.nextSolidId = 1
    this.tutorial = tutorial
    this.length = length
    this.checkpointEvery = checkpointEvery
    this.nextCheckpoint = checkpointEvery
    this.checkpointCount = 0
    this.finished = false
    this.difficulty = difficulty
    this.heist = heist
    // its own rng, so drawing the skyline doesn't shift the course's rolls
    this.skyline = createSkyline(createRng(this.seed ^ 0x5c71e))
    this.plainRun = 0
    this.lastDh = 0
  }

  difficultyAt(x) {
    if (!this.difficulty) return difficultyAt(x)
    const { start = 0, ramp = WORLD.DIFFICULTY_DISTANCE } = this.difficulty
    return Math.min(1, start + (1 - start) * Math.max(0, x) / ramp)
  }

  next() {
    const rng = this.rng
    const id = this.index++
    const tutorial = this.tutorial ? TUTORIAL[id] : null
    const x0 = this.cursor
    const roof = this.roof
    const d = this.difficultyAt(x0)
    // the roof that crosses the finish distance is long and clear
    const finish = !this.finished && x0 >= this.length - 25
    if (finish) this.finished = true
    // landing zone, then the obstacles, then the run-up to the next gap. Now
    // and then, after a short landing, a roof is only landing and run-up:
    // touch down and go again.
    const quick = this.entryClear < 14 && rng.chance(0.3)
    const zone = quick ? rng.range(0, 2) : rng.range(5, 24) * (1 - 0.2 * d)
    const width = round(id === 0 ? 75 : finish ? 70 : tutorial ? rng.range(46, 52) : this.entryClear + RUNWAY + zone)
    const x1 = round(x0 + width)
    const depth = round(rng.range(14, 30))

    const chunk = {
      id,
      x0, x1, roof, depth,
      style: rng.int(0, 3),
      tint: rng.int(0, 5),
      seed: rng.int(1, 1e9),
      solids: [],
      wallruns: [],
      ziplines: [],
      pads: [],
      fences: [],
      decor: [],
      hints: [],
      extras: [],
      shards: [],
      lasers: [],
      drones: [],
      gap: null,
      xEnd: 0,
      span: [x0, x1],
      checkpoint: null,
      finish: null,
    }
    if (finish) {
      chunk.finish = { x: round(x0 + 14), y: roof }
    } else if (id > 0 && x0 >= this.nextCheckpoint && !this.finished) {
      chunk.checkpoint = { x: round(x0 + 3), y: roof, index: ++this.checkpointCount }
      this.nextCheckpoint = x0 + this.checkpointEvery
    }
    chunk.solids.push(this.solid('roof', 'building', x0, x1, WORLD.STREET_Y, roof, {
      z0: WORLD.BUILDING_FRONT_Z - depth, z1: WORLD.BUILDING_FRONT_Z,
    }))

    const gapType = tutorial ? tutorial.gap : finish ? 'jump' : this.pickGap(roof, d, x0)
    const gap = this.buildGap(chunk, gapType, d, tutorial)
    chunk.gap = gap

    const obstacleEnd = gap.runwayStart - RUNWAY
    const obstacleStart = x0 + (id === 0 ? 46 : this.entryClear)
    if (!finish) this.placeObstacles(chunk, obstacleStart, obstacleEnd, d, tutorial)
    this.placeDecor(chunk)
    if (!finish && !tutorial) placeFences(chunk, d, obstacleStart)
    if (this.heist && id > 0 && !finish) placeHeist(chunk, gap, d, obstacleStart)
    if (tutorial?.hints.gap) chunk.hints.push({ x: x1 - 14, key: tutorial.hints.gap })

    chunk.xEnd = gap.nextX0
    let spanEnd = gap.nextX0
    for (const w of chunk.wallruns) spanEnd = Math.max(spanEnd, w.x1)
    for (const z of chunk.ziplines) spanEnd = Math.max(spanEnd, z.bx)
    chunk.span = [x0, spanEnd]

    this.cursor = gap.nextX0
    this.roof = gap.nextRoof
    this.entryClear = gap.entryClear
    this.lastGap = gapType
    this.plainRun = gapType === 'jump' ? this.plainRun + 1 : 0
    if (gapType === 'jump') this.lastDh = gap.dh
    return chunk
  }

  solid(kind, sub, x0, x1, y0, y1, extra = {}) {
    return { id: this.nextSolidId++, kind, sub, x0: round(x0), x1: round(x1), y0: round(y0), y1: round(y1), ...extra }
  }

  // How far the skyline wants this roof to move, in meters (up is positive).
  pull(x, roof) {
    return this.skyline(x) - roof
  }

  pickGap(roof, d, x) {
    const pull = this.pull(x, roof)
    const rise = pull > 3 ? 2.4 : pull < -3 ? 0.25 : 1
    const fall = pull < -6 ? 3.2 : pull < -2 ? 1.4 : 0.3
    const canZip = roof - 7 >= WORLD.ROOF_MIN
    const canRise = roof + 5.5 <= WORLD.ROOF_MAX
    // a string of plain jumps gets less and less likely: something else turns up
    const jump = 5 * (this.plainRun >= 3 ? 0.25 : this.plainRun === 2 ? 0.6 : 1)
    const weights = [
      ['jump', jump],
      ['climb', canRise ? (1.2 + d) * rise : 0],
      ['wallrun', 1 + d],
      ['zip', canZip ? fall : 0],
      ['spring', canRise ? 0.9 * rise : 0],
    ]
    let type = this.rng.weighted(weights)
    if (type === this.lastGap && type !== 'jump' && this.rng.chance(0.6)) type = 'jump'
    return type
  }

  buildGap(chunk, type, d, tutorial) {
    const rng = this.rng
    const { x1, roof } = chunk
    const clampRoof = (y) => round(Math.max(WORLD.ROOF_MIN, Math.min(WORLD.ROOF_MAX, y)))
    let dh, width, entryClear = 10, runwayStart = x1

    switch (type) {
      case 'jump': {
        let frac
        if (tutorial) {
          dh = rng.range(...tutorial.dh)
          frac = 0.4
        } else {
          const pull = this.pull(x1, roof)
          // lean toward the skyline, and after a drop favour stepping back up
          let up = Math.max(0.12, Math.min(0.88, 0.45 + pull * 0.07))
          if (this.lastDh < -1 && Math.abs(pull) < 4) up = Math.min(0.88, up + 0.2)
          // never two level jumps running
          const leap = rng.chance(0.12) && Math.abs(this.lastDh) >= 1
          if (leap) {
            // a long leap across to a roof at the same height
            dh = rng.range(-0.4, 0.4)
            frac = rng.range(0.6, 0.65 + 0.15 * d)
          } else {
            const u = rng()
            const rise = 0.8 + 1.4 * u
            const drop = -(1.5 + Math.min(2, Math.max(0, -pull) * 0.2) + (4.5 - Math.min(2, Math.max(0, -pull) * 0.2)) * u)
            dh = rng.chance(up) ? rise : drop
            // at the top or bottom of the city, go the other way rather than flat
            if (roof + dh < WORLD.ROOF_MIN) dh = rise
            else if (roof + dh > WORLD.ROOF_MAX) dh = drop
            frac = rng.range(JUMP_FRAC_MIN, 0.55 + 0.25 * d)
          }
        }
        dh = clampRoof(roof + dh) - roof
        const reach = maxGap(dh)
        width = reach * frac
        // a jump should be one at running pace: wide enough that running off
        // the edge at the slowest speed doesn't make it
        if (!tutorial) width = Math.max(width, Math.min(walkOffGap(dh) + 0.5, reach * 0.65))
        width = round(Math.min(Math.max(2.5, width), reach * JUMP_FRAC_MAX))
        entryClear = Math.max(9, fastLanding(round(dh), width) + LAND_READ * PHYS.SPEED_MAX)
        break
      }
      case 'climb': {
        dh = rng.range(3, 4.6)
        width = rng.range(1.5, 3.2)
        // a pad jump steps up at full speed: room to read the roof after it
        entryClear = 10
        chunk.extras.push({ type: 'ledge', x: x1 + width, y: round(roof + dh) })
        // every climb wall gets a jump pad at the edge: hit it with a jump and you clear the wall
        chunk.pads.push({ x0: round(x1 - WORLD.PAD_LEN - 0.1), x1: round(x1 - 0.1), y: roof, wallX: round(x1 + width), top: round(roof + dh) })
        break
      }
      case 'wallrun': {
        dh = rng.range(-2.5, 0.3)
        width = rng.range(8.5, 10.5 + 2 * d)
        const nextX0 = x1 + width
        const panel = {
          id: `w${chunk.id}`,
          x0: round(x1 - 1.5), x1: round(nextX0 + 1),
          y0: round(roof + 0.3), y1: round(roof + 4.5),
          z: -0.9,
        }
        chunk.wallruns.push(panel)
        chunk.extras.push({
          type: 'wallrunWall',
          x0: round(x1 - 2), x1: round(nextX0 + 2),
          top: round(Math.max(roof, roof + dh) + rng.range(6, 14)),
        })
        // the longest way off is a wall kick from the top of the panel's end
        const kick = jumpDistance(dh - (panel.y1 - roof), PHYS.SPEED_MAX, PHYS.WALLRUN_JUMP_V)
        entryClear = panel.x1 - nextX0 + kick + ARC_READ * PHYS.SPEED_MAX
        break
      }
      case 'zip': {
        dh = -rng.range(7, 13)
        dh = clampRoof(roof + dh) - roof
        width = rng.range(14, 24)
        const nextX0 = x1 + width
        chunk.ziplines.push({
          id: `z${chunk.id}`,
          ax: round(x1 - 1), ay: round(roof + 3.4),
          bx: round(nextX0 + 4), by: round(roof + dh + 2.6),
        })
        // let go at the very end with a jump: the hands are on the cable a
        // little above roof height, and it carries you on at top speed
        const release = 4 - 1.2
        const hang = 2.6 - PHYS.ZIP_HANG
        entryClear = release + jumpDistance(-hang, PHYS.SPEED_MAX, PHYS.JUMP_V * 0.7) + ARC_READ * PHYS.SPEED_MAX
        break
      }
      case 'spring': {
        dh = rng.range(3.5, 5.2)
        width = rng.range(1.5, 2.8)
        const sx = x1 + width - 5
        chunk.solids.push(this.solid('spring', 'spring', sx, sx + 1.6, roof, roof + 0.5, { z0: -1.2, z1: 1.2 }))
        chunk.extras.push({ type: 'ledge', x: x1 + width, y: round(roof + dh) })
        runwayStart = sx
        entryClear = 10
        break
      }
    }
    width = round(width)
    return {
      type,
      width,
      dh: round(dh),
      nextX0: round(x1 + width),
      nextRoof: clampRoof(roof + dh),
      entryClear,
      runwayStart,
    }
  }

  placeObstacles(chunk, start, end, d, tutorial) {
    const rng = this.rng
    const { roof } = chunk
    let x = start + rng.range(0, Math.min(4, Math.max(0, end - start - 2.2)))
    let queue = tutorial ? [...tutorial.obstacles] : null
    let placed = 0
    while (x < end) {
      let type
      if (queue) {
        if (!queue.length) break
        type = queue.shift()
      } else {
        // a breather between obstacles now and then, but never a bare roof
        if (placed && rng.chance(0.15 - 0.1 * d)) { x += rng.range(4, 8); continue }
        type = rng.weighted([['vent', 3], ['highbox', 1 + d], ['beam', 2], ['housing', 1.3]])
        // a housing that won't fit is swapped for something short, rather than
        // leaving the end of the roof empty
        if (type === 'housing' && x + 9 > end) type = rng.chance(0.5) ? 'vent' : 'beam'
      }
      let obstacle, after
      if (type === 'vent') {
        const w = rng.range(0.8, 1.8)
        obstacle = this.solid('block', 'vent', x, x + w, roof, roof + rng.range(0.6, 1.15), { z0: -0.9, z1: 0.9 })
        after = 7
      } else if (type === 'highbox') {
        const w = rng.range(0.8, 1.4)
        obstacle = this.solid('block', 'highbox', x, x + w, roof, roof + rng.range(1.4, 2.0), { z0: -0.8, z1: 0.8 })
        after = 8
      } else if (type === 'beam') {
        const w = rng.range(0.5, 2.2)
        const bottom = roof + rng.range(1.0, 1.15)
        obstacle = this.solid('beam', 'beam', x, x + w, bottom, bottom + 0.45, { z0: -4, z1: 1.4 })
        after = 7
      } else {
        const w = rng.range(4, 9)
        obstacle = this.solid('block', 'housing', x, x + w, roof, roof + rng.range(2.4, 3.6), { z0: -3.2, z1: 1.0 })
        after = 10
      }
      if (obstacle.x1 > end) break
      chunk.solids.push(obstacle)
      placed++
      const hint = tutorial?.hints[type]
      if (hint) chunk.hints.push({ x: obstacle.x0, key: hint })
      // tighter as it gets harder, but never closer than a top-speed runner
      // can read coming off the last one
      x = obstacle.x1 + Math.max(LAND_READ * PHYS.SPEED_MAX, after * (1 - 0.3 * d)) + rng.range(0, 4 * (1 - d) + 2)
    }
  }

  placeDecor(chunk) {
    const rng = this.rng
    const count = Math.floor((chunk.x1 - chunk.x0) / 5)
    const backZ = WORLD.BUILDING_FRONT_Z - chunk.depth
    for (let i = 0; i < count; i++) {
      chunk.decor.push({
        type: rng.weighted(DECOR_TYPES),
        x: round(rng.range(chunk.x0 + 1.5, chunk.x1 - 1.5)),
        z: round(rng.range(backZ + 2, -4.5)),
        s: round(rng.range(0.7, 1.3)),
        r: round(rng.range(0, Math.PI * 2)),
        v: rng(),
      })
    }
    if (rng.chance(0.55)) chunk.extras.push({ type: 'birds', x: round(rng.range(chunk.x0 + 10, chunk.x1 - 4)), count: rng.int(3, 7) })
  }
}

// ── electrified fences ──────────────────────────────────────────────────
// Some vents become a live fence across the roof: same place, same timing, but
// it has to be jumped (no vaulting, no sliding). Their own rng keeps every
// other part of a seed's course unchanged.

const FENCE_RING = 0x7e4ce
// A fence takes a full jump started well before it, so it only replaces a
// vent with a clear run-up: this long at top speed after the last obstacle
// (or the landing zone), on top of the time to see it.
const FENCE_RUNUP = 0.6

function placeFences(chunk, d, entry) {
  const rng = createRng(chunk.seed ^ FENCE_RING)
  const blocks = chunk.solids.filter((o) => o.kind === 'block' || o.kind === 'beam').sort((a, b) => a.x0 - b.x0)
  let prevEnd = entry - 4
  for (const s of blocks) {
    const before = prevEnd
    prevEnd = s.x1
    if (s.sub !== 'vent' || s.x0 - before < FENCE_RUNUP * PHYS.SPEED_MAX) continue
    if (!rng.chance(0.24 + 0.26 * d)) continue
    chunk.solids.splice(chunk.solids.indexOf(s), 1)
    // it runs across the roof, so along the lane it is only as deep as a post
    const at = (s.x0 + s.x1) / 2
    chunk.fences.push({ id: `${chunk.id}:F${chunk.fences.length}`, x0: round(at - 0.3), x1: round(at + 0.3), y0: chunk.roof, y1: round(chunk.roof + WORLD.FENCE_H) })
  }
}

// ── heist layer ─────────────────────────────────────────────────────────
// Shards trace the lines a runner actually takes (over gaps, along cables
// and wall-runs); lasers and drones sit on clear stretches of roof.

const SHARD_RING = 0x5a17

// How far a takedown can throw you: kicked off a drone at the top of a jump,
// at top speed. Drones stay this far (plus a moment to set up the next move)
// back from the edge, so taking one out never throws you into the gap: not
// even the narrow one under a climb wall, which you'd drop below the reach of.
function takedownCarry() {
  const v = HEIST.TAKEDOWN_VY
  const t = (v + Math.sqrt(v * v + 2 * PHYS.G * jumpApex())) / PHYS.G
  return HEIST.DRONE_W / 2 + t * PHYS.SPEED_MAX + ARC_READ * PHYS.SPEED_MAX
}

function placeHeist(chunk, gap, d, entry) {
  const rng = createRng(chunk.seed ^ SHARD_RING)
  const { x0, x1, roof } = chunk
  let n = 0
  const shard = (x, y) => chunk.shards.push({ id: `${chunk.id}:${n++}`, x: round(x), y: round(y), taken: false })
  const addLaser = (x, len, low) => {
    const y0 = low ? roof + 0.05 : roof + 1.05
    chunk.lasers.push({ id: `${chunk.id}:L${chunk.lasers.length}`, x0: round(x), x1: round(x + len), y0: round(y0), y1: round(y0 + 0.22), low, tripped: false })
  }

  // clear roof intervals between obstacles, past the landing zone and away
  // from the gap runway
  const blocks = chunk.solids.filter((s) => s.kind !== 'roof').sort((a, b) => a.x0 - b.x0)
  const free = []
  let cursor = Math.max(x0 + 9, entry)
  for (const s of blocks) {
    if (s.x0 - 5 > cursor) free.push([cursor, s.x0 - 5])
    cursor = Math.max(cursor, s.x1 + 5)
  }
  const end = gap.runwayStart - 6
  if (end > cursor) free.push([cursor, end])
  // `limit`: the placement has to end before this x
  const take = (len, limit = Infinity) => {
    const fits = free.filter(([a, b]) => Math.min(b, limit) - a >= len)
    if (!fits.length) return null
    const iv = rng.pick(fits)
    const at = rng.range(iv[0], Math.min(iv[1], limit) - len)
    // split what remains so later placements don't overlap
    free.splice(free.indexOf(iv), 1)
    if (at - iv[0] > 4) free.push([iv[0], at - 2])
    if (iv[1] - (at + len) > 4) free.push([at + len + 2, iv[1]])
    return at
  }

  // gap lines
  switch (gap.type) {
    case 'jump': {
      for (const u of [0.2, 0.5, 0.8]) {
        const base = roof + (gap.dh < 0 ? gap.dh * u * u : gap.dh * u)
        shard(x1 - 1 + (gap.width + 2) * u, base + 2.3 + 0.7 * Math.sin(Math.PI * u))
      }
      break
    }
    case 'zip': {
      const z = chunk.ziplines[0]
      for (let i = 1; i <= 5; i++) {
        const x = z.ax + 3 + (z.bx - z.ax - 6) * (i - 1) / 4
        shard(x, z.ay + (x - z.ax) * (z.by - z.ay) / (z.bx - z.ax) - 1)
      }
      break
    }
    case 'wallrun':
      for (const u of [0.2, 0.5, 0.8]) shard(x1 + gap.width * u, roof + 2.3)
      break
    case 'climb':
      shard(x1 + gap.width - 0.5, roof + gap.dh * 0.6)
      break
    case 'spring':
      shard(x1 + gap.width + 2, roof + gap.dh + 1)
      shard(x1 + gap.width + 3.6, roof + gap.dh + 1)
      break
  }

  // laser grids: low ones are jumped, high ones are slid under. Some take
  // the place of a vent (also a jump: vaults need one) or a pipe (a slide), so
  // the spacing the obstacle pass designed for reaction time still holds.
  const swap = 0.2 + 0.35 * d
  for (const s of blocks) {
    if ((s.sub !== 'vent' && s.sub !== 'beam') || !rng.chance(swap)) continue
    const low = s.sub === 'vent'
    const len = Math.max(low ? 1.8 : 1.4, s.x1 - s.x0 + 0.6)
    chunk.solids.splice(chunk.solids.indexOf(s), 1)
    addLaser(s.x0 - 0.3, len, low)
  }
  // drones hover just above head height: kick them out of the air, or get
  // spotted. One goes on clear roof if there's room, or else takes the place
  // of an obstacle, whose spacing already leaves time to see it coming.
  if (rng.chance(0.65 + 0.3 * d)) {
    const limit = gap.runwayStart - takedownCarry()
    const drone = (x) => chunk.drones.push({ id: `${chunk.id}:D`, x: round(x), y: round(roof + 2.75), down: false, spotted: false, passed: false })
    const at = take(6, limit + 3)
    if (at !== null) drone(at + 3)
    else {
      const spots = chunk.solids.filter((s) => (s.sub === 'beam' || s.sub === 'vent') && (s.x0 + s.x1) / 2 <= limit)
      if (spots.length) {
        const s = rng.pick(spots)
        chunk.solids.splice(chunk.solids.indexOf(s), 1)
        drone((s.x0 + s.x1) / 2)
      }
    }
  }

  if (rng.chance(0.15 + 0.3 * d)) {
    const low = rng.chance(0.5)
    const len = low ? rng.range(1.8, 3.2) : rng.range(1.4, 2.8)
    const at = take(len + 8)
    if (at !== null) addLaser(at + 5, len, low)
  }

  // a line of shards along the roof: low ones are free, high ones need a jump
  if (rng.chance(0.65)) {
    const count = rng.int(3, 5)
    const at = take(count * 1.6 + 1)
    if (at !== null) {
      const high = rng.chance(0.4)
      for (let i = 0; i < count; i++) shard(at + 0.5 + i * 1.6, roof + (high ? 2.9 : 0.9))
    }
  }
}
