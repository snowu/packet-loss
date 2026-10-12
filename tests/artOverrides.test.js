// Artist PNGs replacing code-drawn sprites: src/pixel/overrides.js, the hooks in the bake functions,
// scripts/use-art.mjs (art:use / art:check) and the offline precache.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setOverride, clearOverrides, loadArtOverrides, peekOverride } from '../src/pixel/overrides.js'
import { bakeDrone } from '../src/pixel/security.js'
import { bakeBird, bakeCar, bakeDecor, BRANDS } from '../src/pixel/sprites.js'
import { drawArt, artSize } from '../src/pixel/art.js'
import { PixelBuffer, pack } from '../src/pixel/pixels.js'
import { paletteAt } from '../src/pixel/palette.js'
import { artFiles, serviceWorker } from '../vite.config.js'
import { decodePng, encodePng } from '../scripts/png.mjs'
import { deflateSync } from 'node:zlib'

const solid = (w, h, c) => { const b = new PixelBuffer(w, h); b.data.fill(c); return b }
const PINK = pack([255, 0, 255])
afterEach(() => clearOverrides())

describe('art overrides', () => {
  it('replace a sprite only at the size the game draws it, as a fresh copy each time', () => {
    const code = bakeDrone(0, false)
    setOverride('drone_0', solid(code.w, code.h, PINK))
    const a = bakeDrone(2, false) // frame 2 is rotor frame 0
    expect([...new Set(a.data)]).toEqual([PINK])
    a.data[0] = 0
    expect(bakeDrone(0, false).data[0]).toBe(PINK) // callers can tint their copy without touching the override
    expect(bakeDrone(1, false).data).toEqual(bakeDrone(1, false).data)
    expect(bakeDrone(1, false).data.includes(PINK)).toBe(false) // other frames keep the built-in art
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setOverride('bird_1', solid(9, 9, PINK)) // birds are 5×3
    expect(bakeBird(1).data.includes(PINK)).toBe(false)
    expect(bakeBird(1).w).toBe(5)
    expect(warn).toHaveBeenCalledTimes(1) // warned once, not every frame
    warn.mockRestore()
  })

  it('covers birds, cars, decor and brand signs, but not the classic sign or the variable antenna', () => {
    const pal = paletteAt(0)
    for (const [id, make] of [['bird_2', () => bakeBird(2)], ['car_left', () => bakeCar(-1, pal, 1)], ['tank', () => bakeDecor('tank', 0.3, pal)], ['sign_volt', () => bakeDecor('sign', (BRANDS.indexOf('VOLT') + 0.5) / BRANDS.length, pal)]]) {
      const b = make(); setOverride(id, solid(b.w, b.h, PINK))
      expect(make().data.every((v) => v === PINK), id).toBe(true)
    }
    const classic = bakeDecor('sign', (BRANDS.indexOf('VOLT') + 0.5) / BRANDS.length, pal, { classic: true })
    expect(classic.data.includes(PINK)).toBe(false)
    const ant = bakeDecor('antenna', 0.5, pal); setOverride('antenna', solid(ant.w, ant.h, PINK))
    expect(bakeDecor('antenna', 0.5, pal).data.includes(PINK)).toBe(false)
  })

  it('ad art keeps its own colours (and still flips)', () => {
    const [w, h] = artSize('can'), o = solid(w, h, 0); o.data[0] = PINK
    setOverride('can', o)
    const b = new PixelBuffer(w * 2, h * 2)
    drawArt(b, 'can', 0, 0, {}, 2, true)
    expect(b.get((w - 1) * 2, 0)).toBe(PINK); expect(b.get((w - 1) * 2 + 1, 1)).toBe(PINK)
    expect(b.data.filter((v) => v === PINK).length).toBe(4)
  })

  it('load from public/art: listed IDs only, bad names skipped, a missing manifest means none', async () => {
    const files = { '/g/art/manifest.json': ['bird_0', '../evil', 'nope'], '/g/art/bird_0.png': 'png' }
    const fetch = async (url) => (url in files ? { ok: true, json: async () => files[url], blob: async () => files[url] } : { ok: false })
    expect(await loadArtOverrides({ base: '/g/', fetch, decode: async () => solid(5, 3, PINK) })).toBe(1)
    expect(peekOverride('bird_0', 5, 3)).not.toBe(null)
    clearOverrides()
    expect(await loadArtOverrides({ base: '/x/', fetch, decode: async () => solid(1, 1, 0) })).toBe(0)
    expect(await loadArtOverrides({ base: '/g/', fetch: async () => { throw new Error('offline') } })).toBe(0)
  })
})

describe('art:use and art:check', () => {
  it('--changed copies only edited, redrawable PNGs into public/art; check verifies them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pl-use-')), handoff = join(dir, 'h'), pub = join(dir, 'p')
    try {
      cpSync('art-handoff', handoff, { recursive: true })
      const touch = (file) => { const img = decodePng(readFileSync(join(handoff, file))); img.rgba[3] = 255; img.rgba[0] ^= 0x80; writeFileSync(join(handoff, file), encodePng(img.w, img.h, img.rgba)) }
      touch('decor/tank.png'); touch('runner/courier/poses/courier_idle.png')
      const run = (...a) => execFileSync(process.execPath, ['scripts/use-art.mjs', '--handoff', handoff, '--public', pub, ...a], { encoding: 'utf8', stdio: 'pipe' })
      expect(run('--changed')).toMatch(/In the game now: tank/)
      expect(JSON.parse(readFileSync(join(pub, 'manifest.json'), 'utf8'))).toEqual(['tank'])
      expect(existsSync(join(pub, 'courier_idle.png'))).toBe(false) // the runner is reference only
      expect(run('--check')).toMatch(/1 override OK/)
      writeFileSync(join(pub, 'tank.png'), encodePng(2, 2, new Uint8Array(16)))
      expect(() => run('--check')).toThrow(/2×2, the game draws it at/)
      run('--remove', 'tank')
      expect(JSON.parse(readFileSync(join(pub, 'manifest.json'), 'utf8'))).toEqual([])
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }, 60000)

  it('the shipped public/art passes the check', () => {
    expect(execFileSync(process.execPath, ['scripts/use-art.mjs', '--check'], { encoding: 'utf8' })).toMatch(/OK/)
  })
})

describe('offline', () => {
  it('precaches the override manifest and its PNGs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pl-sw-'))
    try {
      writeFileSync(join(dir, 'manifest.json'), JSON.stringify(['bird_0', 'tank']))
      const art = artFiles(new URL(`file://${dir}/`))
      expect(art).toEqual(['art/manifest.json', 'art/bird_0.png', 'art/tank.png'])
      expect(serviceWorker('r1', ['assets/a.js'], art)).toMatch(/"art\/bird_0\.png"/)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('png helper', () => {
  it('reads what it writes, including filtered rows from other editors', () => {
    const rgba = new Uint8Array([1, 2, 3, 4, 250, 251, 252, 253, 9, 8, 7, 0, 100, 50, 25, 128])
    expect([...decodePng(encodePng(2, 2, rgba)).rgba]).toEqual([...rgba])
    // the same pixels with row filters, as other editors write them: row 0 "Sub", row 1 "Up"
    const filtered = Buffer.from([1, 1, 2, 3, 4, 249, 249, 249, 249, 2, 8, 6, 4, 252, 106, 55, 29, 131])
    const enc = encodePng(2, 2, rgba), idatAt = enc.indexOf('IDAT') - 4, data = deflateSync(filtered)
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const crc = (b) => { let c = 0xffffffff; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1 } return (c ^ 0xffffffff) >>> 0 }
    const crcB = Buffer.alloc(4); crcB.writeUInt32BE(crc(Buffer.concat([Buffer.from('IDAT'), data])))
    const png = Buffer.concat([enc.subarray(0, idatAt), len, Buffer.from('IDAT'), data, crcB, enc.subarray(enc.indexOf('IEND') - 4)])
    expect([...decodePng(png).rgba]).toEqual([...rgba])
  })
})
