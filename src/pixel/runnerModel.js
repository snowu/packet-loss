// Shared model-space measurements for every outfit and movement state.
// World physics remains unchanged; these are illustrated sprite dimensions
// (1 unit = 1 logical pixel). The skeleton in rig/skeleton.js is built from them.
export const MODEL = Object.freeze({
  thigh: 10.7, shin: 10.3, hip: 22.6, bounce: 0.55,
  torso: 9.4, upper: 6.0, fore: 5.2, hand: 1.9,
})
// The shoe in foot space (ankle at the origin, x forward, y down). The gait
// plants its lower edge on the roof.
export const SHOE = Object.freeze({ x: -1.5, y: -0.6, w: 6.2, h: 3.0 })
// The runner's sprite: 64x80 logical pixels rastered at 2x, with the roof
// contact point at `origin`. Tall enough for arms overhead on a climb and
// for legs hanging below the line on a zipline.
export const FRAME = Object.freeze({ width: 128, height: 160, origin: [32, 62], scale: 2 })
