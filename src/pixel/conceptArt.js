// Production atlases generated from the approved art sheet. Geometry is still
// owned by the simulation; these images only supply its visible materials.
export const KIT = Object.freeze({ tank: 0, ac: 1, vent: 2, sign: 3, drone: 4, crate: 5, pipe: 6, spring: 7, duct: 8, shard: 9, wallrun: 10, cables: 11, roof: 12, concrete: 13, industrial: 14, stripes: 15 })
export const ATLAS_GRID = 4
let art = null

export function poseFor(p, time, idle = false) {
  const t = Number.isFinite(time) ? Math.max(0, time) : 0
  const speed = Number.isFinite(p.speed) ? p.speed : 12
  if (idle || p.state === 'idle' || p.state === 'blocked') return 15
  switch (p.state) {
    case 'slide': return 8
    case 'vault': case 'mantle': return 9
    case 'climb': return 11
    case 'wallslide': return 10
    case 'wallrun': return 12
    case 'zip': return 13
    case 'roll': case 'dead': return 14
    case 'air': return p.vy > 1 ? 6 : 5
    case 'stumble': return 7
    default: return Math.floor(t * Math.max(6, Math.min(14, speed * 0.9))) % 6
  }
}

export function atlasCell(width, height, index, columns = 4, rows = 4) {
  const x0 = Math.round((index % columns) * width / columns), y0 = Math.round(Math.floor(index / columns) * height / rows)
  return { x: x0, y: y0, w: Math.round((index % columns + 1) * width / columns) - x0, h: Math.round((Math.floor(index / columns) + 1) * height / rows) - y0 }
}

function frames(image, columns = 4, rows = 4) {
  const cv = document.createElement('canvas')
  cv.width = image.width; cv.height = image.height
  const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(image, 0, 0)
  const rgba = c.getImageData(0, 0, cv.width, cv.height).data
  return Array.from({ length: columns * rows }, (_, i) => {
    const cell = atlasCell(cv.width, cv.height, i, columns, rows)
    let left = cell.w, top = cell.h, right = -1, bottom = -1
    for (let y = 0; y < cell.h; y++) for (let x = 0; x < cell.w; x++) {
      if (rgba[((cell.y + y) * cv.width + cell.x + x) * 4 + 3] < 32) continue
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
    }
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
    const [environment, skyline, courierRig, windbreakerRig, techwearRig] = await Promise.all(['environment-atlas.png', 'skyline.png', 'v2/courier-rig.png', 'v2/windbreaker-rig.png', 'v2/techwear-rig.png'].map(image))
    art = { kit: frames(environment), skyline }
    art.rigs = { courier: frames(courierRig, 3, 3), windbreaker: frames(windbreakerRig, 3, 3), techwear: frames(techwearRig, 3, 3) }
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
