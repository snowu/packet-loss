import { describe, it, expect } from 'vitest'
import { RunGait, RUN_STRIDE, STANCE, SHOE, runFrame, runPose } from '../src/pixel/runGait.js'

const runner = speed => ({ state: 'run', speed })

describe('distance-driven run gait', () => {
  it('plays one alternating contact per half stride at different speeds and draw rates', () => {
    for (const speed of [9, 12, 17]) for (const hz of [30, 60, 120]) {
      const gait = new RunGait(), steps = []
      gait.update(runner(speed), 0, 0)
      const duration = (RUN_STRIDE * 4 + 0.001) / speed
      for (let i = 1; i <= Math.ceil(duration * hz); i++) {
        const x = Math.min(i / hz * speed, RUN_STRIDE * 4 + 0.001)
        const contact = gait.update(runner(speed), x, 1 / hz)
        if (contact !== null) {
          steps.push(contact)
          const pose = runPose(gait.phase)
          expect(contact ? pose.far.planted : pose.near.planted).toBe(true)
          expect(runFrame(gait.phase) % 32).toBeLessThan(9)
        }
      }
      expect(steps).toEqual([1, 0, 1, 0, 1, 0, 1, 0])
    }
  })

  it('keeps phase continuous on acceleration and advances by half as much in focus', () => {
    const normal = new RunGait(), focus = new RunGait()
    normal.update(runner(9), 0, 0); focus.update(runner(9), 0, 0)
    let x = 0
    for (let i = 0; i < 100; i++) {
      const speed = i < 50 ? 9 : 17
      x += speed / 60
      normal.update(runner(speed), x, 1 / 60)
      focus.update(runner(speed), x / 2, 1 / 120)
    }
    expect(normal.phase).toBeCloseTo(x / RUN_STRIDE, 10)
    expect(focus.phase).toBeCloseTo(normal.phase / 2, 10)
  })

  it('does not step while stationary, airborne, idle, paused or teleporting', () => {
    const gait = new RunGait(), p = runner(12)
    gait.update(p, 20, 0)
    for (let i = 0; i < 100; i++) expect(gait.update(p, 20, 0)).toBeNull()
    expect(gait.phase).toBe(0)
    expect(gait.update({ ...p, state: 'air' }, 25, 1)).toBeNull()
    expect(gait.update(p, 26, 1 / 60)).toBeNull()
    expect(gait.update(p, 1000, 1 / 60)).toBeNull()
    expect(gait.update(p, -100, 1 / 60)).toBeNull()
    expect(gait.update(p, -99, 1 / 60, true)).toBeNull()
    gait.reset(); expect(gait.phase).toBe(0)
  })

  it('plants each ankle in world space and keeps anatomical bone lengths through the full cycle', () => {
    for (let i = 0; i < 1000; i++) {
      const phase = i / 1000, pose = runPose(phase)
      for (const [key, offset] of [['near', 0], ['far', 0.5]]) {
        const leg = pose[key]
        expect(Math.hypot(leg.knee[0] - leg.hip[0], leg.knee[1] - leg.hip[1])).toBeCloseTo(9.6, 8)
        expect(Math.hypot(leg.ankle[0] - leg.knee[0], leg.ankle[1] - leg.knee[1])).toBeCloseTo(9.5, 8)
        const u = (phase + offset) % 1
        if (u < STANCE) {
          const soles = [SHOE.x, SHOE.x + SHOE.w].map(x => leg.ankle[1] + x * Math.sin(leg.tilt) + (SHOE.y + SHOE.h) * Math.cos(leg.tilt))
          expect(Math.max(...soles)).toBeCloseTo(0, 8)
          expect(leg.ankle[0] + u * RUN_STRIDE * 14).toBeCloseTo(RUN_STRIDE * 14 * STANCE / 2, 8)
        }
      }
    }
    expect(runPose(0)).toEqual(runPose(1))
  })

  it('recovers continuously without stopping at swing keys or snapping at contact', () => {
    const eps = 1e-6
    for (const t of [STANCE, 0.51, 0.69, 0.86, 1]) {
      const before = runPose(t - eps).near, after = runPose(t + eps).near
      expect(Math.hypot(after.ankle[0] - before.ankle[0], after.ankle[1] - before.ankle[1])).toBeLessThan(0.001)
      expect(Math.abs(after.tilt - before.tilt)).toBeLessThan(0.001)
      const left = (runPose(t).near.ankle[0] - before.ankle[0]) / eps
      const right = (after.ankle[0] - runPose(t).near.ankle[0]) / eps
      expect(Math.abs(left - right)).toBeLessThan(0.01)
    }
  })
})
