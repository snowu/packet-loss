// Dress a solved skeleton. Geometry here is the same for every skin; the
// skin only picks which material each region uses. Draw order (back to
// front): far arm, far leg, ponytail, torso and head, near leg, near arm.
import { at, frame } from './skeleton.js'
import { Raster, TONE } from './raster.js'
import { MAT, paletteOf } from './skins.js'
import { FRAME, SHOE } from '../runnerModel.js'

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const local = (fr, pts) => pts.map(([f, u]) => at(fr, f, u))

// Limb radii, model units.
const R = Object.freeze({
  thigh: [2.05, 1.5], shin: [1.45, 1.0], upper: [1.25, 1.0], fore: [1.0, 0.82], fist: [1.15, 1.05],
  neck: 0.95, hair: [1.35, 1.2, 1.05, 0.85, 0.65, 0.42],
})

// Shoe profile in foot space: x forward from the ankle, y down. Its lowest
// edge is SHOE.y + SHOE.h, which is what the gait plants on the roof.
const SOLE_Y = SHOE.y + SHOE.h
const SHOE_SHAPE = [[-0.9, -0.9], [0.9, -0.75], [1.8, -0.1], [3.4, 0.5], [4.4, 1.0], [SHOE.x + SHOE.w, 1.75], [4.5, SOLE_Y], [SHOE.x + 0.3, SOLE_Y], [SHOE.x, 1.6], [SHOE.x + 0.05, 0.1]]

function footFrame(l) {
  // Foot space x runs along the sole; frame() takes an "up" angle, so the
  // forward axis of frame(o, a) is [cos a, sin a]: exactly the foot's.
  return frame(l.ankle, l.foot)
}
const footPt = (fr, x, y) => at(fr, x, -y)

function drawLeg(r, l, skin, far) {
  const s = skin.style
  r.capsule(l.hip, l.knee, ...R.thigh, MAT.pants, far)
  r.capsule(l.knee, l.ankle, ...R.shin, MAT.pants, far)
  const fr = footFrame(l)
  r.poly(SHOE_SHAPE.map(([x, y]) => footPt(fr, x, y)), MAT.shoe, far, (mx, my) => {
    const dx = mx - l.ankle[0], dy = my - l.ankle[1]
    const y = -(dx * fr.u[0] + dy * fr.u[1])
    return y > SOLE_Y - 0.75 ? TONE.light : y < 0.2 ? TONE.shade : TONE.base
  })
  // Sole, a side stripe and the laces are recolours inside the shoe.
  r.paint([[SHOE.x, SOLE_Y - 0.8], [SHOE.x + SHOE.w + 0.1, SOLE_Y - 0.8], [SHOE.x + SHOE.w + 0.1, SOLE_Y + 0.1], [SHOE.x - 0.1, SOLE_Y + 0.1]].map(([x, y]) => footPt(fr, x, y)), MAT.sole, far)
  r.paint([[0.4, 1.25], [2.6, 0.75], [2.9, 1.15], [0.6, 1.6]].map(([x, y]) => footPt(fr, x, y)), MAT.sole, far, TONE.light)
  r.dot(footPt(fr, 1.7, -0.05), MAT.sole, far, TONE.light)
  r.dot(footPt(fr, 2.6, 0.35), MAT.sole, far, TONE.light)
  // Jogger cuff gathered at the ankle.
  r.paintCapsule(lerp(l.knee, l.ankle, 0.82), l.ankle, 1.2, 1.2, MAT.pants, far, false)
  r.paintCapsule(lerp(l.knee, l.ankle, 0.86), lerp(l.knee, l.ankle, 0.9), 1.3, 1.3, MAT.pants, far)
  if (s.kneepads) {
    const along = [l.knee[0] - l.hip[0], l.knee[1] - l.hip[1]], len = Math.hypot(...along)
    // The pad sits on the front of the knee (forward of the thigh's line).
    const fwd = [along[1] / len, -along[0] / len]
    const c = [l.knee[0] + fwd[0] * 0.55, l.knee[1] + fwd[1] * 0.55]
    r.paintCapsule(c, c, 1.25, 1.25, MAT.pad, far)
  }
  // Cargo pocket on the outer thigh.
  const p0 = lerp(l.hip, l.knee, 0.38), p1 = lerp(l.hip, l.knee, 0.62)
  r.paintCapsule(p0, p1, 0.85, 0.85, MAT.pants, far, false)
}

function drawArm(r, a, skin, far) {
  const s = skin.style
  r.capsule(a.shoulder, a.elbow, ...R.upper, MAT.skin, far)
  r.capsule(a.elbow, a.wrist, ...R.fore, MAT.skin, far)
  if (s.sleeves !== 'none') {
    r.paintCapsule(a.shoulder, a.elbow, R.upper[0] + 0.3, R.upper[1] + 0.3, s.sleeves === 'long' ? MAT.sleeve : MAT.skin, far)
    if (s.sleeves === 'short') r.paintCapsule(a.shoulder, lerp(a.shoulder, a.elbow, 0.55), R.upper[0] + 0.3, R.upper[1] + 0.3, MAT.sleeve, far)
    else {
      r.paintCapsule(a.elbow, a.wrist, R.fore[0] + 0.3, R.fore[1] + 0.3, MAT.sleeve, far)
      r.paintCapsule(lerp(a.elbow, a.wrist, 0.86), a.wrist, 1.15, 1.15, MAT.trim, far)
    }
  }
  // The fist goes on after the sleeve, so cuffs never colour the glove.
  const fist = lerp(a.wrist, a.knuckles, 0.15)
  r.capsule(fist, a.knuckles, ...R.fist, s.gloves ? MAT.glove : MAT.skin, far)
  if (s.gloves) r.paintCapsule(a.knuckles, a.knuckles, 0.55, 0.55, MAT.skin, far)
}

// Torso profile: [forward, up] in the pelvis frame up to the waist, then in
// the chest frame. Front first (top to bottom), then the back (bottom to top).
const CHEST_FRONT = [[1.1, 4.9], [2.0, 3.6], [2.45, 2.4], [2.15, 1.3], [1.65, 0.2]]
const PELVIS_FRONT = [[1.7, 2.2], [1.9, 0.6], [1.6, -0.9]]
const PELVIS_BACK = [[-2.2, -0.6], [-2.3, 1.0], [-1.85, 2.6]]
const CHEST_BACK = [[-1.9, 0.6], [-2.25, 2.3], [-2.15, 3.9], [-1.2, 5.0], [0.2, 5.25]]

function drawTorso(r, j, skin) {
  const s = skin.style, pel = j.pelvis, ch = j.chest
  const outline = [...local(ch, CHEST_FRONT), ...local(pel, PELVIS_FRONT), ...local(pel, PELVIS_BACK), ...local(ch, CHEST_BACK)]
  const proj = (fr, mx, my) => [(mx - fr.o[0]) * fr.f[0] + (my - fr.o[1]) * fr.f[1], (mx - fr.o[0]) * fr.u[0] + (my - fr.o[1]) * fr.u[1]]
  r.poly(outline, MAT.top, false, (mx, my) => {
    const [f, u] = proj(ch, mx, my)
    const [pf] = proj(pel, mx, my)
    const side = u < 0 ? pf : f
    return side < -1.15 ? TONE.shade : side > 1.55 && u > 1.2 ? TONE.light : TONE.base
  })
  // Seat and hips, in the trousers.
  r.capsule(at(pel, -0.6, 0.4), at(pel, 0.5, 0.2), 2.25, 2.0, MAT.pants)
  r.paint([[-3, 1.2], [3, 1.2], [3, -3], [-3, -3]].map(([f, u]) => at(pel, f, u)), MAT.pants)
  // Belt and buckle.
  r.paint([[-3, 1.95], [3, 1.95], [3, 1.15], [-3, 1.15]].map(([f, u]) => at(pel, f, u)), MAT.belt)
  r.dot(at(pel, 1.55, 1.55), MAT.trim, false, TONE.light)
  if (s.midriff) r.paint([[-3, 3.4], [3, 3.4], [3, 1.95], [-3, 1.95]].map(([f, u]) => at(pel, f, u)), MAT.skin)
  if (s.zip) {
    r.paint([[1.35, 5.0], [2.6, 5.0], [2.6, 0], [1.35, 0]].map(([f, u]) => at(ch, f, u)), MAT.top, false, TONE.light)
    r.paint([[1.2, 2.2], [3, 2.2], [3, -0.5], [1.2, -0.5]].map(([f, u]) => at(pel, f, u)), MAT.top, false, TONE.light)
    r.paint([[-3, 0.65], [3, 0.65], [3, 0.0], [-3, 0.0]].map(([f, u]) => at(ch, f, u)), MAT.trim)
  } else {
    // Tank top: a strap over the shoulder and a frayed hem.
    r.paint([[-3, 2.75], [3, 2.75], [3, 2.25], [-3, 2.25]].map(([f, u]) => at(pel, f, u)), MAT.top, false, TONE.shade)
  }
  r.capsule(j.neck, at(j.head, 0, 0.6), R.neck, R.neck, MAT.skin, false, TONE.shade)
  if (s.collar) {
    r.paintCapsule(j.neck, at(j.head, -0.2, 0.2), 1.5, 1.3, MAT.collar)
    r.paint([[-1.2, 5.4], [1.3, 5.4], [1.3, 4.1], [-1.2, 4.1]].map(([f, u]) => at(ch, f, u)), MAT.collar)
  }
}

// Head, in its own frame: forward and up from the top of the neck.
const CRANIUM = Array.from({ length: 18 }, (_, i) => { const a = i / 18 * Math.PI * 2; return [-0.15 + Math.cos(a) * 2.95, 3.85 + Math.sin(a) * 3.2] })
const FACE = [[-0.3, 0.6], [0.9, 0.55], [2.0, 1.1], [2.45, 1.75], [2.35, 2.25], [2.7, 2.65], [3.2, 3.25], [2.75, 3.65], [2.85, 4.45], [2.55, 5.6], [0.5, 5.8], [-0.6, 3.0]]
const HAIR_CAP = [[-0.9, 1.7], [-2.6, 2.3], [-3.3, 3.9], [-3.15, 5.7], [-2.2, 7.0], [-0.4, 7.55], [1.5, 7.35], [2.75, 6.5], [3.35, 5.35], [2.65, 5.1], [2.35, 5.55], [1.75, 4.85], [1.25, 5.3], [0.55, 4.55], [-0.3, 4.75], [-0.75, 3.2]]

function drawHead(r, j, skin) {
  const h = j.head
  r.poly(local(h, CRANIUM), MAT.skin)
  r.poly(local(h, FACE), MAT.skin, false, (mx, my) => {
    const u = (mx - h.o[0]) * h.u[0] + (my - h.o[1]) * h.u[1]
    return u < 1.25 ? TONE.shade : TONE.base
  })
  r.poly(local(h, HAIR_CAP), MAT.hair, false, (mx, my) => {
    const f = (mx - h.o[0]) * h.f[0] + (my - h.o[1]) * h.f[1], u = (mx - h.o[0]) * h.u[0] + (my - h.o[1]) * h.u[1]
    return u > 6.7 && f > -1.4 && f < 1.6 ? TONE.light : (f < -2.3 || u < 2.7) ? TONE.shade : TONE.base
  })
  // Ear, eye, brow, mouth.
  r.paint(local(h, [[-0.6, 3.0], [0.15, 2.9], [0.3, 3.8], [-0.4, 4.1]]), MAT.skin)
  r.dot(at(h, -0.1, 3.35), MAT.skin, false, TONE.shade)
  r.dot(at(h, 1.85, 3.95), MAT.eye)
  r.dot(at(h, 2.3, 3.95), MAT.eye)
  r.dot(at(h, 1.85, 4.55), MAT.hair, false, TONE.shade)
  r.dot(at(h, 2.35, 4.6), MAT.hair, false, TONE.shade)
  r.dot(at(h, 2.25, 2.25), MAT.skin, false, TONE.shade)
}

function drawHair(r, pts) {
  for (let i = 0; i + 1 < pts.length; i++) r.capsule(pts[i], pts[i + 1], R.hair[i], R.hair[i + 1], MAT.hair)
  r.capsule(pts[0], pts[0], 0.9, 0.9, MAT.band, false, TONE.base)
}

// Draw a full runner into `raster` (material indices).
export function drawRunner(r, joints, hair, skin) {
  r.begin(FRAME.origin)
  drawArm(r, joints.farArm, skin, true); r.endLayer(true)
  drawLeg(r, joints.far, skin, true); r.endLayer(true)
  drawHair(r, hair); r.endLayer()
  drawTorso(r, joints, skin); drawHead(r, joints, skin); r.endLayer()
  drawLeg(r, joints.near, skin, false); r.endLayer()
  drawArm(r, joints.nearArm, skin, false); r.endLayer()
  return r
}

export const newRaster = () => new Raster(FRAME.width, FRAME.height, FRAME.scale)

// Index buffer to RGBA pixels through a skin's palette.
export function colorize(r, lut, out = new Uint32Array(r.final.length)) {
  const f = r.final
  for (let i = 0; i < f.length; i++) out[i] = f[i] ? lut[f[i]] : 0
  return out
}

const palettes = new WeakMap()
export function paletteFor(skin) {
  let lut = palettes.get(skin)
  if (!lut) { lut = paletteOf(skin); palettes.set(skin, lut) }
  return lut
}
