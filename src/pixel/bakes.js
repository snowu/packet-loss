// Sprite bakers that can run off the main thread: pure functions of plain
// data that return a PixelBuffer. The bake worker and the view share this
// table, so a job means the same thing on either side.
import { bakeFacade, bakeFog, bakeMist, bakeTower } from './city.js'
import { bakeLightHalo } from './effects.js'
import { bakeSky, bakeHaze, bakeVignette, bakeAlarm } from './screen.js'
import { bakePipe, bakePipeFront } from './obstacles.js'

export const JOBS = {
  facade: bakeFacade, fog: bakeFog, mist: bakeMist,
  sky: bakeSky, haze: bakeHaze, vignette: bakeVignette, alarm: bakeAlarm,
  pipe: bakePipe, pipeFront: bakePipeFront,
  tower: bakeTower, lightHalo: bakeLightHalo,
}

export function runJob([name, args]) {
  return JOBS[name](...args)
}
