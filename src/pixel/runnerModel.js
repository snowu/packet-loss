// Shared model-space measurements for every outfit and movement state.
// World physics remains unchanged; these are illustrated sprite dimensions
// (1 unit = 1 logical pixel). The skeleton in rig/skeleton.js is built from them.
//
// Proportions are those of an athletic adult about six and a half heads
// tall: the hip joint just over half way up, a torso a little longer than a
// thigh, and arms that reach mid-thigh when they hang.
export const MODEL = Object.freeze({
  thigh: 10.6, shin: 10.0, hip: 22.0, bounce: 0.85,
  torso: 11.4, upper: 6.9, fore: 6.2, hand: 2.2,
  head: 6.3,
})
// How thick each painted part is drawn across its bone. Lengths above set the
// proportions of the skeleton; these set the build, for every outfit at once.
export const GIRTH = Object.freeze({ torso: 7.1, upper: 3.2, fore: 2.6, hand: 2.6, thigh: 5.7, shin: 3.9 })
// Girth multiplier from the start of a bone to its end: full hips and thighs
// narrowing to the knee, a calf narrowing to the ankle.
export const TAPER = Object.freeze({ torso: [1.1, 1.0], thigh: [1.2, 0.84], shin: [1.12, 0.84] })
// The nine painted parts of an outfit sheet (3x3, reading order).
export const PART = Object.freeze({ head: 0, torso: 1, hair: 2, upper: 3, fore: 4, hand: 5, thigh: 6, shin: 7, shoe: 8 })
// The shoe in foot space (ankle at the origin, x forward, y down). The gait
// plants its lower edge on the roof.
export const SHOE = Object.freeze({ x: -1.5, y: -0.6, w: 6.4, h: 3.0 })
// The runner's sprite: 64x80 logical pixels rastered at 2x, with the roof
// contact point at `origin`. Tall enough for arms overhead on a climb and
// for legs hanging below the line on a zipline.
export const FRAME = Object.freeze({ width: 128, height: 160, origin: [32, 62], scale: 2 })
