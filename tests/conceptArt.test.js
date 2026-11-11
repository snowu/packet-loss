import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { atlasCell, trimSlivers, KIT } from '../src/pixel/conceptArt.js'
import { decodePng } from '../scripts/png.mjs'
import { serviceWorker } from '../vite.config.js'
import { SKINS } from '../src/pixel/rig/skins.js'

describe('production concept art', () => {
  it('covers every atlas pixel exactly once even when dimensions do not divide by four', () => {
    for (const [w, h] of [[1246, 1263], [1261, 1247]]) {
      const cells = Array.from({ length: 16 }, (_, i) => atlasCell(w, h, i))
      expect(cells.reduce((sum, c) => sum + c.w * c.h, 0)).toBe(w * h)
      expect(cells[15].x + cells[15].w).toBe(w)
      expect(cells[15].y + cells[15].h).toBe(h)
    }
  })

  it('ships a nonempty transparent sprite in every animation and kit cell', () => {
    for (const file of ['courier-atlas.png', 'windbreaker-atlas.png', 'techwear-atlas.png', 'environment-atlas.png']) {
      const { w, h, rgba } = decodePng(readFileSync(new URL(`../public/concept-art/${file}`, import.meta.url)))
      for (let i = 0; i < 16; i++) {
        const c = atlasCell(w, h, i)
        let opaque = 0, clear = 0
        for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) {
          const a = rgba[(y * w + x) * 4 + 3]
          if (a > 32) opaque++; else clear++
        }
        expect(opaque, `${file} frame ${i}`).toBeGreaterThan(500)
        expect(clear, `${file} frame ${i} has gutters`).toBeGreaterThan(500)
      }
    }
    expect(Object.keys(KIT)).toHaveLength(16)
  })

  it('trims a neighbouring sprite\'s bleed from a cell, and nothing else', () => {
    const used = (...runs) => { const u = new Uint32Array(100); for (const [a, b] of runs) u.fill(1, a, b + 1); return u }
    expect(trimSlivers(used([0, 1], [30, 90]))).toEqual([30, 90])   // bleed at the top edge
    expect(trimSlivers(used([10, 70], [98, 99]))).toEqual([10, 70]) // and at the bottom
    expect(trimSlivers(used([3, 4], [30, 90]))).toEqual([3, 90])    // detail away from the edge stays
    expect(trimSlivers(used([0, 20], [30, 90]))).toEqual([0, 90])   // a real part stays
    expect(trimSlivers(used([0, 1], [3, 90]))).toEqual([0, 90])     // no clear gap: one sprite
    // The crate fills its cell's box, so it is drawn as tall as it collides.
    const { w, h, rgba } = decodePng(readFileSync(new URL('../public/concept-art/environment-atlas.png', import.meta.url)))
    const c = atlasCell(w, h, KIT.crate), rows = new Uint32Array(c.h)
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (rgba[((c.y + y) * w + c.x + x) * 4 + 3] >= 32) rows[y]++
    expect(trimSlivers(rows)[0]).toBeGreaterThan(50)
  })

  it('precaches all production artwork for offline play', () => {
    const sw = serviceWorker('test', [])
    for (const name of ['environment-atlas.png', 'skyline.png', ...Object.values(SKINS).map(skin => skin.sheet)]) expect(sw).toContain(`concept-art/${name}`)
  })
})
