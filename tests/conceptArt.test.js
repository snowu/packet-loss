import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { atlasCell, poseFor, KIT } from '../src/pixel/conceptArt.js'
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

  it('gives traversal states deliberate poses and loops the run animation', () => {
    const states = { slide: 8, vault: 9, mantle: 9, climb: 11, wallslide: 10, wallrun: 12, zip: 13, roll: 14, dead: 14, blocked: 15 }
    for (const [state, frame] of Object.entries(states)) expect(poseFor({ state, speed: 12 }, 2)).toBe(frame)
    expect(poseFor({ state: 'air', vy: 4 }, 0)).toBe(6)
    expect(poseFor({ state: 'air', vy: -4 }, 0)).toBe(5)
    expect(poseFor({ state: 'run', speed: 12 }, 0, true)).toBe(15)
    const seen = new Set(Array.from({ length: 60 }, (_, i) => poseFor({ state: 'run', speed: 12 }, i / 30)))
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5])
    // Recorded trial ghosts omit live-player speed.
    expect(poseFor({ state: 'run' }, 1)).toBeGreaterThanOrEqual(0)
    expect(poseFor({ state: 'run' }, 1)).toBeLessThan(6)
    expect(poseFor({ state: 'run', speed: NaN }, NaN)).toBe(0)
  })

  it('precaches all production artwork for offline play', () => {
    const sw = serviceWorker('test', [])
    for (const name of ['courier-atlas.png', 'windbreaker-atlas.png', 'techwear-atlas.png', 'environment-atlas.png', 'skyline.png', 'courier-rig.png', 'windbreaker-rig.png', 'techwear-rig.png']) expect(sw).toContain(`concept-art/${name}`)
  })

  it('ships six complete transparent rig parts for each outfit', () => {
    for (const name of ['courier', 'windbreaker', 'techwear']) {
      const { w, h, rgba } = decodePng(readFileSync(new URL(`../public/concept-art/${name}-rig.png`, import.meta.url)))
      for (let i = 0; i < 6; i++) {
        const cell = atlasCell(w, h, i, 3, 2)
        let opaque = 0, clear = 0
        for (let y = cell.y; y < cell.y + cell.h; y++) for (let x = cell.x; x < cell.x + cell.w; x++) {
          if (rgba[(y * w + x) * 4 + 3] > 32) opaque++; else clear++
        }
        expect(opaque, `${name} part ${i}`).toBeGreaterThan(500)
        expect(clear, `${name} part ${i} gutters`).toBeGreaterThan(500)
      }
    }
  })
})
