// The runner as a pixel sprite. A small skeleton is posed procedurally from
// the physics state (springy joints, squash on landing, a simulated ponytail)
// and rasterized into chunky outlined pixels at a stepped frame rate.
//
// Sprite space: pixels, y up, origin at the feet, facing +x.
// Hanging limbs point along (sin a, -cos a): positive angles swing forward.

import { PixelBuffer, hex, mix, pack } from './pixels.js'
import { PHYS } from '../sim/config.js'

export const SPRITE_W = 64
export const SPRITE_H = 64
export const ORIGIN_X = 32
export const ORIGIN_Y = 52

const L = {
  thigh: 6.3, shin: 6.1, foot: 3.1,
  torso: 6.9, neck: 1.2, head: 2.75,
  upper: 4.9, fore: 4.5,
  hip: 12.4,
}

const COLORS = {
  skin: hex(0xf0b089), skinFar: hex(0xc27a5c),
  top: hex(0x231c2e), topFar: hex(0x181320),
  pants: hex(0xe9e4ee), pantsFar: hex(0xa79eb8),
  shoe: hex(0xff3b30), shoeFar: hex(0xb3261f),
  hair: hex(0x2b1a17), glove: hex(0x2c2638), gloveFar: hex(0x1d1926),
  band: hex(0xff3b30),
  visor: hex(0x29f3ff),
  outline: hex(0x140c1c),
}

const far = (c) => mix(c, [12, 8, 22], 0.32)
const palette = (o) => {
  const c = { ...COLORS, ...o }
  for (const k of ['skin', 'top', 'pants', 'shoe', 'glove', 'sleeve']) if (c[k] && !o[k + 'Far']) c[k + 'Far'] = far(c[k])
  return c
}

// Looks for the runner. Lengths and thickness scale the same skeleton; cloth
// is a list of verlet chains (coat tails, scarf) hung off joints, and a
// ponytail gives the character a distinct silhouette. `shade` darkens the side away from the light,
// `fps` is the raster rate.
export const RUNNER_STYLES = {
  classic: {
    name: 'Classic', scale: 1, thick: 1, head: 1, shade: 0, fps: 24, colors: COLORS,
    ponytail: { n: 4, seg: 1.9, r0: 1.15, r1: 0.79, grav: 1, damp: 0.93 }, cloth: [],
  },
  courier: {
    name: 'Courier', scale: 1.18, thick: 0.92, head: 1, shade: 0.28, fps: 30, face: true,
    colors: palette({
      top: hex(0xeeebf4), pants: hex(0x2a2440), pantsFar: hex(0x1c1830), shoe: hex(0xff3b30),
      glove: hex(0xff3b30), band: hex(0xff3b30), hair: hex(0x1d1214), skin: hex(0xe9a882),
    }),
    sleeveless: true,
    ponytail: { n: 5, seg: 1.7, r0: 1.05, r1: 0.45, grav: 0.28, damp: 0.91 },
    cloth: [],
  },
  windbreaker: {
    name: 'Windbreaker', scale: 1.18, thick: 1, head: 1, shade: 0.32, fps: 60, face: true,
    colors: palette({
      top: hex(0xff5a2a), sleeve: hex(0xff5a2a), pants: hex(0x24243a), pantsFar: hex(0x17172a),
      shoe: hex(0xf2f0f6), shoeFar: hex(0xa8a4b8), glove: hex(0x1c1a28), band: hex(0x29f3ff),
      hair: hex(0x1a1220), scarf: hex(0x29f3ff), skin: hex(0xd89a74),
    }),
    sleeves: true,
    ponytail: { n: 5, seg: 1.65, r0: 1, r1: 0.45, grav: 0.28, damp: 0.91 },
    cloth: [
      { at: 'scarf', n: 5, seg: 2.1, r0: 1.1, r1: 0.8, col: 'scarf', grav: 0.1, damp: 0.9 },
      { at: 'coat', n: 3, seg: 2.2, r0: 1.9, r1: 1.2, col: 'top', grav: 0.3, damp: 0.88 },
    ],
  },
  techwear: {
    name: 'Techwear', scale: 1.18, thick: 0.9, head: 1, shade: 0.36, fps: 60, face: true,
    colors: palette({
      top: hex(0x2c3046), sleeve: hex(0x2c3046), pants: hex(0x1d1f2e), pantsFar: hex(0x14151f),
      shoe: hex(0xd9dbe6), shoeFar: hex(0x8e90a2), glove: hex(0x111219), band: hex(0x29f3ff),
      hair: hex(0xe8e4f2), scarf: hex(0xff3b30), skin: hex(0xd8a080), trim: hex(0x29f3ff),
    }),
    sleeves: true, trim: true,
    ponytail: { n: 5, seg: 1.65, r0: 1, r1: 0.45, grav: 0.28, damp: 0.91 },
    cloth: [
      { at: 'coat', n: 5, seg: 2.3, r0: 2.1, r1: 1.0, col: 'top', grav: 0.3, damp: 0.88 },
      { at: 'scarf', n: 6, seg: 2.2, r0: 1.0, r1: 0.7, col: 'scarf', grav: 0.1, damp: 0.9 },
    ],
  },
}

// Picker order.
export const RUNNERS = ['courier', 'windbreaker', 'techwear']

// The ponytail is a cloth chain like the rest.
const withPonytail = (base) => ({ ...base, cloth: [{ at: 'hair', col: 'hair', ...base.ponytail }, ...base.cloth] })

const GROUNDED = new Set(['run', 'idle', 'blocked', 'stumble', 'slide', 'vault'])

const JOINTS = ['torso', 'head', 'thighA', 'shinA', 'footA', 'thighB', 'shinB', 'footB', 'armA', 'foreA', 'armB', 'foreB', 'hip', 'hipX']

function pose(o) {
  const p = { torso: 0, head: 0, thighA: 0, shinA: 0, footA: 0, thighB: 0, shinB: 0, footB: 0, armA: 0, foreA: 0, armB: 0, foreB: 0, hip: 0, hipX: 0 }
  return Object.assign(p, o)
}

const smooth = (u) => u * u * (3 - 2 * u)
const clamp01 = (u) => Math.max(0, Math.min(1, u))

function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const len = dx * dx + dy * dy
  let t = len > 0 ? ((px - ax) * dx + (py - ay) * dy) / len : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const x = ax + dx * t - px, y = ay + dy * t - py
  return x * x + y * y
}

export class RunnerSprite {
  constructor(style = 'classic') {
    this.style = withPonytail(RUNNER_STYLES[style] ?? RUNNER_STYLES.classic)
    const sc = this.style.scale
    this.L = Object.fromEntries(Object.entries(L).map(([k, v]) => [k, v * sc]))
    this.cur = pose({})
    this.vel = pose({})
    this.spin = 0
    this.phase = 0
    this.time = 0
    this.landT = 0
    this.landAmt = 0
    this.lastStep = 0
    this.onStep = null
    this.buf = new PixelBuffer(SPRITE_W, SPRITE_H)
    this.ids = new Uint8Array(SPRITE_W * SPRITE_H)
    this.chains = null
    this.rim = hex(0xffd98a)
    this.rimDir = [-1, 1]
    this.state = 'idle'
  }

  land(impact) {
    this.landT = 0
    this.landAmt = Math.min(1, impact / 16)
  }

  // ── posing ──────────────────────────────────────────────────────────────

  runPose(phase, k) {
    const leg = (ph) => {
      // Contact, compression, push-off, heel recovery and knee drive each
      // have their own shape. A sine swing kept the legs too straight and
      // gave the airborne and planted halves the same mechanical timing.
      const keys = [
        [0.85, -0.45, -0.3], [0.25, -0.65, 0.15],
        [-0.35, -0.45, 0.3], [-0.8, -0.3, 0.2],
        [-0.65, -1.45, -0.4], [0.15, -2.05, -0.6],
        [1.0, -1.75, -0.4], [1.15, -1.0, -0.25],
      ]
      const u = ((ph / (Math.PI * 2)) % 1 + 1) % 1 * keys.length
      const i = Math.floor(u), t = u - i
      const sample = (axis) => {
        const a = keys[(i + 7) % 8][axis], b = keys[i][axis]
        const c = keys[(i + 1) % 8][axis], d = keys[(i + 2) % 8][axis]
        return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t)
      }
      return { thigh: sample(0) * (0.9 + k * 0.2), shin: sample(1), foot: sample(2) }
    }
    const a = leg(phase), b = leg(phase + Math.PI)
    const pump = 0.9 + 0.3 * k
    const lean = -0.18 - 0.2 * k
    const swing = Math.sin(phase + 0.22)
    return pose({
      torso: lean - 0.075 * Math.sin(phase * 2 + 0.4),
      head: -lean * 0.7 + 0.04 + 0.045 * Math.sin(phase * 2 - 0.35),
      thighA: a.thigh, shinA: a.shin, footA: a.foot,
      thighB: b.thigh, shinB: b.shin, footB: b.foot,
      armA: -swing * pump + 0.12, foreA: 1.15 + Math.max(0, -swing) * 0.65,
      armB: swing * pump + 0.12, foreB: 1.15 + Math.max(0, swing) * 0.65,
      hip: 0.2 - 0.9 * Math.cos(phase * 2 - 0.5),
      hipX: 0.3 * k + 0.45 * Math.sin(phase * 2 + 0.2),
    })
  }

  target(p, dt) {
    const k = clamp01((p.speed - PHYS.SPEED_MIN) / (PHYS.SPEED_MAX - PHYS.SPEED_MIN))
    const t = this.time
    switch (p.state) {
      case 'run':
      case 'wallrun': {
        this.phase += dt * Math.PI * 2 * (p.speed / (5.2 + p.speed * 0.06)) * (p.state === 'wallrun' ? 1.15 : 1)
        const o = this.runPose(this.phase, k)
        if (p.state === 'wallrun') { o.torso += 0.18; o.hip += 0.6 }
        return o
      }
      case 'climb': {
        this.phase += dt * Math.PI * 2 * 2.6
        const s = Math.sin(this.phase)
        return pose({
          torso: 0.05, head: 0.35,
          thighA: 1.25 + s * 0.55, shinA: -1.5 + s * 0.5, footA: -0.6,
          thighB: 1.25 - s * 0.55, shinB: -1.5 - s * 0.5, footB: -0.6,
          armA: 2.75 + s * 0.4, foreA: 0.25, armB: 2.75 - s * 0.4, foreB: 0.25,
        })
      }
      case 'air': {
        const v = p.vy / PHYS.JUMP_V
        if (v > 0.15) {
          // rising: lead knee driven up, trail leg extended, arms thrown
          return pose({
            torso: -0.28, head: 0.25,
            thighA: 1.35, shinA: -1.7, footA: 0.2,
            thighB: -0.45, shinB: -0.55, footB: -0.6,
            armA: -0.85, foreA: 1.2, armB: 2.1, foreB: 0.7,
            hip: 0.4,
          })
        }
        if (v > -0.35) {
          // apex: gathered, legs cycling
          return pose({
            torso: -0.12, head: 0.15,
            thighA: 1.0, shinA: -1.6, footA: 0.1,
            thighB: 0.35, shinB: -1.75, footB: -0.2,
            armA: 0.8 + Math.sin(t * 14) * 0.25, foreA: 1.0, armB: 1.6, foreB: 0.6,
            hip: 0.6,
          })
        }
        // falling: reaching for the ground, arms out for balance
        const reach = clamp01(-v / 1.4)
        return pose({
          torso: -0.05 + reach * 0.12, head: 0.3,
          thighA: 0.75 - reach * 0.25, shinA: -0.7 + reach * 0.35, footA: 0.3,
          thighB: 0.2 + reach * 0.2, shinB: -1.1 + reach * 0.5, footB: 0.1,
          armA: 1.9 + Math.sin(t * 9) * 0.35 * reach, foreA: 0.5, armB: -0.6 + reach * 0.9 - Math.sin(t * 9) * 0.3 * reach, foreB: 0.8,
          hip: 0.3,
        })
      }
      case 'slide':
        return pose({
          torso: 1.05, head: -0.75,
          thighA: 1.5, shinA: -0.05, footA: -0.45,
          thighB: 0.55, shinB: -2.35, footB: 0.5,
          armA: -1.6, foreA: 0.2, armB: -0.2, foreB: 1.3,
          hip: -7.2, hipX: -0.5,
        })
      case 'roll':
        return pose({
          torso: -1.0, head: -0.7,
          thighA: 2.2, shinA: -2.5, footA: 0.4, thighB: 2.0, shinB: -2.4, footB: 0.4,
          armA: 1.7, foreA: 1.7, armB: 1.5, foreB: 1.8,
          hip: -4.2,
        })
      case 'stumble':
        return pose({
          torso: -1.05 + Math.sin(t * 18) * 0.08, head: 0.7,
          thighA: 1.25, shinA: -1.7, footA: 0.2, thighB: -0.25, shinB: -1.1, footB: -0.3,
          armA: 1.6 + Math.sin(t * 22) * 0.5, foreA: 0.5, armB: 0.9 - Math.sin(t * 22) * 0.5, foreB: 0.6,
          hip: -3.2,
        })
      case 'vault': {
        const kin = p.kin
        const u = kin ? clamp01(kin.t / kin.T) : 0
        if (kin && kin.mode === 'step') {
          return pose({
            torso: -0.75, head: 0.5,
            thighA: 1.9, shinA: -2.1, footA: 0.3, thighB: 0.1, shinB: -0.9, footB: -0.4,
            armA: 0.9, foreA: 0.3, armB: 0.2, foreB: 0.6, hip: -1.2,
          })
        }
        // speed vault: plant a hand, swing the legs through
        const s = Math.sin(u * Math.PI)
        return pose({
          torso: -0.55 - s * 0.55, head: 0.5 + s * 0.3,
          thighA: 1.0 + s * 0.85, shinA: -1.1 - s * 0.6, footA: 0.3,
          thighB: 0.7 + s * 0.9, shinB: -1.6 + s * 0.4, footB: 0.1,
          armA: 0.55 + s * 0.6, foreA: 0.05, armB: 1.5 - u * 1.2, foreB: 0.5,
          hip: s * 1.5,
        })
      }
      case 'mantle': {
        const kin = p.kin
        const u = kin ? clamp01(kin.t / kin.T) : 1
        return pose({
          torso: -0.15 - smooth(u) * 0.75, head: 0.4,
          armA: 2.95 - smooth(u) * 2.4, foreA: 0.15 + u * 1.1, armB: 2.85 - smooth(u) * 2.2, foreB: 0.2 + u * 1.0,
          thighA: 0.3 + smooth(u) * 1.6, shinA: -0.4 - u * 1.8, footA: 0.2,
          thighB: 0.15, shinB: -0.3 - u * 0.6, footB: -0.2,
        })
      }
      case 'wallslide':
        return pose({
          torso: 0.12, head: 0.45,
          thighA: 0.9, shinA: -1.15, footA: -0.5, thighB: 0.55, shinB: -0.8, footB: -0.4,
          armA: 2.7, foreA: 0.35, armB: 2.3, foreB: 0.5,
        })
      case 'blocked':
        return pose({
          torso: -0.25, head: 0.2 + Math.sin(t * 5) * 0.06,
          thighA: 0.4, shinA: -0.5, footA: 0, thighB: -0.3, shinB: -0.2, footB: -0.2,
          armA: 1.45, foreA: 0.55, armB: 1.3, foreB: 0.7,
          hip: -0.6 + Math.sin(t * 5) * 0.35,
        })
      case 'zip': {
        const sway = Math.sin(t * 2.6) * 0.12
        return pose({
          torso: 0.18 + sway, head: -0.2,
          armA: 2.98 - sway, foreA: 0.05, armB: 2.92 - sway, foreB: 0.12,
          thighA: 0.75 + sway, shinA: -0.35, footA: 0.35, thighB: 0.55 + sway, shinB: -0.55, footB: 0.3,
          hip: 0,
        })
      }
      case 'dead':
        return pose({
          torso: Math.sin(t * 6) * 0.6, head: 0.5,
          thighA: Math.sin(t * 8) * 1.1, shinA: -0.9, thighB: -Math.sin(t * 8) * 1.1, shinB: -0.9,
          armA: 2.4 + Math.sin(t * 10) * 0.8, foreA: 0.4, armB: 2.0 - Math.sin(t * 10) * 0.8, foreB: 0.5,
        })
      default: {
        // idle: breathing, weight on the back foot, an occasional glance
        const b = Math.sin(t * 2.2)
        return pose({
          torso: -0.04 + b * 0.025, head: 0.08 + Math.max(0, Math.sin(t * 0.7)) * 0.25,
          thighA: 0.18, shinA: -0.12, footA: 0, thighB: -0.12, shinB: -0.08, footB: 0,
          armA: 0.12 + b * 0.04, foreA: 0.35, armB: -0.15 - b * 0.04, foreB: 0.4,
          hip: b * 0.25 - 0.2,
        })
      }
    }
  }

  // ── per-frame ───────────────────────────────────────────────────────────

  update(dt, p, wx, wy, mode) {
    this.time += dt
    const state = mode === 'idle' ? 'idle' : p.state
    this.state = state
    const target = this.target(state === p.state ? p : { ...p, state }, dt)

    // land squash overlay
    this.landT += dt
    if (this.landT < 0.22 && (state === 'run' || state === 'stumble')) {
      const u = Math.sin((this.landT / 0.22) * Math.PI) * this.landAmt
      target.hip -= 2.6 * u
      target.thighA += 0.5 * u; target.shinA -= 0.9 * u
      target.thighB += 0.4 * u; target.shinB -= 0.8 * u
      target.torso -= 0.3 * u
    }

    // springy joints: a touch of overshoot keeps motion loose
    const fast = state === 'run' || state === 'wallrun' || state === 'climb'
    const k = fast ? 1400 : 420
    const c = 2 * Math.sqrt(k) * (fast ? 0.85 : 0.62)
    // substep so long frames can't blow the springs up
    const n = Math.max(1, Math.ceil(dt / (1 / 240)))
    const h = dt / n
    for (let i = 0; i < n; i++) {
      for (const j of JOINTS) {
        const a = k * (target[j] - this.cur[j]) - c * this.vel[j]
        this.vel[j] += a * h
        this.cur[j] += this.vel[j] * h
      }
    }

    if (state === 'roll') {
      const u = clamp01(p.t / PHYS.ROLL_TIME)
      this.spin = -Math.PI * 2 * smooth(u)
    } else if (state === 'dead') {
      this.spin -= dt * 2.4
    } else {
      this.spin = Math.atan2(Math.sin(this.spin), Math.cos(this.spin)) * Math.exp(-dt * 14)
    }

    this.joints = this.solve()
    if (fast) {
      const step = Math.floor(this.phase / Math.PI)
      if (step !== this.lastStep) {
        this.lastStep = step
        this.onStep?.(state)
      }
    }
    this.simulateHair(dt, wx, wy)
  }

  // Joint positions in sprite space.
  solve() {
    const c = this.cur
    const L = this.L, sc = this.style.scale
    const dir = (a) => [Math.sin(a), -Math.cos(a)]
    const up = (a) => [-Math.sin(a), Math.cos(a)]
    const add = (p, d, l) => [p[0] + d[0] * l, p[1] + d[1] * l]
    const pelvis = [c.hipX, L.hip + c.hip]
    const chest = add(pelvis, up(c.torso), L.torso * 0.55)
    const shoulder = add(pelvis, up(c.torso), L.torso)
    const neck = add(shoulder, up(c.torso), L.neck)
    const head = add(neck, up(c.torso + c.head), L.head * 0.95)
    const arm = (a, f) => {
      const elbow = add(shoulder, dir(c.torso + a), L.upper)
      const hand = add(elbow, dir(c.torso + a + f), L.fore)
      return [elbow, hand]
    }
    const leg = (th, sh, fo) => {
      const knee = add(pelvis, dir(th), L.thigh)
      const ankle = add(knee, dir(th + sh), L.shin)
      const fa = th + sh + fo
      const toe = [ankle[0] + Math.cos(fa) * L.foot, ankle[1] + Math.sin(fa) * L.foot]
      return [knee, ankle, toe]
    }
    const [elbowA, handA] = arm(c.armA, c.foreA)
    const [elbowB, handB] = arm(c.armB, c.foreB)
    const [kneeA, ankleA, toeA] = leg(c.thighA, c.shinA, c.footA)
    const [kneeB, ankleB, toeB] = leg(c.thighB, c.shinB, c.footB)
    const hairRoot = add(head, [(-Math.cos(c.torso + c.head) * 1.0 - Math.sin(c.torso + c.head) * 1.9) * sc, (-Math.sin(c.torso + c.head) * 1.0 + Math.cos(c.torso + c.head) * 1.4) * sc], 1)
    const back = [-Math.cos(c.torso), -Math.sin(c.torso)]
    const coatRoot = add(add(pelvis, up(c.torso), L.torso * 0.3), back, 1.6 * sc)
    const scarfRoot = add(neck, back, 1.1 * sc)
    const j = { pelvis, chest, shoulder, neck, head, elbowA, handA, elbowB, handB, kneeA, ankleA, toeA, kneeB, ankleB, toeB, hairRoot, coatRoot, scarfRoot }
    // grounded poses never sink below the floor
    if (GROUNDED.has(this.state)) {
      const low = Math.min(ankleA[1] - 0.6 * sc, toeA[1] - 0.5 * sc, ankleB[1] - 0.6 * sc, toeB[1] - 0.5 * sc)
      if (low < 0) for (const key of Object.keys(j)) j[key] = [j[key][0], j[key][1] - low]
    }
    if (this.spin !== 0) {
      const cx = 0, cy = 4.5 * sc
      const s = Math.sin(this.spin), co = Math.cos(this.spin)
      for (const key of Object.keys(j)) {
        const [x, y] = j[key]
        j[key] = [cx + (x - cx) * co - (y - cy) * s, cy + (x - cx) * s + (y - cy) * co]
      }
      if (this.state === 'roll') {
        let low = Infinity
        for (const key of Object.keys(j)) if (key !== 'coatRoot' && key !== 'scarfRoot') low = Math.min(low, j[key][1] - 1.6 * sc)
        for (const key of Object.keys(j)) j[key] = [j[key][0], j[key][1] - low]
      }
    }
    return j
  }

  // Cloth (ponytail, coat tails, scarf): short verlet chains in world pixels,
  // so they trail real motion.
  simulateHair(dt, wx, wy) {
    const specs = this.style.cloth
    const roots = { hair: this.joints.hairRoot, coat: this.joints.coatRoot, scarf: this.joints.scarfRoot }
    const sc = this.style.scale
    if (!this.chains) this.chains = specs.map(() => null)
    this.chainsLocal = specs.map((spec, ci) => {
      const r = roots[spec.at]
      const root = [wx + r[0], wy + r[1]]
      const seg = spec.seg * sc
      let h = this.chains[ci]
      if (!h || Math.abs(h[0].x - root[0]) > 40 * sc || Math.abs(h[0].y - root[1]) > 40 * sc) {
        h = this.chains[ci] = Array.from({ length: spec.n }, (_, i) => ({ x: root[0] - i * seg, y: root[1] - i * 0.6, px: root[0] - i * seg, py: root[1] - i * 0.6 }))
      }
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)))
      const sdt = Math.min(dt, 0.05) / steps
      for (let s = 0; s < steps; s++) {
        h[0].x = root[0]; h[0].y = root[1]
        for (let i = 1; i < h.length; i++) {
          const q = h[i]
          const vx = (q.x - q.px) * spec.damp, vy = (q.y - q.py) * spec.damp
          q.px = q.x; q.py = q.y
          q.x += vx
          q.y += vy - 70 * spec.grav * sdt * sdt * 60
        }
        for (let it = 0; it < 3; it++) {
          for (let i = 1; i < h.length; i++) {
            const a = h[i - 1], b = h[i]
            const dx = b.x - a.x, dy = b.y - a.y
            const d = Math.hypot(dx, dy) || 1
            const diff = (d - seg) / d
            if (i === 1) { b.x -= dx * diff; b.y -= dy * diff }
            else { a.x += dx * diff * 0.5; a.y += dy * diff * 0.5; b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5 }
          }
        }
      }
      return h.map((q) => [q.x - wx, q.y - wy])
    })
    this.hairLocal = this.chainsLocal[specs.findIndex((c) => c.at === 'hair')] ?? null
  }

  // ── raster ─────────────────────────────────────────────────────────────

  parts() {
    const j = this.joints
    const st = this.style
    const C = st.colors
    const k = st.scale * st.thick
    const graceful = st.face
    const out = []
    const seg = (a, b, r, col, far = false) => out.push({ a, b, r: r * k, col, far })
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    const sleeve = st.sleeves ? C.sleeve : null
    const hand = (wrist, elbow, distant) => {
      if (!graceful) { seg(wrist, wrist, 1.15, distant ? C.gloveFar : C.glove, distant); return }
      const length = Math.hypot(wrist[0] - elbow[0], wrist[1] - elbow[1]) || 1
      const d = [(wrist[0] - elbow[0]) / length, (wrist[1] - elbow[1]) / length]
      const point = (along, across = 0) => [wrist[0] + (d[0] * along - d[1] * across) * st.scale, wrist[1] + (d[1] * along + d[0] * across) * st.scale]
      const glove = distant ? C.gloveFar : C.glove, skin = distant ? C.skinFar : C.skin
      // A cuff, directional palm, exposed knuckles and a separate thumb.
      // The fingers extend for a reaching hand, and gather during the run.
      const reach = ['climb', 'mantle', 'wallslide', 'zip', 'vault'].includes(this.state)
      seg(point(-0.7), point(-0.2), 0.85, glove, distant)
      seg(point(0), point(reach ? 1.2 : 0.5), 0.7, glove, distant)
      seg(point(reach ? 1.6 : 0.85), point(reach ? 2.1 : 1), 0.45, skin, distant)
      seg(point(0.1, -0.8), point(0.7, -0.8), 0.4, skin, distant)
    }
    // far side (B) first
    seg(j.shoulder, j.elbowB, 1.15, sleeve ? C.sleeveFar : C.skinFar, true)
    seg(j.elbowB, j.handB, 0.95, sleeve ? C.sleeveFar : C.skinFar, true)
    hand(j.handB, j.elbowB, true)
    seg(j.pelvis, j.kneeB, graceful ? 1.5 : 1.75, C.pantsFar, true)
    seg(j.kneeB, j.ankleB, graceful ? 1.05 : 1.3, C.pantsFar, true)
    seg(j.ankleB, j.toeB, graceful ? 0.8 : 1.0, C.shoeFar, true)
    // cloth trails behind the body
    st.cloth.forEach((spec, ci) => {
      const pts = this.chainsLocal?.[ci] || []
      for (let i = 1; i < pts.length; i++) {
        const t = i / Math.max(1, pts.length - 1)
        out.push({ a: pts[i - 1], b: pts[i], r: (spec.r0 + (spec.r1 - spec.r0) * t) * st.scale, col: C[spec.col], far: spec.col === 'top' })
      }
    })
    // A continuous, lightly fitted athletic top: rounded hips, a modest
    // waist taper and soft shoulders. Its contour follows the posed torso.
    if (graceful) {
      const coat = st.cloth.some((c) => c.at === 'coat')
      seg(j.pelvis, j.pelvis, 1.95, st.colors.pantsTop ?? C.pants)
      out.push({
        torso: true, a: lerp(j.pelvis, j.shoulder, 0.06), b: j.shoulder,
        // Back and front widths describe the clothed figure separately:
        // a gentle chest curve, fitted waist, and room around the hips.
        profile: [[0, 2.05, 2.05], [0.32, coat ? 1.55 : 1.35, coat ? 1.65 : 1.4], [0.64, 1.65, coat ? 2.2 : 2.4], [0.8, 1.6, coat ? 2.05 : 2.15], [1, 1.55, 1.65]],
        r: 2.4 * k, k, col: C.top,
      })
    } else {
      seg(j.pelvis, j.chest, 2.05, st.colors.pantsTop ?? C.pants)
      seg(lerp(j.pelvis, j.chest, 0.35), j.shoulder, 2.4, C.top)
    }
    if (st.trim) seg(lerp(j.pelvis, j.shoulder, 0.15), lerp(j.pelvis, j.shoulder, 0.85), 0.6, C.trim)
    seg(j.shoulder, j.neck, 1.0, C.skin)
    // head + hair cap
    if (graceful) out.push({ face: true, c: j.head, r: 2.85 * st.scale, col: C.skin })
    else seg(j.head, j.head, 2.75 * st.head, C.skin)
    out.push({ hairCap: true, c: j.head, r: (graceful ? 2.8 : 2.7) * st.scale * st.head, col: C.hair })
    // near side (A)
    seg(j.pelvis, j.kneeA, graceful ? 1.65 : 1.8, C.pants)
    seg(j.kneeA, j.ankleA, graceful ? 1.2 : 1.35, C.pants)
    seg(j.ankleA, j.toeA, graceful ? 0.95 : 1.05, C.shoe)
    if (st.shade) seg(j.ankleA, j.toeA, 0.45, C.shoeFar)
    seg(j.shoulder, j.elbowA, graceful ? 1 : 1.2, sleeve ?? C.skin)
    seg(lerp(j.shoulder, j.elbowA, 0.55), lerp(j.shoulder, j.elbowA, 0.6), graceful ? 1 : 1.2, C.band)
    seg(j.elbowA, j.handA, graceful ? 0.8 : 1.0, sleeve ?? C.skin)
    hand(j.handA, j.elbowA, false)
    if (graceful) seg(j.hairRoot, j.hairRoot, 0.6, C.band)
    return out
  }

  // The runner's shape alone, outline included, in one flat color: what
  // tint(raster()) gives, without working out the shading it would discard.
  silhouette(color, out) {
    const W = SPRITE_W, H = SPRITE_H
    if (!out || out.w !== W || out.h !== H) out = new PixelBuffer(W, H)
    this.cover()
    const ids = this.ids, data = out.data, c = pack(color)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        data[i] = ids[i] || (x > 0 && ids[i - 1]) || (x < W - 1 && ids[i + 1]) ||
          (y > 0 && ids[i - W]) || (y < H - 1 && ids[i + W]) ? c : 0
      }
    }
    return out
  }

  // Which part covers each sprite pixel (0 for none), into this.ids.
  cover() {
    const W = SPRITE_W, H = SPRITE_H
    const ids = this.ids
    ids.fill(0)
    const parts = this.parts()
    const face = this.cur.torso + this.cur.head + this.spin
    for (let pi = 0; pi < parts.length; pi++) {
      const part = parts[pi]
      if (part.hairCap || part.face) {
        const [cx, cy] = part.c
        const fx = Math.sin(-face), fy = Math.cos(-face)  // head "up" vector
        const reach = part.r + 1
        for (let y = Math.floor(cy - reach); y <= cy + reach; y++) {
          for (let x = Math.floor(cx - reach); x <= cx + reach; x++) {
            const dx = x + 0.5 - cx, dy = y + 0.5 - cy
            // hair covers the back and the crown; the face stays clear
            const along = dx * fy - dy * fx         // + toward the face (forward)
            const upward = dx * fx + dy * fy
            const sc = this.style.scale
            if (part.face) {
              // An oval crown and a gently tapered jaw, rather than a round
              // helmet. Clothing and athletic proportions carry the body.
              const u = upward / sc, a = along / sc
              const width = u < -1.5 ? 1.4 : 2.05
              // A quiet, nearly straight face edge; the hair and jaw carry
              // the profile rather than a projecting middle pixel.
              if (a > (u < -1.2 ? 1.25 : 1.45)) continue
              if ((a / width) ** 2 + (upward / part.r) ** 2 > 1) continue
            } else {
              if (dx * dx + dy * dy > part.r * part.r) continue
              if (along > (this.style.face ? -0.2 : 0.9) * sc && upward < 1.5 * sc) continue
            }
            const px = x + ORIGIN_X, py = ORIGIN_Y - y - 1
            if (px >= 0 && py >= 0 && px < W && py < H) ids[py * W + px] = pi + 1
          }
        }
        continue
      }
      const [ax, ay] = part.a, [bx, by] = part.b, r = part.r
      const x0 = Math.floor(Math.min(ax, bx) - r), x1 = Math.ceil(Math.max(ax, bx) + r)
      const y0 = Math.floor(Math.min(ay, by) - r), y1 = Math.ceil(Math.max(ay, by) + r)
      const r2 = r * r
      const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (part.torso) {
            const u = ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / length2
            if (u < 0 || u > 1.07) continue
            const t = Math.min(1, u)
            const across = ((x + 0.5 - ax) * dy - (y + 0.5 - ay) * dx) / Math.sqrt(length2)
            const side = across >= 0 ? 2 : 1
            let width = part.profile.at(-1)[side]
            for (let i = 1; i < part.profile.length; i++) {
              const t1 = part.profile[i][0], r1 = part.profile[i][side]
              const t0 = part.profile[i - 1][0], r0 = part.profile[i - 1][side]
              if (t <= t1) { width = r0 + (r1 - r0) * (t - t0) / (t1 - t0); break }
            }
            if (Math.abs(across) > width * part.k) continue
          } else if (segDist2(x + 0.5, y + 0.5, ax, ay, bx, by) > r2) continue
          const px = x + ORIGIN_X, py = ORIGIN_Y - y - 1
          if (px >= 0 && py >= 0 && px < W && py < H) ids[py * W + px] = pi + 1
        }
      }
    }
    return parts
  }

  raster() {
    const W = SPRITE_W, H = SPRITE_H
    const ids = this.ids
    const parts = this.cover()
    const face = this.cur.torso + this.cur.head + this.spin

    // colorize, rim light toward the light source, outline the silhouette
    const buf = this.buf
    buf.data.fill(0)
    const st = this.style
    const outline = pack(st.colors.outline ?? COLORS.outline)
    const [rdx, rdy] = this.rimDir
    const packed = parts.map((p) => pack(p.col))
    const rimmed = parts.map((p) => {
      const dark = Math.max(...p.col) < 100
      return p.far ? pack(p.col) : pack(mix(p.col, this.rim, st.face ? (dark ? 0.32 : 0.18) : 0.45))
    })
    const shaded = parts.map((p) => pack(mix(p.col, [10, 6, 20], st.shade)))
    // a pixel is shaded when, two steps away from the light, it leaves its part
    const away = (x, y, d) => {
      const nx = x - rdx * d, ny = y + rdy * d
      return nx < 0 || ny < 0 || nx >= W || ny >= H ? 0 : ids[ny * W + nx]
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const id = ids[y * W + x]
        if (!id) continue
        const nx = x + rdx, ny = y - rdy
        const lit = nx < 0 || ny < 0 || nx >= W || ny >= H || ids[ny * W + nx] === 0
        let c = lit ? rimmed[id - 1] : packed[id - 1]
        if (st.shade && !lit && (away(x, y, 1) !== id || (!st.face && away(x, y, 2) !== id))) c = shaded[id - 1]
        buf.data[y * W + x] = c
      }
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (ids[y * W + x]) continue
        if ((x > 0 && ids[y * W + x - 1]) || (x < W - 1 && ids[y * W + x + 1]) ||
            (y > 0 && ids[(y - 1) * W + x]) || (y < H - 1 && ids[(y + 1) * W + x])) {
          buf.data[y * W + x] = outline
        }
      }
    }
    // eye: one dark pixel on the face side
    const [hx, hy] = this.joints.head
    const sc = st.scale
    if (st.face) {
      const detail = (along, up, color, hair = false) => {
        const x = Math.round(hx + (Math.cos(face) * along - Math.sin(face) * up) * sc) + ORIGIN_X
        const y = ORIGIN_Y - Math.round(hy + (Math.sin(face) * along + Math.cos(face) * up) * sc) - 1
        if (x < 0 || y < 0 || x >= W || y >= H) return
        const part = parts[ids[y * W + x] - 1]
        if (part?.face || (hair && part?.hairCap)) buf.set(x, y, pack(color))
      }
      const skin = st.colors.skin
      detail(1.1, 1.3, st.colors.hair) // brow
      detail(1.3, 0.6, COLORS.outline) // eye
      detail(1.1, -0.7, mix(skin, [255, 222, 191], 0.28)) // cheek
      detail(1.5, -1.55, mix(skin, st.colors.skinFar, 0.7)) // mouth and jaw
      detail(-0.2, -0.15, st.colors.skinFar, true) // ear against the hairline
      detail(-0.4, 1.9, mix(st.colors.hair, this.rim, 0.15), true) // swept fringe
      return buf
    }
    const ex = Math.round(hx + (Math.cos(face) * 1.3 - Math.sin(face) * 0.5) * sc)
    const ey = Math.round(hy + (Math.sin(face) * 1.3 + Math.cos(face) * 0.5) * sc)
    const epx = ex + ORIGIN_X, epy = ORIGIN_Y - ey - 1
    const visor = pack(st.face ? COLORS.outline : st.colors.visor ?? COLORS.visor)
    if (ids[epy * W + epx]) {
      buf.set(epx, epy, visor)
      if (!st.face && ids[epy * W + epx - 1]) buf.set(epx - 1, epy, visor)
      if (!st.face && sc > 1.3 && ids[epy * W + epx + 1]) buf.set(epx + 1, epy, visor)
    }
    return buf
  }
}
