import { describe, it, expect } from 'vitest'
import { roofDecor, DECOR } from '../src/pixel/roofDecor.js'

const roofs = Array.from({ length: 300 }, (_, i) => ({ seed: i * 7919 + 13, width: 120 + (i * 37) % 700 }))

describe('rooftop decor', () => {
  it('is deterministic and stays on its roof without overlapping', () => {
    for (const { seed, width } of roofs) {
      const items = roofDecor(seed, width)
      expect(roofDecor(seed, width)).toEqual(items)
      for (const [i, it] of items.entries()) {
        expect(it.x).toBeGreaterThanOrEqual(0)
        expect(it.x + it.w).toBeLessThanOrEqual(width - 6)
        if (i) expect(it.x).toBeGreaterThanOrEqual(items[i - 1].x + items[i - 1].w)
      }
    }
  })

  it('never puts the same prop in two arrangements running, and uses every kind', () => {
    const used = new Set(), layouts = new Set()
    for (const { seed, width } of roofs) {
      const items = roofDecor(seed, width)
      layouts.add(items.map(it => it.id).join())
      let run = 0
      for (const [i, it] of items.entries()) {
        used.add(it.id)
        run = i && items[i - 1].id === it.id ? run + 1 : 1
        expect(run, `seed ${seed}`).toBeLessThanOrEqual(2) // a pair at most
      }
    }
    expect([...used].sort()).toEqual(Object.keys(DECOR).sort())
    expect(layouts.size).toBeGreaterThan(120)
  })

  it('spaces billboards out and does not repeat an advert on one roof', () => {
    const adverts = new Set(), colors = new Set()
    for (const { seed, width } of roofs) {
      const signs = roofDecor(seed, width).filter(it => it.id === 'sign')
      for (const [i, s] of signs.entries()) {
        adverts.add(s.ad); colors.add(s.color.join())
        expect(s.ad).toBeGreaterThanOrEqual(0); expect(s.ad).toBeLessThan(16)
        if (i) { expect(s.x - signs[i - 1].x).toBeGreaterThanOrEqual(240); expect(s.ad).not.toBe(signs[i - 1].ad) }
      }
    }
    expect(adverts.size).toBe(16)
    expect(colors.size).toBeGreaterThanOrEqual(5)
  })
})
