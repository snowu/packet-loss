// Actual game sprites at 3x nearest-neighbour, without a browser.
// node scripts/art-sheet.mjs [checkout] [output.png]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { encodePng, decodePng } from './png.mjs'

const root = resolve(process.argv[2] || '.')
const output = resolve(process.argv[3] || 'docs/screenshots/courier-pass/after-sheet.png')
const mod = p => import(pathToFileURL(resolve(root, p)).href)
const { PixelBuffer, pack } = await mod('src/pixel/pixels.js')
const { RunnerSprite } = await mod('src/pixel/runner.js')
const { bakeDecor, drawText } = await mod('src/pixel/sprites.js')
const { bakeDrone } = await mod('src/pixel/security.js')
const { paletteAt } = await mod('src/pixel/palette.js')
const { artIds, artFile, setArtPng } = await mod('src/pixel/artPng.js')
for (const id of artIds()) {
  const q = decodePng(readFileSync(resolve(root, 'public', artFile(id))))
  const b = new PixelBuffer(q.w, q.h)
  b.data.set(new Uint32Array(q.rgba.buffer)); setArtPng(id, b)
}
const b = new PixelBuffer(480, 210), ink = pack([12, 10, 24]), light = pack([222, 215, 226])
b.rect(0, 0, b.w, b.h, ink)
drawText(b, 'PACKET LOSS / GAME SPRITES', 12, 10, light, 2)
const pal = paletteAt(1500)
const poses = ['run', 'air', 'slide', 'vault', 'climb', 'roll']
for (let i = 0; i < poses.length; i++) {
  const r = new RunnerSprite('courier')
  r.rim = pal.rim
  for (let f = 0; f < 24; f++) r.update(1 / 60, { state: poses[i], speed: 12, vy: -3, t: f / 60, kin: { t: 0.13, T: 0.3, mode: 'arc' } }, f * 3, 100, null)
  b.blit(r.raster(), 8 + i * 78, 35)
  drawText(b, poses[i].toUpperCase(), 22 + i * 78, 104, light)
}
drawText(b, 'ROOF KIT / SECURITY', 12, 125, light)
for (const [i, id] of ['tank', 'ac', 'vents'].entries()) {
  const sprite = bakeDecor(id, 0.5, pal)
  b.blit(sprite, 28 + i * 95, 190 - sprite.h)
  drawText(b, id.toUpperCase(), 28 + i * 95, 198, light)
}
for (const [i, alarm] of [false, true].entries()) {
  b.blit(bakeDrone(0, alarm), 330 + i * 75, 160)
  drawText(b, alarm ? 'ALARM' : 'ARMED', 330 + i * 75, 198, light)
}
const scale = 3, large = new PixelBuffer(b.w * scale, b.h * scale)
for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) large.rect(x * scale, y * scale, scale, scale, b.get(x, y))
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, encodePng(large.w, large.h, new Uint8Array(large.data.buffer)))
console.log(output)
