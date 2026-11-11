// Animation clips for the shared skeleton. Each clip is a few authored key
// poses; sampling runs a spline through them, so motion carries its velocity
// through every key. The run is not keyed: it comes from the distance-driven
// gait, whose feet are planted on the roof and whose contacts drive the
// footstep sounds.
import { runPose, RUN_STRIDE } from '../runGait.js'
import { PHYS } from '../../sim/config.js'
import { pose, splinePose, ground, solve, legAngles } from './skeleton.js'

const TAU = Math.PI * 2
const clamp01 = v => Math.max(0, Math.min(1, v))
const wrap = v => ((v % 1) + 1) % 1
const ease = v => { const t = clamp01(v); return t * t * (3 - 2 * t) }

// keys: [[time, pose], ...] with times ascending from 0 to 1.
export function clip(keys, { loop = false, register = 'ground' } = {}) {
  return { keys: keys.map(([t, p]) => [t, pose(p)]), loop, register }
}

export function sample(c, t, out = {}) {
  const keys = c.keys, n = keys.length
  if (n === 1) return Object.assign(out, keys[0][1])
  t = c.loop ? wrap(t) : clamp01(t)
  let i = 0
  while (i < n - 2 && t >= keys[i + 1][0]) i++
  const span = keys[i + 1][0] - keys[i][0], u = span > 0 ? clamp01((t - keys[i][0]) / span) : 0
  // A looped clip's last key repeats its first, so neighbours wrap past it.
  const at = k => c.loop ? keys[((k % (n - 1)) + (n - 1)) % (n - 1)][1] : keys[Math.max(0, Math.min(n - 1, k))][1]
  return splinePose(at(i - 1), at(i), at(i + 1), at(i + 2), u, out)
}

// ---- Authored clips -------------------------------------------------------
// Values are deltas from NEUTRAL (see skeleton.js), in radians.

export const CLIPS = {
  // Weight on the back leg, breathing, a slow look about.
  idle: clip([
    [0, { lean: 0.03, chest: 0.0, head: -0.02, nThigh: 0.1, nKnee: 0.16, fThigh: -0.07, fKnee: 0.05, nArm: 0.06, nElbow: 0.32, fArm: -0.1, fElbow: 0.36 }],
    [0.5, { lean: 0.05, chest: 0.045, head: 0.03, nThigh: 0.12, nKnee: 0.24, fThigh: -0.06, fKnee: 0.1, nArm: 0.1, nElbow: 0.36, fArm: -0.06, fElbow: 0.4 }],
    [1, { lean: 0.03, chest: 0.0, head: -0.02, nThigh: 0.1, nKnee: 0.16, fThigh: -0.07, fKnee: 0.05, nArm: 0.06, nElbow: 0.32, fArm: -0.1, fElbow: 0.36 }],
  ], { loop: true }),

  // Stopped dead against a wall: guard up, weight on the toes.
  brace: clip([
    [0, { lean: 0.12, chest: 0.05, head: -0.05, nThigh: 0.28, nKnee: 0.45, nFoot: 0.1, fThigh: -0.18, fKnee: 0.22, fFoot: 0.25, nArm: 0.55, nElbow: 1.95, nWrist: -0.3, fArm: 0.8, fElbow: 1.75, fWrist: -0.3 }],
    [0.5, { lean: 0.14, chest: 0.08, head: -0.03, nThigh: 0.3, nKnee: 0.52, nFoot: 0.1, fThigh: -0.17, fKnee: 0.26, fFoot: 0.25, nArm: 0.5, nElbow: 2.0, nWrist: -0.3, fArm: 0.75, fElbow: 1.8, fWrist: -0.3 }],
    [1, { lean: 0.12, chest: 0.05, head: -0.05, nThigh: 0.28, nKnee: 0.45, nFoot: 0.1, fThigh: -0.18, fKnee: 0.22, fFoot: 0.25, nArm: 0.55, nElbow: 1.95, nWrist: -0.3, fArm: 0.8, fElbow: 1.75, fWrist: -0.3 }],
  ], { loop: true }),

  // Airborne, parameterised by vertical speed rather than time: falling (0)
  // through apex (0.6) to take-off drive (1).
  air: clip([
    [0, { lean: -0.02, chest: -0.04, head: -0.12, nThigh: 0.5, nKnee: 0.4, nFoot: 0.15, fThigh: -0.12, fKnee: 0.95, fFoot: 0.45, nArm: 2.1, nElbow: 0.6, nWrist: -0.2, fArm: -0.55, fElbow: 0.9, fWrist: -0.1 }],
    [0.35, { lean: 0.06, chest: 0.0, head: -0.06, nThigh: 0.75, nKnee: 0.85, nFoot: 0.25, fThigh: 0.05, fKnee: 1.0, fFoot: 0.5, nArm: 1.6, nElbow: 0.8, fArm: 0.0, fElbow: 1.1 }],
    [0.6, { lean: 0.12, chest: 0.04, head: 0.0, nThigh: 1.05, nKnee: 1.45, nFoot: 0.35, fThigh: 0.28, fKnee: 1.35, fFoot: 0.55, nArm: 0.35, nElbow: 1.25, fArm: 1.0, fElbow: 1.05 }],
    [1, { lean: 0.18, chest: 0.05, head: 0.02, nThigh: 1.3, nKnee: 1.7, nFoot: 0.45, fThigh: -0.42, fKnee: 0.75, fFoot: 0.7, nArm: -0.65, nElbow: 1.45, fArm: 1.95, fElbow: 0.55, fWrist: -0.2 }],
  ]),

  // Feet-first slide, low enough to pass under a pipe: drop onto the hip (0),
  // then skim with the lead leg out, the other knee up, a hand trailing.
  slide: clip([
    [0, { x: -1, lean: -0.5, chest: 0.2, head: -0.2, nThigh: 1.25, nKnee: 0.7, nFoot: -0.5, fThigh: 1.0, fKnee: 1.5, fFoot: -0.1, nArm: -0.7, nElbow: 0.5, fArm: 1.0, fElbow: 0.9 }],
    [0.16, { x: -4, lean: -1.2, chest: 0.24, head: -0.42, nThigh: 1.6, nKnee: 0.1, nFoot: -1.05, fThigh: 1.72, fKnee: 0.8, fFoot: -0.55, nArm: -1.18, nElbow: 0.18, nWrist: -0.4, fArm: 1.25, fElbow: 0.7 }],
    [0.6, { x: -4.5, lean: -1.26, chest: 0.26, head: -0.46, nThigh: 1.63, nKnee: 0.06, nFoot: -1.1, fThigh: 1.78, fKnee: 0.9, fFoot: -0.6, nArm: -1.2, nElbow: 0.14, nWrist: -0.4, fArm: 1.15, fElbow: 0.8 }],
    [1, { x: -4.5, lean: -1.24, chest: 0.26, head: -0.45, nThigh: 1.62, nKnee: 0.08, nFoot: -1.1, fThigh: 1.76, fKnee: 0.86, fFoot: -0.6, nArm: -1.2, nElbow: 0.15, nWrist: -0.4, fArm: 1.18, fElbow: 0.78 }],
  ]),

  // Vault by progress: drive the lead knee and reach for the obstacle (0),
  // plant a hand on it and swing both legs over ahead of the body, sitting
  // back onto the arm (0.34..0.6), push off and drop the feet (0.82), land
  // running (1). The lowest point is registered to the simulation's arc, so
  // the planted hand rides the top of the obstacle.
  vault: clip([
    [0, { lean: 0.38, chest: 0.08, head: 0.05, nThigh: -0.35, nKnee: 0.35, nFoot: 0.5, fThigh: 1.25, fKnee: 1.3, fFoot: 0.3, nArm: 0.95, nElbow: 0.25, nWrist: -0.4, fArm: -0.7, fElbow: 0.9 }],
    [0.34, { lean: -0.12, chest: 0.12, head: 0.0, nThigh: 1.45, nKnee: 0.55, nFoot: -0.5, fThigh: 1.75, fKnee: 0.75, fFoot: -0.5, nArm: 0.3, nElbow: 0.05, nWrist: -1.3, fArm: 1.1, fElbow: 0.8 }],
    [0.6, { lean: -0.32, chest: 0.16, head: -0.05, nThigh: 1.62, nKnee: 0.2, nFoot: -0.7, fThigh: 1.8, fKnee: 0.45, fFoot: -0.6, nArm: -0.35, nElbow: 0.05, nWrist: -0.9, fArm: 1.45, fElbow: 0.5 }],
    [0.82, { lean: 0.08, chest: 0.08, head: 0.0, nThigh: 0.75, nKnee: 0.8, nFoot: 0.0, fThigh: 1.15, fKnee: 0.35, fFoot: -0.2, nArm: -0.9, nElbow: 0.4, nWrist: -0.3, fArm: 1.0, fElbow: 0.9 }],
    [1, { lean: 0.2, chest: 0.03, head: 0.0, nThigh: -0.15, nKnee: 0.65, nFoot: 0.4, fThigh: 0.6, fKnee: 0.5, fFoot: 0.1, nArm: -0.4, nElbow: 1.3, fArm: 0.9, fElbow: 1.1 }],
  ]),

  // Ledge mantle by progress: hang, pull, press over, step through.
  mantle: clip([
    [0, { lean: -0.05, chest: -0.03, head: -0.15, nThigh: 0.25, nKnee: 0.5, nFoot: 0.3, fThigh: 0.05, fKnee: 0.4, fFoot: 0.35, nArm: 2.75, nElbow: 0.25, nWrist: 0.2, fArm: 2.9, fElbow: 0.2, fWrist: 0.2 }],
    [0.35, { lean: 0.05, chest: 0.0, head: -0.05, nThigh: 1.3, nKnee: 1.8, nFoot: 0.3, fThigh: 0.35, fKnee: 0.9, fFoot: 0.5, nArm: 2.2, nElbow: 1.5, nWrist: 0.3, fArm: 2.35, fElbow: 1.4, fWrist: 0.3 }],
    [0.7, { lean: 0.65, chest: 0.15, head: 0.1, nThigh: 1.75, nKnee: 2.1, nFoot: 0.2, fThigh: 0.5, fKnee: 1.3, fFoot: 0.5, nArm: 0.45, nElbow: 0.25, nWrist: -1.1, fArm: 0.6, fElbow: 0.3, fWrist: -1.1 }],
    [1, { lean: 0.25, chest: 0.04, head: 0.0, nThigh: 0.7, nKnee: 0.8, nFoot: 0.1, fThigh: -0.1, fKnee: 0.5, fFoot: 0.35, nArm: -0.3, nElbow: 1.2, fArm: 0.8, fElbow: 1.1 }],
  ]),

  // Running up a wall, hand over hand. One loop is two hand placements.
  climb: clip([
    [0, { lean: 0.12, chest: 0.04, head: -0.25, nThigh: 1.35, nKnee: 1.95, nFoot: -0.4, fThigh: 0.35, fKnee: 1.05, fFoot: -0.1, nArm: 2.95, nElbow: 0.25, fArm: 2.15, fElbow: 1.45 }],
    [0.5, { lean: 0.12, chest: 0.04, head: -0.25, nThigh: 0.35, nKnee: 1.05, nFoot: -0.1, fThigh: 1.35, fKnee: 1.95, fFoot: -0.4, nArm: 2.15, nElbow: 1.45, fArm: 2.95, fElbow: 0.25 }],
    [1, { lean: 0.12, chest: 0.04, head: -0.25, nThigh: 1.35, nKnee: 1.95, nFoot: -0.4, fThigh: 0.35, fKnee: 1.05, fFoot: -0.1, nArm: 2.95, nElbow: 0.25, fArm: 2.15, fElbow: 1.45 }],
  ], { loop: true }),

  // Sliding down a wall: hands up on it, feet braced against it.
  wallslide: clip([
    [0, { lean: 0.08, chest: 0.02, head: -0.18, nThigh: 0.75, nKnee: 1.25, nFoot: -0.75, fThigh: 0.3, fKnee: 0.8, fFoot: -0.5, nArm: 2.55, nElbow: 0.35, nWrist: 0.3, fArm: 2.85, fElbow: 0.3, fWrist: 0.3 }],
    [0.5, { lean: 0.1, chest: 0.03, head: -0.15, nThigh: 0.8, nKnee: 1.3, nFoot: -0.75, fThigh: 0.32, fKnee: 0.85, fFoot: -0.5, nArm: 2.5, nElbow: 0.45, nWrist: 0.3, fArm: 2.8, fElbow: 0.38, fWrist: 0.3 }],
    [1, { lean: 0.08, chest: 0.02, head: -0.18, nThigh: 0.75, nKnee: 1.25, nFoot: -0.75, fThigh: 0.3, fKnee: 0.8, fFoot: -0.5, nArm: 2.55, nElbow: 0.35, nWrist: 0.3, fArm: 2.85, fElbow: 0.3, fWrist: 0.3 }],
  ], { loop: true }),

  // Hanging from a zipline by both hands, knees up, swaying.
  zip: clip([
    [0, { lean: -0.12, chest: -0.04, head: 0.05, nThigh: 1.35, nKnee: 1.75, nFoot: 0.3, fThigh: 1.0, fKnee: 1.6, fFoot: 0.4, nArm: 2.88, nElbow: 0.18, nWrist: 0.1, fArm: 3.02, fElbow: 0.24, fWrist: 0.1 }],
    [0.5, { lean: -0.2, chest: -0.05, head: 0.1, nThigh: 1.5, nKnee: 1.9, nFoot: 0.35, fThigh: 1.15, fKnee: 1.75, fFoot: 0.45, nArm: 2.82, nElbow: 0.22, nWrist: 0.1, fArm: 2.96, fElbow: 0.28, fWrist: 0.1 }],
    [1, { lean: -0.12, chest: -0.04, head: 0.05, nThigh: 1.35, nKnee: 1.75, nFoot: 0.3, fThigh: 1.0, fKnee: 1.6, fFoot: 0.4, nArm: 2.88, nElbow: 0.18, nWrist: 0.1, fArm: 3.02, fElbow: 0.24, fWrist: 0.1 }],
  ], { loop: true, register: 'hands' }),

  // A parkour roll by progress, turning once at the steady rate the body
  // covers ground: land in a deep crouch reaching for the roof (0), tuck
  // tight and go over (0.22..0.78), come up onto the feet already leaning
  // into the run (1). `spin` turns the whole pose about its middle.
  roll: clip([
    [0, { spin: 0, lean: 0.7, chest: 0.2, head: 0.55, nThigh: 1.5, nKnee: 2.0, nFoot: 0.2, fThigh: 1.3, fKnee: 1.9, fFoot: 0.3, nArm: 0.7, nElbow: 0.3, fArm: 0.9, fElbow: 0.3 }],
    [0.22, { spin: TAU * 0.22, lean: 1.0, chest: 0.45, head: 1.55, nThigh: 2.1, nKnee: 2.5, nFoot: 0.6, fThigh: 1.95, fKnee: 2.45, fFoot: 0.7, nArm: 0.25, nElbow: 1.05, nWrist: 0.3, fArm: 0.05, fElbow: 1.25, fWrist: 0.3 }],
    [0.78, { spin: TAU * 0.78, lean: 1.0, chest: 0.45, head: 1.55, nThigh: 2.1, nKnee: 2.5, nFoot: 0.6, fThigh: 1.95, fKnee: 2.45, fFoot: 0.7, nArm: 0.25, nElbow: 1.05, nWrist: 0.3, fArm: 0.05, fElbow: 1.25, fWrist: 0.3 }],
    [1, { spin: TAU, lean: 0.55, chest: 0.12, head: 0.3, nThigh: 1.25, nKnee: 1.7, nFoot: 0.25, fThigh: 0.35, fKnee: 1.25, fFoot: 0.55, nArm: -0.3, nElbow: 1.2, fArm: 0.8, fElbow: 1.2 }],
  ], { register: 'none' }),

  // A trip: pitch forward, arms out, catch it, run again.
  stumble: clip([
    [0, { lean: 0.5, chest: 0.12, head: 0.2, nThigh: 0.8, nKnee: 1.0, nFoot: 0.2, fThigh: -0.45, fKnee: 0.5, fFoot: 0.5, nArm: -0.9, nElbow: 0.5, fArm: 1.7, fElbow: 0.35 }],
    [0.45, { lean: 0.62, chest: 0.16, head: 0.3, nThigh: -0.2, nKnee: 0.7, nFoot: 0.5, fThigh: 0.95, fKnee: 1.2, fFoot: 0.1, nArm: 1.8, nElbow: 0.4, fArm: -0.7, fElbow: 0.7 }],
    [1, { lean: 0.28, chest: 0.05, head: 0.05, nThigh: 0.6, nKnee: 0.8, nFoot: 0.1, fThigh: -0.2, fKnee: 0.7, fFoot: 0.4, nArm: -0.5, nElbow: 1.4, fArm: 0.8, fElbow: 1.3 }],
  ]),

  // Down: crumpled on the roof.
  dead: clip([
    [0, { lean: 0.9, chest: 0.3, head: 0.9, nThigh: 1.4, nKnee: 2.2, nFoot: 0.6, fThigh: 0.9, fKnee: 2.3, fFoot: 0.9, nArm: 1.2, nElbow: 0.8, fArm: 1.5, fElbow: 0.5 }],
    [1, { lean: 1.25, chest: 0.4, head: 1.3, nThigh: 1.55, nKnee: 2.5, nFoot: 0.8, fThigh: 1.15, fKnee: 2.5, fFoot: 1.0, nArm: 1.6, nElbow: 0.3, fArm: 1.8, fElbow: 0.2 }],
  ]),
}

// ---- The run, from the gait -------------------------------------------------

// Convert the gait's planted-foot IK into skeleton channels. `pace` (0..1)
// leans the body further over and drives the arms harder at speed.
export function runChannels(phase, pace = 0.5, out = {}) {
  if (!Number.isFinite(phase)) phase = 0
  const g = runPose(phase), t = wrap(phase)
  const legOf = l => legAngles(g.hip, l.ankle)
  const n = legOf(g.near), f = legOf(g.far)
  const swing = g.arm * (0.86 + 0.34 * pace)
  // The arm is not a pendulum: driving forward it folds tight and the fist
  // comes up to the chin; behind the body it opens and trails. The elbow
  // leads the swing by a little, so the forearm visibly whips through.
  const whip = Math.cos(t * TAU - 0.55)
  const elbow = (a, dir) => 1.32 + 0.5 * a + 0.16 * dir * whip
  const wrist = (a, dir) => 0.05 - 0.22 * dir * whip
  // The ribcage twists against the hips once per stride and the head stays
  // level over it; twice per stride the chest gives with each footfall.
  const twist = Math.sin(t * TAU - 0.4), give = Math.sin(t * TAU * 2 + 0.6)
  Object.assign(out, pose({
    x: g.hip[0], y: g.hip[1],
    lean: g.lean - 0.02 + 0.09 * pace + 0.02 * give,
    chest: 0.03 + 0.06 * twist + 0.035 * give,
    head: 0.02 - 0.03 * pace - 0.035 * twist + 0.03 * give,
    nThigh: n.thigh, nKnee: n.knee, nFoot: g.near.tilt,
    fThigh: f.thigh, fKnee: f.knee, fFoot: g.far.tilt,
    nArm: swing, nElbow: elbow(swing, 1), nWrist: wrist(swing, 1),
    fArm: -swing, fElbow: elbow(-swing, -1), fWrist: wrist(-swing, -1),
  }))
  return out
}

// ---- State to pose ----------------------------------------------------------

const pace = p => clamp01(((Number.isFinite(p.speed) ? p.speed : 12) - PHYS.SPEED_MIN) / (PHYS.SPEED_MAX - PHYS.SPEED_MIN))
const progress = (p, T) => p.kin && p.kin.T > 0 ? clamp01(p.kin.t / p.kin.T) : clamp01((p.t ?? 0) / T)

// Which clip a simulation state plays, and its blend-in time. Grounded clips
// are registered to the roof; air poses keep their feet at the body's base.
export function clipFor(p, idle) {
  if (idle || p.state === 'idle') return 'idle'
  switch (p.state) {
    case 'run': return 'run'
    case 'blocked': return 'brace'
    case 'air': case 'slide': case 'vault': case 'mantle': case 'climb': case 'wallslide':
    case 'wallrun': case 'zip': case 'roll': case 'stumble': case 'dead': return p.state
    default: return 'run'
  }
}

// Where a vault is in its clip. The hand plant is keyed to the obstacle, not
// the clock: approach until the body reaches its near face (0..PLANT), cross
// it on the hand (PLANT..RELEASE), then come off the far side (RELEASE..1).
// Ghosts carry no obstacle, so they fall back to plain progress.
const PLANT = 0.34, RELEASE = 0.6
function vaultTime(p) {
  const k = p.kin, u = progress(p, 0.3)
  if (!k || !(k.x1 > k.x0) || !(k.ex > k.sx)) return u
  const x = k.sx + (k.ex - k.sx) * u, reach = PHYS.W / 2 + 0.25
  const a = Math.max(k.sx + 0.05, k.x0 - reach), b = Math.min(k.ex - 0.05, Math.max(a + 0.1, k.x1 - reach))
  if (x < a) return PLANT * ease((x - k.sx) / (a - k.sx))
  if (x < b) return PLANT + (RELEASE - PLANT) * (x - a) / (b - a)
  return RELEASE + (1 - RELEASE) * (x - b) / (k.ex - b)
}

export function sampleState(name, p, ctx, out = {}) {
  const t = Number.isFinite(p.t) ? p.t : 0
  switch (name) {
    case 'run': return runChannels(ctx.phase, pace(p), out)
    case 'wallrun': {
      // Running along a wall: the same stride, driven by time, leaning in.
      runChannels((t * Math.max(8, p.speed || 12)) / RUN_STRIDE, 1, out)
      out.lean += 0.12; out.head -= 0.08
      return out
    }
    case 'idle': return registered('idle', ctx.time / 3.4, out)
    case 'brace': return registered('brace', ctx.time / 2.2, out)
    case 'air': {
      const vy = Number.isFinite(p.vy) ? p.vy : 0
      sample(CLIPS.air, clamp01((vy + 11) / 18), out)
      // Nobody holds a pose in the air: the legs keep working and the arms
      // feel for balance.
      const w = ctx.time * 7
      out.nThigh += 0.1 * Math.sin(w); out.fThigh -= 0.1 * Math.sin(w)
      out.nKnee += 0.14 * Math.sin(w + 1.1); out.fKnee += 0.14 * Math.sin(w + 2.6)
      out.nArm += 0.12 * Math.sin(w * 0.7 + 0.5); out.fArm -= 0.12 * Math.sin(w * 0.7 + 1.4)
      out.chest += 0.03 * Math.sin(w * 0.5)
      return Object.assign(out, ground(out))
    }
    case 'slide': {
      // The settled pose shudders as it skids, so a long slide is never frozen.
      sample(CLIPS.slide, t / PHYS.SLIDE_TIME, out)
      const skid = clamp01(t / 0.12) * 0.022
      out.lean += skid * Math.sin(ctx.time * 41); out.nThigh += skid * Math.sin(ctx.time * 33 + 1); out.fKnee += skid * 2 * Math.sin(ctx.time * 27 + 2)
      return Object.assign(out, ground(out))
    }
    case 'vault': return registered('vault', vaultTime(p), out)
    case 'mantle': return registered('mantle', progress(p, PHYS.MANTLE_TIME), out)
    case 'climb': return registered('climb', t / 0.42, out)
    case 'wallslide': return registered('wallslide', t / 1.6, out)
    case 'zip': return registered('zip', t / 1.9, out)
    case 'stumble': return registered('stumble', t / PHYS.STUMBLE_TIME, out)
    case 'dead': return registered('dead', t / 0.35, out)
    case 'roll': {
      // The ball stays on the roof whichever way up it is.
      sample(CLIPS.roll, t / PHYS.ROLL_TIME, out)
      return Object.assign(out, ground(out))
    }
  }
  return runChannels(ctx.phase, pace(p), out)
}

// Hands on a zipline sit at the line, which hangs ZIP_HANG above the feet.
const ZIP_GRIP = -PHYS.ZIP_HANG * 14

function registered(name, t, out) {
  const c = CLIPS[name]
  sample(c, t, out)
  if (c.register === 'ground') Object.assign(out, ground(out))
  else if (c.register === 'hands') {
    const j = solve(out), grip = Math.min(j.nearArm.knuckles[1], j.farArm.knuckles[1])
    out.y += ZIP_GRIP - grip
  }
  return out
}
