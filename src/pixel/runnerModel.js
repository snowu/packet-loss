// Shared model-space measurements for every outfit and movement state.
// World physics remains unchanged; these are illustrated sprite dimensions.
export const MODEL = Object.freeze({
  thigh: 10.7, shin: 10.3, hip: 22.6, bounce: 0.55,
  torso: 9.4, upper: 6.0, fore: 5.2, hand: 1.9,
  head: 7.0, hair: 6.4,
})
export const SHOE = Object.freeze({ x: -1.5, y: -0.6, w: 6.2, h: 3.0 })
export const FRAME = Object.freeze({ width: 128, height: 128, origin: [32, 56], scale: 2 })
export const PART = Object.freeze({ head: 0, torso: 1, hair: 2, upper: 3, fore: 4, hand: 5, thigh: 6, shin: 7, shoe: 8 })

export const rotatePoint = (p, angle) => [p[0] * Math.cos(angle) - p[1] * Math.sin(angle), p[0] * Math.sin(angle) + p[1] * Math.cos(angle)]
export const addPoint = (a, b) => [a[0] + b[0], a[1] + b[1]]

export function shoulderAt(pose) { return addPoint(pose.hip, rotatePoint([0, -MODEL.torso], pose.lean)) }

// Limb angles are measured forward from hanging straight down.
export function armPose(shoulder, angle, flex = 1.65 - angle * 0.15) {
  const elbow = addPoint(shoulder, [Math.sin(angle) * MODEL.upper, Math.cos(angle) * MODEL.upper])
  const fore = angle + flex
  const wrist = addPoint(elbow, [Math.sin(fore) * MODEL.fore, Math.cos(fore) * MODEL.fore])
  const knuckles = addPoint(wrist, [Math.sin(fore) * MODEL.hand, Math.cos(fore) * MODEL.hand])
  return { shoulder, elbow, wrist, knuckles }
}

function legPose(hip, thigh, kneeFlex, tilt = 0) {
  const knee = addPoint(hip, [Math.sin(thigh) * MODEL.thigh, Math.cos(thigh) * MODEL.thigh])
  const shin = thigh - kneeFlex
  const ankle = addPoint(knee, [Math.sin(shin) * MODEL.shin, Math.cos(shin) * MODEL.shin])
  return { hip, knee, ankle, tilt, planted: false }
}

// Traversal poses use the same body, limbs and separate head as running. The
// bottom of each pose is registered to the actor's simulation position.
export function traversalPose(index) {
  let hip = [0, -MODEL.hip], lean = 0.05, legs = [[0.08, 0.12], [-0.08, 0.12]], arms = [[-0.1, 0.12], [0.12, 0.12]]
  switch (index) {
    case 6: // Jump: knee drive, extended trailing leg, opposite reaching arm.
      lean = 0.18; legs = [[1.05, 1.75], [-0.35, 0.55]]; arms = [[-0.55, 1.6], [2.4, 0.25]]; break
    case 5: // Fall / prepare to land.
      lean = 0.08; legs = [[0.4, 0.6], [-0.12, 0.45]]; arms = [[1.0, 0.8], [-0.6, 1.0]]; break
    case 7: // Stumble.
      lean = 0.45; legs = [[0.6, 0.9], [-0.5, 0.8]]; arms = [[1.4, 0.4], [-0.4, 1.4]]; break
    case 8: // Feet-first slide, torso reclined.
      hip = [-4, -5]; lean = -1.5; legs = [[1.5, 0.08], [1.36, 0.1]]; arms = [[-1.1, 1.9], [0.6, 1.4]]; break
    case 9: // Compact speed vault.
      lean = 0.65; legs = [[1.5, 1.9], [0.75, 1.1]]; arms = [[0.25, 0.2], [1.55, 0.8]]; break
    case 10: // Wall / ledge hang.
      lean = -0.04; legs = [[0.22, 0.4], [-0.1, 0.25]]; arms = [[2.8, 0.15], [3.05, 0.12]]; break
    case 11: // Climb: feet and hands at different heights.
      lean = 0.02; legs = [[1.15, 1.9], [0.55, 1.0]]; arms = [[2.9, 0.25], [1.95, 0.9]]; break
    case 12: // Wall-run.
      lean = 0.3; legs = [[0.85, 1.15], [-0.4, 0.6]]; arms = [[-0.7, 1.7], [1.0, 1.2]]; break
    case 13: // Zipline grip above head.
      lean = -0.16; legs = [[0.5, 0.9], [-0.08, 0.55]]; arms = [[2.75, 0.35], [2.9, 0.2]]; break
    case 14: // Tucked roll.
      lean = 1.25; legs = [[1.9, 2.25], [1.5, 2.1]]; arms = [[0.9, 2.0], [0.65, 2.2]]; break
  }
  const near = legPose(hip, ...legs[0]), far = legPose(hip, ...legs[1])
  // A relaxed ankle follows a bent calf in air; grounded extension stays flat.
  for (const leg of [near, far]) leg.tilt = Math.atan2(leg.knee[0] - leg.ankle[0], leg.ankle[1] - leg.knee[1]) - 0.08
  const bottom = Math.max(...[near, far].map(l => l.ankle[1] + Math.max(SHOE.x * Math.sin(l.tilt), (SHOE.x + SHOE.w) * Math.sin(l.tilt)) + Math.max(SHOE.y * Math.cos(l.tilt), (SHOE.y + SHOE.h) * Math.cos(l.tilt))))
  hip[1] -= bottom
  for (const leg of [near, far]) { leg.knee[1] -= bottom; leg.ankle[1] -= bottom }
  // These are world angles: counter body lean without bending the neck in
  // the opposite direction. A roll keeps the head tucked with the torso.
  const pose = { hip, near, far, lean, arm: 0, headTilt: lean * (index === 14 ? 0.8 : 0.35) }
  const shoulder = shoulderAt(pose)
  pose.nearArm = armPose(shoulder, ...arms[0]); pose.farArm = armPose(shoulder, ...arms[1])
  return pose
}
