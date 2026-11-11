// Production atlases generated from the approved art sheet. Geometry is still
// owned by the simulation; these images only supply its visible materials.
import { SKINS } from './rig/skins.js'

export const KIT = Object.freeze({ tank: 0, ac: 1, vent: 2, sign: 3, drone: 4, crate: 5, pipe: 6, spring: 7, duct: 8, shard: 9, wallrun: 10, cables: 11, roof: 12, concrete: 13, industrial: 14, stripes: 15 })
export const ATLAS_GRID = 4
let art = null

export function atlasCell(width, height, index, columns = 4, rows = 4) {
  const x0 = Math.round((index % columns) * width / columns), y0 = Math.round(Math.floor(index / columns) * height / rows)
  return { x: x0, y: y0, w: Math.round((index % columns + 1) * width / columns) - x0, h: Math.round((Math.floor(index / columns) + 1) * height / rows) - y0 }
}

// First and last used index along one axis of a cell. A thin strip of a
// neighbouring sprite that bled over the cell's edge, with clear space
// between it and the real sprite, is not part of the sprite: keeping it
// would squash the artwork into part of the box it is drawn in.
export function trimSlivers(used) {
  const n = used.length, thin = Math.max(2, Math.round(n * 0.06)), gap = Math.max(2, Math.round(n * 0.03))
  let a = 0, b = n - 1
  while (a <= b && !used[a]) a++
  while (b >= a && !used[b]) b--
  const skip = (from, step) => {
    let end = from
    while (end !== (step > 0 ? b : a) && used[end + step]) end += step
    if (Math.abs(end - from) + 1 > thin || (from !== 0 && from !== n - 1)) return from
    let next = end + step, clear = 0
    while (next >= a && next <= b && !used[next]) { next += step; clear++ }
    return clear >= gap && next >= a && next <= b ? next : from
  }
  a = skip(a, 1); b = skip(b, -1)
  return [a, b]
}

function frames(image, columns = 4, rows = 4) {
  const cv = document.createElement('canvas')
  cv.width = image.width; cv.height = image.height
  const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(image, 0, 0)
  const rgba = c.getImageData(0, 0, cv.width, cv.height).data
  return Array.from({ length: columns * rows }, (_, i) => {
    const cell = atlasCell(cv.width, cv.height, i, columns, rows)
    // Opaque pixels per row and column of the cell.
    const rowsUsed = new Uint32Array(cell.h), colsUsed = new Uint32Array(cell.w)
    for (let y = 0; y < cell.h; y++) for (let x = 0; x < cell.w; x++) {
      if (rgba[((cell.y + y) * cv.width + cell.x + x) * 4 + 3] < 32) continue
      rowsUsed[y]++; colsUsed[x]++
    }
    const [top, bottom] = trimSlivers(rowsUsed), [left, right] = trimSlivers(colsUsed)
    if (right < left) throw new Error(`Empty concept atlas cell ${i}`)
    const frame = document.createElement('canvas')
    frame.width = right - left + 1; frame.height = bottom - top + 1
    frame.getContext('2d').drawImage(cv, cell.x + left, cell.y + top, frame.width, frame.height, 0, 0, frame.width, frame.height)
    return frame
  })
}

export async function loadConceptArt() {
  const base = import.meta.env.BASE_URL + 'concept-art/'
  const image = name => new Promise((resolve, reject) => {
    const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(new Error(`Cannot load ${name}`)); im.src = base + name
  })
  try {
    const sheets = [...new Set(Object.values(SKINS).map(skin => skin.sheet))]
    const [environment, skyline, ...rigs] = await Promise.all(['environment-atlas.png', 'skyline.png', ...sheets].map(image))
    art = { kit: frames(environment), skyline }
    // Each outfit sheet is nine trimmed parts; rig/parts.js binds them to the skeleton.
    art.rigs = Object.fromEntries(sheets.map((sheet, i) => [sheet, frames(rigs[i], 3, 3)]))
    // District colour work happens before gameplay, not on a scrolling frame.
    art.backgrounds = new Map()
    const tints = { 'Kowloon Night': null, 'Acid Rain': '#397251', 'Smog Noon': '#b49351', 'Neon Dusk': '#a1436a', 'Blackout': '#50304a' }
    for (const [name, tint] of Object.entries(tints)) {
      const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512
      const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(skyline, 0, 0, cv.width, cv.height)
      if (tint) { ctx.globalCompositeOperation = 'color'; ctx.fillStyle = tint; ctx.fillRect(0, 0, cv.width, cv.height); ctx.globalCompositeOperation = 'source-over' }
      if (name === 'Smog Noon' || name === 'Blackout') { ctx.fillStyle = name === 'Smog Noon' ? '#c0a06a55' : '#00000066'; ctx.fillRect(0, 0, cv.width, cv.height) }
      art.backgrounds.set(name, cv)
    }
    return true
  } catch (e) { console.warn('Concept art unavailable; using original renderer.', e); return false }
}

export const conceptArt = () => art
