import { PPU } from './sprites.js'
import { MODEL, SHOE } from './runnerModel.js'
export { SHOE } from './runnerModel.js'

// A full left/right stride, in world metres. Position, not wall-clock time,
// advances the feet, so focus, changing speed and skipped draws cannot slip.
export const RUN_STRIDE = 4.2
export const RUN_FRAMES = 64
export const STANCE = 0.24
export const CONTACT_X = 5
const STRIKE_TILT = -0.08
const PUSH_TILT = 0.38
const FLAT_AT = 0.08
const ROLL_AT = 0.14
export const RECOVERY_KEYS = [STANCE, 0.43, 0.64, 0.83, 1]
const TAU = Math.PI * 2
const wrap = x => ((x % 1) + 1) % 1

// Local shoe coordinates, shared with the renderer. Roll around the sole's
// lowest point so heel strike and toe-off never bury the shoe in the roof.
export const soleHeight = tilt => Math.max(SHOE.y * Math.cos(tilt), (SHOE.y + SHOE.h) * Math.cos(tilt)) +
  Math.max(SHOE.x * Math.sin(tilt), (SHOE.x + SHOE.w) * Math.sin(tilt))

// Rotate about the heel at strike and the toe at push-off. Translating only
// the ankle plants its height but drags the visible contact across the roof.
export function plantedAnkle(x, tilt) {
  const pivot = tilt < 0 ? SHOE.x : SHOE.x + SHOE.w
  return [x + pivot * (1 - Math.cos(tilt)) + (SHOE.y + SHOE.h) * Math.sin(tilt), -soleHeight(tilt)]
}

function swing(u, reach) {
  // Hermite tangents are in pixels per cycle. Match ground velocity at both
  // ends; easing every segment to a stop made the recovering feet hitch.
  const speed = -RUN_STRIDE * PPU
  const start = plantedAnkle(reach - RUN_STRIDE * PPU * STANCE, PUSH_TILT), end = plantedAnkle(reach, STRIKE_TILT)
  // Toe roll is still moving at lift-off; heel roll is moving at strike.
  const velocity = (tilt, rate, pivot) => [
    speed + (pivot * Math.sin(tilt) + (SHOE.y + SHOE.h) * Math.cos(tilt)) * rate,
    ((SHOE.y + SHOE.h) * Math.sin(tilt) - pivot * Math.cos(tilt)) * rate,
  ]
  const rollRate = 2 * PUSH_TILT / (STANCE - ROLL_AT)
  const strikeRate = -STRIKE_TILT / FLAT_AT
  const out = velocity(PUSH_TILT, rollRate, SHOE.x + SHOE.w)
  const into = velocity(STRIKE_TILT, strikeRate, SHOE.x)
  const keys = [
    [STANCE, ...start, PUSH_TILT, ...out, rollRate],
    [0.43, -8, -16, 0.8, 42, -8, -1],
    [0.64, -0.5, -12.5, 0.1, 50, 25, -3],
    [0.83, 5, -8, -0.18, 10, 30, 0],
    [1, ...end, STRIKE_TILT, ...into, strikeRate],
  ]
  const i = Math.min(3, keys.findIndex((k, i) => i < 4 && u < keys[i + 1][0]))
  const a = keys[i], b = keys[i + 1], span = b[0] - a[0], t = (u - a[0]) / span
  const h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h10 = t ** 3 - 2 * t ** 2 + t
  const h01 = -2 * t ** 3 + 3 * t ** 2, h11 = t ** 3 - t ** 2
  return [1, 2, 3].map(j => h00 * a[j] + h10 * span * a[j + 3] + h01 * b[j] + h11 * span * b[j + 3])
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
export function kneeBetween(hip, ankle, thigh = MODEL.thigh, shin = MODEL.shin) {
  const dx = ankle[0] - hip[0], dy = ankle[1] - hip[1]
  const length = Math.max(0.001, Math.hypot(dx, dy))
  const d = Math.min(length, thigh + shin - 0.001)
  const along = (thigh * thigh - shin * shin + d * d) / (2 * d)
  const bend = Math.sqrt(Math.max(0, thigh * thigh - along * along))
  return [hip[0] + dx / length * along + dy / length * bend, hip[1] + dy / length * along - dx / length * bend]
}

export function shinFootAngle(knee, ankle) {
  // A neutral ankle puts the shoe perpendicular to the shin. A shoe held
  // horizontal in world space folds backwards through a recovering calf.
  return Math.atan2(knee[0] - ankle[0], ankle[1] - knee[1])
}

const smooth = x => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t) }

function recoveryFoot(u, knee, ankle, roll) {
  const v = (u - STANCE) / (1 - STANCE)
  const flex = 0.12 - 0.24 * smooth(v / 0.6)
  const anatomical = shinFootAngle(knee, ankle) + flex
  // Only the ground controls the shoe's world angle. Ease out of toe roll
  // and back into strike with zero blend velocity at both boundaries.
  const weight = smooth((u - STANCE) / 0.10) * smooth((1 - u) / 0.14)
  return roll + (anatomical - roll) * weight
}

export function runPose(phase) {
  // Compression follows contact; extension and flight follow push-off. The
  // old low, almost stationary pelvis forced a squat through the whole run.
  const t = wrap(phase), hip = [0, -MODEL.hip + MODEL.bounce * Math.cos((t - 0.11) * TAU * 2)]
  const leg = offset => {
    const u = wrap(t + offset), reach = CONTACT_X
    let ankle, tilt
    if (u < STANCE) {
      // Moving backwards by exactly the world distance travelled keeps the
      // sole planted on the roof until toe-off.
      tilt = u < FLAT_AT ? STRIKE_TILT * (1 - u / FLAT_AT) : u > ROLL_AT ? PUSH_TILT * ((u - ROLL_AT) / (STANCE - ROLL_AT)) ** 2 : 0
      ankle = plantedAnkle(reach - RUN_STRIDE * PPU * u, tilt)
    } else {
      const recovery = swing(u, reach)
      ankle = recovery.slice(0, 2)
      tilt = recovery[2]
    }
    const knee = kneeBetween(hip, ankle)
    if (u >= STANCE) tilt = recoveryFoot(u, knee, ankle, tilt)
    return { hip, knee, ankle, tilt, planted: u < STANCE }
  }
  // Counter the thigh drive, which peaks before contact, rather than the
  // ankle contact clock. The old arms lagged the legs by a quarter cycle.
  return { hip, near: leg(0), far: leg(0.5), arm: 0.95 * Math.sin(t * TAU - 0.55), lean: 0.19 }
}

export const runFrame = phase => Math.floor(wrap(phase) * RUN_FRAMES) % RUN_FRAMES
