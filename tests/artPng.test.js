// Sprites drawn from public/art PNGs: src/pixel/artPng.js, the bake functions that use it, and the
// offline precache. These are the art checks too: a PNG of the wrong size, a missing one or a stray
// file fails here.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { artIds, artFile, artRef, setArtPng, clearArtPngs, loadArt } from '../src/pixel/artPng.js'
import { bakeDrone } from '../src/pixel/security.js'
import { bakeBird, bakeCar, bakeDecor, BRANDS, signArtId } from '../src/pixel/sprites.js'
import { drawArt, artSize, artColors, ART_NAMES } from '../src/pixel/art.js'
import { bakeBillboard, specFor } from '../src/pixel/billboard.js'
import { PixelBuffer, pack } from '../src/pixel/pixels.js'
import { paletteAt, BASE_PALETTE, PALETTE_NAMES } from '../src/pixel/palette.js'
import { artFiles, serviceWorker } from '../vite.config.js'
import { decodePng } from '../scripts/png.mjs'

const PUBLIC = new URL('../public/', import.meta.url)
const solid = (w, h, c) => { const b = new PixelBuffer(w, h); b.data.fill(c); return b }
const PINK = pack([255, 0, 255])
const fromFile = (id) => { const img = decodePng(readFileSync(new URL(artFile(id), PUBLIC))); const b = new PixelBuffer(img.w, img.h); b.data.set(new Uint32Array(img.rgba.buffer, img.rgba.byteOffset, img.w * img.h)); return b }
// every quantized palette the game can show: each district and each step of each blend
const PALETTES = [...new Map(Array.from({ length: PALETTE_NAMES.length * 1500 / 30 }, (_, i) => paletteAt(i * 30)).map((p) => [p.version, p])).values()]
const withRefs = (f) => { for (const id of artIds()) setArtPng(id, artRef(id)); try { return f() } finally { clearArtPngs() } }
const same = (make) => { clearArtPngs(); const code = make(); const art = withRefs(make); return art.w === code.w && art.h === code.h && art.data.every((v, i) => v === code.data[i]) }
afterEach(() => clearArtPngs())

describe('sprite PNGs in public/art', () => {
  it('every sprite has its PNG, at the size the game draws it, and nothing else is there', () => {
    const ids = artIds()
    expect(ids.length).toBe(35)
    for (const id of ids) {
      const png = fromFile(id), ref = artRef(id)
      expect([png.w, png.h], artFile(id)).toEqual([ref.w, ref.h])
    }
    const files = readdirSync(new URL('art/', PUBLIC), { recursive: true, withFileTypes: true }).filter((d) => d.isFile())
    expect(files.map((d) => d.name).filter((n) => !n.endsWith('.png'))).toEqual([])
    expect(artFiles()).toEqual(ids.map(artFile).sort()) // a PNG with no sprite, or in the wrong folder, fails here
  })

  it('the base palette is the first district as the game starts it', () => {
    const p = paletteAt(0)
    expect(BASE_PALETTE).toEqual({ ...p })
  })

  it('an untouched PNG draws exactly the code art in every district, blend step and variant', () => {
    for (const pal of PALETTES) {
      for (const type of ['tank', 'ac', 'dish', 'skylight', 'vents', 'solar']) for (const v of [0, 0.21, 0.5, 0.83, 0.999]) expect(same(() => bakeDecor(type, v, pal)), `${type} ${v} ${pal.version}`).toBe(true)
      BRANDS.forEach((brand, i) => { for (const k of [0.01, 0.3, 0.5, 0.7, 0.99]) expect(same(() => bakeDecor('sign', (i + k) / BRANDS.length, pal)), `${brand} ${k} ${pal.version}`).toBe(true) })
      for (let seed = 0; seed < 12; seed++) for (const dir of [1, -1]) expect(same(() => bakeCar(dir, pal, seed)), `car ${dir} ${seed}`).toBe(true)
    }
    for (const f of [0, 1, 2]) expect(same(() => bakeBird(f))).toBe(true)
    for (const alarm of [false, true]) for (const f of [0, 1, 2, 3]) expect(same(() => bakeDrone(f, alarm))).toBe(true)
  })

  it('ads follow the billboard hue, and billboards look the same drawn from untouched PNGs', () => {
    for (const pal of PALETTES.filter((_, i) => i % 3 === 0)) {
      for (const name of ART_NAMES) for (let h = 0; h < pal.neon.length; h++) {
        const [w, ht] = artSize(name), colors = artColors(pal.neon[h], pal, pal.neon[(h + 2) % pal.neon.length])
        for (const [sc, flip] of [[1, false], [2, true]]) expect(same(() => { const b = new PixelBuffer(w * sc, ht * sc); drawArt(b, name, 0, 0, colors, sc, flip); return b }), name).toBe(true)
      }
      for (let i = 0; i < 40; i++) for (const place of ['near', 'facade']) {
        const s = specFor(9000 + i, place)
        for (const f of [0, 1]) expect(same(() => bakeBillboard(s, pal, f)), `${s.kind} ${s.seed}`).toBe(true)
      }
    }
  })

  it('a painted PNG shows as painted: new colours stay, the placeholder\'s colours follow the district', () => {
    const pal = PALETTES.find((p) => p.version > 20)
    const ref = artRef('tank'), png = new PixelBuffer(ref.w, ref.h); png.data.set(ref.data)
    const keep = ref.data.findIndex((v) => v >>> 24)
    png.data[keep] = PINK
    setArtPng('tank', png)
    clearArtPngs(); const code = bakeDecor('tank', 0.5, pal); setArtPng('tank', png)
    const art = bakeDecor('tank', 0.5, pal)
    expect(art.data[keep]).toBe(PINK)
    expect(art.data.every((v, i) => i === keep || v === code.data[i])).toBe(true)
    art.data[0] = 1
    expect(bakeDecor('tank', 0.5, pal).data[0]).not.toBe(1) // callers can tint their copy without touching the PNG
    expect(png.data[keep]).toBe(PINK)
  })

  it('ads flip and scale the PNG', () => {
    const [w, h] = artSize('can'), o = solid(w, h, 0); o.data[0] = PINK
    setArtPng('can', o)
    const b = new PixelBuffer(w * 2, h * 2)
    drawArt(b, 'can', 0, 0, artColors([200, 40, 90], BASE_PALETTE, [40, 200, 90]), 2, true)
    expect(b.get((w - 1) * 2, 0)).toBe(PINK); expect(b.get((w - 1) * 2 + 1, 1)).toBe(PINK)
    expect(b.data.filter((v) => v === PINK).length).toBe(4)
  })

  it('a missing or wrongly sized PNG falls back to the code art, with one warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const code = bakeBird(1)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatch('art/sky/bird_1.png is missing')
    setArtPng('bird_1', solid(9, 9, PINK)) // birds are 5×3
    expect(bakeBird(1).data).toEqual(code.data)
    expect(bakeBird(1).w).toBe(5)
    expect(warn).toHaveBeenCalledTimes(2) // once for the size, not every frame
    warn.mockRestore()
  })

  it('loadArt fetches every sprite\'s PNG under the base URL and skips files that fail', async () => {
    const asked = []
    const fetch = async (url) => { asked.push(url); return url.endsWith('drone_0.png') ? { ok: false } : { ok: true, blob: async () => url } }
    const decode = async (url) => artRef(url.split('/').pop().slice(0, -4))
    expect(await loadArt({ base: '/packet-loss/', fetch, decode })).toBe(artIds().length - 1)
    expect(asked).toContain('/packet-loss/art/security/drone_alarm_1.png')
    expect(asked).toContain('/packet-loss/art/ads/can.png')
    expect(asked.length).toBe(artIds().length)
  })

  it('the offline cache holds every sprite PNG', () => {
    expect(artFiles()).toEqual(artIds().map(artFile).sort())
    const source = serviceWorker('r1', ['assets/game.js'])
    expect(source).toContain('"art/decor/sign_zen24.png"')
    expect(signArtId('ZEN 24')).toBe('sign_zen24')
  })

  it('the PNGs in public/art are what the game draws', () => {
    for (const id of artIds()) setArtPng(id, fromFile(id))
    const b = bakeDrone(0, false), file = fromFile('drone_0')
    expect(b.data).toEqual(file.data)
  })
})
