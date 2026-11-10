import { PPU } from './sprites.js'

// A full left/right stride, in world metres. Position, not wall-clock time,
// advances the feet, so focus, changing speed and skipped draws cannot slip.
export const RUN_STRIDE = 4.2
export const RUN_FRAMES = 64
export const STANCE = 0.36
const TAU = Math.PI * 2
const wrap = x => ((x % 1) + 1) % 1

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
  const t = wrap(phase), hip = [0, -16.7 + 1.2 * Math.sin(t * TAU * 2)]
  const leg = offset => {
    const u = wrap(t + offset), reach = RUN_STRIDE * PPU * STANCE / 2
    let ankle, tilt
    if (u < STANCE) {
      // Moving backwards by exactly the world distance travelled keeps the
      // sole planted on the roof until toe-off.
      ankle = [reach - RUN_STRIDE * PPU * u, -3.4]
      tilt = u < 0.10 ? -0.12 * (1 - u / 0.10) : u > 0.27 ? (u - 0.27) * 3 : 0
    } else {
      const v = (u - STANCE) / (1 - STANCE)
      const keys = [[-reach, -3.4], [-12, -11.5], [1, -13], [12, -7], [reach, -3.4]]
      const at = v * 4, i = Math.min(3, Math.floor(at)), f = at - i
      const ease = f * f * (3 - 2 * f)
      ankle = keys[i].map((a, j) => a + (keys[i + 1][j] - a) * ease)
      tilt = 0.3 * Math.sin(v * Math.PI) - 0.12 * v
    }
    return { hip, knee: kneeBetween(hip, ankle), ankle, tilt, planted: u < STANCE }
  }
  return { hip, near: leg(0), far: leg(0.5), arm: -0.75 * Math.cos(t * TAU), lean: 0.16 + 0.025 * Math.sin(t * TAU * 2) }
}

export const runFrame = phase => Math.floor(wrap(phase) * RUN_FRAMES) % RUN_FRAMES
