// Artist-drawn PNGs that replace sprites the game otherwise draws in code.
// public/art/manifest.json lists the art IDs that have a PNG (IDs as in
// art-handoff/manifest.json); each is public/art/<id>.png. An override is only
// used when it is exactly the size the code draws, so layout and hitboxes never
// move; a mismatched file is ignored (with a console warning) and the code art
// stays. Load them before the first sprite is baked: sprites are cached.
import { PixelBuffer } from './pixels.js'

const OVERRIDES = new Map()
const warned = new Set()

export function setOverride(id, buf) { OVERRIDES.set(id, buf) }
export function clearOverrides() { OVERRIDES.clear(); warned.clear() }
export const overrideIds = () => [...OVERRIDES.keys()]

// The override for `id` if it is w×h (shared, do not modify), else null.
export function peekOverride(id, w, h) {
  const o = OVERRIDES.get(id)
  if (!o) return null
  if (o.w === w && o.h === h) return o
  if (!warned.has(id)) {
    warned.add(id)
    console.warn(`art override ${id}.png is ${o.w}×${o.h} but the game draws it at ${w}×${h}; keeping the built-in art`)
  }
  return null
}

// `buf`, or a fresh copy of its override when there is one of the same size.
export function withOverride(id, buf) {
  const o = peekOverride(id, buf.w, buf.h)
  if (!o) return buf
  const c = new PixelBuffer(o.w, o.h)
  c.data.set(o.data)
  return c
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

// Fetch public/art/manifest.json and every PNG it lists. Never throws: with no
// manifest, or a file that fails, the game simply keeps its built-in art.
export async function loadArtOverrides({ base = import.meta.env?.BASE_URL ?? '/', fetch = globalThis.fetch, decode = decodeImage } = {}) {
  try {
    const res = await fetch(`${base}art/manifest.json`)
    if (!res.ok) return 0
    const ids = await res.json()
    await Promise.all((Array.isArray(ids) ? ids : []).map(async (id) => {
      if (!/^[\w-]+$/.test(id)) return
      try {
        const r = await fetch(`${base}art/${id}.png`)
        if (r.ok) setOverride(id, await decode(await r.blob()))
      } catch { /* keep the built-in art */ }
    }))
  } catch { /* no overrides */ }
  return OVERRIDES.size
}
