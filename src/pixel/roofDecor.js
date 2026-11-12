// What stands on a roof behind the play lane: water tanks, air handlers,
// vents, ducts, junction boxes and billboards. The layout is a pure function
// of the building's seed, so it is the same every time that roof is drawn.
import { hash } from './pixels.js'

// Size of each prop in logical pixels at scale 1.
export const DECOR = Object.freeze({ tank: [42, 68], ac: [37, 27], vent: [35, 31], sign: [58, 66], duct: [17, 34], cables: [38, 26] })
// Props that go down together, with how often each arrangement is picked.
const GROUPS = [
  [['tank'], 3], [['ac'], 3], [['ac', 'ac'], 2], [['vent'], 3], [['vent', 'duct'], 2], [['duct'], 2],
  [['cables'], 2], [['ac', 'vent'], 2], [['tank', 'cables'], 1], [['duct', 'ac'], 1], [['sign'], 4],
]
const SCALES = [0.82, 1, 1.16]
// Billboard light colours. A billboard's colour is also what the wet roof
// under it reflects.
export const NEONS = Object.freeze([[255, 64, 160], [70, 225, 255], [255, 176, 56], [150, 255, 90], [255, 84, 72], [178, 120, 255]])
const SIGN_SIZES = [[58, 66], [74, 70], [50, 58]]
const SIGN_SPACING = 240

// items: { id, x, w, h, flip, shade, ad, color }, x from the roof's left edge.
export function roofDecor(seed, width, ads = 16) {
  const items = []
  const total = GROUPS.reduce((sum, g) => sum + g[1], 0)
  let x = 10 + hash(seed, 1, 71) * 46, lastKind = null, lastSign = -Infinity, lastAd = -1
  for (let i = 0; i < 40 && x < width - 24; i++) {
    // Draw an arrangement, redrawing if it would repeat what came before.
    let group = null
    for (let attempt = 0; attempt < 6 && !group; attempt++) {
      let pick = hash(seed, i, 72 + attempt) * total
      const g = GROUPS.find(entry => (pick -= entry[1]) < 0) ?? GROUPS[0]
      const kinds = g[0]
      if (kinds[0] === lastKind || kinds.at(-1) === lastKind) continue
      if (kinds[0] === 'sign' && (x - lastSign < SIGN_SPACING || width < 150)) continue
      group = kinds
    }
    if (group) {
      const placed = []
      let px = x
      for (const [n, id] of group.entries()) {
        let w, h, ad, color
        if (id === 'sign') {
          [w, h] = SIGN_SIZES[Math.floor(hash(seed, i, 80) * SIGN_SIZES.length)]
          ad = Math.floor(hash(seed, i, 81) * ads)
          if (ad === lastAd) ad = (ad + 1 + Math.floor(hash(seed, i, 82) * (ads - 1))) % ads
          color = NEONS[Math.floor(hash(seed, i, 83) * NEONS.length)]
        } else {
          const scale = SCALES[Math.floor(hash(seed, i * 4 + n, 84) * SCALES.length)]
          w = Math.round(DECOR[id][0] * scale); h = Math.round(DECOR[id][1] * scale)
        }
        if (px + w > width - 6) break
        placed.push({ id, x: Math.round(px), w, h, flip: id !== 'sign' && hash(seed, i * 4 + n, 85) < 0.5, shade: Math.floor(hash(seed, i * 4 + n, 86) * 3), ad, color })
        px += w + 3 + hash(seed, i * 4 + n, 87) * 6
      }
      if (!placed.length) break
      items.push(...placed)
      lastKind = placed.at(-1).id
      const sign = placed.find(p => p.id === 'sign')
      if (sign) { lastSign = sign.x; lastAd = sign.ad }
      x = px
    }
    // Bare roof between arrangements, now and then a long stretch of it.
    x += 22 + hash(seed, i, 88) * 96 + (hash(seed, i, 89) < 0.28 ? 110 : 0)
  }
  return items
}
