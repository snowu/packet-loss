// The runner, ready to draw: one animator (outfit-independent) posing the
// skeleton, and the chosen outfit's painted parts laid over it each frame.
import { Animator } from './animator.js'
import { buildKit, drawRunner, SS } from './parts.js'
import { SKINS } from './skins.js'
import { FRAME } from '../runnerModel.js'
import { conceptArt } from '../conceptArt.js'

export { SKINS, defineSkin } from './skins.js'
export const RUN_ORIGIN = FRAME.origin

const kits = new Map()
function kitFor(skin) {
  if (!kits.has(skin)) kits.set(skin, buildKit(conceptArt().rigs[skin.sheet], skin))
  return kits.get(skin)
}

export class RunnerRig {
  constructor(skin = 'courier') {
    this.animator = new Animator()
    this.canvas = document.createElement('canvas')
    this.canvas.width = FRAME.width / FRAME.scale * SS; this.canvas.height = FRAME.height / FRAME.scale * SS
    this.ctx = this.canvas.getContext('2d')
    this.outline = null
    this.setSkin(skin)
  }

  setSkin(id) {
    this.skin = SKINS[id] || SKINS.courier
    this.dirty = true
  }

  reset() { this.animator.reset(); this.last = undefined }

  // Outline the pose: 'light' against a dark city, 'dark' against a bright
  // one, null for none. It is what keeps a dark figure apart from a dark
  // picture, and it is drawn from sprites baked with the kit, so it costs a
  // few small draws and no per-frame compositing.
  setOutline(tone) {
    if (tone !== this.outline) { this.outline = tone; this.dirty = true }
  }

  // Advance to `time` (seconds on the caller's clock) and return the pose.
  update(p, time, phase, idle, x, y) {
    const dt = this.last === undefined || !(time >= this.last) ? 0 : time - this.last
    this.last = time
    this.animator.update(p, dt, phase, idle, x, y)
    this.dirty = true
    return this.animator.out
  }

  // The current pose as a canvas, SS pixels per logical pixel, with the roof
  // contact at FRAME.origin.
  image() {
    if (!this.dirty) return this.canvas
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    drawRunner(ctx, this.animator.joints, this.animator.hairPoints, kitFor(this.skin), FRAME.origin, this.outline)
    this.dirty = false
    return this.canvas
  }

}
