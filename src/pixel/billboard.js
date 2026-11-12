// City advertising. A billboard is a mount (rooftop board, round sign, holo
// projection, cloth banner or LED ticker) carrying one or two ads: a product or mascot sprite, a
// brand, a slogan and a background treatment. specFor() decides the shape from
// a seed alone; bakeBillboard() paints it with the current palette; the view
// animates tickers, holos and ad rotation on top.
import { PixelBuffer, pack, mix, hash, dither } from './pixels.js'
import { drawText, outlined } from './sprites.js'
import { artSize, artColors, drawArt, drawBig, bigW, drawKanji } from './art.js'

export const ADS = [
  { brand: 'NEON COLA', tag: 'STAY AWAKE', art: 'can' },
  { brand: 'RAMEN 24', tag: 'HOT NOW', art: 'bowl' },
  { brand: 'HELIX', tag: 'SEE MORE', art: 'face' },
  { brand: 'LUCKY', tag: 'LOANS 0%', art: 'cat' },
  { brand: 'ICE KILLS', tag: 'VIRA GUARD', art: 'skull' },
  { brand: 'WATCHER', tag: 'WE SEE YOU', art: 'eye' },
  { brand: 'CALM+', tag: 'FEEL NOTHING', art: 'pill' },
  { brand: 'KOI BANK', tag: 'GROW', art: 'koi' },
  { brand: 'KITE', tag: 'RUN FASTER', art: 'shoe' },
  { brand: 'MARS', tag: 'NEW COLONY', art: null, bg: 'sunset' },
  { brand: 'ORBIT AIR', tag: 'FLY HIGH', art: 'planet' },
  { brand: 'SYNTH', tag: 'UPGRADE NOW', art: 'face' },
  { brand: 'OKAMI', tag: 'SAKE', art: 'bottle' },
  { brand: 'NEXA', tag: 'TRUST US', art: 'eye' },
  { brand: 'OBEY', tag: 'CURFEW 22.00', art: 'badge' },
  { brand: 'CITIZEN', tag: 'SCORE 742', art: 'badge' },
]
const BGS = ['plain', 'bands']
// LED news crawls. Each channel has a badge, a colour and its own feed;
// market items are [symbol, change] and get an up or down arrow.
export const CHANNELS = [
  { label: 'CH9', color: [96, 206, 255], feed: ['CURFEW 22.00', 'RAIN 80%', 'BLACKOUT SECTOR 7', 'WATER RATION -20%', 'TRANSIT DELAYED', 'AIR INDEX 312'] },
  { label: '!!!', color: [255, 72, 64], feed: ['REPORT UNLICENSED RUNNERS', 'STAY INDOORS', 'CITIZEN SCORE AUDIT', 'ID CHECK AHEAD', 'DRONE PATROL ACTIVE'] },
  { label: 'NKO', color: [120, 236, 132], feed: [['NKO', 3.2], ['HLX', -1.4], ['KOI', 0.8], ['SYN', -6.1], ['NEXA', 12.5], ['ORB', -0.3]] },
  { label: 'PSA', color: [255, 196, 84], feed: ['SLEEP IS OPTIONAL', 'YOUR DATA OUR FUTURE', 'OBEY THE CURFEW', 'HAPPY WORKERS', 'TRUST THE GRID'] },
]

// Which mounts appear where, with weights.
const KINDS = {
  far: [['board', 3], ['holo', 2], ['round', 1], ['banner', 1]],
  near: [['board', 3], ['holo', 2], ['round', 1], ['banner', 2], ['ticker', 1]],
  facade: [['board', 1]],
  roof: [['board', 3], ['round', 1]],
}

function weighted(list, h) {
  const total = list.reduce((s, [, w]) => s + w, 0)
  let x = h * total
  for (const [k, w] of list) { if ((x -= w) < 0) return k }
  return list[0][0]
}

const adFor = (seed) => ({
  ...ADS[Math.floor(hash(seed, 1) * ADS.length)],
  hue: Math.floor(hash(seed, 2) * 16),
  bgStyle: BGS[Math.floor(hash(seed, 3) * BGS.length)],
  layout: Math.floor(hash(seed, 4) * 3),
  flip: hash(seed, 5) < 0.5,
  seed,
})

// Shape of a billboard from its seed and placement: kind and pixel size.
export function specFor(seed, place) {
  const r = (k) => hash(seed, k, 71)
  const kind = weighted(KINDS[place], r(1))
  const big = place === 'roof' || place === 'facade' ? 2 : place === 'near' ? 1 : 0
  const s = { kind, seed, place, ads: [adFor(seed * 3 + 1), adFor(seed * 3 + 2)] }
  if (kind === 'board') {
    s.pw = [54, 84, 112][big] + Math.floor(r(2) * [8, 12, 10][big])
    s.ph = [25, 36, 42][big] + Math.floor(r(3) * 4)
    s.legs = place === 'facade' ? 0 : [8, 10, 14][big]
    s.w = s.pw + 4; s.h = s.ph + 7 + s.legs
  } else if (kind === 'round') {
    s.r = [8, 11, 13][big]
    s.pole = place === 'facade' ? 0 : [8, 12, 18][big]
    s.w = s.r * 2 + 2 + (place === 'facade' ? 6 : 0); s.h = s.r * 2 + 2 + s.pole
  } else if (kind === 'holo') {
    s.w = big ? 44 : 32; s.h = big ? 30 : 22
  } else if (kind === 'banner') {
    s.glyphs = 3 + Math.floor(r(4) * (big ? 3 : 2))
    s.kanji = r(5) < 0.55
    s.w = 13; s.h = s.glyphs * 9 + 10
  } else if (kind === 'ticker') {
    s.channel = Math.floor(r(7) * CHANNELS.length)
    const feed = CHANNELS[s.channel].feed, start = Math.floor(r(9) * feed.length)
    s.items = [0, 1, 2].map((i) => feed[(start + i) % feed.length])
    s.w = place === 'facade' ? 70 + Math.floor(r(8) * 40) : 46 + Math.floor(r(8) * 18); s.h = 16
    s.badge = 15
    s.screen = [s.badge + 1, 4, s.w - s.badge - 2, 9]                // x, y, w, h of the LED field

  }
  return s
}

const BOARD_THEMES = {
  can: [[226, 238, 84], [35, 28, 51]],
  face: [[127, 214, 230], [20, 38, 56]],
  bowl: [[255, 177, 88], [66, 27, 36]],
  cat: [[245, 204, 118], [47, 41, 63]],
  skull: [[236, 119, 131], [42, 28, 48]],
  eye: [[169, 195, 235], [28, 32, 62]],
  pill: [[180, 216, 169], [27, 49, 51]],
  koi: [[246, 166, 130], [36, 49, 61]],
  shoe: [[238, 152, 94], [38, 29, 52]],
  planet: [[137, 196, 233], [28, 30, 64]],
  bottle: [[232, 112, 96], [40, 26, 38]],
  badge: [[240, 92, 84], [24, 26, 40]],
}
const THEME_PLAIN = [[236, 210, 165], [46, 32, 56]]
// A second, contrasting colour per campaign for bursts, washes and stickers.
const POP = {
  can: [255, 90, 160], face: [236, 96, 180], bowl: [255, 230, 120], cat: [255, 100, 110],
  skull: [140, 240, 200], eye: [255, 160, 70], pill: [255, 120, 170], koi: [100, 200, 230],
  shoe: [120, 220, 255], planet: [255, 140, 200], bottle: [255, 214, 120], badge: [90, 170, 255],
}
const STICKERS = ['NEW', '24H', 'HOT', 'NOW', 'TRY', 'ONLY']

// Match the visible campaign, including the roof board rotation.
export function billboardLight(s, pal, time = 0) {
  const period = 12 + hash(s.seed, 78) * 6
  const frame = s.place === 'facade' ? 0 : Math.floor(time / period + hash(s.seed, 79)) & 1
  const ad = s.ads[frame]
  if (s.kind === 'ticker') return CHANNELS[s.channel].color
  return s.kind === 'board' ? (BOARD_THEMES[ad.art] ?? THEME_PLAIN)[0] : inks(ad, pal).hue
}

// ── palettes ─────────────────────────────────────────────────────────────

// Signs ask for their inks every frame (for the light they throw), so the
// result is kept per ad and palette.
const inkCache = new WeakMap()

export function inks(a, pal) {
  const hit = inkCache.get(a)
  if (hit?.pal === pal) return hit.inks
  const c = inksFor(a, pal)
  inkCache.set(a, { pal, inks: c })
  return c
}

function inksFor(a, pal) {
  const hue = mix(pal.neon[a.hue % pal.neon.length], [148, 163, 177], 0.2)
  const other = mix(pal.neon[(a.hue + 1) % pal.neon.length], hue, 0.65)
  return {
    hue, other,
    glow: pack(hue),
    ink: pack(mix(hue, [255, 255, 255], 0.82)),
    shade: pack(mix(hue, [0, 0, 0], 0.8)),
    dark: pack(mix(hue, [8, 6, 16], 0.82)),
    top: mix(hue, [8, 6, 16], 0.76),
    bottom: mix(hue, [8, 6, 16], 0.88),
    art: artColors(hue, pal, other),
  }
}

const METAL = (pal) => pack(mix(pal.shadow, [46, 44, 60], 0.5))
const METAL_L = (pal) => pack(mix(pal.shadow, [96, 94, 116], 0.5))
const smallW = (s) => s.length * 4 - 1

// Crisp luminous cores with a colored falloff baked into the sign's panel.
// Take the strongest contribution so neighbouring strokes keep their gaps.
function neon(b, source, x, y, hue) {
  const glow = new Float32Array(b.w * b.h)
  for (let sy = 0; sy < source.h; sy++) for (let sx = 0; sx < source.w; sx++) {
    if (!(source.get(sx, sy) >>> 24)) continue
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const distance = Math.hypot(dx, dy)
      if (distance > 3) continue
      const px = x + sx + dx, py = y + sy + dy
      if (px < 0 || py < 0 || px >= b.w || py >= b.h) continue
      const i = py * b.w + px
      glow[i] = Math.max(glow[i], distance < 1.1 ? 0.55 : distance < 2.1 ? 0.23 : 0.08)
    }
  }
  for (let i = 0; i < glow.length; i++) if (glow[i]) {
    const c = b.data[i]
    b.data[i] = pack(mix([c & 255, (c >>> 8) & 255, (c >>> 16) & 255], hue, glow[i]))
  }
  const core = pack(mix(hue, [255, 255, 255], 0.86))
  for (let sy = 0; sy < source.h; sy++) for (let sx = 0; sx < source.w; sx++) {
    if (source.get(sx, sy) >>> 24) b.set(x + sx, y + sy, core)
  }
}

// ── ad panel ─────────────────────────────────────────────────────────────

function background(b, a, c, x, y, w, h) {
  const style = a.bg ?? a.bgStyle
  const t = pack(c.top), m = pack(mix(c.top, c.bottom, 0.5)), d = pack(c.bottom)
  if (style === 'sunset') {
    const sky = [mix(c.hue, [20, 8, 40], 0.75), mix(c.hue, [20, 8, 40], 0.5), mix(c.hue, [255, 200, 120], 0.15)]
    const horizon = y + Math.floor(h * 0.62)
    for (let yy = y; yy < horizon; yy++) b.rect(x, yy, w, 1, pack(sky[Math.min(2, Math.floor((yy - y) / (horizon - y) * 3))]))
    const sun = pack([255, 214, 120]), cx = x + Math.floor(w * 0.7), r = Math.floor(h * 0.3)
    for (let yy = -r; yy <= 0; yy++) for (let xx = -r; xx <= r; xx++) {
      if (xx * xx + yy * yy <= r * r && !(yy > -r * 0.6 && (yy & 1))) b.set(cx + xx, horizon - 1 + yy, sun)
    }
    for (let xx = 0; xx < w; xx++) {                               // mountains
      const mh = Math.max(1, Math.round(3 + 3 * Math.abs(Math.sin(xx * 0.21 + a.hue)) + 2 * Math.sin(xx * 0.07)))
      b.rect(x + xx, horizon - mh, 1, mh, pack(mix(c.hue, [10, 6, 20], 0.7)))
    }
    b.rect(x, horizon, w, y + h - horizon, pack(mix(c.hue, [10, 6, 20], 0.86)))
    const grid = pack(mix(c.hue, [10, 6, 20], 0.3))
    for (let yy = horizon, k = 1; yy < y + h; yy += k, k++) b.rect(x, yy, w, 1, grid)
    for (let i = -6; i <= 6; i++) {
      const x0 = x + (w >> 1) + i * 3, x1 = x + (w >> 1) + i * 12
      for (let yy = horizon; yy < y + h; yy++) {
        const px = Math.round(x0 + (x1 - x0) * (yy - horizon) / Math.max(1, y + h - 1 - horizon))
        if (px >= x && px < x + w) b.set(px, yy, grid)
      }
    }
    return
  }
  if (style === 'plain') { b.rect(x, y, w, h, d); return }
  const bands = [t, m, d]
  for (let yy = 0; yy < h; yy++) b.rect(x, y + yy, w, 1, bands[Math.min(2, Math.floor((yy / h) * 3))])
}

function paintAd(b, a, pal, x, y, w, h, skyline) {
  if (skyline) { paintSmall(b, a, pal, x, y, w, h); return }
  // Printed campaigns have their own brand colors. District lighting nudges
  // the paper and frame, instead of turning every ad into the same dark UI.
  const [accent, ground] = BOARD_THEMES[a.art] ?? THEME_PLAIN
  const base = mix(ground, pal.shadow, 0.12)
  const paper = mix([241, 235, 220], pal.light, 0.06)
  const copy = pack(paper), secondary = pack(mix(paper, accent, 0.4))
  b.rect(x, y, w, h, pack(base))
  const [aw, ah] = a.art ? artSize(a.art) : [0, 0]
  const sc = a.art && ah * 2 <= h - 6 ? 2 : 1
  const heroW = a.art ? Math.max(32, aw * sc + 10) : 0
  if (a.art) {
    b.rect(x, y, heroW, h, pack(mix(base, accent, 0.22)))
    b.rect(x + heroW - 1, y, 1, h, pack(mix(base, accent, 0.42)))
    const art = artColors(accent, pal, [70, 58, 83])
    art.e = pack(paper)
    drawArt(b, a.art, x + Math.floor((heroW - aw * sc) / 2), y + Math.floor((h - ah * sc) / 2), art, sc)
    b.rect(x + 5, y + h - 3, heroW - 10, 1, pack(mix(base, accent, 0.38)))
  }
  const tx = x + heroW + 6, room = w - heroW - 12
  const lines = a.art === 'can' ? a.brand.split(' ') : bigW(a.brand) <= room ? [a.brand] : a.brand.split(' ')
  const fontScale = Math.max(...lines.map(bigW)) * 2 <= room ? 2 : 1
  const lineH = 7 * fontScale
  const titleH = lines.length * (lineH + 2) - 2
  const tagFits = smallW(a.tag) <= room && titleH + 14 <= h - 4
  const totalH = titleH + (tagFits ? 10 : 0)
  const ty = y + Math.floor((h - totalH) / 2) - 1
  lines.forEach((line, i) => {
    if (bigW(line) <= room) {
      const glyphs = new PixelBuffer(bigW(line), 7)
      drawBig(glyphs, line, 0, 0, copy)
      const title = new PixelBuffer(glyphs.w * fontScale, 7 * fontScale)
      for (let yy = 0; yy < glyphs.h; yy++) for (let xx = 0; xx < glyphs.w; xx++) {
        if (glyphs.get(xx, yy) >>> 24) title.rect(xx * fontScale, yy * fontScale, fontScale, fontScale, copy)
      }
      neon(b, title, tx, ty + i * (lineH + 2), accent)
    } else drawText(b, line.slice(0, Math.floor((room + 1) / 4)), tx, ty + i * (lineH + 2), copy)
  })
  if (tagFits) drawText(b, a.tag, tx, ty + titleH + 5, secondary)
  const tube = new PixelBuffer(Math.min(room, 22), 1)
  tube.rect(0, 0, tube.w, 1, pack(accent))
  neon(b, tube, tx, y + h - 4, accent)

}

// ── small skyline boards ─────────────────────────────────────────────────
// Seen from blocks away, so they lean on one strong shape: a hero sprite, a
// colour block and a short line of copy. Each ad is a backlit screen
// (scanlines, glowing type) on a dark or brand-flooded field, and picks one of three
// layouts. Grime and graffiti come from the seed.

const firstFit = (list, room, width) => list.find((t) => t && width(t) <= room)

function wrap(text, room, width = smallW) {
  const lines = []
  for (const word of text.split(' ')) {
    const last = lines.length - 1
    if (last >= 0 && width(`${lines[last]} ${word}`) <= room) lines[last] += ` ${word}`
    else if (width(word) <= room) lines.push(word)
    else break
  }
  return lines
}

// Slogan lines in the 5x7 face when the whole slogan fits the box, else 3x5.
function slogan(b, text, x, y, room, height, color) {
  const big = wrap(text, room, bigW)
  const useBig = big.join(' ') === text && big.length * 9 - 2 <= height
  const lines = useBig ? big : wrap(text, room)
  const step = useBig ? 9 : 6
  let ty = y
  for (const line of lines) {
    if (ty + step - 1 > y + height) break
    if (useBig) drawBig(b, line, x, ty, color); else drawText(b, line, x, ty, color)
    ty += step
  }
  return ty
}

// Rows a cropped sprite keeps in view, so a portrait keeps its eyes.
const FOCUS = { face: 9 }

// Sprite centred in a box and cropped to it, so tall portraits read as close-ups.
function artIn(b, name, x, y, w, h, colors, flip) {
  const [aw, ah] = artSize(name)
  const clip = new PixelBuffer(w, h)
  const top = ah <= h ? (h - ah) >> 1 : Math.max(h - ah, Math.min(0, (h >> 1) - (FOCUS[name] ?? ah >> 1)))
  drawArt(clip, name, (w - aw) >> 1, top, colors, 1, flip)
  b.blit(clip, x, y)
}

// Alternating wedges radiating from (cx, cy), filling a box.
function rays(b, cx, cy, x0, y0, w, h, c1, c2, n = 10) {
  for (let py = y0; py < y0 + h; py++) for (let px = x0; px < x0 + w; px++) {
    const k = Math.floor((Math.atan2(py - cy, px - cx) + Math.PI) / (2 * Math.PI) * n * 2)
    b.set(px, py, k & 1 ? c1 : c2)
  }
}

// A round promo sticker with a short word on it.
function sticker(b, x, y, text, color, ink) {
  const w = smallW(text) + 5, r = (w >> 1) + 0.5
  b.disc(x + r, y + r - 1, r + 1, pack(mix(color, [0, 0, 0], 0.5)))
  b.disc(x + r, y + r - 1, r, pack(color))
  drawText(b, text, x + 3, y + Math.round(r) - 3, ink)
}

function kanjiColumn(b, seed, x, y, h, color) {
  for (let i = 0, gy = y; gy + 5 <= y + h; i++, gy += 7) drawKanji(b, seed * 7 + i, x, gy, color, 5)
}

function paintSmall(b, a, pal, x, y, w, h) {
  const r = (k) => hash(a.seed, k, 33)
  const [accent, ground] = BOARD_THEMES[a.art] ?? THEME_PLAIN
  const near = w >= 80
  // every board is a backlit display: a dark one, or one flooded with the brand colour
  const bg = r(1) < 0.45 ? mix(accent, pal.shadow, 0.7) : mix(ground, pal.shadow, 0.15)
  const copy = mix(accent, [255, 255, 255], 0.75)
  const pop = POP[a.art] ?? [255, 120, 170]
  const quiet = mix(pop, bg, 0.3)
  const ink = pack(mix(ground, [0, 0, 0], 0.4))
  const stick = STICKERS[Math.floor(r(20) * STICKERS.length)]
  const art = artColors(accent, pal, [70, 58, 83])
  art.e = pack(mix(accent, [255, 255, 255], 0.6))
  const [aw, ah] = a.art ? artSize(a.art) : [0, 0]
  const title = (room) => firstFit([a.brand, a.brand.split(' ')[0]], room, smallW)
  const titleBig = (room) => firstFit([a.brand, a.brand.split(' ')[0]], room, bigW)
  const lit = (text, tx, ty, big) => {
    const g = new PixelBuffer(big ? bigW(text) : smallW(text), big ? 7 : 5)
    if (big) drawBig(g, text, 0, 0, pack(copy)); else drawText(g, text, 0, 0, pack(copy))
    if (a.bg === 'sunset') b.blit(outlined(g, pack(mix(ground, [0, 0, 0], 0.5))), tx - 1, ty - 1)
    neon(b, g, tx, ty, accent)
  }

  if (a.bg === 'sunset') background(b, a, inks(a, pal), x, y, w, h)
  else {
    b.rect(x, y, w, h, pack(bg))
    for (let yy = 0; yy < h; yy++) {                                 // a banded wash of the pop colour from the top
      const t = Math.round((1 - yy / h) * 3) / 3
      b.rect(x, y + yy, w, 1, pack(mix(bg, pop, t * 0.2)))
    }
    for (let yy = 0; yy < h; yy++) {                                 // backlight falloff
      const t = Math.abs(yy / h - 0.4)
      if (t > 0.3) b.rect(x, y + yy, w, 1, pack(mix(bg, [0, 0, 0], (t - 0.3) * 0.8)))
    }
  }
  // far boards are too small for the product stack unless the brand fits beside the sprite
  const farProduct = a.art && smallW(a.brand.split(' ')[0]) <= w - Math.min(aw + 6, Math.floor(w * 0.45)) - 6
  const layout = !a.art ? 2 : a.layout === 1 && (near || farProduct) ? 1 : 0
  let tagArea = null                                                  // where graffiti may land

  if (layout === 0) {
    // poster: hero sprite on a halo, brand on a solid strip along the bottom
    const brandBig = firstFit([a.brand, a.brand.split(' ')[0]], w - 4, bigW)
    const strip = brandBig ? 9 : 7, artH = h - strip
    const ax = a.flip ? x + 2 : x + w - Math.min(aw, Math.floor(w * 0.55)) - 2
    const boxW = Math.min(aw, Math.floor(w * 0.55))
    const cx = ax + (boxW >> 1), cy = y + (artH >> 1)
    const rx0 = Math.max(x, ax - 8), rx1 = Math.min(x + w, ax + boxW + 8)
    rays(b, cx, cy, rx0, y, rx1 - rx0, artH, pack(mix(bg, pop, 0.3)), pack(mix(bg, accent, 0.2)))
    b.rect(a.flip ? rx1 : rx0 - 1, y, 1, artH, pack(mix(bg, pop, 0.5)))
    b.disc(cx + 0.5, cy + 0.5, Math.min(artH, boxW) * 0.42 + 1, pack(mix(bg, accent, 0.35)))
    artIn(b, a.art, ax, y + 1, boxW, artH - 1, art, a.flip)
    tagArea = [ax, y + 2, boxW, artH - 4]
    b.rect(x, y + artH, w, strip, pack(accent))
    b.rect(x, y + artH, w, 1, pack(mix(accent, [255, 255, 255], 0.4)))
    if (brandBig) drawBig(b, brandBig, x + 2, y + artH + 1, ink)
    else if (title(w - 4)) drawText(b, title(w - 4), x + 2, y + artH + 1, ink)
    // a promo sticker slapped on the end of the strip, if the brand leaves room; else hazard slashes
    const brandEnd = x + 2 + (brandBig ? bigW(brandBig) : smallW(title(w - 4) ?? ''))
    const sw = smallW(stick) + 7
    if (near && brandEnd < x + w - sw - 3) sticker(b, x + w - sw - 2, y + artH - 6, stick, pop, ink)
    else for (let i = 0; i < 3; i++) b.line(x + w - 12 + i * 4, y + artH - 1, x + w - 8 + i * 4, y + artH - 5, pack(pop))
    const side = a.flip ? x + boxW + 4 : x + 2, room = w - boxW - 6
    const ty = artH >= 12 ? slogan(b, a.tag, side, y + 2, room, artH - 3, pack(copy)) : y + 2
    if (ty > y + 2) b.rect(side, ty - 1, Math.min(room, 18), 1, pack(pop))
    if (room >= 5) kanjiColumn(b, a.seed, a.flip ? x + w - 7 : side, ty + 1, y + artH - ty - 2, pack(quiet))
  } else if (layout === 1) {
    // product: hero panel on one side, copy stack and a kanji rail on the other
    const heroW = Math.min(aw + 6, Math.floor(w * 0.45))
    const hx = a.flip ? x + w - heroW : x
    const hero = mix(bg, accent, 0.25)
    rays(b, hx + (heroW >> 1), y + (h >> 1), hx, y, heroW, h, pack(hero), pack(mix(hero, pop, 0.35)), 8)
    b.rect(a.flip ? hx : hx + heroW - 1, y, 1, h, pack(mix(bg, pop, 0.7)))
    artIn(b, a.art, hx + 1, y + 1, heroW - 2, h - 2, art, a.flip)
    if (near) sticker(b, a.flip ? x + w - smallW(stick) - 7 : x + 1, y + h - 12, stick, pop, ink)
    tagArea = [hx, y + (h >> 1), heroW, h >> 1]
    const rail = near ? 8 : 0
    const cx = a.flip ? x + 3 + rail : x + heroW + 3, room = w - heroW - 6 - rail
    const big = titleBig(room)
    const t = big || title(room)
    let ty = y + (near ? 4 : 2)
    if (t) { lit(t, cx, ty, !!big); ty += big ? 10 : 7 }
    ty = slogan(b, a.tag, cx, ty, room, y + h - 2 - ty, pack(mix(copy, accent, 0.45)))
    const bar = new PixelBuffer(Math.min(room, 14), 1); bar.rect(0, 0, bar.w, 1, pack(pop))
    if (ty <= y + h - 5) neon(b, bar, cx, y + h - 4, pop)
    if (rail) {
      const rx = a.flip ? x + 1 : x + w - rail
      b.rect(rx, y, rail - 1, h, pack(mix(mix(bg, pop, 0.25), [0, 0, 0], 0.3)))
      kanjiColumn(b, a.seed, rx + 1, y + 3, h - 5, pack(mix(pop, [255, 255, 255], 0.3)))
    }
  } else {
    // type: the brand alone in big glowing letters, slogan in an inverted tab
    const big = titleBig(w - 6), t = big || title(w - 6)
    const tw = big ? bigW(t) : smallW(t)
    const ty = y + Math.max(2, Math.floor(h * 0.18))
    lit(t, x + ((w - tw) >> 1), ty, !!big)
    const gy = ty + (big ? 10 : 7)
    const tagBig = h >= 30 && firstFit([a.tag], w - 8, bigW)
    const tag = tagBig || firstFit([a.tag, a.tag.split(' ')[0]], w - 8, smallW)
    const tw2 = tagBig ? bigW(tag) : smallW(tag ?? ''), th = tagBig ? 9 : 7
    if (tag && gy + th <= y + h) {
      const tx = x + ((w - tw2) >> 1), ink = pack(mix(ground, [0, 0, 0], 0.4))
      b.rect(tx - 2, gy - 1, tw2 + 4, th, pack(accent))
      if (tagBig) drawBig(b, tag, tx, gy, ink); else drawText(b, tag, tx, gy, ink)
    }
    if (h >= 26) for (let i = 0, n = Math.floor((w - 8) / 7); i < n; i++) drawKanji(b, a.seed * 3 + i, x + 4 + i * 7, y + h - 7, pack(quiet), 5)
    if (h >= 26) tagArea = [x, y + h - 9, w, 8]
  }

  // wear: scanlines, a dead LED module, sometimes a graffiti tag
  for (let yy = y + 1; yy < y + h; yy += 2) for (let xx = x; xx < x + w; xx++) {
    const v = b.get(xx, yy)
    b.set(xx, yy, pack(mix([v & 255, (v >>> 8) & 255, (v >>> 16) & 255], [0, 0, 0], 0.1)))
  }
  if (tagArea && r(2) < 0.45) {
    const [ax, ay, aw2, ah2] = tagArea, dw = Math.min(aw2, 3 + Math.floor(r(3) * 4)), dh = Math.min(ah2, 2 + Math.floor(r(4) * 3))
    b.rect(ax + Math.floor(r(5) * (aw2 - dw)), ay + Math.floor(r(6) * (ah2 - dh)), dw, dh, pack(mix(bg, [0, 0, 0], 0.6)))
  }
  if (tagArea && tagArea[2] >= 14 && r(7) < 0.35) {
    const [ax, ay, aw2, ah2] = tagArea
    const spray = pack(pal.neon[Math.floor(r(8) * pal.neon.length)])
    const gx = ax + 1 + Math.floor(r(9) * (aw2 - 13)), gy = ay + Math.min(ah2 - 3, 2 + Math.floor(r(6) * ah2))
    for (let i = 0; i < 12; i++) b.set(gx + i, gy + Math.round(Math.sin(i * 1.3 + a.seed) * 2), spray)
    b.line(gx + 2, gy - 2, gx + 4, gy + 3, spray); b.line(gx + 8, gy + 3, gx + 11, gy - 2, spray)
  }
}

// ── tickers ──────────────────────────────────────────────────────────────

const ARROW = { up: ['00100', '01110', '11111'], down: ['11111', '01110', '00100'] }

// The lit crawl: every feed item in its own colour, diamonds between them,
// led in by a blank screen's width so text enters from the right.
function bakeTickerStrip(s) {
  const ch = CHANNELS[s.channel], lead = s.screen[2]
  const pieces = []
  const light = mix(ch.color, [255, 255, 255], 0.55)
  for (const item of s.items) {
    if (Array.isArray(item)) {
      const [sym, d] = item, up = d >= 0
      const tone = up ? [120, 236, 132] : [255, 84, 76]
      pieces.push([sym, [230, 236, 244]], [up ? 'up' : 'down', tone], [`${up ? '+' : ''}${d.toFixed(1)}%`, tone])
    } else pieces.push([item, light])
    pieces.push(['sep', ch.color])
  }
  const width = (p) => p === 'sep' ? 7 : p === 'up' || p === 'down' ? 7 : bigW(p) + 4
  const strip = new PixelBuffer(lead + pieces.reduce((n, [p]) => n + width(p), 0), 7)
  let x = lead
  for (const [p, c] of pieces) {
    if (p === 'sep') { strip.rect(x + 1, 3, 3, 1, pack(c)); strip.rect(x + 2, 2, 1, 3, pack(c)) }
    else if (ARROW[p]) ARROW[p].forEach((row, ry) => { for (let i = 0; i < 5; i++) if (row[i] === '1') strip.set(x + i, 2 + ry, pack(c)) })
    else drawBig(strip, p, x, 0, pack(c))
    x += width(p)
  }
  return strip
}

// Glass over the LED field: a dot mask that breaks lit text into diodes,
// a soft glare, and sometimes a dead column.
function bakeTickerGlass(s) {
  const [sx, sy, sw, sh] = s.screen
  const b = new PixelBuffer(s.w, s.h)
  for (let y = sy; y < sy + sh; y++) for (let x = sx; x < sx + sw; x++) if ((x + y) & 1) b.set(x, y, pack([0, 0, 0], 70))
  for (let i = 0; i < 3; i++) b.line(sx + 6 + i, sy, sx + 6 + i - sh + 1, sy + sh - 1, pack([255, 255, 255], 18))
  if (hash(s.seed, 94) < 0.5) b.rect(sx + 4 + Math.floor(hash(s.seed, 95) * (sw - 8)), sy, 1 + Math.floor(hash(s.seed, 96) * 2), sh, pack([6, 6, 12], 230))
  return b
}

// Draw a ticker at time t. `get(frame)` returns baked frames as canvases.
export function drawTicker(ctx, s, get, x, y, t) {
  const [sx, sy, sw] = s.screen
  ctx.drawImage(get(0), x, y)
  const strip = get(1)
  let off = Math.floor(t * 20 + hash(s.seed, 79) * 500) % strip.width
  if (hash(Math.floor(t * 4), s.seed, 97) < 0.03) off = (off + 3) % strip.width          // signal hiccup
  const take = Math.min(sw, strip.width - off)
  ctx.drawImage(strip, off, 0, take, 7, x + sx, y + sy + 1, take, 7)
  if (take < sw) ctx.drawImage(strip, 0, 0, sw - take, 7, x + sx + take, y + sy + 1, sw - take, 7)
  ctx.drawImage(get(2), x, y)
  const ch = CHANNELS[s.channel]
  const on = s.channel === 1 ? Math.floor(t * 4) & 1 : Math.floor(t * 1.5 + s.seed) & 1
  ctx.fillStyle = `rgb(${on ? ch.color.join(',') : '40,20,24'})`
  ctx.fillRect(x + 2, y + sy + 7, 2, 1)
}

// ── mounts ───────────────────────────────────────────────────────────────

export function bakeBillboard(s, pal, frame) {
  const metal = METAL(pal), metalL = METAL_L(pal)
  const a = s.ads[frame & 1]

  if (s.kind === 'ticker' && frame === 1) return bakeTickerStrip(s)
  if (s.kind === 'ticker' && frame === 2) return bakeTickerGlass(s)
  const b = new PixelBuffer(s.w, s.h)

  if (s.kind === 'board') {
    const { pw, ph, legs } = s
    const shadow = pack(mix(pal.shadow, [6, 8, 15], 0.55))
    if (s.place === 'facade') {
      // Four wall brackets and a shadow along the lower/right frame edge.
      for (const lx of [4, s.w - 6]) b.rect(lx, 1, 2, ph + 6, metalL)
      b.rect(2, 5, s.w - 2, ph + 2, shadow)
    }
    for (const lx of [Math.floor(s.w * 0.2), Math.floor(s.w * 0.75)]) b.rect(lx, ph + 7, 2, legs, metal)
    b.rect(Math.floor(s.w * 0.2), ph + 7 + (legs >> 1), Math.floor(s.w * 0.55) + 2, 1, metal)
    if (legs) b.rect(0, ph + 8, s.w, 1, metalL)                             // catwalk
    b.rect(0, 3, s.w, ph + 4, metal)
    b.rect(0, 3, s.w, 1, metalL)
    b.rect(0, 4, 1, ph + 2, metalL)
    b.rect(s.w - 1, 4, 1, ph + 3, shadow)
    paintAd(b, a, pal, 2, 5, pw, ph, s.place === 'far' || s.place === 'near')
    const lamps = pw > 50 ? 3 : 2
    const c = inks(a, pal)
    const beam = pack(mix(c.top, [255, 244, 214], 0.3))
    for (let i = 0; i < lamps; i++) {
      const lx = 2 + Math.round((pw - 4) * (i + 0.5) / lamps)
      b.rect(lx - 1, 0, 3, 1, metal); b.rect(lx, 1, 1, 2, metal)
      b.set(lx, 2, pack([255, 244, 214]))
      for (let x = lx - 4; x <= lx + 4; x++) if (dither(x, 5, 0.5)) b.set(x, 5, beam)
    }
    return b
  }

  if (s.kind === 'round') {
    const r = s.r, side = s.place === 'facade' ? 6 : 0
    const cx = side + r + 1, cy = r + 1
    const c = inks(a, pal)
    if (s.pole) b.rect(cx - 1, cy + r, 3, s.pole + 1, metal)
    if (side) { b.rect(0, cy - 1, side + 2, 2, metal); b.rect(0, cy - 4, 2, 8, metalL) }
    b.disc(cx + 0.5, cy + 0.5, r + 1, metal)
    b.disc(cx + 0.5, cy + 0.5, r, c.glow)
    b.disc(cx + 0.5, cy + 0.5, r - 2, pack(c.bottom))
    for (let y = -r; y < 0; y++) for (let x = -r; x <= r; x++) {     // lit upper half
      if (x * x + y * y < (r - 2) ** 2 && dither(cx + x, cy + y, 0.4)) b.set(cx + x, cy + y, pack(c.top))
    }
    const room = r * 2 - 3
    const [aw, ah] = a.art ? artSize(a.art) : [99, 99]
    if (aw <= room && ah <= room) drawArt(b, a.art, cx - (aw >> 1), cy - (ah >> 1), c.art, 1, a.flip)
    else drawKanji(b, a.hue * 5 + s.seed, cx - 3, cy - 3, c.ink, 7)
    return b
  }

  if (s.kind === 'holo') {
    // a monochrome projection of the ad's sprite and brand; the view spins it
    const c = inks(a, pal)
    const tones = [pack(mix(c.hue, [255, 255, 255], 0.75)), pack(c.hue), pack(mix(c.hue, [0, 0, 0], 0.35))]
    const mono = {}
    for (const [k, v] of Object.entries(c.art)) {
      const l = (v & 255) * 0.3 + ((v >> 8) & 255) * 0.59 + ((v >> 16) & 255) * 0.11
      mono[k] = k === 'k' ? tones[2] : tones[l > 170 ? 0 : l > 90 ? 1 : 2]
    }
    const name = a.art ?? 'eye'
    const [aw, ah] = artSize(name)
    const sc = s.w >= aw * 2 + 2 && s.h >= ah * 2 + 8 ? 2 : 1
    drawArt(b, name, (s.w - aw * sc) >> 1, Math.max(0, s.h - 8 - ah * sc), mono, sc, a.flip)
    const word = a.brand.split(' ')[0]
    if (smallW(word) <= s.w) drawText(b, word, (s.w - smallW(word)) >> 1, s.h - 6, tones[0])
    for (let y = 1; y < s.h; y += 3) for (let x = 0; x < s.w; x++) if (b.get(x, y) >>> 24) b.set(x, y, tones[2])
    return b
  }

  if (s.kind === 'banner') {
    // cloth banner hung off a tower side, glyphs running down it
    const c = inks(a, pal)
    b.rect(0, 0, s.w, 2, metal)
    b.rect(1, 2, s.w - 2, s.h - 7, pack(c.bottom))
    b.rect(1, 2, 1, s.h - 7, c.glow); b.rect(s.w - 2, 2, 1, s.h - 7, c.glow)
    const letters = (a.brand.replace(/[^A-Z0-9]/g, '') + 'XXXXX')
    for (let i = 0; i < s.glyphs; i++) {
      const gy = 5 + i * 9
      if (s.kanji) drawKanji(b, s.seed * 11 + i, 3, gy, c.ink, 7, c.glow)
      else drawBig(b, letters[i], 4, gy, c.ink, c.shade)
    }
    for (let x = 1; x < s.w - 1; x += 2) b.rect(x, s.h - 5, 1, 2 + ((x >> 1) & 1) * 2, c.glow)    // tassels
    return b
  }

  if (s.kind === 'ticker') {
    const ch = CHANNELS[s.channel], [sx, sy, sw, sh] = s.screen
    const shadow = pack(mix(pal.shadow, [6, 8, 15], 0.55))
    for (const bx of [4, s.w - 6]) { b.rect(bx, 0, 2, 3, metal); b.set(bx, 0, metalL) }       // hangers
    b.rect(0, 2, s.w, 13, metal)
    b.rect(0, 2, s.w, 1, metalL)
    b.rect(0, 14, s.w, 1, shadow)
    for (const bx of [1, s.w - 2]) b.set(bx, 3, metalL)                                         // bolts
    // channel badge: label over a "live" lamp the view blinks
    b.rect(1, sy, s.badge - 1, sh, pack(mix(ch.color, pal.shadow, 0.2)))
    b.rect(1, sy, s.badge - 1, 1, pack(mix(ch.color, [255, 255, 255], 0.35)))
    drawText(b, ch.label, 1 + ((s.badge - 1 - smallW(ch.label)) >> 1), sy + 1, pack(mix(ch.color, [0, 0, 0], 0.8)))
    b.rect(2, sy + 7, s.badge - 3, 1, pack(mix(ch.color, [0, 0, 0], 0.7)))
    b.rect(s.badge, sy, 1, sh, shadow)
    // dark LED field with unlit diodes
    const field = mix(ch.color, [4, 4, 10], 0.9)
    b.rect(sx, sy, sw, sh, pack(field))
    for (let y = sy; y < sy + sh; y++) for (let x = sx; x < sx + sw; x++) if (!((x + y) & 1)) b.set(x, y, pack(mix(ch.color, [4, 4, 10], 0.8)))
    // power cable sagging off one end, rust under the bolts
    const cx = hash(s.seed, 91) < 0.5 ? 3 : s.w - 4, dir = cx < 8 ? 1 : -1
    for (let i = 0; i < 7; i++) b.set(cx + dir * i, 15 + (i > 1 && i < 6 ? 1 : 0), pack([18, 16, 26]))
    for (const bx of [1, s.w - 2]) if (hash(s.seed, bx, 92) < 0.6) b.rect(bx, 4, 1, 2 + Math.floor(hash(s.seed, bx, 93) * 4), pack(mix(pal.shadow, [120, 70, 50], 0.5)))
    return b
  }


  return b
}
