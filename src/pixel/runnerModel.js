// Shared model-space measurements for every outfit and movement state.
// World physics remains unchanged; these are illustrated sprite dimensions
// (1 unit = 1 logical pixel). The skeleton in rig/skeleton.js is built from them.
export const MODEL = Object.freeze({
  thigh: 10.7, shin: 10.3, hip: 22.6, bounce: 0.55,
  torso: 9.4, upper: 6.0, fore: 5.2, hand: 1.9,
  head: 7.0,
})
// How thick each painted part is drawn across its bone. Lengths above set the
// proportions of the skeleton; these set the build, for every outfit at once.
export const GIRTH = Object.freeze({ torso: 7.6, upper: 3.0, fore: 2.2, hand: 2.4, thigh: 6.3, shin: 4.2 })
// Girth multiplier from the start of a bone to its end: full hips and thighs
// narrowing to the knee, a calf narrowing to the ankle.
export const TAPER = Object.freeze({ torso: [1.2, 0.96], thigh: [1.28, 0.8], shin: [1.15, 0.85] })
// The nine painted parts of an outfit sheet (3x3, reading order).
export const PART = Object.freeze({ head: 0, torso: 1, hair: 2, upper: 3, fore: 4, hand: 5, thigh: 6, shin: 7, shoe: 8 })
// The shoe in foot space (ankle at the origin, x forward, y down). The gait
// plants its lower edge on the roof.
export const SHOE = Object.freeze({ x: -1.5, y: -0.6, w: 6.2, h: 3.0 })
// The runner's sprite: 64x80 logical pixels rastered at 2x, with the roof
// contact point at `origin`. Tall enough for arms overhead on a climb and
// for legs hanging below the line on a zipline.
export const FRAME = Object.freeze({ width: 128, height: 160, origin: [32, 62], scale: 2 })
