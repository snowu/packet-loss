import { RUN_FRAMES, runPose } from './runGait.js'
import { MODEL, SHOE, FRAME, PART, shoulderAt, armPose, traversalPose, rotatePoint, addPoint } from './runnerModel.js'
export { shoulderAt, armPose } from './runnerModel.js'
export const RUN_ORIGIN = FRAME.origin
export const ARM = Object.freeze({ upper: MODEL.upper, fore: MODEL.fore, hand: MODEL.hand })

// Landmarks in the NEW trimmed nine-part kit. Head, torso, ponytail and fist
// are independent images, so proportions never depend on their crop margins.
const BIND = {
  [PART.torso]: { a: [0.52, 0.87], b: [0.25, 0.18], width: 6.6 },
  [PART.upper]: { a: [0.64, 0.14], b: [0.34, 0.91], width: 2.4 },
  [PART.fore]: { a: [0.52, 0.08], b: [0.55, 0.94], width: 1.8 },
  [PART.hand]: { a: [0.43, 0.16], b: [0.52, 0.80], width: 2.1 },
  [PART.thigh]: { a: [0.52, 0.07], b: [0.46, 0.94], width: 3.6 },
  [PART.shin]: { a: [0.76, 0.12], b: [0.40, 0.93], width: 2.9 },
}
export const HEAD_BIND = Object.freeze({ neck: [0.43, 0.94], tie: [0.15, 0.29] })
export const HAIR_BIND = Object.freeze([0.93, 0.23])

export function hairOffset(phase, distance) {
  const d = Math.max(0, Math.min(1, distance)), t = phase * Math.PI * 2
  if (d === 0) return 0
  return d ** 1.5 * (0.5 * Math.sin(t * 2 - d * 2.4) + 0.15 * Math.sin(t - d * 1.2))
}

function canvas(w, h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv }

// Measure actual opaque width perpendicular to the source bone. Every outfit
// has the same anatomical thickness despite differently shaped cloth cutouts.
function sourceBone(image, bind) {
  const a = [bind.a[0] * image.width, bind.a[1] * image.height]
  const b = [bind.b[0] * image.width, bind.b[1] * image.height]
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]), length = Math.hypot(b[0] - a[0], b[1] - a[1])
  const cv = canvas(image.width, image.height), c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(image, 0, 0)
  const data = c.getImageData(0, 0, cv.width, cv.height).data
  let low = Infinity, high = -Infinity
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
    if (data[(y * cv.width + x) * 4 + 3] < 32) continue
    const perpendicular = -(x - a[0]) * Math.sin(angle) + (y - a[1]) * Math.cos(angle)
    low = Math.min(low, perpendicular); high = Math.max(high, perpendicular)
  }
  return { a, angle, length, width: bind.width / Math.max(1, high - low) }
}

function painter(parts) {
  const bones = Object.fromEntries(Object.entries(BIND).map(([id, bind]) => [id, sourceBone(parts[id], bind)]))
  const far = parts.map(image => {
    const cv = canvas(image.width, image.height), c = cv.getContext('2d'); c.drawImage(image, 0, 0)
    c.globalCompositeOperation = 'source-atop'; c.fillStyle = '#120d2c77'; c.fillRect(0, 0, cv.width, cv.height)
    return cv
  })
  const bone = (ctx, images, id, from, to) => {
    const source = bones[id], angle = Math.atan2(to[1] - from[1], to[0] - from[0])
    ctx.save(); ctx.translate(...from); ctx.rotate(angle)
    ctx.scale(Math.hypot(to[0] - from[0], to[1] - from[1]) / source.length, source.width)
    ctx.rotate(-source.angle); ctx.drawImage(images[id], -source.a[0], -source.a[1]); ctx.restore()
  }
  const leg = (ctx, images, l) => {
    bone(ctx, images, PART.thigh, l.hip, l.knee)
    bone(ctx, images, PART.shin, l.knee, l.ankle)
    ctx.save(); ctx.translate(...l.ankle); ctx.rotate(l.tilt)
    ctx.drawImage(images[PART.shoe], SHOE.x, SHOE.y, SHOE.w, SHOE.h); ctx.restore()
  }
  const arm = (ctx, images, a) => {
    bone(ctx, images, PART.upper, a.shoulder, a.elbow)
    bone(ctx, images, PART.fore, a.elbow, a.wrist)
    bone(ctx, images, PART.hand, a.wrist, a.knuckles)
  }
  return (pose, phase = 0, running = false) => {
    const cv = canvas(FRAME.width, FRAME.height), ctx = cv.getContext('2d')
    ctx.scale(FRAME.scale, FRAME.scale); ctx.translate(...RUN_ORIGIN); ctx.imageSmoothingEnabled = false
    const shoulder = shoulderAt(pose), nearArm = pose.nearArm || armPose(shoulder, pose.arm), farArm = pose.farArm || armPose(shoulder, -pose.arm)
    arm(ctx, far, farArm); leg(ctx, far, pose.far); leg(ctx, parts, pose.near)
    bone(ctx, parts, PART.torso, pose.hip, shoulder)
    const neck = addPoint(shoulder, rotatePoint([1.8, -1.0], pose.lean)), head = parts[PART.head]
    const headAngle = pose.headTilt ?? 0.04, headScale = MODEL.head / head.height
    const tieLocal = [(HEAD_BIND.tie[0] - HEAD_BIND.neck[0]) * head.width * headScale, (HEAD_BIND.tie[1] - HEAD_BIND.neck[1]) * MODEL.head]
    const tie = addPoint(neck, rotatePoint(tieLocal, headAngle)), hair = parts[PART.hair]
    // A compact ponytail is its own sprite, attached to a stable head landmark.
    const hairHeight = MODEL.hair, hairScale = hairHeight / hair.height, hairX = hair.width * HAIR_BIND[0], hairY = hair.height * HAIR_BIND[1]
    ctx.save(); ctx.translate(...tie); ctx.rotate(headAngle + (running ? 0.35 : 0.04))
    for (let x = 0; x < hair.width; x += 8) {
      const sw = Math.min(8, hair.width - x), d = (hairX - (x + sw / 2)) / hairX
      ctx.drawImage(hair, x, 0, sw, hair.height, (x - hairX) * hairScale, -hairY * hairScale + hairOffset(phase, d), sw * hairScale, hairHeight)
    }
    ctx.restore()
    ctx.save(); ctx.translate(...neck); ctx.rotate(headAngle)
    ctx.drawImage(head, -HEAD_BIND.neck[0] * head.width * headScale, -HEAD_BIND.neck[1] * MODEL.head, head.width * headScale, MODEL.head); ctx.restore()
    arm(ctx, parts, nearArm)
    return cv
  }
}

export function bakeRunner(parts) {
  const paint = painter(parts)
  const traversal = Array.from({ length: 16 }, (_, i) => paint(traversalPose(i), 0, false))
  // Rotate a tucked roll about the visible body, not the transparent canvas.
  const roll = traversal[14], data = roll.getContext('2d').getImageData(0, 0, roll.width, roll.height).data
  let left = roll.width, right = 0, top = roll.height, bottom = 0
  for (let y = 0; y < roll.height; y++) for (let x = 0; x < roll.width; x++) {
    if (data[(y * roll.width + x) * 4 + 3] < 32) continue
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  roll.rollPivot = [(left + right) / (2 * FRAME.scale) - RUN_ORIGIN[0], (top + bottom) / (2 * FRAME.scale) - RUN_ORIGIN[1]]
  roll.poseHeight = (bottom - top) / FRAME.scale
  return {
    run: Array.from({ length: RUN_FRAMES }, (_, i) => paint(runPose(i / RUN_FRAMES), i / RUN_FRAMES, true)),
    traversal,
  }
}
export const bakeRunFrames = parts => bakeRunner(parts).run
export const bakeTraversalFrames = parts => bakeRunner(parts).traversal
