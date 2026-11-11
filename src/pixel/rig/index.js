// The runner, ready to draw: one animator (outfit-independent) and one
// raster, recoloured through the chosen skin's palette at the very end.
import { Animator } from './animator.js'
import { drawRunner, newRaster, colorize, paletteFor } from './paint.js'
import { SKINS } from './skins.js'
import { FRAME } from '../runnerModel.js'

export { SKINS, defineSkin } from './skins.js'
export const RUN_ORIGIN = FRAME.origin

export class RunnerRig {
  constructor(skin = 'courier') {
    this.animator = new Animator()
    this.raster = newRaster()
    this.pixels = new Uint32Array(FRAME.width * FRAME.height)
    this.canvas = null
    this.setSkin(skin)
  }

  setSkin(id) {
    this.skin = SKINS[id] || SKINS.courier
    this.dirty = true
  }

  reset() { this.animator.reset(); this.last = undefined }

  // Advance to `time` (seconds on the caller's clock) and return the pose.
  update(p, time, phase, idle, x, y) {
    const dt = this.last === undefined || !(time >= this.last) ? 0 : time - this.last
    this.last = time
    this.animator.update(p, dt, phase, idle, x, y)
    this.dirty = true
    return this.animator.out
  }

  // RGBA pixels of the current pose (Uint32, little-endian).
  render() {
    drawRunner(this.raster, this.animator.joints, this.animator.hairPoints, this.skin)
    return colorize(this.raster, paletteFor(this.skin), this.pixels)
  }

  // Browser: the current pose as a canvas at 2x raster resolution.
  image() {
    if (!this.dirty && this.canvas) return this.canvas
    this.render()
    if (!this.canvas) {
      this.canvas = document.createElement('canvas'); this.canvas.width = FRAME.width; this.canvas.height = FRAME.height
      this.ctx = this.canvas.getContext('2d')
      this.imageData = this.ctx.createImageData(FRAME.width, FRAME.height)
      this.view32 = new Uint32Array(this.imageData.data.buffer)
    }
    this.view32.set(this.pixels)
    this.ctx.putImageData(this.imageData, 0, 0)
    this.dirty = false
    return this.canvas
  }
}
