// Sprites the game draws from PNGs: public/art/<folder>/<id>.png is the one
// copy of each, what the game ships and what artists paint over. The code that
// first drew a sprite stays as its reference: `defineArt` registers the
// sprite's ID, folder and how to draw it with the base palette (Neon Dusk),
// which is exactly what the PNG starts out as.
//
// Districts and billboards recolour the code art. A PNG follows along by
// colour: every colour the reference has is replaced with the colour the code
// puts at the same pixels for this palette and variant, so an untouched PNG
// looks exactly like the code art everywhere. Colours an artist adds stay as
// painted.
//
// A PNG is used only at the size the code draws, so layout and hitboxes never
// move; a missing or mismatched file falls back to the code art with one
// console warning. Load them before the first sprite is baked: sprites are cached.
import { PixelBuffer } from './pixels.js'

const DEFS = new Map()  // id → { folder, ref }
const PNGS = new Map()  // id → PixelBuffer
const REFS = new Map()  // id → reference PixelBuffer, drawn once
const warned = new Set()

export function defineArt(id, folder, ref) {
  if (DEFS.has(id)) throw new Error('duplicate art ID ' + id)
  DEFS.set(id, { folder, ref })
}
export const artIds = () => [...DEFS.keys()]
export const artFile = (id) => `art/${DEFS.get(id).folder}/${id}.png`
export function artRef(id) {
  if (!REFS.has(id)) REFS.set(id, DEFS.get(id).ref())
  return REFS.get(id)
}

export function setArtPng(id, buf) { PNGS.set(id, buf) }
export function clearArtPngs() { PNGS.clear(); warned.clear() }

function warnOnce(key, msg) {
  if (warned.has(key)) return
  warned.add(key)
  console.warn(msg)
}

// The PNG for `id` if it is w×h (shared, do not modify), else null.
export function artPng(id, w, h) {
  const o = PNGS.get(id)
  if (!o) { if (DEFS.has(id)) warnOnce(id + ' missing', `${artFile(id)} is missing; drawing ${id} in code`); return null }
  if (o.w === w && o.h === h) return o
  warnOnce(`${id} ${o.w}×${o.h}`, `${artFile(id)} is ${o.w}×${o.h} but the game draws it at ${w}×${h}; drawing it in code`)
  return null
}

// Reference colour → the colour `code` has at the same pixels (the most common
// one, should a reference colour land on several).
function colourMap(ref, code) {
  const votes = new Map()
  for (let i = 0; i < ref.data.length; i++) {
    const r = ref.data[i], c = code.data[i]
    if (!(r >>> 24)) continue
    let v = votes.get(r)
    if (!v) votes.set(r, v = new Map())
    v.set(c, (v.get(c) ?? 0) + 1)
  }
  const map = new Map()
  for (const [r, v] of votes) {
    let best = r, n = -1
    for (const [c, k] of v) if (k > n) { best = c; n = k }
    if (best !== r) map.set(r, best)
  }
  return map
}

// The sprite to show for `id`, given `code`, what the code draws for this
// palette and variant: a fresh copy of the PNG recoloured to match, or `code`
// itself when there is no usable PNG.
export function fromArt(id, code) {
  const png = artPng(id, code.w, code.h)
  if (!png) return code
  const out = new PixelBuffer(png.w, png.h)
  out.data.set(png.data)
  const ref = artRef(id)
  if (ref.w !== code.w || ref.h !== code.h) return out
  const map = colourMap(ref, code)
  if (map.size) for (let i = 0; i < out.data.length; i++) { const c = map.get(out.data[i]); if (c !== undefined) out.data[i] = c }
  return out
}

async function decodeImage(blob) {
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bmp.width, bmp.height) : Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height })
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bmp, 0, 0)
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height)
  const b = new PixelBuffer(img.width, img.height)
  b.data.set(new Uint32Array(img.data.buffer, img.data.byteOffset, img.width * img.height))
  return b
}

// Fetch the PNG of every registered sprite. Never throws: a file that fails
// leaves that sprite drawn in code.
export async function loadArt({ base = import.meta.env?.BASE_URL ?? '/', fetch = globalThis.fetch, decode = decodeImage } = {}) {
  await Promise.all(artIds().map(async (id) => {
    try {
      const r = await fetch(base + artFile(id))
      if (r.ok) setArtPng(id, await decode(await r.blob()))
    } catch { /* drawn in code */ }
  }))
  return PNGS.size
}
