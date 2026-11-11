import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { atlasCell, KIT } from '../src/pixel/conceptArt.js'
import { decodePng } from '../scripts/png.mjs'
import { serviceWorker } from '../vite.config.js'

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

  it('precaches all production artwork for offline play', () => {
    const sw = serviceWorker('test', [])
    for (const name of ['environment-atlas.png', 'skyline.png']) expect(sw).toContain(`concept-art/${name}`)
  })
})
