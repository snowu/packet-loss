// Turns simulation state into a continuous skeleton pose, one per drawn frame.
// States crossfade instead of cutting, landings squash through the legs with
// the feet held in place, and the ponytail is a damped spring chain driven by
// the body's real motion. Nothing here depends on the outfit.
import { CHANNELS, pose, solve, crouch, at, bottomOf } from './skeleton.js'
import { clipFor, sampleState } from './clips.js'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t) }
const wrapPi = a => a - Math.PI * 2 * Math.round(a / (Math.PI * 2))

// Blend-in time for each clip, seconds. Short where the simulation changes
// state on an impact, longer where the body has time to settle.
const BLEND = { run: 0.1, idle: 0.3, brace: 0.12, air: 0.1, slide: 0.08, vault: 0.1, mantle: 0.08, climb: 0.1, wallslide: 0.12, wallrun: 0.1, zip: 0.12, roll: 0.06, stumble: 0.08, dead: 0.15 }
const GROUNDED = new Set(['run', 'idle', 'brace'])

// Follow-through. These channels do not track the pose directly: each chases
// it on a damped spring, so the chest, head and hands arrive a beat late and
// overshoot a little whenever the body changes what it is doing. [stiffness,
// damping]; lower stiffness trails more.
const FOLLOW = { chest: [260, 17], head: [200, 15], nWrist: [230, 13], fWrist: [230, 13], nElbow: [520, 30], fElbow: [520, 30] }
// How far body acceleration (m/s^2) tips the torso: forward when speeding
// up, back when braking.
const SURGE = 0.006

// Hair: segment lengths (model units) from the tie to the tip.
export const HAIR_SEGMENTS = Object.freeze([1.6, 1.5, 1.4, 1.25, 1.05])
export const HAIR_TIE = Object.freeze([-1.6, 4.2]) // head frame: back, up

export class Hair {
  constructor() { this.reset() }
  reset() { this.angle = null; this.speed = HAIR_SEGMENTS.map(() => 0); this.anchor = null; this.anchorV = [0, 0] }

  // Angles are world directions: 0 streams straight back, PI/2 hangs down.
  target(motion) {
    const wind = clamp(motion[0] / 15, 0, 1), lift = clamp(-motion[1] * 0.045, -0.5, 0.75)
    return 1.25 - 0.62 * wind - lift
  }

  update(dt, anchor, motion) {
    const n = HAIR_SEGMENTS.length, rest = this.target(motion)
    if (!this.angle) {
      this.angle = HAIR_SEGMENTS.map((_, i) => rest + i * 0.08)
      this.anchor = anchor; this.anchorV = [0, 0]
      return
    }
    if (!(dt > 0)) return
    const v = [(anchor[0] - this.anchor[0]) / dt, (anchor[1] - this.anchor[1]) / dt]
    // Teleports and respawns must not fling the hair.
    const accel = Math.hypot(v[0], v[1]) > 600 ? [0, 0] : [(v[0] - this.anchorV[0]) / dt, (v[1] - this.anchorV[1]) / dt]
    this.anchor = anchor; this.anchorV = Math.hypot(v[0], v[1]) > 600 ? [0, 0] : v
    const steps = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / steps
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < n; i++) {
        const parent = i ? this.angle[i - 1] : rest
        const goal = i ? parent + (rest - parent) * 0.3 + 0.13 : rest
        const k = 150 - i * 18, c = 15 - i * 1.6
        // The tie accelerating one way swings the strands the other.
        const tangent = [Math.sin(this.angle[i]), Math.cos(this.angle[i])]
        const push = clamp(-(accel[0] * tangent[0] + accel[1] * tangent[1]) / (HAIR_SEGMENTS[i] * 9), -260, 260)
        this.speed[i] += (k * (goal - this.angle[i]) - c * this.speed[i] + push) * h
        this.speed[i] = clamp(this.speed[i], -40, 40)
        this.angle[i] += this.speed[i] * h
      }
    }
  }

  points(anchor) {
    const pts = [anchor]
    for (let i = 0; i < HAIR_SEGMENTS.length; i++) {
      const a = this.angle ? this.angle[i] : 1.2, p = pts[i]
      // The ponytail lies on the roof rather than passing through it.
      pts.push([p[0] - Math.cos(a) * HAIR_SEGMENTS[i], Math.min(p[1] + Math.sin(a) * HAIR_SEGMENTS[i], Math.max(p[1], -0.8))])
    }
    return pts
  }
}

export class Animator {
  constructor() { this.hair = new Hair(); this.reset() }

  reset() {
    this.clip = null; this.from = null; this.blendT = 1; this.blendDur = 0
    this.time = 0; this.landT = 1; this.landAmp = 0; this.airVy = 0; this.state = null
    this.pos = null; this.motion = [0, 0]; this.surge = 0
    this.follow = null
    this.target = pose(); this.out = pose()
    this.hair.reset()
  }

  // p: simulation actor; dt: seconds since last draw (0 while paused);
  // phase: run gait phase; x, y: world position in metres (y up).
  update(p, dt, phase, idle = false, x = 0, y = 0) {
    dt = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0
    this.time += dt
    this.trackMotion(dt, x, y)

    const name = clipFor(p, idle)
    if (p.state === 'air') this.airVy = Number.isFinite(p.vy) ? p.vy : this.airVy
    if (this.state === 'air' && p.state !== 'air' && p.state !== 'dead') {
      // Squash on touchdown, scaled by how hard the landing was.
      this.landAmp = clamp((-this.airVy - 3) / 14, 0.2, 1) * 2.8
      this.landT = 0
    }
    this.state = p.state
    if (name !== this.clip) {
      this.from = { ...this.out }
      this.blendT = 0
      this.blendDur = this.clip === null ? 0 : BLEND[name] ?? 0.1
      this.clip = name
    }

    const target = sampleState(name, p, { phase, time: this.time }, this.target)
    this.landT += dt
    if (GROUNDED.has(name) && this.landT < 0.4) {
      const u = this.landT / 0.065
      Object.assign(target, crouch(target, this.landAmp * u * Math.exp(1 - u)))
    }

    this.blendT += dt
    if (this.blendT < this.blendDur && this.from) {
      const w = smooth(this.blendT / this.blendDur), out = this.out
      for (const k of CHANNELS) {
        // Spin is an angle: blend the short way round, so finishing a roll
        // does not unwind it.
        const a = k === 'spin' ? target.spin + wrapPi(this.from.spin - target.spin) : this.from[k]
        out[k] = a + (target[k] - a) * w
      }
    } else Object.assign(this.out, target)
    if (!this.blendDur || this.blendT >= this.blendDur) this.out.spin = wrapPi(this.out.spin)

    this.secondary(dt)
    this.joints = solve(this.out)
    // Each clip stands on the roof, but a pose halfway between two of them
    // may not: ease it out as the blend proceeds rather than let a foot dip
    // through, without snapping a pose that started below the line (a zipline).
    if (name !== 'air' && name !== 'zip') {
      const sunk = bottomOf(this.joints)
      const settled = this.blendDur ? Math.min(1, 2 * smooth(this.blendT / this.blendDur)) : 1
      if (sunk > 0) { this.out.y -= sunk * settled; this.joints = solve(this.out) }
    }
    this.hair.update(dt, at(this.joints.head, ...HAIR_TIE), this.motion)
    this.hairPoints = this.hair.points(at(this.joints.head, ...HAIR_TIE))
    return this.out
  }

  secondary(dt) {
    const out = this.out
    if (!this.follow) { this.follow = Object.fromEntries(Object.keys(FOLLOW).map(k => [k, [out[k], 0]])); return }
    out.lean += this.surge
    const steps = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / steps
    for (const k in FOLLOW) {
      const f = this.follow[k], [stiff, damp] = FOLLOW[k]
      for (let i = 0; i < steps && h > 0; i++) { f[1] += (stiff * (out[k] - f[0]) - damp * f[1]) * h; f[0] += f[1] * h }
      // Stay within reach of the pose, so a long stall cannot leave it adrift.
      f[0] = clamp(f[0], out[k] - 0.6, out[k] + 0.6)
      out[k] = f[0]
    }
  }

  trackMotion(dt, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    if (!this.pos || !(dt > 0)) { if (!this.pos) this.pos = [x, y]; return }
    const vx = (x - this.pos[0]) / dt, vy = (y - this.pos[1]) / dt
    this.pos = [x, y]
    if (Math.hypot(vx, vy) > 80) return
    const k = 1 - Math.exp(-dt * 12)
    const ax = clamp((vx - this.motion[0]) * 12, -40, 40)
    this.surge += (clamp(ax * SURGE, -0.12, 0.12) - this.surge) * (1 - Math.exp(-dt * 9))
    // World y is up; motion is kept in m/s with y up.
    this.motion = [this.motion[0] + (vx - this.motion[0]) * k, this.motion[1] + (vy - this.motion[1]) * k]
  }
}
