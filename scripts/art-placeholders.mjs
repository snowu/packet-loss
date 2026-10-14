// Writes the PNG of every sprite registered with defineArt (src/pixel/artPng.js) that has none in
// public/art yet, drawn by its code art in the base palette. Only for new sprites: existing PNGs are
// never touched, since the PNG is the art from then on.
//   node scripts/art-placeholders.mjs
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { artIds, artFile, artRef } from '../src/pixel/artPng.js'
import '../src/pixel/sprites.js'
import '../src/pixel/security.js'
import '../src/pixel/art.js'
import { encodePng } from './png.mjs'

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const made = []
for (const id of artIds()) {
  const file = join(pub, artFile(id))
  if (existsSync(file)) continue
  const b = artRef(id)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, encodePng(b.w, b.h, new Uint8Array(b.data.buffer, b.data.byteOffset, b.w * b.h * 4)))
  made.push(artFile(id))
}
console.log(made.length ? `New placeholders:\n  ${made.join('\n  ')}` : 'Every sprite has its PNG.')
