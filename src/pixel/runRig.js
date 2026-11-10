import { RUN_FRAMES, runPose, SHOE } from './runGait.js'

// Pivots are fractions of each trimmed cutout: shoulder/elbow, hip/knee,
// knee/ankle. The same registered kit is used by all three outfits.
const JOINTS = [null, [[0.48, 0.14], [0.47, 0.875]], [[0.42, 0.10], [0.52, 0.70]], [[0.38, 0.095], [0.77, 0.84]], [[0.61, 0.11], [0.46, 0.93]]]
export const TORSO = Object.freeze({ height: 21, hip: [0.715, 0.905], shoulder: [0.61, 0.555] })
export const RUN_ORIGIN = [28, 45]

// Bind the shoulder to the same source landmark and transform used to paint
// the torso. A separate world-space guess left the arms floating in front.
export function shoulderAt(pose, aspect) {
  const x = (TORSO.shoulder[0] - TORSO.hip[0]) * TORSO.height * aspect
  const y = (TORSO.shoulder[1] - TORSO.hip[1]) * TORSO.height
  return [pose.hip[0] + x * Math.cos(pose.lean) - y * Math.sin(pose.lean), pose.hip[1] + x * Math.sin(pose.lean) + y * Math.cos(pose.lean)]
}

export function armPose(shoulder, angle) {
  const elbow = [shoulder[0] + Math.sin(angle) * 5.7, shoulder[1] + Math.cos(angle) * 5.7]
  // Keep the hand in front of and above the elbow throughout the pump. The
  // forearm's absolute angle follows the upper arm with a smaller amplitude.
  const fore = 2.05 + angle * 0.45
  const wrist = [elbow[0] + Math.sin(fore) * 4.4, elbow[1] + Math.cos(fore) * 4.4]
  return { shoulder, elbow, wrist }
}

function bone(ctx, image, id, from, to) {
  const [a, b] = JOINTS[id].map(p => [p[0] * image.width, p[1] * image.height])
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]) - Math.atan2(b[1] - a[1], b[0] - a[0])
  const scale = Math.hypot(to[0] - from[0], to[1] - from[1]) / Math.hypot(b[0] - a[0], b[1] - a[1])
  // Compress across the bone, in its own coordinate system. Uniform scaling
  // turned the baggy cutouts into oversized overlapping knee/ankle lumps.
  const sourceAngle = Math.atan2(b[1] - a[1], b[0] - a[0])
  ctx.save(); ctx.translate(...from); ctx.rotate(angle + sourceAngle)
  ctx.scale(scale, scale * (id >= 3 ? 0.72 : 1)); ctx.rotate(-sourceAngle)
  ctx.drawImage(image, -a[0], -a[1]); ctx.restore()
}

function boot(ctx, image, leg) {
  ctx.save(); ctx.translate(...leg.ankle); ctx.rotate(leg.tilt)
  ctx.drawImage(image, SHOE.x, SHOE.y, SHOE.w, SHOE.h); ctx.restore()
}

function drawLeg(ctx, parts, leg) {
  bone(ctx, parts[3], 3, leg.hip, leg.knee)
  bone(ctx, parts[4], 4, leg.knee, leg.ankle)
  boot(ctx, parts[5], leg)
}

function drawArm(ctx, parts, shoulder, angle) {
  const { elbow, wrist } = armPose(shoulder, angle)
  bone(ctx, parts[1], 1, shoulder, elbow)
  bone(ctx, parts[2], 2, elbow, wrist)
}

export function bakeRunFrames(parts) {
  const far = parts.map(image => {
    const cv = document.createElement('canvas'); cv.width = image.width; cv.height = image.height
    const ctx = cv.getContext('2d'); ctx.drawImage(image, 0, 0)
    ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = '#120d2c55'; ctx.fillRect(0, 0, cv.width, cv.height)
    return cv
  })
  return Array.from({ length: RUN_FRAMES }, (_, i) => {
    const cv = document.createElement('canvas'); cv.width = 112; cv.height = 96
    const ctx = cv.getContext('2d'); ctx.scale(2, 2); ctx.translate(...RUN_ORIGIN); ctx.imageSmoothingEnabled = false
    const pose = runPose(i / RUN_FRAMES), torso = parts[0]
    const shoulder = shoulderAt(pose, torso.width / torso.height)
    drawArm(ctx, far, shoulder, -pose.arm)
    drawLeg(ctx, far, pose.far)
    drawLeg(ctx, parts, pose.near)
    ctx.save(); ctx.translate(...pose.hip); ctx.rotate(pose.lean)
    const h = TORSO.height, w = torso.width / torso.height * h
    ctx.drawImage(torso, -w * TORSO.hip[0], -h * TORSO.hip[1], w, h); ctx.restore()
    drawArm(ctx, parts, shoulder, pose.arm)
    return cv
  })
}
