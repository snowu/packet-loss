import { describe, it, expect } from 'vitest'
import { Level } from '../src/sim/level.js'
import { ScoreKeeper, COMBO_WINDOW, MAX_MULT } from '../src/sim/score.js'
import { GhostRecorder, GhostPlayer } from '../src/sim/ghost.js'
import { TRACKS, dailyTrack, levelOptions } from '../src/sim/tracks.js'

describe('checkpoints and finish', () => {
  it('places checkpoints on roofs at the configured spacing', () => {
    const level = new Level(5, { checkpointEvery: 200 })
    level.ensure(2000)
    expect(level.checkpoints.length).toBeGreaterThan(7)
    let prev = 0
    for (const cp of level.checkpoints) {
      expect(cp.x - prev).toBeGreaterThanOrEqual(150)
      expect(level.roofAt(cp.x)).toBeCloseTo(cp.y, 5)
      prev = cp.x
    }
    expect(level.respawnPoint(level.checkpoints[2].x + 30)).toBe(level.checkpoints[2])
    expect(level.respawnPoint(10).x).toBe(0)
  })

  it('keeps the roof a fall comes back to, however far past the checkpoint you got', () => {
    const level = new Level(4242)
    for (let x = 0; x < 1400; x += 5) {
      level.ensure(x + 200)
      level.pruneBehind(x, true)
      const back = level.respawnPoint(x)
      expect(level.roofAt(back.x)).not.toBeNull()
    }
    // and the city before the checkpoint still goes
    expect(level.chunks[0].x1).toBeGreaterThan(level.respawnPoint(1400).x - 120)
    // heist comes back on the roof you fell from, so it prunes by distance
    const heist = new Level(4242)
    heist.ensure(1600)
    heist.pruneBehind(1400)
    expect(heist.chunks[0].span[1]).toBeGreaterThanOrEqual(1310)
  })

  it('gives every trial track a finish line near its length, on a clear roof', () => {
    for (const track of [...TRACKS, dailyTrack(new Date(2026, 9, 7))]) {
      const level = new Level(track.seed, levelOptions(track))
      level.ensure(track.length + 200)
      expect(level.finish).not.toBeNull()
      expect(level.finish.x).toBeGreaterThan(track.length - 20)
      expect(level.finish.x).toBeLessThan(track.length + 80)
      expect(level.roofAt(level.finish.x)).toBeCloseTo(level.finish.y, 5)
      expect(level.chunks.slice(0, 6).some((c) => c.hints.length)).toBe(false)
    }
  })

  it('builds the same trial course every time', () => {
    const a = new Level(TRACKS[0].seed, levelOptions(TRACKS[0]))
    const b = new Level(TRACKS[0].seed, levelOptions(TRACKS[0]))
    a.ensure(800); b.ensure(800)
    expect(JSON.stringify(a.chunks)).toBe(JSON.stringify(b.chunks))
  })
})

describe('combo scoring', () => {
  const p = (x, speed = 12, state = 'run') => ({ x, speed, state })

  it('chains moves into a multiplier and banks when the window lapses', () => {
    const s = new ScoreKeeper()
    s.update(0, p(0))
    s.event('vault', 12)
    s.event('roll', 12)
    s.event('wallrun', 12)
    expect(s.mult).toBe(3)
    const pending = s.pending
    expect(pending).toBeGreaterThan(0)
    let result = null
    for (let t = 0; t < COMBO_WINDOW + 0.1 && !result; t += 0.05) result = s.update(0.05, p(1))
    expect(result).toBe('bank')
    expect(s.total).toBeGreaterThanOrEqual(pending)
    expect(s.mult).toBe(0)
  })

  it('throws away the combo on a mistake', () => {
    const s = new ScoreKeeper()
    s.event('vault', 12)
    s.event('vault', 12)
    expect(s.event('hardland', 12)).toBe('bail')
    expect(s.total).toBe(0)
    expect(s.mult).toBe(0)
  })

  it('lets plain slides grow a chain only once', () => {
    const s = new ScoreKeeper()
    for (let i = 0; i < 6; i++) { s.event('slide', 12); s.event('jump', 12) }
    expect(s.mult).toBe(1)
    // and the window isn't kept open by sliding on the spot
    let result = null
    for (let t = 0; t < COMBO_WINDOW + 0.1 && !result; t += 0.05) result = s.update(0.05, p(1))
    expect(result).toBe('bank')
    // a new chain counts its first slide again
    s.event('slide', 12)
    expect(s.mult).toBe(1)
  })

  it('caps the multiplier and rewards speed', () => {
    const slow = new ScoreKeeper(), fast = new ScoreKeeper()
    for (let i = 0; i < 20; i++) { slow.event('vault', 9); fast.event('vault', 17) }
    expect(slow.mult).toBe(MAX_MULT)
    expect(fast.pending).toBeGreaterThan(slow.pending)
  })
})

describe('ghosts', () => {
  it('replays a recorded run', () => {
    const rec = new GhostRecorder(20)
    for (let i = 0; i <= 200; i++) rec.sample(i / 100, { x: i * 0.1, y: 2, state: i < 100 ? 'run' : 'air', speed: 10, vy: 0 })
    const ghost = new GhostPlayer(JSON.parse(JSON.stringify(rec.data())))
    const g = ghost.at(1.025)
    expect(g.x).toBeCloseTo(10.25, 1)
    expect(g.state).toBe('air')
    expect(ghost.at(5).done).toBe(true)
  })
})
