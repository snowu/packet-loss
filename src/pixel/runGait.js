import { PPU } from './sprites.js'

// A full left/right stride, in world metres. Position, not wall-clock time,
// advances the feet, so focus, changing speed and skipped draws cannot slip.
export const RUN_STRIDE = 4.2
export const RUN_FRAMES = 64
export const STANCE = 0.36
const TAU = Math.PI * 2
const wrap = x => ((x % 1) + 1) % 1

// Local shoe coordinates, shared with the renderer. Roll around the sole's
// lowest point so heel strike and toe-off never bury the shoe in the roof.
export const SHOE = Object.freeze({ x: -2.15, y: -0.9, w: 7.6, h: 4.3 })
export const soleHeight = tilt => (SHOE.y + SHOE.h) * Math.cos(tilt) +
  Math.max(SHOE.x * Math.sin(tilt), (SHOE.x + SHOE.w) * Math.sin(tilt))

function swing(u, reach) {
  // Hermite tangents are in pixels per cycle. Match ground velocity at both
  // ends; easing every segment to a stop made the recovering feet hitch.
  const speed = -RUN_STRIDE * PPU
  const keys = [
    [STANCE, -reach, -soleHeight(0.45), speed, -28],
    [0.51, -11, -11, 55, -40],
    [0.69, 0, -13, 75, 15],
    [0.86, 11, -7, 30, 42],
    [1, reach, -soleHeight(-0.16), speed, 0],
  ]
  const i = Math.min(3, keys.findIndex((k, i) => i < 4 && u < keys[i + 1][0]))
  const a = keys[i], b = keys[i + 1], span = b[0] - a[0], t = (u - a[0]) / span
  const h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h10 = t ** 3 - 2 * t ** 2 + t
  const h01 = -2 * t ** 3 + 3 * t ** 2, h11 = t ** 3 - t ** 2
  return [1, 2].map(j => h00 * a[j] + h10 * span * a[j + 2] + h01 * b[j] + h11 * span * b[j + 2])
}

export class RunGait {
  constructor() { this.reset() }
  reset() { this.phase = 0; this.x = null; this.active = false }

  update(p, x, dt, idle = false) {
    const running = p.state === 'run' && !idle
    const dx = x - this.x
    // Re-enter on a contact pose; land already supplies the impact sound.
    // Do not turn a respawn/teleport into a burst of missed footsteps.
    if (!running || !this.active || !Number.isFinite(dx) || dx < 0 || dx > Math.max(1, (p.speed || 17) * dt * 3)) {
      this.phase = 0; this.x = x; this.active = running
      return null
    }
    this.x = x
    const before = Math.floor(this.phase * 2)
    this.phase += dx / RUN_STRIDE
    return Math.floor(this.phase * 2) > before ? (Math.floor(this.phase * 2) & 1) : null
  }
}

// Knee bends forward in side view. Both bones retain their length, including
// during heel recovery; no frame can sprout another leg or reverse a knee.
export function kneeBetween(hip, ankle, thigh = 9.6, shin = 9.5) {
  const dx = ankle[0] - hip[0], dy = ankle[1] - hip[1]
  const length = Math.max(0.001, Math.hypot(dx, dy))
  const d = Math.min(length, thigh + shin - 0.001)
  const along = (thigh * thigh - shin * shin + d * d) / (2 * d)
  const bend = Math.sqrt(Math.max(0, thigh * thigh - along * along))
  return [hip[0] + dx / length * along + dy / length * bend, hip[1] + dy / length * along - dx / length * bend]
}

export function runPose(phase) {
  const t = wrap(phase), hip = [0, -18.8 + 0.6 * Math.cos(t * TAU * 2)]
  const leg = offset => {
    const u = wrap(t + offset), reach = RUN_STRIDE * PPU * STANCE / 2
    let ankle, tilt
    if (u < STANCE) {
      // Moving backwards by exactly the world distance travelled keeps the
      // sole planted on the roof until toe-off.
      tilt = u < 0.10 ? -0.16 * (1 - u / 0.10) : u > 0.25 ? 0.45 * ((u - 0.25) / (STANCE - 0.25)) ** 2 : 0
      ankle = [reach - RUN_STRIDE * PPU * u, -soleHeight(tilt)]
    } else {
      const v = (u - STANCE) / (1 - STANCE)
      ankle = swing(u, reach)
      tilt = 0.45 * (1 - v) - 0.16 * v + 0.45 * Math.sin(v * Math.PI)
    }
    return { hip, knee: kneeBetween(hip, ankle), ankle, tilt, planted: u < STANCE }
  }
  return { hip, near: leg(0), far: leg(0.5), arm: -0.75 * Math.cos(t * TAU), lean: 0.16 + 0.025 * Math.sin(t * TAU * 2) }
}

export const runFrame = phase => Math.floor(wrap(phase) * RUN_FRAMES) % RUN_FRAMES
