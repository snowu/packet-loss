import { describe, expect, it } from 'vitest'
import { css } from '../src/pixel/pixels.js'

describe('css colors', () => {
  it('writes the color the canvas would store', () => {
    expect(css([10.4, 20.6, 30])).toBe('rgb(10,21,30)')
    expect(css([10, 20, 30], 0)).toBe('rgba(10,20,30,0)')
    // alpha lands on the canvas's own 8-bit steps
    for (const a of [0.001, 0.12, 0.3333, 0.45, 0.5, 0.75, 0.999]) {
      const s = css([1, 2, 3], a)
      const stored = s.startsWith('rgba') ? +s.match(/,([\d.]+)\)$/)[1] : 1
      expect(Math.round(stored * 255)).toBe(Math.round(a * 255))
    }
  })

  it('hands back the same string for the same color', () => {
    expect(css([200, 100, 50], 0.4)).toBe(css([200.2, 99.8, 50], 0.4001))
    expect(css([200, 100, 50], 0.4)).not.toBe(css([200, 100, 50], 0.42))
  })

  it('passes colors outside 0-255 through without mixing them up', () => {
    expect(css([300, -2, 5])).toBe('rgb(300,-2,5)')
    expect(css([0, 0, 0], 0.5)).not.toBe(css([256, 0, 0], 0.5))
  })
})
