// Runner skins. A skin is a sheet of nine painted parts (3x3, reading order:
// head, torso, ponytail; upper arm, forearm, fist; thigh, shin, shoe), and
// optionally a recolour of it. Every sheet is bound to the same skeleton at
// the same landmarks and drawn at the same girth (see parts.js), so a skin
// changes the surface and never the rigging, proportions or animation.
import { PART } from '../runnerModel.js'

export function defineSkin({ name, sheet, recolor = null }) {
  if (!name || !sheet) throw new Error('A skin needs a name and a sheet')
  for (const part of Object.keys(recolor || {})) {
    if (part !== 'all' && !(part in PART)) throw new Error(`Skin "${name}" recolours an unknown part: ${part}`)
  }
  return Object.freeze({ name, sheet, recolor })
}

export const SKINS = {
  courier: defineSkin({ name: 'Courier', sheet: 'v2/courier-rig.png' }),
  windbreaker: defineSkin({ name: 'Windbreaker', sheet: 'v2/windbreaker-rig.png' }),
  techwear: defineSkin({ name: 'Techwear', sheet: 'v2/techwear-rig.png' }),
}

// The recolour rules that apply to one part: `all` first, then its own.
// A rule (or an array of them) is { hue, sat, light, tint, where }:
//   hue    degrees to rotate the hue by
//   tint   '#rrggbb': take this colour's hue and saturation, keep the shading
//   sat    saturation multiplier        light  lightness multiplier
//   where  [fromHue, toHue] in degrees: only touch pixels in this hue range
//          (wraps past 360), e.g. the red of a glove but not the fingers
export function rulesFor(skin, part) {
  const r = skin.recolor
  return r ? [r.all, r[part]].flat().filter(Boolean) : []
}

function toHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min
  if (!d) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

function toRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

const clamp01 = v => Math.max(0, Math.min(1, v))

// Recolour RGBA pixels in place. Alpha is never touched, so a recolour cannot
// change a part's silhouette.
export function recolorPixels(rgba, rules) {
  for (const rule of [rules].flat()) {
    const tint = rule.tint ? toHsl(...[1, 3, 5].map(i => parseInt(rule.tint.slice(i, i + 2), 16))) : null
    const [from, to] = rule.where || [0, 360]
    for (let i = 0; i < rgba.length; i += 4) {
      if (!rgba[i + 3]) continue
      let [h, s, l] = toHsl(rgba[i], rgba[i + 1], rgba[i + 2])
      if (rule.where && (s < 0.08 || !(from <= to ? h >= from && h <= to : h >= from || h <= to))) continue
      if (tint) { h = tint[0]; s = tint[1] * (rule.where ? 1 : Math.min(1, s * 2 + 0.5)) }
      h = (((h + (rule.hue || 0)) % 360) + 360) % 360
      s = clamp01(s * (rule.sat ?? 1)); l = clamp01(l * (rule.light ?? 1))
      const rgb = toRgb(h, s, l)
      rgba[i] = rgb[0]; rgba[i + 1] = rgb[1]; rgba[i + 2] = rgb[2]
    }
  }
  return rgba
}
