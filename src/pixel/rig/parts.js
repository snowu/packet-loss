// Dresses the solved skeleton in an outfit's nine painted parts. Each part is
// bound to its bone at fixed landmarks, reduced once to working resolution
// with proper filtering, and then only rotated into place every frame, so
// the artwork stays clean at game size and identical in build across outfits.
import { MODEL, GIRTH, TAPER, SHOE, PART } from '../runnerModel.js'
import { BONES, at } from './skeleton.js'
import { HAIR_SEGMENTS } from './animator.js'
import { rulesFor, recolorPixels } from './skins.js'

// Working pixels per model unit. The game shows the runner at 2, so the
// frame is drawn at twice that and averaged down for clean edges.
export const SS = 4

// Joint landmarks in each trimmed part, as fractions of its width and height:
// `a` is where the bone starts, `b` where it ends.
export const BIND = Object.freeze({
  torso: { a: [0.52, 0.87], b: [0.25, 0.18] },
  upper: { a: [0.64, 0.14], b: [0.34, 0.91] },
  fore: { a: [0.52, 0.08], b: [0.55, 0.94] },
  hand: { a: [0.43, 0.16], b: [0.52, 0.80] },
  thigh: { a: [0.52, 0.07], b: [0.46, 0.94] },
  shin: { a: [0.76, 0.12], b: [0.40, 0.93] },
})
const LENGTH = { torso: MODEL.torso, upper: BONES.upper, fore: BONES.fore, hand: BONES.hand, thigh: BONES.thigh, shin: BONES.shin }
// The head hangs on the neck; the ponytail runs from its tie to its tip.
export const HEAD_BIND = Object.freeze({ neck: [0.43, 0.94] })
export const HAIR_BIND = Object.freeze({ tie: [0.93, 0.23], tip: [0.36, 0.96] })
// Where the painted neck sits in the skeleton's head frame (forward, up).
const NECK_AT = [1.2, -0.6]
const FAR_TINT = '#120d2c77'

function canvas(w, h) {
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.ceil(w)); cv.height = Math.max(1, Math.ceil(h))
  return cv
}

function recoloured(image, rules) {
  if (!rules.length) return image
  const cv = canvas(image.width, image.height), c = cv.getContext('2d', { willReadFrequently: true })
  c.drawImage(image, 0, 0)
  const data = c.getImageData(0, 0, cv.width, cv.height)
  recolorPixels(data.data, rules); c.putImageData(data, 0, 0)
  return cv
}

// Opaque extent of a part across its bone, in source pixels. Girth is set
// from this, so a baggy sleeve and a bare arm come out the same thickness.
function extentAcross(image, a, angle) {
  const cv = canvas(image.width, image.height), c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(image, 0, 0)
  const data = c.getImageData(0, 0, cv.width, cv.height).data, s = Math.sin(angle), k = Math.cos(angle)
  let low = Infinity, high = -Infinity
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
    if (data[(y * cv.width + x) * 4 + 3] < 32) continue
    const d = -(x - a[0]) * s + (y - a[1]) * k
    if (d < low) low = d
    if (d > high) high = d
  }
  return Math.max(1, high - low)
}

// Bake a part once: turn it so `angle` lies along +x, scale it by (sx, sy)
// and put source point `a` at the returned anchor. Large reductions are
// halved in steps first, so every source pixel contributes to the result.
function bake(image, a, angle, sx, sy) {
  let src = image, k = 1
  while (Math.max(sx, sy) * k < 0.5) {
    const half = canvas(src.width / 2, src.height / 2), c = half.getContext('2d')
    c.imageSmoothingQuality = 'high'; c.drawImage(src, 0, 0, half.width, half.height)
    src = half; k *= 2
  }
  const cos = Math.cos(-angle), sin = Math.sin(-angle)
  const map = (x, y) => [((x - a[0]) * cos - (y - a[1]) * sin) * sx, ((x - a[0]) * sin + (y - a[1]) * cos) * sy]
  const corners = [map(0, 0), map(image.width, 0), map(0, image.height), map(image.width, image.height)]
  const left = Math.floor(Math.min(...corners.map(p => p[0]))) - 1, top = Math.floor(Math.min(...corners.map(p => p[1]))) - 1
  const cv = canvas(Math.max(...corners.map(p => p[0])) - left + 2, Math.max(...corners.map(p => p[1])) - top + 2)
  const c = cv.getContext('2d'); c.imageSmoothingQuality = 'high'
  c.translate(-left, -top); c.scale(sx, sy); c.rotate(-angle); c.translate(-a[0], -a[1])
  c.drawImage(src, 0, 0, image.width, image.height)
  return { cv, x: -left, y: -top }
}

// Widen a baked bone sprite at one end and narrow it at the other, column by
// column about the bone's axis, so thickness can vary along a limb.
function tapered(sprite, length, [from, to]) {
  const grow = Math.max(from, to), pad = Math.ceil(sprite.cv.height * (grow - 1) / 2) + 1
  const cv = canvas(sprite.cv.width, sprite.cv.height + pad * 2), c = cv.getContext('2d'); c.imageSmoothingQuality = 'high'
  for (let x = 0; x < cv.width; x++) {
    const t = Math.max(0, Math.min(1, (x - sprite.x) / length)), f = from + (to - from) * t
    c.drawImage(sprite.cv, x, 0, 1, sprite.cv.height, x, pad + sprite.y - sprite.y * f, 1, sprite.cv.height * f)
  }
  return { cv, x: sprite.x, y: sprite.y + pad }
}

function shaded(sprite) {
  const cv = canvas(sprite.cv.width, sprite.cv.height), c = cv.getContext('2d')
  c.drawImage(sprite.cv, 0, 0)
  c.globalCompositeOperation = 'source-atop'; c.fillStyle = FAR_TINT; c.fillRect(0, 0, cv.width, cv.height)
  return { ...sprite, cv }
}

// Outline colours: a cool light against a night city, near-black against a
// bright one. OUTLINE is how far the outline stands off the part, in sprite
// pixels (SS per logical pixel).
export const OUTLINES = Object.freeze({ light: '#cfe4ff78', dark: '#0b0814b8' })
const OUTLINE = 2

// The same sprite grown by OUTLINE all round and filled with one colour.
function outlined(sprite, color) {
  const d = OUTLINE, cv = canvas(sprite.cv.width + d * 2, sprite.cv.height + d * 2), c = cv.getContext('2d')
  for (const [x, y] of [[0, d], [d * 2, d], [d, 0], [d, d * 2], [d * 0.3, d * 0.3], [d * 1.7, d * 0.3], [d * 0.3, d * 1.7], [d * 1.7, d * 1.7]]) c.drawImage(sprite.cv, x, y)
  c.globalCompositeOperation = 'source-in'; c.fillStyle = color; c.fillRect(0, 0, cv.width, cv.height)
  return { cv, x: sprite.x + d, y: sprite.y + d }
}

// Build an outfit's drawable kit from its nine trimmed part images.
export function buildKit(images, skin) {
  const part = name => recoloured(images[PART[name]], rulesFor(skin, name))
  const near = {}
  for (const [name, bind] of Object.entries(BIND)) {
    const image = part(name)
    const a = [bind.a[0] * image.width, bind.a[1] * image.height], b = [bind.b[0] * image.width, bind.b[1] * image.height]
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0])
    near[name] = bake(image, a, angle, LENGTH[name] * SS / Math.hypot(b[0] - a[0], b[1] - a[1]), GIRTH[name] * SS / extentAcross(image, a, angle))
    if (TAPER[name]) near[name] = tapered(near[name], LENGTH[name] * SS, TAPER[name])
  }
  const head = part('head'), headScale = MODEL.head * SS / head.height
  near.head = bake(head, [HEAD_BIND.neck[0] * head.width, HEAD_BIND.neck[1] * head.height], 0, headScale, headScale)
  const shoe = part('shoe')
  near.shoe = bake(shoe, [-SHOE.x / SHOE.w * shoe.width, -SHOE.y / SHOE.h * shoe.height], 0, SHOE.w * SS / shoe.width, SHOE.h * SS / shoe.height)
  const hair = part('hair')
  const tie = [HAIR_BIND.tie[0] * hair.width, HAIR_BIND.tie[1] * hair.height], tip = [HAIR_BIND.tip[0] * hair.width, HAIR_BIND.tip[1] * hair.height]
  const hairScale = HAIR_SEGMENTS.reduce((s, l) => s + l, 0) * SS / Math.hypot(tip[0] - tie[0], tip[1] - tie[1])
  near.hair = bake(hair, tie, Math.atan2(tip[1] - tie[1], tip[0] - tie[0]), hairScale, hairScale)
  const far = Object.fromEntries(['upper', 'fore', 'hand', 'thigh', 'shin', 'shoe'].map(name => [name, shaded(near[name])]))
  const outline = Object.fromEntries(Object.entries(OUTLINES).map(([tone, color]) => [tone, Object.fromEntries(['torso', 'upper', 'fore', 'thigh', 'shin'].map(name => [name, outlined(near[name], color)]))]))
  return { near, far, outline }
}

// Sprites are baked at SS pixels per unit, so placing one is a rotation
// about its joint and nothing else. `o` is the roof contact in model units.
function place(ctx, o, sprite, from, angle, stretch = 1) {
  const cos = Math.cos(angle), sin = Math.sin(angle)
  ctx.setTransform(cos * stretch, sin * stretch, -sin, cos, (from[0] + o[0]) * SS, (from[1] + o[1]) * SS)
  ctx.drawImage(sprite.cv, -sprite.x, -sprite.y)
}
const along = (from, to) => Math.atan2(to[1] - from[1], to[0] - from[0])

function leg(ctx, o, kit, l) {
  place(ctx, o, kit.thigh, l.hip, along(l.hip, l.knee))
  place(ctx, o, kit.shin, l.knee, along(l.knee, l.ankle))
  place(ctx, o, kit.shoe, l.ankle, l.foot)
}

function arm(ctx, o, kit, a) {
  place(ctx, o, kit.upper, a.shoulder, along(a.shoulder, a.elbow))
  place(ctx, o, kit.fore, a.elbow, along(a.elbow, a.wrist))
  place(ctx, o, kit.hand, a.wrist, along(a.wrist, a.knuckles))
}

// Lay a sprite that was baked straight along a chain of points, one band per
// segment, so it bends where the chain bends. `lengths` are the segments'
// lengths in the sprite (model units); a band is stretched along the chain if
// its two points are further apart than that. Bands overlap by a pixel, which
// covers the wedge a bend opens on its outer side.
function bent(ctx, o, sprite, points, lengths) {
  let start = 0
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i] * SS, last = i === lengths.length - 1
    const x0 = i ? sprite.x + start - 1 : 0, x1 = last ? sprite.cv.width : sprite.x + start + length + 1
    const a = points[i], b = points[i + 1], angle = along(a, b), cos = Math.cos(angle), sin = Math.sin(angle)
    const stretch = Math.hypot(b[0] - a[0], b[1] - a[1]) * SS / length
    ctx.setTransform(cos * stretch, sin * stretch, -sin, cos, (a[0] + o[0]) * SS, (a[1] + o[1]) * SS)
    ctx.drawImage(sprite.cv, x0, 0, x1 - x0, sprite.cv.height, x0 - sprite.x - start, -sprite.y, x1 - x0, sprite.cv.height)
    start += length
  }
}

// The spine as the torso is drawn along it: from the hips through the waist
// to the top of the chest, rounded so the back curves instead of folding.
const SPINE_BANDS = 3
const SPINE_LENGTHS = Array.from({ length: SPINE_BANDS }, () => MODEL.torso / SPINE_BANDS)
export function spine(j) {
  const a = j.hip, c = j.waist, b = at(j.chest, 0, BONES.chest), pts = []
  for (let i = 0; i <= SPINE_BANDS; i++) {
    // A curve from hip to chest that is pulled half way toward the waist.
    const t = i / SPINE_BANDS, u = 1 - t, k = 2 * u * t
    const mid = [(a[0] + b[0]) / 2 * 0.5 + c[0] * 0.5, (a[1] + b[1]) / 2 * 0.5 + c[1] * 0.5]
    pts.push([u * u * a[0] + k * mid[0] + t * t * b[0], u * u * a[1] + k * mid[1] + t * t * b[1]])
  }
  return pts
}

// Draw a solved pose onto a canvas of SS pixels per model unit, with the
// roof contact at `origin` (model units). `outline` ('light' or 'dark') puts
// an outline round the whole figure first. Leaves the transform reset.
export function drawRunner(ctx, j, hair, kit, origin, outline = null) {
  const { near, far } = kit, o = origin, edge = outline && kit.outline[outline]
  const spinePoints = spine(j), neck = at(j.head, ...NECK_AT)
  if (edge) {
    // Only what is dark enough to be lost: trousers, top and sleeves. Skin,
    // hair, gloves and shoes hold their own against the city.
    for (const a of [j.farArm, j.nearArm]) { place(ctx, o, edge.upper, a.shoulder, along(a.shoulder, a.elbow)); place(ctx, o, edge.fore, a.elbow, along(a.elbow, a.wrist)) }
    for (const l of [j.far, j.near]) { place(ctx, o, edge.thigh, l.hip, along(l.hip, l.knee)); place(ctx, o, edge.shin, l.knee, along(l.knee, l.ankle)) }
    bent(ctx, o, edge.torso, spinePoints, SPINE_LENGTHS)
  }
  arm(ctx, o, far, j.farArm); leg(ctx, o, far, j.far); leg(ctx, o, near, j.near)
  bent(ctx, o, near.torso, spinePoints, SPINE_LENGTHS)
  bent(ctx, o, near.hair, hair, HAIR_SEGMENTS)
  place(ctx, o, near.head, neck, j.head.angle)
  arm(ctx, o, near, j.nearArm)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}
