// Art sheets for the rigged runner, rendered by the game's own rig code.
//   node bench/rig-sheet.js [--out=docs/screenshots/runner-rig]
// Writes:
//   model-sheet.png  skeleton and build, outfits, recolour examples, every
//                    move, run contacts
//   run-cycle.png    animated (APNG): every outfit running in place
//   moves.png        animated (APNG): a scripted run through every move,
//                    showing the crossfades between them
// Everything is drawn in Chromium by the same code the game runs.
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync, crc32 } from 'node:zlib'

const output = process.argv.find(arg => arg.startsWith('--out='))?.slice('--out='.length) || 'docs/screenshots/runner-rig'
mkdirSync(output, { recursive: true })

// ---- APNG ---------------------------------------------------------------------
function chunk(type, data) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0)
  return Buffer.concat([head, data, crc])
}
function scanlines(w, h, rgba) {
  const raw = Buffer.alloc(h * (w * 4 + 1))
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1)
  return deflateSync(raw, { level: 9 })
}
function apng(w, h, frames, fps) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  const actl = Buffer.alloc(8); actl.writeUInt32BE(frames.length, 0)
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('acTL', actl)]
  let seq = 0
  frames.forEach((rgba, i) => {
    const fc = Buffer.alloc(26)
    fc.writeUInt32BE(seq++, 0); fc.writeUInt32BE(w, 4); fc.writeUInt32BE(h, 8)
    fc.writeUInt16BE(1, 20); fc.writeUInt16BE(fps, 22)
    parts.push(chunk('fcTL', fc))
    const data = scanlines(w, h, rgba)
    if (i === 0) parts.push(chunk('IDAT', data))
    else { const sq = Buffer.alloc(4); sq.writeUInt32BE(seq++); parts.push(chunk('fdAT', Buffer.concat([sq, data]))) }
  })
  parts.push(chunk('IEND', Buffer.alloc(0)))
  return Buffer.concat(parts)
}

const server = await createServer({ logLevel: 'error', server: { port: 0 } }); await server.listen()
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
try {
  const page = await browser.newPage()
  page.on('pageerror', e => { throw e })
  const films = { run: { frames: [] }, moves: { frames: [] } }
  await page.exposeFunction('__frame', (name, w, h, fps, b64) => { Object.assign(films[name], { w, h, fps }); films[name].frames.push(new Uint8Array(Buffer.from(b64, 'base64'))) })
  await page.goto(`${server.resolvedUrls.local[0]}lab.html`)
  const png = await page.evaluate(async () => {
    const { loadConceptArt, conceptArt } = await import('/packet-loss/src/pixel/conceptArt.js')
    if (!(await loadConceptArt())) throw new Error('Runner artwork did not load')
    const { RunnerRig, SKINS, defineSkin } = await import('/packet-loss/src/pixel/rig/index.js')
    const { BONES } = await import('/packet-loss/src/pixel/rig/skeleton.js')
    const { FRAME, GIRTH } = await import('/packet-loss/src/pixel/runnerModel.js')
    const { RUN_STRIDE } = await import('/packet-loss/src/pixel/runGait.js')
    const { PHYS } = await import('/packet-loss/src/sim/config.js')
    const canvas = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv }
    const INK = '#efe7da', DIM = '#a99bb8', ACCENT = '#ff5a4a', BG = '#17111f', ROOF = '#4a3a55'

    // Recolour examples: outfits made from an existing sheet with no new art.
    SKINS.ember = defineSkin({ name: 'Ember (recolour)', sheet: SKINS.techwear.sheet, recolor: { torso: [{ where: [150, 200], tint: '#ffb020' }, { where: [330, 20], tint: '#ffb020' }], upper: { where: [150, 200], tint: '#ffb020' }, fore: { where: [150, 200], tint: '#ffb020' }, hair: { tint: '#b3261e', light: 0.62 }, head: { where: [200, 330], tint: '#b3261e', light: 0.62 }, shoe: { tint: '#ff7a1a', sat: 1.4, light: 0.8 } } })
    SKINS.moss = defineSkin({ name: 'Moss (recolour)', sheet: SKINS.windbreaker.sheet, recolor: { torso: { where: [5, 40], hue: 95, sat: 0.8 }, upper: { where: [5, 40], hue: 95, sat: 0.8 }, fore: { where: [5, 40], hue: 95, sat: 0.8 }, thigh: { hue: -200, sat: 0.7 }, shin: { hue: -200, sat: 0.7 } } })
    const outfits = ['courier', 'windbreaker', 'techwear'], recolours = ['ember', 'moss']

    // The runner exactly as the game shows it: drawn at 4 px per unit and
    // averaged down to the screen's 2.
    const game = rig => { const cv = canvas(FRAME.width, FRAME.height), c = cv.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(rig.image(), 0, 0, cv.width, cv.height); return cv }
    const posed = (skin, p, { idle = false, phase = 0, frames = 90 } = {}) => {
      const rig = new RunnerRig(skin)
      for (let i = 0; i <= frames; i++) rig.update(p, i / 60, phase, idle, (p.speed || 0) * i / 60, 0)
      return rig
    }

    // ---- Animations, streamed to Node as raw frames ----
    const send = (name, cv, fps) => {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
      let s = ''; for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000))
      return window.__frame(name, cv.width, cv.height, fps, btoa(s))
    }
    const stage = (w, h, ground, scroll, zoom) => {
      const cv = canvas(w, h), c = cv.getContext('2d', { willReadFrequently: true }); c.imageSmoothingEnabled = false
      c.fillStyle = '#1f1520'; c.fillRect(0, 0, w, h); c.fillStyle = '#5a4560'; c.fillRect(0, ground, w, h - ground)
      c.fillStyle = '#7d6386'; c.fillRect(0, ground, w, 2)
      // Roof seams scroll at running speed so planted feet can be judged.
      for (let s = 0; s < 12; s++) { const x = Math.round((((s * 44 - scroll * 2 * zoom) % 528) + 528) % 528); c.fillRect(x, ground + 2, 2, h - ground) }
      return [cv, c]
    }
    const put = (c, rig, gx, gy, zoom) => c.drawImage(game(rig), gx - FRAME.origin[0] * 2 * zoom, gy - FRAME.origin[1] * 2 * zoom, FRAME.width * zoom, FRAME.height * zoom)
    {
      const zoom = 2, cell = 200, h = 230, ground = 196, speed = 14, N = 48, dt = RUN_STRIDE / speed / N * 2
      const rigs = outfits.map(id => new RunnerRig(id))
      for (let i = -90; i < N; i++) {
        const phase = i * dt * speed / RUN_STRIDE
        rigs.forEach(r => r.update({ state: 'run', speed }, (i + 90) * dt, phase, false, i * dt * speed, 0))
        if (i < 0) continue
        const [cv, c] = stage(cell * rigs.length, h, ground, i * dt * speed * 14, zoom)
        rigs.forEach((r, k) => put(c, r, k * cell + 80, ground, zoom))
        await send('run', cv, Math.round(1 / dt))
      }
    }
    {
      const SCRIPT = [
        ['run', 0.6], ['air', 0.62, t => ({ vy: PHYS.JUMP_V - PHYS.G * t * 0.85 })], ['run', 0.5],
        ['slide', PHYS.SLIDE_TIME], ['run', 0.45], ['vault', 0.3, t => ({ kin: { t, T: 0.3 } })], ['run', 0.4],
        ['air', 0.5, t => ({ vy: 6 - PHYS.G * t })], ['roll', PHYS.ROLL_TIME], ['run', 0.5],
        ['stumble', PHYS.STUMBLE_TIME], ['run', 0.5], ['blocked', 0.7], ['idle', 1.2],
      ]
      const zoom = 2, w = 340, h = 260, ground = 214, dt = 1 / 60, speed = 13, rig = new RunnerRig('courier')
      let x = 0, phase = 0, clock = 0, n = 0
      for (const [state, duration, extra] of SCRIPT) for (let t = 0; t < duration - 1e-9; t += dt) {
        if (state !== 'blocked' && state !== 'idle') x += speed * dt
        if (state === 'run') phase += speed * dt / RUN_STRIDE
        clock += dt
        rig.update({ state: state === 'idle' ? 'run' : state, t, speed, vy: 0, ...(extra ? extra(t) : {}) }, clock, phase, state === 'idle', x, 0)
        if (n++ % 2) continue
        const [cv, c] = stage(w, h, ground, x * 14, zoom)
        put(c, rig, w / 2 - 20, ground, zoom)
        c.fillStyle = '#a99bb8'; c.font = '12px ui-monospace, monospace'; c.fillText(state.toUpperCase(), 10, 20)
        await send('moves', cv, 15)
      }
    }

    // ---- Static sheet ----
    const W = 1600, H = 1760, cv = canvas(W, H), c = cv.getContext('2d'); c.imageSmoothingEnabled = false
    c.fillStyle = BG; c.fillRect(0, 0, W, H)
    const text = (s, x, y, size = 16, color = INK, weight = '') => { c.fillStyle = color; c.font = `${weight} ${size}px ui-monospace, monospace`; c.fillText(s, x, y) }
    const place = (rig, gx, gy, zoom) => c.drawImage(game(rig), gx - FRAME.origin[0] * 2 * zoom, gy - FRAME.origin[1] * 2 * zoom, FRAME.width * zoom, FRAME.height * zoom)
    const ground = (x, y, w, color = ROOF) => { c.fillStyle = color; c.fillRect(x, y, w, 2) }

    text('PACKET LOSS / RUNNER RIG', 40, 56, 30, INK, 'bold')
    text('The painted v2 outfits on one skeleton. Every sprite below is drawn by the game\'s rig code at game resolution, then enlarged.', 40, 88, 15, DIM)

    text('SKELETON AND BUILD', 40, 140, 18, ACCENT, 'bold')
    const neutral = posed('courier', { state: 'run' }, { idle: true }), zoom = 4, gx = 200, gy = 560
    ground(60, gy, 300)
    c.globalAlpha = 0.45; place(neutral, gx, gy, zoom); c.globalAlpha = 1
    const P = p => [gx + p[0] * 2 * zoom, gy + p[1] * 2 * zoom], j = neutral.animator.joints
    const chains = [[j.near.hip, j.near.knee, j.near.ankle], [j.far.hip, j.far.knee, j.far.ankle], [j.hip, j.waist, j.neck, j.head.o],
      [j.shoulder, j.nearArm.elbow, j.nearArm.wrist, j.nearArm.knuckles], [j.shoulder, j.farArm.elbow, j.farArm.wrist, j.farArm.knuckles], neutral.animator.hairPoints]
    chains.forEach((ch, i) => {
      c.strokeStyle = ['#55ddeb', '#2f8a94', '#efe7da', '#ffcf66', '#a8843a', '#d38bff'][i]; c.lineWidth = 3
      c.beginPath(); ch.forEach((p, k) => k ? c.lineTo(...P(p)) : c.moveTo(...P(p))); c.stroke()
      for (const p of ch) { c.beginPath(); c.arc(...P(p), 4, 0, Math.PI * 2); c.fillStyle = c.strokeStyle; c.fill() }
    })
    const rows = [['BONE LENGTHS', ''], ['torso', `${BONES.abdomen} + ${BONES.chest.toFixed(1)}`], ['thigh / shin', `${BONES.thigh} / ${BONES.shin}`], ['upper / forearm / fist', `${BONES.upper} / ${BONES.fore} / ${BONES.hand}`], ['ponytail', '5 spring segments'],
      ['GIRTH', ''], ['torso', `${GIRTH.torso}`], ['thigh / calf', `${GIRTH.thigh} / ${GIRTH.shin}`], ['upper / forearm', `${GIRTH.upper} / ${GIRTH.fore}`]]
    rows.forEach(([k, v], i) => { text(k, 400, 196 + i * 28, 15, v ? DIM : INK, v ? '' : 'bold'); text(v, 620, 196 + i * 28, 15) })
    text('Logical pixels. Bones never stretch, knees and', 400, 480, 14, DIM)
    text('elbows cannot bend backwards, planted soles move', 400, 502, 14, DIM)
    text('exactly with the roof. Girth sets the build for', 400, 524, 14, DIM)
    text('every outfit at once (runnerModel.js).', 400, 546, 14, DIM)

    text('OUTFITS', 860, 140, 18, ACCENT, 'bold')
    outfits.forEach((id, k) => {
      const x = 930 + k * 230
      ground(x - 80, 560, 190); place(posed(id, { state: 'run' }, { idle: true }), x, 560, 4)
      text(SKINS[id].name.toUpperCase(), x - 70, 590, 15, INK, 'bold')
    })

    text('PARTS: ONE 3x3 SHEET PER OUTFIT, BOUND AT THE SAME LANDMARKS', 40, 670, 18, ACCENT, 'bold')
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'
    conceptArt().rigs[SKINS.courier.sheet].forEach((im, i) => {
      const s = Math.min(96 / im.width, 150 / im.height)
      c.drawImage(im, 60 + i * 104 + (96 - im.width * s) / 2, 700 + (150 - im.height * s) / 2, im.width * s, im.height * s)
    })
    c.imageSmoothingEnabled = false
    text('RECOLOURS: NEW OUTFITS, NO NEW ART', 1060, 670, 18, ACCENT, 'bold')
    recolours.forEach((id, k) => {
      const x = 1150 + k * 240
      ground(x - 70, 880, 170); place(posed(id, { state: 'run', speed: 14 }, { phase: 0.3 }), x, 880, 2)
      text(SKINS[id].name.toUpperCase(), x - 70, 906, 13, DIM)
    })

    const states = [
      ['IDLE', { state: 'run' }, { idle: true }], ['RUN', { state: 'run', speed: 15 }, { phase: 0.1 }], ['JUMP', { state: 'air', vy: 9 }], ['APEX', { state: 'air', vy: 0 }], ['FALL', { state: 'air', vy: -10 }],
      ['SLIDE', { state: 'slide', t: 0.4 }], ['VAULT', { state: 'vault', t: 0.12, kin: { t: 0.12, T: 0.3 } }], ['MANTLE', { state: 'mantle', t: 0.24, kin: { t: 0.24, T: 0.32 } }],
      ['CLIMB', { state: 'climb', t: 0.1 }], ['WALL SLIDE', { state: 'wallslide', t: 0.3 }], ['WALL RUN', { state: 'wallrun', t: 0.25, speed: 14 }], ['ZIPLINE', { state: 'zip', t: 0.4 }],
      ['ROLL', { state: 'roll', t: 0.22 }], ['STUMBLE', { state: 'stumble', t: 0.18 }], ['BRACED', { state: 'blocked', t: 0.3 }], ['DOWN', { state: 'dead', t: 0.4 }],
    ]
    text('MOVES', 40, 950, 18, ACCENT, 'bold')
    states.forEach(([label, p, o = {}], i) => {
      const col = i % 8, row = Math.floor(i / 8), x = 110 + col * 190, y = 1150 + row * 230
      ground(x - 80, y, 170)
      // A zipline hangs the runner below the cable, which sits ZIP_HANG above the feet.
      const lift = label === 'ZIPLINE' ? 150 - PHYS.ZIP_HANG * 14 * 4 : 0
      if (lift) ground(x - 80, y - 150, 170, ACCENT)
      place(posed(outfits[(row + (col > 4)) % 3], p, o), x, y - lift, 2)
      text(label, x - 70, y + 26, 14, DIM)
    })

    text('RUN CYCLE / ALTERNATING CONTACTS (RED: A FOOT LANDS)', 40, 1450, 18, ACCENT, 'bold')
    outfits.forEach((id, row) => {
      for (let col = 0; col < 8; col++) {
        const x = 110 + col * 190, y = 1540 + row * 90
        ground(x - 70, y, 150, col === 0 || col === 4 ? ACCENT : ROOF)
        place(posed(id, { state: 'run', speed: 14 }, { phase: col / 8, frames: 30 }), x, y, 1)
        if (row === 2) text(String(col + 1), x - 4, y + 22, 13, DIM)
      }
    })
    return cv.toDataURL('image/png').split(',')[1]
  })
  writeFileSync(`${output}/model-sheet.png`, Buffer.from(png, 'base64'))
  for (const [name, file] of [['run', 'run-cycle.png'], ['moves', 'moves.png']]) {
    const f = films[name]
    writeFileSync(`${output}/${file}`, apng(f.w, f.h, f.frames, f.fps))
  }
  console.log(`Wrote ${output}/model-sheet.png, run-cycle.png and moves.png`)
} finally { await browser.close(); await server.close() }
