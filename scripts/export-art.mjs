// Exports the game's built-in pixel art as PNGs for artists: `npm run art:export [dir]` (default art-handoff/).
// Everything is drawn by the same functions the game and the style lab use (src/pixel/*), with the first
// district's palette, so the files match what the game shows. A manifest records which function and
// arguments made each file.
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { deflateSync } from 'node:zlib'
import { paletteAt, pinPalette, PALETTE_NAMES } from '../src/pixel/palette.js'
import { bakeDecor, bakeBird, bakeCar, bakeCloud, BRANDS, PPU, signArtId } from '../src/pixel/sprites.js'
import { bakeDrone, bakeEmitter } from '../src/pixel/security.js'
import { bakeObstacle, bakePipe, bakePipeFront, bakeFence } from '../src/pixel/obstacles.js'
import { bakeBillboard, specFor } from '../src/pixel/billboard.js'
import { bakeTower, bakeFacade } from '../src/pixel/city.js'
import { ART_NAMES, artSize, artColors, drawArt } from '../src/pixel/art.js'
import { RunnerSprite, RUNNER_STYLES, RUNNERS } from '../src/pixel/runner.js'
import { createPlayer } from '../src/sim/player.js'
import { PixelBuffer } from '../src/pixel/pixels.js'

const out = resolve(process.argv[2] ?? 'art-handoff')
const SEED = 20261008 // the style lab's default seed, so these match its sheets

// ── PNG (RGBA, straight alpha; PixelBuffer data is little-endian 0xAABBGGRR, i.e. RGBA bytes) ──
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => { const len = Buffer.alloc(4), crc = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type), data]); len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body)); return Buffer.concat([len, body, crc]) }
function png(buf) {
  const { w, h } = buf, rgba = Buffer.from(buf.data.buffer, buf.data.byteOffset, w * h * 4), raw = Buffer.alloc(h * (w * 4 + 1))
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}
const copy = (b) => { const c = new PixelBuffer(b.w, b.h); c.data.set(b.data); return c }

const manifest = []
// art the game can take back as a PNG (src/pixel/overrides.js): fixed-size sprites drawn through withOverride/peekOverride
const OVERRIDABLE = (folder, id) => folder === 'security' && id.startsWith('drone') || folder === 'decor' && id !== 'antenna' || folder === 'ads' || /^(bird_\d|car_(left|right))$/.test(id)
const seenIds = new Set()
async function save(folder, id, buf, made, extra = {}) {
  if (!buf || !buf.w || !buf.h) return
  if (seenIds.has(id)) throw new Error('duplicate art ID ' + id); seenIds.add(id)
  extra = { overridable: OVERRIDABLE(folder, id), ...extra }
  const file = `${folder}/${id}.png`
  await mkdir(dirname(resolve(out, file)), { recursive: true })
  await writeFile(resolve(out, file), png(buf))
  manifest.push({ id, file, width: buf.w, height: buf.h, made, ...extra })
}

await rm(out, { recursive: true, force: true })
pinPalette(0)
const pal = paletteAt(0)

// ── runner: every look in every pose, and a run cycle as numbered frames (an animation) ──
const POSES = [ // same table as the style lab's pose sheet
  ['idle', { state: 'idle' }, 'idle'], ['run', { state: 'run', speed: 12 }, null, 0.18], ['sprint', { state: 'run', speed: 17 }, null, 0.33],
  ['jump', { state: 'air', vy: 9 }], ['apex', { state: 'air', vy: 0 }], ['fall', { state: 'air', vy: -14 }], ['slide', { state: 'slide' }],
  ['roll', { state: 'roll', t: 0.18 }], ['vault', { state: 'vault', kin: { t: 0.11, T: 0.22, mode: 'vault' } }], ['climb', { state: 'climb' }],
  ['wallrun', { state: 'wallrun', speed: 13 }], ['zipline', { state: 'zip' }], ['mantle', { state: 'mantle', kin: { t: 0.16, T: 0.32, mode: 'mantle' } }], ['stumble', { state: 'stumble' }],
]
for (const id of RUNNERS) {
  for (const [name, o, mode, settle = 0.6] of POSES) {
    const r = new RunnerSprite(id); r.rim = pal.rim
    const p = { ...createPlayer(0, 0), speed: 12, vy: 0, t: 0.1, ...o }
    for (let i = 0; i < 90; i++) { if (o.state === 'roll') p.t = o.t; r.update(settle / 90, p, i * (p.speed ?? 0) * 0.2, 0, mode) }
    await save(`runner/${id}/poses`, `${id}_${name}`, copy(r.raster()), `RunnerSprite('${id}') posed '${name}'`, { origin: [32, 52], reference: true })
  }
  // one stride, 8 frames: the cycle length follows the game's own cadence at running speed
  for (const [anim, speed] of [['run', 12], ['sprint', 17]]) {
    const r = new RunnerSprite(id); r.rim = pal.rim
    const p = { ...createPlayer(0, 0), state: 'run', speed }
    const cycle = (5.2 + speed * 0.06) / speed, sub = 6, dt = cycle / 8 / sub
    let x = 0
    for (let i = 0; i < 120; i++) { x += speed * 0.02; r.update(0.02, p, x, 0, null) } // settle into the stride
    for (let f = 0; f < 8; f++) {
      for (let s = 0; s < sub; s++) { x += speed * dt; r.update(dt, p, x, 0, null) }
      await save(`runner/${id}`, `${id}_${anim}_${f}`, copy(r.raster()), `RunnerSprite('${id}') ${anim} cycle frame ${f}/8 at speed ${speed}`, { origin: [32, 52], reference: true, fps: Math.round(8 / cycle) })
    }
  }
}

// ── security ──
for (const alarm of [false, true]) for (const f of [0, 1]) await save('security', `drone${alarm ? '_alarm' : ''}_${f}`, bakeDrone(f, alarm), `bakeDrone(${f}, ${alarm})`)
for (const tripped of [false, true]) await save('security', `emitter${tripped ? '_tripped' : ''}`, bakeEmitter(14, 1, tripped), `bakeEmitter(14, 1, ${tripped})`)

// ── rooftop decor (the game pushes these toward the backdrop colour when drawing them behind the runner) ──
for (const type of ['tank', 'antenna', 'ac', 'dish', 'skylight', 'vents', 'solar']) await save('decor', type, bakeDecor(type, 0.5, pal), `bakeDecor('${type}', 0.5, pal)`)
for (let i = 0; i < BRANDS.length; i++) {
  const v = (i + 0.5) / BRANDS.length
  await save('decor', signArtId(BRANDS[i]), bakeDecor('sign', v, pal), `bakeDecor('sign', ${v.toFixed(4)}, pal)`)
}

// ── obstacles (the style lab's obstacle sheet) ──
const OBS = [['vent', 1.4, 1.1, 3], ['vent', 1.1, 0.8, 1], ['vent', 1.6, 1.0, 2], ['highbox', 1.2, 2.0, 2], ['highbox', 1.0, 1.6, 7], ['housing', 5.5, 3, 4], ['spring', 1.6, 0.5, 9]]
const count = {}
for (const [sub, wm, hm, id] of OBS) {
  const w = Math.round(wm * PPU), h = Math.round(hm * PPU), n = (count[sub] = (count[sub] ?? -1) + 1)
  await save('obstacles', n ? `${sub}_${String.fromCharCode(97 + n)}` : sub, bakeObstacle(sub, w, h, pal, id + SEED), `bakeObstacle('${sub}', ${w}, ${h}, pal, ${id + SEED})`)
}
for (const [w, h, drop, id] of [[31, 6, 14, 5], [22, 6, 14, 6]]) {
  const n = w === 31 ? '' : '_b'
  await save('obstacles', `pipe${n}`, bakePipe('beam', w, h, drop, pal, id + SEED), `bakePipe('beam', ${w}, ${h}, ${drop}, pal, ${id + SEED})`)
  await save('obstacles', `pipe${n}_front`, bakePipeFront('beam', w, h, drop, pal, id + SEED), `bakePipeFront('beam', ${w}, ${h}, ${drop}, pal, ${id + SEED})`)
}
await save('obstacles', 'fence', bakeFence(36, 9, pal), 'bakeFence(36, 9, pal)')

// ── billboards: one of each mount; rotating boards export both campaigns as frames ──
const seen = new Map()
for (let i = 0; i < 400 && seen.size < 5; i++) { const s = specFor(SEED + i, i % 2 ? 'near' : 'facade'); if (!seen.has(s.kind)) seen.set(s.kind, s) }
for (const [kind, s] of seen) {
  const frames = kind === 'ticker' ? [0] : [0, 1]
  for (const f of frames) await save('billboards', frames.length > 1 ? `${kind}_${f}` : kind, bakeBillboard(s, pal, f), `bakeBillboard(specFor(${s.seed}, '${s.place}'), pal, ${f})`, { spec: { seed: s.seed, place: s.place } })
}

// ── ad mascots and products (hand-drawn rows in src/pixel/art.js) ──
for (const [i, name] of ART_NAMES.entries()) {
  const [w, h] = artSize(name), b = new PixelBuffer(w, h)
  drawArt(b, name, 0, 0, artColors(pal.neon[i % pal.neon.length], pal, pal.neon[(i + 1) % pal.neon.length]))
  await save('ads', name, b, `drawArt('${name}') with artColors(pal.neon[${i % pal.neon.length}])`, { source: `src/pixel/art.js ART.${name}` })
}

// ── sky traffic ──
for (const f of [0, 1, 2]) await save('sky', `bird_${f}`, bakeBird(f), `bakeBird(${f})`)
await save('sky', 'car_right', bakeCar(1, pal, 3), 'bakeCar(1, pal, 3)')
await save('sky', 'car_left', bakeCar(-1, pal, 4), 'bakeCar(-1, pal, 4)')
for (const [i, [w, h]] of [[40, 12], [56, 16], [72, 20]].entries()) await save('sky', `cloud_${'abc'[i]}`, bakeCloud(w, h, pal, SEED + i), `bakeCloud(${w}, ${h}, pal, ${SEED + i})`)

// ── city ──
for (let i = 0; i < 3; i++) await save('city', `tower_${'abc'[i]}`, bakeTower(28 + i * 8, 90 + i * 20, 2, pal.near, pal.midWin, pal, SEED + i * 13), `bakeTower(${28 + i * 8}, ${90 + i * 20}, 2, pal.near, pal.midWin, pal, ${SEED + i * 13})`)
for (const [style, name] of ['brick', 'glass', 'concrete', 'metal'].entries()) await save('city', `facade_${name}`, bakeFacade({ w: 120, roofH: 10, style, seed: SEED, pal, wall: style }), `bakeFacade({ w: 120, roofH: 10, style: ${style}, seed: ${SEED}, pal, wall: ${style} })`)

await writeFile(resolve(out, 'manifest.json'), JSON.stringify({ palette: PALETTE_NAMES[0], seed: SEED, files: manifest }, null, 2) + '\n')
await writeFile(resolve(out, 'README.md'), `# Art handoff

The game draws all of its pixel art in code (\`src/pixel/\`). These PNGs are that art, exported at native size with transparency, using the **${PALETTE_NAMES[0]}** district palette, so artists can redraw it in any pixel editor (or open the repository in spritewright).

| Folder | What | Notes |
| --- | --- | --- |
| \`runner/<look>/\` | \`run_0..7\` and \`sprint_0..7\` stride cycles; \`poses/\` has one frame of every move | 64×64 canvas, feet at (32, 52) on every frame. Posed live from a skeleton in game, so these are **reference** for now. The far-side limbs are drawn darker on purpose. |
| \`security/\` | drones (2-frame rotor animation, normal and alarm), laser emitters | magenta = armed, amber = alarm |
| \`decor/\` | rooftop props and branded signs | the game tints these toward the sky when they stand behind the runner |
| \`obstacles/\` | vents, high boxes, housings, springs, pipes (back and front layers), fence | sizes follow the level generator |
| \`billboards/\` | one of each mount; \`_0/_1\` are the two rotating campaigns | |
| \`ads/\` | the hand-drawn mascots and products from \`src/pixel/art.js\` | coloured per billboard in game |
| \`sky/\`, \`city/\` | birds (3-frame flap), cars, clouds, towers, facades | |

Numbered files (\`bird_0\`, \`bird_1\`…) are animation frames; spritewright plays them as an animation and onion-skins them.

\`manifest.json\` lists every file with the function and arguments that drew it. Run \`npm run art:export\` again for a fresh export from the code; it replaces this folder.

## Putting redrawn art in the game

Files marked \`"overridable": true\` in the manifest go straight into the game: the drones, birds, cars, rooftop decor and signs, and the ad mascots. Edit them here, keeping the canvas size, then run

    npm run art:use -- --changed

It copies every PNG that differs from the built-in art into \`public/art/\` and lists it in \`public/art/manifest.json\`. The game and the art lab load those before drawing anything, and they're cached for offline play. \`npm run art:use -- --remove <id>\` goes back to the built-in art for one sprite, and \`npm run art:check\` verifies the overrides.

A redrawn PNG keeps its own colours. The built-in art is recoloured per district (ads take the billboard's hue), so a redrawn sprite looks the same in every district.

Not redrawable yet: the runner (posed live from a skeleton, so these frames are reference), obstacles, pipes, billboards, clouds, towers and facades, whose sizes change with the level. The antenna and laser emitter heights vary too.
`)
console.log(`Exported ${manifest.length} PNGs to ${out}`)
