import { describe, it, expect } from 'vitest'
import { RunnerSprite } from '../src/pixel/runner.js'
import { paletteAt, pinPalette, districtName, PALETTE_NAMES } from '../src/pixel/palette.js'

const STATES = ['run', 'air', 'slide', 'roll', 'vault', 'mantle', 'climb', 'wallslide', 'wallrun', 'zip', 'stumble', 'blocked', 'dead']

describe.each(['classic', 'courier', 'windbreaker', 'techwear'])('%s pixel runner sprite', (style) => {
  it('stays stable through long frames in every state', () => {
    const r = new RunnerSprite(style)
    let x = 0
    for (const state of STATES) {
      for (let i = 0; i < 30; i++) {
        x += 1.5
        r.update(0.1, { state, speed: 14, vy: -6, t: i * 0.02, kin: { t: i * 0.01, T: 0.3, mode: 'arc' } }, x * 14, 100, null)
      }
      for (const [jx, jy] of Object.values(r.joints)) {
        expect(Number.isFinite(jx) && Number.isFinite(jy)).toBe(true)
        expect(Math.abs(jx)).toBeLessThan(40)
        expect(Math.abs(jy)).toBeLessThan(40)
      }
    }
  })

  it('rasterizes an outlined figure', () => {
    const r = new RunnerSprite(style)
    for (let i = 0; i < 20; i++) r.update(1 / 60, { state: 'run', speed: 12, vy: 0, t: 0 }, i * 3, 100, null)
    const buf = r.raster()
    const opaque = buf.data.filter((c) => c >>> 24).length
    expect(opaque).toBeGreaterThan(120)
    expect(opaque).toBeLessThan(900)
  })

  it('draws the ghost silhouette over exactly the pixels the sprite covers', () => {
    const r = new RunnerSprite(style)
    const cyan = (255 << 24 | 255 << 16 | 243 << 8 | 41) >>> 0
    let x = 0
    for (const state of STATES) {
      for (let i = 0; i < 12; i++) {
        x += 1.5
        r.update(1 / 30, { state, speed: 14, vy: -6, t: i * 0.03, kin: { t: i * 0.02, T: 0.3, mode: 'arc' } }, x * 14, 100, null)
      }
      const shape = Array.from(r.raster().data, (c) => (c >>> 24 ? cyan : 0))
      expect(Array.from(r.silhouette([41, 243, 255]).data)).toEqual(shape)
    }
  })
})

describe('pixel palettes', () => {
  it('quantize blends into stable versions', () => {
    expect(paletteAt(100).version).toBe(paletteAt(200).version)
    expect(paletteAt(1400).version).not.toBe(paletteAt(100).version)
    for (const d of [0, 1300, 1450, 3000, 6000, 9000]) expect(paletteAt(d).sky.length).toBeGreaterThan(3)
  })

  it('stays on a pinned district for the whole run', () => {
    pinPalette(2)
    try {
      const v = paletteAt(0).version
      for (const d of [700, 1450, 4000, 9000]) {
        expect(paletteAt(d).version).toBe(v)
        expect(districtName(d)).toBe(PALETTE_NAMES[2])
      }
    } finally {
      pinPalette(null)
    }
    expect(districtName(1600)).toBe(PALETTE_NAMES[1])
  })
})
