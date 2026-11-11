// Runner skins. A skin is colours plus a few switches that decide which
// material a body region uses (bare arm or sleeve, glove or hand, collar or
// neck). It never changes geometry: every skin draws the exact same pixels
// in every frame, only in different colours. Add a skin by adding an entry.
import { OUTLINE_MAT, FAR } from './raster.js'

export const MATERIALS = Object.freeze(['outline', 'skin', 'hair', 'top', 'trim', 'pants', 'pad', 'shoe', 'sole', 'glove', 'belt', 'eye', 'band', 'sleeve', 'collar'])
export const MAT = Object.freeze(Object.fromEntries(MATERIALS.map((m, i) => [m, i + 1])))
if (MAT.outline !== OUTLINE_MAT) throw new Error('outline must be material 1')

export const STYLE_DEFAULTS = Object.freeze({
  sleeves: 'none', // 'none' | 'short' | 'long'
  midriff: false,  // bare waist between top and belt
  gloves: true,    // fingerless gloves over the fists
  collar: false,   // scarf / high collar over the neck
  zip: false,      // jacket zip and seams in the trim colour
  kneepads: true,
})

const SHADOW = [30, 16, 52], WARM = [255, 240, 214], NIGHT = [12, 8, 26]

export function hexColor(h) {
  const n = parseInt(String(h).replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

// Shade toward a cool violet and light toward a warm white: hue-shifted
// ramps read as painted pixel art, where plain darkening reads as mud.
export function ramp(base, { shade = 0.42, light = 0.3 } = {}) {
  const c = hexColor(base)
  return [c, mix(c, SHADOW, shade), mix(c, WARM, light)]
}

export function defineSkin({ name, colors, style = {}, ramps = {} }) {
  const c = { outline: '#140c1e', eye: '#1b1024', ...colors }
  c.sleeve ??= c.top; c.collar ??= c.trim; c.band ??= c.trim; c.glove ??= c.skin; c.pad ??= c.pants
  for (const m of MATERIALS) if (!c[m]) throw new Error(`Skin ${name} is missing a ${m} colour`)
  return Object.freeze({ name, colors: Object.freeze(c), style: Object.freeze({ ...STYLE_DEFAULTS, ...style }), ramps })
}

// Little-endian RGBA lookup for every index byte the rasterizer can write.
export function paletteOf(skin) {
  const lut = new Uint32Array(256)
  const pack = ([r, g, b]) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
  for (const m of MATERIALS) {
    const id = MAT[m], tones = m === 'outline' ? [hexColor(skin.colors.outline), hexColor(skin.colors.outline), hexColor(skin.colors.outline)] : ramp(skin.colors[m], skin.ramps[m])
    for (let t = 0; t < 3; t++) {
      lut[(id << 2) | t] = pack(tones[t])
      // Far limbs sit in the body's shadow.
      lut[(id << 2) | t | FAR] = pack(m === 'outline' ? tones[t] : mix(tones[t], NIGHT, 0.34))
    }
  }
  return lut
}

export const SKINS = Object.freeze({
  courier: defineSkin({
    name: 'Courier',
    colors: {
      skin: '#d99a72', hair: '#5a3424', top: '#ddd6ca', trim: '#ff3b30', pants: '#3b3352', pad: '#7a7088',
      shoe: '#ff3b30', sole: '#f2ece2', glove: '#d8302b', belt: '#231d2c', band: '#e8e4ee',
    },
    style: { sleeves: 'none', midriff: true, gloves: true },
  }),
  windbreaker: defineSkin({
    name: 'Windbreaker',
    colors: {
      skin: '#cf9068', hair: '#4a2a20', top: '#f0642c', trim: '#2fe3ff', pants: '#2e2c44', pad: '#6a6880',
      shoe: '#ece8f2', sole: '#a7a3b6', glove: '#26232f', belt: '#1f1c28', collar: '#3bc2d4', band: '#e8e4ee',
    },
    style: { sleeves: 'long', gloves: true, collar: true, zip: true },
  }),
  techwear: defineSkin({
    name: 'Techwear',
    colors: {
      skin: '#d49b78', hair: '#e6e2ee', top: '#2b2e40', trim: '#2fe3ff', pants: '#22232f', pad: '#4b4d60',
      shoe: '#dcdee8', sole: '#8a8ca0', glove: '#15161d', belt: '#14151c', collar: '#b52a35', band: '#2fe3ff',
    },
    style: { sleeves: 'long', gloves: true, collar: true, zip: true },
  }),
})
