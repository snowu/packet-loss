// The runner's one skeleton. Every outfit is drawn on these bones, every
// animation is a set of joint angles for them, and bone lengths never change.
//
// Model space: 1 unit = 1 logical pixel, y down, x forward (facing right),
// origin on the roof directly under the runner. Limb angles are measured
// forward from hanging straight down, so a limb points along [sin a, cos a].
import { MODEL, SHOE } from '../runnerModel.js'

export const BONES = Object.freeze({
  abdomen: 5.0, chest: MODEL.torso - 5.0, neck: 1.5,
  thigh: MODEL.thigh, shin: MODEL.shin,
  upper: MODEL.upper, fore: MODEL.fore, hand: MODEL.hand,
})

// A pose is a flat record of numbers, so any two poses blend channel by
// channel. Angles are radians. `x`/`y` place the pelvis; `spin` turns the
// whole body about its middle (rolls). Knee and elbow flex are clamped to
// their anatomical range when solved, so no blend can hyperextend a joint.
// `twist` turns the ribcage against the pelvis about the spine: seen from the
// side, the near shoulder comes forward as the near hip goes back.
export const CHANNELS = Object.freeze([
  'x', 'y', 'spin', 'lean', 'chest', 'twist', 'head',
  'nThigh', 'nKnee', 'nFoot', 'fThigh', 'fKnee', 'fFoot',
  'nArm', 'nElbow', 'nWrist', 'fArm', 'fElbow', 'fWrist',
])

export const NEUTRAL = Object.freeze({
  x: 0, y: -MODEL.hip, spin: 0, lean: 0.04, chest: 0, twist: 0, head: 0,
  nThigh: 0.05, nKnee: 0.1, nFoot: 0, fThigh: -0.05, fKnee: 0.1, fFoot: 0,
  nArm: 0.05, nElbow: 0.3, nWrist: 0.1, fArm: -0.05, fElbow: 0.3, fWrist: 0.1,
})

export const pose = (values = {}) => ({ ...NEUTRAL, ...values })

export function lerpPose(a, b, t, out = {}) {
  for (const k of CHANNELS) out[k] = a[k] + (b[k] - a[k]) * t
  return out
}

// Centripetal-free uniform Catmull-Rom through four poses. Used for clip keys
// so motion keeps its velocity through every key instead of stopping on it.
export function splinePose(p0, p1, p2, p3, t, out = {}) {
  const t2 = t * t, t3 = t2 * t
  for (const k of CHANNELS) {
    const a = p0[k], b = p1[k], c = p2[k], d = p3[k]
    out[k] = 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3)
  }
  return out
}

const dir = a => [Math.sin(a), Math.cos(a)]
const up = a => [Math.sin(a), -Math.cos(a)]
const add = (p, d, l) => [p[0] + d[0] * l, p[1] + d[1] * l]

// Torso-local frame: `f` forward, `u` up the spine.
export const frame = (origin, angle) => ({ o: origin, u: up(angle), f: [Math.cos(angle), Math.sin(angle)], angle })
export const at = (fr, f, u) => [fr.o[0] + fr.f[0] * f + fr.u[0] * u, fr.o[1] + fr.f[1] * f + fr.u[1] * u]

function leg(hip, thigh, knee, foot) {
  knee = Math.max(0, knee)
  const k = add(hip, dir(thigh), BONES.thigh)
  const ankle = add(k, dir(thigh - knee), BONES.shin)
  return { hip, knee: k, ankle, foot }
}

function arm(shoulder, angle, elbow, wrist) {
  elbow = Math.max(0, elbow)
  const e = add(shoulder, dir(angle), BONES.upper)
  const fore = angle + elbow
  const w = add(e, dir(fore), BONES.fore)
  const hand = fore + wrist
  return { shoulder, elbow: e, wrist: w, knuckles: add(w, dir(hand), BONES.hand), hand }
}

// Half the width of the shoulders and of the hips as a full twist shows
// them from the side, in model units.
const SHOULDER_SPAN = 1.7, HIP_SPAN = 1.0

// Where the two hip joints are: either side of the pelvis centre along its
// forward axis, by how far the body is twisted.
export function hipsOf(p) {
  const f = [Math.cos(p.lean), Math.sin(p.lean)], d = (p.twist || 0) * HIP_SPAN
  return [[p.x - f[0] * d, p.y - f[1] * d], [p.x + f[0] * d, p.y + f[1] * d]]
}

// Forward kinematics: joint positions for a pose, before any `spin`.
function chain(p) {
  const hip = [p.x, p.y], twist = p.twist || 0
  const pelvis = frame(hip, p.lean)
  const waist = at(pelvis, 0, BONES.abdomen)
  const chest = frame(waist, p.lean + p.chest)
  const shoulder = at(chest, -0.3, BONES.chest - 0.6)
  const neck = at(chest, 0.5, BONES.chest)
  const head = frame(add(neck, up(p.lean + p.chest + (p.head - p.lean - p.chest) * 0.5), BONES.neck), p.head)
  const [nearHip, farHip] = hipsOf(p)
  return {
    hip, waist, pelvis, chest, shoulder, neck, head,
    near: leg(nearHip, p.nThigh, p.nKnee, p.nFoot), far: leg(farHip, p.fThigh, p.fKnee, p.fFoot),
    nearArm: arm(at(chest, -0.3 + twist * SHOULDER_SPAN, BONES.chest - 0.6), p.nArm, p.nElbow, p.nWrist),
    farArm: arm(at(chest, -0.3 - twist * SHOULDER_SPAN, BONES.chest - 0.6), p.fArm, p.fElbow, p.fWrist),
  }
}

// The point a roll turns about: the middle of the body as posed, so a
// tucked ball turns about its own centre rather than swinging around a hip.
export function spinPivot(j) {
  const pts = [j.hip, j.shoulder, at(j.head, 0, 5), j.near.knee, j.near.ankle, j.far.knee, j.far.ankle]
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
}

const rot = (pt, c, a) => {
  const s = Math.sin(a), k = Math.cos(a), dx = pt[0] - c[0], dy = pt[1] - c[1]
  return [c[0] + dx * k - dy * s, c[1] + dx * s + dy * k]
}

function spun(j, c, a) {
  if (!a) return j
  const r = pt => rot(pt, c, a)
  const fr = f => frame(r(f.o), f.angle + a)
  const limb = l => ({ ...l, hip: r(l.hip), knee: r(l.knee), ankle: r(l.ankle), foot: l.foot + a })
  const hand = l => ({ ...l, shoulder: r(l.shoulder), elbow: r(l.elbow), wrist: r(l.wrist), knuckles: r(l.knuckles), hand: l.hand + a })
  return {
    hip: r(j.hip), waist: r(j.waist), shoulder: r(j.shoulder), neck: r(j.neck),
    pelvis: fr(j.pelvis), chest: fr(j.chest), head: fr(j.head),
    near: limb(j.near), far: limb(j.far), nearArm: hand(j.nearArm), farArm: hand(j.farArm),
  }
}

export function solve(p) {
  const j = chain(p)
  return p.spin ? spun(j, spinPivot(j), p.spin) : j
}

// Shoe outline in foot space (ankle at the origin), shared with the gait's
// ground contact so a planted sole sits exactly on the roof.
export const SOLE = Object.freeze([[SHOE.x, SHOE.y + SHOE.h], [SHOE.x + SHOE.w, SHOE.y + SHOE.h]])

export function soleBottom(l) {
  const s = Math.sin(l.foot), c = Math.cos(l.foot)
  let low = -Infinity
  for (const x of [SHOE.x, SHOE.x + SHOE.w]) for (const y of [SHOE.y, SHOE.y + SHOE.h]) low = Math.max(low, l.ankle[1] + x * s + y * c)
  return low
}

// Lowest visible point of a solved pose: soles, fists, seat and head.
export function bottomOf(j) {
  return Math.max(soleBottom(j.near), soleBottom(j.far),
    j.nearArm.knuckles[1] + 1.2, j.farArm.knuckles[1] + 1.2,
    j.hip[1] + 2.4, j.waist[1] + 2.2, j.shoulder[1] + 2.2, at(j.head, 0, 3.5)[1] + 3.5)
}

// Highest visible point of a solved pose (y is down, so the smallest): the
// crown and the back of the hair, the fists, knees and shoulders.
export function topOf(j) {
  return Math.min(at(j.head, 0.4, MODEL.head * 0.86)[1], at(j.head, -2.6, MODEL.head * 0.7)[1],
    j.nearArm.knuckles[1] - 1.2, j.farArm.knuckles[1] - 1.2, j.near.knee[1] - 2.4, j.far.knee[1] - 2.4, j.shoulder[1] - 2.2)
}

// Lift or drop the pose so its lowest point rests on the roof.
export function ground(p) {
  return { ...p, y: p.y - bottomOf(solve(p)) }
}

// Two-bone IK. The knee bends forward (toward +x), as a knee must in side view.
export function kneeBetween(hip, ankle, a = BONES.thigh, b = BONES.shin) {
  const dx = ankle[0] - hip[0], dy = ankle[1] - hip[1]
  const length = Math.max(0.001, Math.hypot(dx, dy))
  const d = Math.min(length, a + b - 0.001)
  const along = (a * a - b * b + d * d) / (2 * d)
  const bend = Math.sqrt(Math.max(0, a * a - along * along))
  return [hip[0] + dx / length * along + dy / length * bend, hip[1] + dy / length * along - dx / length * bend]
}

// Thigh angle and knee flex that put the ankle at a world position.
export function legAngles(hip, ankle) {
  const knee = kneeBetween(hip, ankle)
  const thigh = Math.atan2(knee[0] - hip[0], knee[1] - hip[1])
  const shin = Math.atan2(ankle[0] - knee[0], ankle[1] - knee[1])
  return { thigh, knee: thigh - shin }
}

// Drop the pelvis while the feet stay where they are: the landing squash,
// applied to any grounded pose without sliding its soles.
export function crouch(p, amount) {
  if (!(amount > 0)) return p
  const j = chain(p), q = { ...p, y: p.y + amount, lean: p.lean + amount * 0.05 }
  const [nearHip, farHip] = hipsOf(q)
  const n = legAngles(nearHip, j.near.ankle), f = legAngles(farHip, j.far.ankle)
  return { ...q, nThigh: n.thigh, nKnee: n.knee, fThigh: f.thigh, fKnee: f.knee }
}
