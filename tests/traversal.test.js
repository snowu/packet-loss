import { describe, it, expect } from 'vitest'
import { Level } from '../src/sim/level.js'
import { createPlayer, stepPlayer } from '../src/sim/player.js'
import { Bot } from '../src/sim/bot.js'
import { PHYS } from '../src/sim/config.js'
import { TRACKS, levelOptions } from '../src/sim/tracks.js'

// The bot drives the real physics through generated courses: if it can finish,
// every gap, wall, wall-run, zipline and springboard in them is passable.
// noRoll: never press down in the air, so every hard landing is a stumble.
function runCourse(seed, distance, { noRoll = false, options } = {}) {
  const level = new Level(seed, options)
  level.ensure(200)
  const p = createPlayer(0, level.roofAt(0))
  const bot = new Bot(level)
  let t = 0
  while (p.alive && p.x < distance && t < distance / 4) {
    level.ensure(p.x + 150)
    level.prune(p.x - 60)
    let input = bot.input(p)
    if (noRoll && p.state === 'air') input = { ...input, down: false, downPressed: false }
    stepPlayer(p, input, PHYS.FIXED_DT, level, [])
    t += PHYS.FIXED_DT
  }
  return p
}

describe('generated courses are traversable', { timeout: 120000 }, () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`seed ${seed} survives 2.5km`, () => {
      const p = runCourse(seed, 2500)
      expect(p.alive).toBe(true)
      expect(p.x).toBeGreaterThanOrEqual(2500)
    })
  }
})

// Fumbled moves cost speed, never a life: a runner who never rolls out of a
// drop stumbles on every hard landing and still makes every next gap.
describe('generated courses forgive a runner who never rolls', { timeout: 120000 }, () => {
  for (const [seed, difficulty] of [[7, null], [8, { start: 1 }]]) {
    it(`seed ${seed}${difficulty ? ' at full difficulty' : ''} survives 1.5km`, () => {
      const p = runCourse(seed, 1500, { noRoll: true, options: { tutorial: false, difficulty } })
      expect(p.alive).toBe(true)
      expect(p.x).toBeGreaterThanOrEqual(1500)
    })
  }
})

describe('trial tracks are finishable within their silver time', { timeout: 120000 }, () => {
  for (const track of TRACKS) {
    it(track.name, () => {
      const level = new Level(track.seed, levelOptions(track))
      level.ensure(300)
      const p = createPlayer(0, level.roofAt(0))
      const bot = new Bot(level)
      let t = 0
      while (t < track.medals[2] * 2 && !(level.finish && p.x >= level.finish.x)) {
        level.ensure(p.x + 150)
        stepPlayer(p, bot.input(p), PHYS.FIXED_DT, level, [])
        t += PHYS.FIXED_DT
        expect(p.alive).toBe(true)
      }
      expect(level.finish && p.x >= level.finish.x).toBe(true)
      expect(t).toBeLessThanOrEqual(track.medals[1] + 1)
    })
  }
})
