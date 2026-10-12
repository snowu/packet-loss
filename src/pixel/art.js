// Hand-drawn pixel art and lettering for advertising: product and mascot
// sprites, a 5x7 display font, and procedurally built faux-kanji.
import { pack, mix, hash } from './pixels.js'
import { peekOverride } from './overrides.js'

// ── sprites ──────────────────────────────────────────────────────────────
// Keys: k outline · a hue · b hue shade · c hue light · w white · W white shade
// s skin · S skin shade · h hair · y gold · r warm red · g/G metal · e glow
export const ART = {
  can: [
    '....kkkkkkkk....',
    '..kkggwwggGGkk..',
    '.kgwgggggggGGGk.',
    '.kggGkkkggggGGk.',
    '.kggGkGkggggGGk.',
    '..kkggggggGGkk..',
    '.kccaaaaaaaaabk.',
    '.kcwaaaaaaaaabk.',
    '.kcwaaaaaaaaabk.',
    '.kcwaaaaaaaaabk.',
    '.kcwaaaaaaaaabk.',
    '.kcwkkkkkkkkabk.',
    '.kcwkwwwwwkkabk.',
    '.kcwkwwywwkkabk.',
    '.kcwkwwyywkkabk.',
    '.kcwkwwwywkkabk.',
    '.kcwkwwyywkkabk.',
    '.kcwkwwywwkkabk.',
    '.kcwkwwwwwkkabk.',
    '.kcwkkkkkkkkabk.',
    '.kcwaaaaaaaaabk.',
    '.kcwaaaaaaaaabk.',
    '.kcwaaaaaaaaabk.',
    '.kcaaaaaaaabbbk.',
    '.kccaaaaaabbbbk.',
    '..kggggggggGGk..',
    '...kkkkkkkkkk...',
  ],
  bowl: [
    '....w...w...w......y',
    '...w...w...w......y.',
    '....w...w...w....y..',
    '...w...w...w....y.y.',
    'kkkkkkkkkkkkkkkky.y.',
    'kyyyywwyyyyyyyykyk..',
    'kcaaaaaaaaaaaaaabk..',
    '.kcaaawwwaaaaaabk...',
    '.kcaawrrrwaaaaabk...',
    '..kcaawwwaaaaabk....',
    '...kcaaaaaaaabk.....',
    '....kkbbbbbbkk......',
    '.....kGGGGGGk.......',
    '.....kkkkkkkk.......',
  ],
  face: [
    '.......kkkkkk.........',
    '.....kkHHhhhhkk.......',
    '....kHHHhhhhhhhkk.....',
    '...kHHHhhhhhhhhhSk....',
    '..kHHHhhhhhhhhhsslkk..',
    '..kHHhhhhhhhhhssllsk..',
    '.kHHhhhhhhhhhssllssk..',
    '.kHhhhhhhhhhssllsssk..',
    '.kHhhhhhhhhhsskkkssk..',
    '.kHhhhhhhhhsslwksssk..',
    '.khhhhhhhhhsslsssSk...',
    '.khhhhhhhhhssllssSSkk.',
    '.khhhhhhhhhssllsssssk.',
    '.khhhhhhhhSsssllSSkk..',
    '.khhhhhhhSSsssllSSk...',
    '.khhhhhhhSSsssssSsk...',
    '..khhhhhhSSssSrrSsk...',
    '..khhhhhhSSsssssSk....',
    '...khhhhhSSsssssSk....',
    '....khhhhSSsssSkk.....',
    '.....khhhSSssSkk......',
    '......khhSSsSk........',
    '......khhSSsSk........',
    '.....kggkSSsSkk.......',
    '....kggggkSsSkggk.....',
    '...kggggggkkkggggk....',
    '..kggggGgggeggggggk...',
    '.kggggGGgggeggggggGk..',
    'kggggGGGgggeggggggGGk.',
    'kkkkkkkkkkkkkkkkkkkkk.',
  ],
  cat: [
    '..k......k......',
    '.kwk....kwk..kk.',
    '.kwwkkkkwwk.kwwk',
    'kwwwwwwwwwwkkwwk',
    'kwwkwwwwkwwk.kwk',
    'kwwkwwwwkwwk.kwk',
    'kwwwwrrwwwwkkwwk',
    'kWwwwwwwwwWkwwk.',
    '.kWwwwwwwWkkwk..',
    '.krryyyyrrk.kk..',
    'kwwwwyywwwwk....',
    'kwwwwwwwwwwk....',
    'kwwwaaaawwwk....',
    'kWwwwwwwwwWk....',
    'kWwwkwwkwwWk....',
    '.kkkkkkkkkk.....',
  ],
  skull: [
    '...kkkkkkkk...',
    '..kwwwwwwwwk..',
    '.kwwwwwwwwwwk.',
    'kwwwwwwwwwwwWk',
    'kwwkkkwwkkkwWk',
    'kwkeekwwkeekWk',
    'kwkkkkwwkkkkWk',
    'kwwwwwkkwwwwWk',
    '.kwwwkkkkwwWk.',
    '..kwwwwwwwWk..',
    '..kwkwkwkwWk..',
    '..kkwkwkwkkk..',
    '...kkkkkkkk...',
  ],
  eye: [
    '.....kkkkkk.....',
    '...kkwwwwwwkk...',
    '.kkwwwkkkkwwwkk.',
    'kwwwwkaaaakwwwwk',
    'kwwwkacckkakwwwk',
    'kwwwkackkkakwwwk',
    'kwwwkaakkaakwwwk',
    'kWwwwkaaaakwwwWk',
    '.kkWwwkkkkwwWkk.',
    '...kkWwwwwWkk...',
    '.....kkkkkk.....',
  ],
  koi: [
    '......kkkk..........',
    '....kkwwrrkk......k.',
    '..kkwwrrrwwwkk...kak',
    '.kwwrrwwwwrrwwk.kaak',
    'kewwwwwrrwwwwwwkaaak',
    '.kwwwwwwwwrrwwk.kaak',
    '..kkwwwwwwwwkk...kak',
    '....kkWWWWkk......k.',
    '......kkkk..........',
  ],
  shoe: [
    '......kkkkk.......',
    '.....kwwwwak......',
    '....kwwkwkwak.....',
    '...kwwwkwkwwakkk..',
    'kkkwwwwwwwwwwwwwk.',
    'kaaawwwwwwwwaaawwk',
    'kwwwwwwwwwwwwwwwwk',
    'kGGGGGGGGGGGGGGGGk',
    '.kkkkkkkkkkkkkkkk.',
  ],
  pill: [
    '.......kkkk.',
    '......kccaak',
    '.....kcaaaak',
    '....kcaaaabk',
    '...kwkaaabk.',
    '..kwwwkabk..',
    '.kwwwwwkk...',
    'kwwwwwWk....',
    'kwwwwWk.....',
    'kWwwWk......',
    '.kkkk.......',
  ],
  bottle: [
    '...kkkk...',
    '...kyyk...',
    '...kkkk...',
    '...kwWk...',
    '...kwWk...',
    '..kwwwWk..',
    '.kwwwwwWk.',
    'kwwwwwwwWk',
    'kwkkkkkkWk',
    'kwkaaaakWk',
    'kwkawcakWk',
    'kwkacwakWk',
    'kwkaaaakWk',
    'kwkkkkkkWk',
    'kwwwwwwwWk',
    'kWwwwwwwWk',
    'kWWwwwwWWk',
    '.kkkkkkkk.',
  ],
  badge: [
    '......kk......',
    '....kkyykk....',
    '..kkyyyyyykk..',
    'kkyyykkkkyyykk',
    'kyyykaaaakyyyk',
    'kyykaccaabkyyk',
    'kyykaccaabkyyk',
    'kyykaaaabbkyyk',
    'kyyykaabbkyyyk',
    '.kyyykbbkyyyk.',
    '.kyyyykkyyyyk.',
    '..kyyyyyyyyk..',
    '...kkyyyykk...',
    '.....kyyk.....',
    '......kk......',
  ],
  planet: [
    '.......kkkkk.......',
    '.....kkcccaakk.....',
    '....kccaaaaaabk....',
    'kkk.kcaaaaaaabbk...',
    'kyykkkkaaaaabbbkkkk',
    '.kyyyyykkkkkkkyyyyk',
    '..kkcaayyyyyyyykkk.',
    '....kaaaabbkkkk....',
    '....kkabbbbbbk.....',
    '......kkkkkkk......',
  ],
}

export const ART_NAMES = Object.keys(ART)

export function artSize(name) {
  const rows = ART[name]
  return [rows[0].length, rows.length]
}

export function artColors(hue, pal, hair) {
  return {
    k: pack([14, 11, 22]), a: pack(hue), b: pack(mix(hue, [0, 0, 0], 0.45)), c: pack(mix(hue, [255, 255, 255], 0.5)),
    w: pack([238, 234, 242]), W: pack([176, 170, 196]), s: pack([236, 186, 156]), S: pack([186, 126, 110]),
    h: pack(mix(hair, [10, 8, 20], 0.55)), H: pack(mix(hair, [117, 114, 143], 0.35)), l: pack([255, 219, 185]), y: pack([255, 214, 90]), r: pack([255, 96, 120]),
    g: pack([168, 168, 188]), G: pack([82, 82, 104]), e: pack(mix(pal.neon[1 % pal.neon.length], [255, 255, 255], 0.2)),
  }
}

export function drawArt(b, name, x, y, colors, scale = 1, flip = false) {
  const rows = ART[name]
  const w = rows[0].length
  // an artist's PNG keeps its own colours instead of the billboard's hue
  const o = peekOverride(name, w, rows.length)
  if (o) {
    for (let ry = 0; ry < o.h; ry++) for (let rx = 0; rx < w; rx++) { const c = o.data[ry * w + (flip ? w - 1 - rx : rx)]; if (c >>> 24) b.rect(x + rx * scale, y + ry * scale, scale, scale, c) }
    return
  }
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < w; rx++) {
      const c = colors[row[flip ? w - 1 - rx : rx]]
      if (c) b.rect(x + rx * scale, y + ry * scale, scale, scale, c)
    }
  })
}

// ── lettering ────────────────────────────────────────────────────────────

const FONT = {
  A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110',
  C: '01110100011000010000100001000101110', D: '11110100011000110001100011000111110',
  E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000',
  G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001',
  I: '01110001000010000100001000010001110', J: '00111000100001000010000101001001100',
  K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001', N: '10001100011100110101100111000110001',
  O: '01110100011000110001100011000101110', P: '11110100011000111110100001000010000',
  Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001',
  S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100',
  U: '10001100011000110001100011000101110', V: '10001100011000110001100010101000100',
  W: '10001100011000110101101011010101010', X: '10001100010101000100010101000110001',
  Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111',
  0: '01110100011001110101110011000101110', 1: '00100011000010000100001000010001110',
  2: '01110100010000100010001000100011111', 3: '11110000010000101110000010000111110',
  4: '00010001100101010010111110001000010', 5: '11111100001111000001000011000101110',
  6: '00110010001000011110100011000101110', 7: '11111000010001000100010000100001000',
  8: '01110100011000101110100011000101110', 9: '01110100011000101111000010001001100',
  '!': '00100001000010000100001000000000100', '+': '00000001000010011111001000010000000',
  '-': '00000000000000011111000000000000000', '%': '11001110100001000100010000101110011',
  '.': '00000000000000000000000000110001100', '/': '00001000100001000100010001000010000',
  ' ': '00000000000000000000000000000000000',
}

export const bigW = (s) => s.length * 6 - 1

// 5x7 text; `outline` draws a 1px border around every letter.
export function drawBig(b, text, x, y, color, shadow, outline) {
  const lit = []
  let cx = x
  for (const ch of text) {
    const g = FONT[ch] || FONT[' ']
    for (let i = 0; i < 35; i++) if (g[i] === '1') lit.push([cx + (i % 5), y + Math.floor(i / 5)])
    cx += 6
  }
  if (outline) for (const [px, py] of lit) b.rect(px - 1, py - 1, 3, 3, outline)
  if (shadow) for (const [px, py] of lit) b.set(px + 1, py + 1, shadow)
  for (const [px, py] of lit) b.set(px, py, color)
}

// Faux kanji on an n×n grid: a radical structure split into parts, each
// filled with a few strokes. Deterministic per seed.
export function kanji(seed, n = 7) {
  const g = new Uint8Array(n * n)
  const set = (x, y) => { if (x >= 0 && y >= 0 && x < n && y < n) g[y * n + x] = 1 }
  const hline = (x0, x1, y) => { for (let x = x0; x <= x1; x++) set(x, y) }
  const vline = (x, y0, y1) => { for (let y = y0; y <= y1; y++) set(x, y) }
  const fill = (x0, y0, x1, y1, s) => {
    const kinds = 1 + Math.floor(hash(s, 1) * 3)
    for (let i = 0; i < kinds; i++) {
      const k = hash(s, i, 2)
      const w = x1 - x0, h = y1 - y0
      if (k < 0.3) hline(x0, x1, y0 + Math.round(hash(s, i, 3) * h))
      else if (k < 0.55) vline(x0 + Math.round(hash(s, i, 4) * w), y0, y1)
      else if (k < 0.7) { hline(x0, x1, y0); vline(x0, y0, y1); vline(x1, y0, y1); hline(x0, x1, y1) }     // box
      else if (k < 0.85) { for (let j = 0; j <= Math.min(w, h); j++) set(x1 - j, y0 + j) }                      // sweep
      else { set(x0 + 1, y0 + 1); set(x1 - 1, y0 + 1); hline(x0, x1, y1) }                                    // dots over a bar
    }
  }
  const m = n - 1
  const st = Math.floor(hash(seed, 9) * 4)
  if (st === 0) { const sx = 2 + Math.floor(hash(seed, 10) * 2); fill(0, 0, sx - 1, m, seed + 1); fill(sx + 1, 0, m, m, seed + 2) }
  else if (st === 1) { const sy = 2 + Math.floor(hash(seed, 10) * 2); fill(0, 0, m, sy - 1, seed + 1); fill(0, sy + 1, m, m, seed + 2) }
  else if (st === 2) { hline(0, m, 0); vline(0, 0, m); vline(m, 0, m); fill(2, 2, m - 2, m - 1, seed + 3) }
  else { hline(0, m, Math.floor(n / 2)); vline(Math.floor(n / 2), 0, m); fill(0, 0, m, m, seed + 4) }
  return g
}

export function drawKanji(b, seed, x, y, color, n = 7, core) {
  const g = kanji(seed, n)
  for (let i = 0; i < g.length; i++) {
    if (!g[i]) continue
    b.set(x + (i % n), y + Math.floor(i / n), core && (i * 7 + seed) % 5 === 0 ? core : color)
  }
}
