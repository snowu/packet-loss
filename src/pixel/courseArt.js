// The things on a roof that the runner has to do something about, drawn for
// the size they really are.
//
// The painted prop sheet has one crate and one pipe. Stretching the crate to
// a 9 px step, a 28 px locker and a 120 px machine room, and squeezing the
// pipe into a 6 px bar, left every obstacle soft and looking like the scenery
// behind it. These are drawn here instead, at the collision box they stand
// for, with one rule for the eye:
//
//   red lid, flat top   something to go over (vault, climb, land on)
//   red and white bar   something to go under (slide)
//
// Nothing behind the lane is allowed either signal (see ConceptView.recede).
//
// Everything is drawn in logical pixels on a grid of half pixels, the same
// density the painted artwork has on screen. No DOM here: `c` is any 2D
// context already scaled so that one unit is one logical pixel.
import { hash } from './pixels.js'

// Colours follow the painted kit: purple-grey steel under a warm key light.
const INK = '#140e1e', STEEL_D = '#39324a', STEEL = '#5d5372', STEEL_L = '#8b7fa3', STEEL_H = '#cfc4dc'
const STEEL_U = '#6c6183', STEEL_B = '#4d445f', PANEL = '#463d5a', RUST = '#a5562f', WARM = '#f0c389'
export const RED = '#ea3340'
const RED_D = '#8e1d2c', RED_L = '#ff8272', CREAM = '#f4ead8', CREAM_D = '#b9aac0', CYAN = '#56e6f2'

// How far artwork may reach outside its collision box, on every side.
export const BLEED = 2

const rect = (c, x, y, w, h, color) => { if (w > 0 && h > 0) { c.fillStyle = color; c.fillRect(x, y, w, h) } }

// Rust and grime: half-pixel specks, the same every time for the same seed.
function weather(c, seed, x, y, w, h, n) {
  for (let i = 0; i < n; i++) {
    const px = x + Math.floor(hash(seed, i, 41) * w * 2) / 2, py = y + Math.floor(hash(seed, i, 42) ** 0.6 * h * 2) / 2
    rect(c, px, py, hash(seed, i, 43) < 0.3 ? 1 : 0.5, 0.5, hash(seed, i, 44) < 0.55 ? RUST : STEEL_D)
  }
}

// The red lid every climbable thing wears: its top is where you put a hand
// or a foot, so it is the brightest, most saturated line on the object.
function lid(c, w, thick = 3) {
  rect(c, -1, 0, w + 2, thick, INK)
  rect(c, -0.5, 0.5, w + 1, thick - 1, RED)
  rect(c, -0.5, 0.5, w + 1, 0.5, RED_L)
  rect(c, 1, 0.5, Math.max(2, Math.round(w * 0.3)), 0.5, '#ffc2ae')   // where the key light catches it
  rect(c, -0.5, thick - 1, w + 1, 0.5, RED_D)
  // Corner fittings, so the lid reads as a made thing and not a stripe.
  rect(c, -0.5, 0.5, 1.5, thick - 1, RED_D); rect(c, w - 1, 0.5, 1.5, thick - 1, RED_D)
  rect(c, -0.5, 0.5, 1.5, 0.5, RED); rect(c, w - 1, 0.5, 1.5, 0.5, RED)
}

// A steel box face under a lid: outlined, lit from the upper left, darker
// toward the roof it stands on.
function face(c, x, y, w, h) {
  rect(c, x, y, w, h, INK)
  rect(c, x + 1, y, w - 2, h - 1, STEEL)
  const third = Math.max(1, Math.round((h - 2) * 0.3))
  rect(c, x + 1, y + 0.5, w - 2, third, STEEL_U)
  rect(c, x + 1, y + h - 1 - third, w - 2, third, STEEL_B)
  rect(c, x + 1, y, w - 2, 0.5, STEEL_D)             // shadow under the lid
  rect(c, x + 1, y + 0.5, w - 2, 0.5, STEEL_L)
  rect(c, x + 1, y + 0.5, 0.5, h - 2, STEEL_L)       // lit edge
  rect(c, x + w - 2, y + 0.5, 1, h - 1.5, STEEL_D)   // shaded edge
  rect(c, x + 1, y + h - 2, w - 2, 1, STEEL_D)
}

// Warning stripes in a lower corner, as on the painted crate.
function chevrons(c, x, y, n) {
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) rect(c, x + i * 2 + (2 - k) * 0.5, y + k * 0.5, 1, 0.5, k ? RED : RED_L)
}

const slats = (c, x, y, w, h) => { rect(c, x, y, w, h, INK); for (let r = 0.5; r < h - 0.5; r += 1) rect(c, x + 0.5, y + r, w - 1, 0.5, STEEL_D) }

// A low crate: run at it and vault.
function crate(c, w, h, seed) {
  lid(c, w)
  face(c, 0, 3, w, h - 3)
  if (h >= 10 && w >= 12) {
    // A recessed panel with a grab handle.
    rect(c, 3, 5, w - 6, h - 8, STEEL_D); rect(c, 3.5, 5.5, w - 7, h - 9, PANEL)
    rect(c, Math.round(w / 2) - 2, 6.5, 4, 0.5, STEEL_H); rect(c, Math.round(w / 2) - 2, 7, 4, 0.5, INK)
  } else if (w >= 8) rect(c, 2.5, Math.min(h - 3, 5.5), w - 5, 0.5, STEEL_D)
  // Corner posts.
  if (w >= 9) { rect(c, 1.5, 3.5, 1, h - 5, STEEL_L); rect(c, w - 3, 3.5, 1, h - 5, STEEL_D) }
  if (h >= 14 && w >= 18) chevrons(c, w - 10, h - 5, 3)
  weather(c, seed, 1, 4, w - 2, h - 6, Math.round(w * h / 28))
}

// A tall locker: needs a jump to get a hand on its lid.
function locker(c, w, h, seed) {
  lid(c, w)
  face(c, 0, 3, w, h - 3)
  // Two doors, each with a louvre and a latch.
  const mid = 3 + Math.round((h - 3) * 0.48)
  rect(c, 1, mid, w - 2, 0.5, INK); rect(c, 1, mid + 0.5, w - 2, 0.5, STEEL_L)
  for (const top of [5, mid + 2]) {
    const lh = Math.min(4, (top === 5 ? mid : h - 2) - top - 2)
    if (lh >= 2 && w >= 9) slats(c, 3, top, w - 6, lh)
  }
  rect(c, w - 3.5, mid - 2, 1, 1, CYAN)
  if (h - mid > 9) { rect(c, 2.5, h - 4, 3, 1, RED_D); rect(c, 3, h - 4, 1, 1, CREAM) }
  weather(c, seed, 1, 4, w - 2, h - 6, Math.round(w * h / 36))
}

// A machine room: too tall to vault. Climb it and run along the top.
function housing(c, w, h, seed) {
  lid(c, w, 3.5)
  face(c, 0, 3.5, w, h - 3.5)
  // Corrugated wall, in bays.
  for (let x = 3; x < w - 3; x += 2) rect(c, x, 5.5, 0.5, h - 9, x % 4 === 3 ? STEEL_D : STEEL_L)
  rect(c, 1, h - 3.5, w - 2, 2.5, STEEL_D); rect(c, 1, h - 3.5, w - 2, 0.5, STEEL_L)
  const bays = Math.max(1, Math.round(w / 34)), bay = (w - 6) / bays
  for (let i = 0; i < bays; i++) {
    const x = Math.round(3 + i * bay), bw = Math.round(bay) - 3, kind = Math.floor(hash(seed, i, 51) * 3)
    rect(c, x + bw + 1, 4, 1.5, h - 5, STEEL); rect(c, x + bw + 1, 4, 0.5, h - 5, STEEL_L); rect(c, x + bw + 2.5, 4, 0.5, h - 5, INK)
    if (kind === 0 && bw >= 14) {
      // A louvre bank.
      const lw = Math.min(bw - 4, 22), lh = Math.min(h - 16, 12)
      rect(c, x + 2, 8, lw, lh, PANEL); slats(c, x + 3, 9, lw - 2, lh - 2)
    } else if (kind === 1 && bw >= 12) {
      // A service door with a warning plate.
      const dh = Math.min(h - 10, 26)
      rect(c, x + 3, h - 3.5 - dh, 10, dh, INK); rect(c, x + 3.5, h - 3 - dh, 9, dh - 0.5, PANEL)
      rect(c, x + 3.5, h - 3 - dh, 9, 0.5, STEEL_L); rect(c, x + 10.5, h - 3.5 - dh / 2, 1, 2, STEEL_H)
      rect(c, x + 5.5, h - dh, 4, 3, WARM); rect(c, x + 7, h - dh + 0.5, 1, 1.5, INK)
    } else if (bw >= 10) {
      // A fan grille.
      const s = Math.min(bw - 4, h - 16, 12)
      rect(c, x + 2, 8, s, s, INK); rect(c, x + 2.5, 8.5, s - 1, s - 1, STEEL_D)
      rect(c, x + 2 + s / 2 - 0.5, 9, 1, s - 2, STEEL); rect(c, x + 3, 8 + s / 2 - 0.5, s - 2, 1, STEEL)
      rect(c, x + 2 + s / 2 - 1, 8 + s / 2 - 1, 2, 2, STEEL_L)
    }
  }
  // Rungs up the face you arrive at: this one is climbed.
  if (h >= 20) for (let y = 7; y < h - 5; y += 3) { rect(c, 1.5, y, 2.5, 0.5, STEEL_H); rect(c, 1.5, y + 0.5, 2.5, 0.5, INK) }
  weather(c, seed, 1, 5, w - 2, h - 8, Math.round(w * h / 60))
}

// sub: 'vent' (low crate), 'highbox' (locker), 'housing' (machine room).
// Origin is the top-left corner of the collision box, w by h logical pixels.
export function drawBlock(c, sub, w, h, seed = 0) {
  if (sub === 'housing') housing(c, w, h, seed)
  else if (sub === 'highbox') locker(c, w, h, seed)
  else crate(c, w, h, seed)
}

// The overhead pipe you slide under. The collision box is the pipe itself:
// w by h, its underside `drop` pixels above the roof. It is wrapped in red
// and white barrier tape, the one object in the game that is, and it is the
// lightest thing in the lane. It stands on two thin legs at the sides of the
// lane, so the gap under it reads as open.
export function drawPipe(c, w, h, drop, seed = 0) {
  const stands = w >= 14 ? [1.5, w - 3] : [Math.round(w / 2) - 0.5]
  for (const x of stands) {
    rect(c, x - 0.5, h - 1, 2.5, drop + 1, INK); rect(c, x, h, 1.5, drop - 0.5, STEEL); rect(c, x, h, 0.5, drop - 0.5, STEEL_L)
    rect(c, x, h, 1.5, 1.5, STEEL_D)                                   // in the pipe's shadow
    rect(c, x - 1.5, h + drop - 2, 4.5, 2, INK); rect(c, x - 1, h + drop - 1.5, 3.5, 1, STEEL); rect(c, x - 1, h + drop - 1.5, 3.5, 0.5, STEEL_L)
  }
  // The pipe: a round bar, lit along the top.
  rect(c, 0, 0, w, h, INK)
  const rows = (h - 1) * 2, tone = (ramp, i) => ramp[Math.min(ramp.length - 1, Math.floor(i / rows * ramp.length))]
  const cream = ['#fffaf0', CREAM, CREAM, '#e2d6cf', CREAM_D, '#8f819b'], red = [RED_L, RED_L, RED, RED, RED_D, '#6e1626']
  for (let i = 0; i < rows; i++) {
    const y = 0.5 + i / 2
    rect(c, 0.5, y, w - 1, 0.5, tone(cream, i))
    // Barrier tape: red bands leaning forward, the way you are travelling.
    for (let x = -8 + (i / 2) % 8; x < w; x += 8) {
      const x0 = Math.max(0.5, x), x1 = Math.min(w - 0.5, x + 4)
      rect(c, x0, y, x1 - x0, 0.5, tone(red, i))
    }
  }
  // Flanged ends.
  for (const x of [-1, w - 1]) {
    rect(c, x, -1, 2, h + 2, INK); rect(c, x + 0.5, -0.5, 1, h + 1, STEEL); rect(c, x + 0.5, -0.5, 1, 1, STEEL_H); rect(c, x + 0.5, h - 1, 1, 1.5, STEEL_D)
  }
  // A clamp over each stand.
  for (const x of stands) { rect(c, x - 0.5, -0.5, 2.5, h + 1, INK); rect(c, x, 0, 1.5, h, STEEL_L); rect(c, x, 0, 1.5, 0.5, STEEL_H); rect(c, x, h - 1.5, 1.5, 1.5, STEEL_D) }
  weather(c, seed, 1, h - 2.5, w - 2, 2, Math.round(w / 6))
}

// A launch ramp: run into it and it throws you. A red wedge rising the way
// you are travelling, with cream arrows up its face. w by h is the collision
// box; the lip stands a little proud of it.
export function drawSpring(c, w, h, seed = 0) {
  const top = x => h - 1.5 - (h - 0.5) * Math.max(0, Math.min(1, x / (w - 2))) ** 0.8
  for (let x = 0; x < w; x += 0.5) {
    const y = Math.round(top(x) * 2) / 2
    rect(c, x, y - 0.5, 0.5, h - y + 0.5, INK)
    if (x >= 0.5 && x < w - 0.5) {
      rect(c, x, y + 2, 0.5, h - y - 3, x > w - 3 ? STEEL_D : STEEL_B)
      rect(c, x, y, 0.5, 2, Math.floor(x / 2) % 3 === 1 && x > 3 ? CREAM : RED)
      rect(c, x, y, 0.5, 0.5, RED_L)
    }
  }
  rect(c, -1, h - 1.5, w + 2, 1.5, INK); rect(c, -0.5, h - 1, w + 1, 0.5, STEEL)
  // The piston that fires it.
  rect(c, w - 5, Math.max(top(w - 5) + 3, 1), 1.5, h - top(w - 5) - 4, STEEL_L)
  weather(c, seed, 2, h - 3, w - 6, 1.5, 3)
}

// The mast a zipline is anchored to, `h` pixels tall from the roof, its top
// at the origin.
export function drawMast(c, h) {
  rect(c, -1.5, -1, 3, h + 1, INK); rect(c, -1, 0, 2, h, STEEL); rect(c, -1, 0, 0.5, h, STEEL_L)
  rect(c, -2.5, h - 2, 5, 2, INK); rect(c, -2, h - 1.5, 4, 1, STEEL_L)
  rect(c, -2, -2.5, 4, 3, INK); rect(c, -1.5, -2, 3, 2, RED); rect(c, -1.5, -2, 3, 0.5, RED_L)
}
