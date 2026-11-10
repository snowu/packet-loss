import { RUN_FRAMES, runPose, SHOE } from './runGait.js'

// Pivots are fractions of each trimmed cutout: shoulder/elbow, hip/knee,
// knee/ankle. The same registered kit is used by all three outfits.
const JOINTS = [null, [[0.48, 0.14], [0.47, 0.875]], [[0.42, 0.10], [0.45, 0.69]], [[0.38, 0.095], [0.77, 0.84]], [[0.61, 0.11], [0.46, 0.93]]]
export const TORSO = Object.freeze({ height: 21, hip: [0.715, 0.905], shoulder: [0.61, 0.555] })
export const ARM = Object.freeze({ upper: 5.9, fore: 4.9, hand: 2.4 })
export const RUN_ORIGIN = [28, 45]

// Tail motion is baked with the gait. The tie stays attached to the head;
// progressively delayed motion toward the tips makes a soft travelling wave.
export function hairOffset(phase, distance) {
  const d = Math.max(0, Math.min(1, distance)), t = phase * Math.PI * 2
  if (d === 0) return 0
  return d ** 1.5 * (1.05 * Math.sin(t * 2 - d * 2.4) + 0.3 * Math.sin(t - d * 1.2))
}

function tailMask(ctx, w, h) {
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w * 0.64, 0); ctx.lineTo(w * 0.64, h * 0.10)
  ctx.bezierCurveTo(w * 0.64, h * 0.16, w * 0.62, h * 0.19, w * 0.59, h * 0.28)
  ctx.bezierCurveTo(w * 0.56, h * 0.37, w * 0.49, h * 0.42, w * 0.43, h * 0.46)
  ctx.bezierCurveTo(w * 0.40, h * 0.49, w * 0.40, h * 0.52, w * 0.35, h * 0.53)
  ctx.lineTo(0, h * 0.53); ctx.closePath()
}

function isolateTail(mask, source, width, height) {
  // The scarf can enter the ponytail's bounding area. Keep the largest
  // connected silhouette inside the mask so detached cloth stays on the body.
  const count = width * height, visited = new Uint8Array(count), queue = new Uint32Array(count)
  const inside = i => mask[i * 4 + 3] >= 128 && source[i * 4 + 3] >= 32
  let largest = new Uint32Array(0)
  for (let start = 0; start < count; start++) {
    if (visited[start] || !inside(start)) continue
    let head = 0, size = 1; queue[0] = start; visited[start] = 1
    while (head < size) {
      const i = queue[head++], x = i % width, y = Math.floor(i / width)
      for (const next of [x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1, y > 0 ? i - width : -1, y + 1 < height ? i + width : -1]) {
        if (next < 0 || visited[next] || !inside(next)) continue
        visited[next] = 1; queue[size++] = next
      }
    }
    if (size > largest.length) largest = queue.slice(0, size)
  }
  const selected = new Uint8Array(count)
  for (const i of largest) {
    selected[i] = 1
    // Include soft ink edges beside the opaque component.
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = i % width + dx, y = Math.floor(i / width) + dy
      if (x >= 0 && x < width && y >= 0 && y < height && source[(y * width + x) * 4 + 3] < 32) selected[y * width + x] = 1
    }
  }
  for (let i = 0; i < count; i++) mask[i * 4 + 3] = selected[i] ? 255 : 0
}

export function splitHair(image) {
  const layer = () => { const cv = document.createElement('canvas'); cv.width = image.width; cv.height = image.height; return cv }
  const body = layer(), tail = layer(), mask = layer(), m = mask.getContext('2d')
  tailMask(m, image.width, image.height); m.fill()
  // Give every source pixel to exactly one layer. Complementary soft masks
  // would lose opacity when recomposited at the tie's moving boundary.
  const pixels = m.getImageData(0, 0, mask.width, mask.height)
  const source = tail.getContext('2d', { willReadFrequently: true }); source.drawImage(image, 0, 0)
  isolateTail(pixels.data, source.getImageData(0, 0, mask.width, mask.height).data, mask.width, mask.height)
  m.putImageData(pixels, 0, 0)
  for (const [cv, operation] of [[body, 'destination-out'], [tail, 'destination-in']]) {
    const c = cv.getContext('2d'); c.clearRect(0, 0, cv.width, cv.height); c.drawImage(image, 0, 0); c.globalCompositeOperation = operation; c.drawImage(mask, 0, 0)
  }
  return { body, tail }
}

function drawTorso(ctx, layers, pose, phase) {
  const { body, tail } = layers, h = TORSO.height, w = body.width / body.height * h
  const x = -w * TORSO.hip[0], y = -h * TORSO.hip[1], scale = h / body.height
  ctx.save(); ctx.translate(...pose.hip); ctx.rotate(pose.lean)
  const tieX = body.width * 0.61
  for (let sx = 0; sx < tail.width; sx += 8) {
    const sw = Math.min(8, tail.width - sx), distance = (tieX - (sx + sw / 2)) / tieX
    ctx.drawImage(tail, sx, 0, sw, tail.height, x + sx * scale, y + hairOffset(phase, distance), sw * scale, h)
  }
  ctx.drawImage(body, x, y, w, h); ctx.restore()
}

// Bind the shoulder to the same source landmark and transform used to paint
// the torso. A separate world-space guess left the arms floating in front.
export function shoulderAt(pose, aspect) {
  const x = (TORSO.shoulder[0] - TORSO.hip[0]) * TORSO.height * aspect
  const y = (TORSO.shoulder[1] - TORSO.hip[1]) * TORSO.height
  return [pose.hip[0] + x * Math.cos(pose.lean) - y * Math.sin(pose.lean), pose.hip[1] + x * Math.sin(pose.lean) + y * Math.cos(pose.lean)]
}

export function armPose(shoulder, angle) {
  const elbow = [shoulder[0] + Math.sin(angle) * ARM.upper, shoulder[1] + Math.cos(angle) * ARM.upper]
  // A flexed elbow follows the upper arm. At the back of the pump the hand
  // passes the waist; at the front it rises toward the chest. Holding both
  // hands above the elbows pinned the arms into the same cramped silhouette.
  const fore = 1.65 + angle * 0.85
  const wrist = [elbow[0] + Math.sin(fore) * ARM.fore, elbow[1] + Math.cos(fore) * ARM.fore]
  const knuckles = [wrist[0] + Math.sin(fore) * ARM.hand, wrist[1] + Math.cos(fore) * ARM.hand]
  return { shoulder, elbow, wrist, knuckles }
}

function bone(ctx, image, id, from, to) {
  const [a, b] = JOINTS[id].map(p => [p[0] * image.width, p[1] * image.height])
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]) - Math.atan2(b[1] - a[1], b[0] - a[0])
  const scale = Math.hypot(to[0] - from[0], to[1] - from[1]) / Math.hypot(b[0] - a[0], b[1] - a[1])
  // Compress across the bone, in its own coordinate system. Uniform scaling
  // turned the baggy cutouts into oversized overlapping knee/ankle lumps.
  const sourceAngle = Math.atan2(b[1] - a[1], b[0] - a[0])
  ctx.save(); ctx.translate(...from); ctx.rotate(angle + sourceAngle)
  if (id === 3) {
    // The shin owns the kneecap. Hide the thigh kit's second kneepad before
    // layering the shin, rather than piling two complete pads on one joint.
    ctx.beginPath(); ctx.rect(-8, -12, Math.hypot(to[0] - from[0], to[1] - from[1]) + 7, 24); ctx.clip()
  }
  ctx.scale(scale, scale * (id >= 3 ? 0.72 : 1)); ctx.rotate(-sourceAngle)
  if (id === 2) {
    // The cuff/fist has its own scale and wrist pivot; stretching the whole
    // cutout down the forearm made the hand tiny and bent it off the wrist.
    const height = image.height * 0.64
    ctx.drawImage(image, 0, 0, image.width, height, -a[0], -a[1], image.width, height)
  } else ctx.drawImage(image, -a[0], -a[1])
  ctx.restore()
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
  const { elbow, wrist, knuckles } = armPose(shoulder, angle)
  bone(ctx, parts[1], 1, shoulder, elbow)
  bone(ctx, parts[2], 2, elbow, wrist)
  const image = parts[2], pivot = [0.45 * image.width, 0.69 * image.height]
  const end = [0.58 * image.width, 0.94 * image.height], top = 0.60 * image.height
  const rotation = Math.atan2(knuckles[1] - wrist[1], knuckles[0] - wrist[0]) - Math.atan2(end[1] - pivot[1], end[0] - pivot[0])
  const scale = ARM.hand / Math.hypot(end[0] - pivot[0], end[1] - pivot[1])
  ctx.save(); ctx.translate(...wrist); ctx.rotate(rotation); ctx.scale(scale, scale)
  ctx.drawImage(image, 0, top, image.width, image.height - top, -pivot[0], top - pivot[1], image.width, image.height - top)
  ctx.restore()
}

export function bakeRunFrames(parts) {
  const torsoLayers = splitHair(parts[0])
  const far = parts.map(image => {
    const cv = document.createElement('canvas'); cv.width = image.width; cv.height = image.height
    const ctx = cv.getContext('2d'); ctx.drawImage(image, 0, 0)
    ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = '#120d2c88'; ctx.fillRect(0, 0, cv.width, cv.height)
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
    drawTorso(ctx, torsoLayers, pose, i / RUN_FRAMES)
    drawArm(ctx, parts, shoulder, pose.arm)
    return cv
  })
}
