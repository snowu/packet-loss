// Verify actual game audio callbacks against the displayed gait, and record
// optional real gameplay with sound. Art sheets come from bench/rig-sheet.js.
// CHROMIUM_PATH=... node bench/gait-review.js [--record]
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { setTimeout as pause } from 'node:timers/promises'

const output = process.argv.find(arg => arg.startsWith('--out='))?.slice('--out='.length) || 'docs/screenshots/gait'
mkdirSync(output, { recursive: true })
const server = await createServer({ logLevel: 'error', server: { port: 0 } }); await server.listen()
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required'] })
const base = server.resolvedUrls.local[0]
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.route(/https:\/\/fonts\./, r => r.abort())
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  const source = readFileSync(new URL('./bench.js', import.meta.url), 'utf8')
  const pin = source.slice(source.indexOf('function pinWorld()'), source.indexOf('// Runs in the page: counts'))
  await page.addInitScript(`${pin}; pinWorld()`)
  await page.goto(`${base}?seed=12345&quality=0`)
  while (!(await page.evaluate(() => !!window.__game))) await pause(20)
  const report = await page.evaluate(async () => {
    const G = window.__game, v = G.view
    const { Audio } = await import('/packet-loss/src/audio.js')
    const { Bot } = await import('/packet-loss/src/sim/bot.js')
    const { runFrame, runPose } = await import('/packet-loss/src/pixel/runGait.js')
    const sounds = [], rendered = [], states = new Set()
    let pending = null, focusSteps = 0
    Audio.prototype.step = function (kind) {
      if (kind !== 'run') return
      const phase = v.gait.phase, foot = Math.floor(phase * 2) & 1
      const contact = runPose(phase)[foot ? 'far' : 'near']
      if (!contact.planted) throw new Error('Footstep while the foot is airborne')
      pending = phase
      sounds.push({ phase, frame: runFrame(phase), state: G.g.player.state })
      if (G.g.focusActive) focusSteps++
    }
    const drawActor = v.drawActor.bind(v)
    v.drawActor = function (p, x, y, time, idle, ghost, phase) {
      if (!ghost) {
        states.add(p.state)
        if (pending !== null) {
          if (p.state !== 'run' || phase !== pending) throw new Error('Sound and rendered gait disagree')
          rendered.push(phase); pending = null
        }
      }
      return drawActor(p, x, y, time, idle, ghost, phase)
    }
    for (const outfit of ['courier', 'windbreaker', 'techwear']) {
      G.start(1); v.setRunner(outfit); G.g.bot = new Bot(G.g.level)
      for (let i = 0; i < 1100; i++) {
        if (i === 360) { G.g.focus = 1; G.g.focusActive = true }
        window.__tick()
        if (i % 120 === 0) await window.__yield()
      }
      const phase = v.gait.phase, count = sounds.length
      G.g.mode = 'paused'
      for (let i = 0; i < 60; i++) window.__tick()
      if (v.gait.phase !== phase || sounds.length !== count) throw new Error('Paused gait advanced')
    }
    return { sounds: sounds.length, matchedDraws: rendered.length, focusSteps, states: [...states], pending }
  })
  assert.ok(report.sounds > 20); assert.equal(report.sounds, report.matchedDraws)
  assert.ok(report.focusSteps > 0); assert.equal(report.pending, null)
  // The runner is posed live each frame now; check it reached every state
  // and drew a sprite whose edges never clip.
  const bounds = await page.evaluate(() => {
    const v = window.__game.view, im = v.rig.image(), d = im.getContext('2d').getImageData(0, 0, im.width, im.height).data
    let opaque = 0
    for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) {
      if (!d[(y * im.width + x) * 4 + 3]) continue
      opaque++
      if (!x || !y || x === im.width - 1 || y === im.height - 1) throw new Error('Runner sprite clipped at its edge')
    }
    return { opaque, size: [im.width, im.height] }
  })
  assert.ok(bounds.opaque > 500)
  assert.deepEqual(errors, [])
  console.log('Gait/audio browser check:', JSON.stringify(report))
  await page.close()

  if (process.argv.includes('--record')) {
    const video = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    await video.route(/https:\/\/fonts\./, r => r.abort())
    await video.goto(`${base}?seed=12345&quality=0`)
    await video.waitForFunction(() => !!window.__game)
    await video.evaluate(async () => {
      const { Audio } = await import('/packet-loss/src/audio.js')
      const start = Audio.prototype.start
      Audio.prototype.start = function () { start.call(this); window.__audioCapture = this }
      window.__game.start(1)
      const { Bot } = await import('/packet-loss/src/sim/bot.js')
      window.__game.g.bot = new Bot(window.__game.g.level)
    })
    await video.waitForFunction(() => window.__game.g.mode === 'run')
    const data = await video.evaluate(async () => {
      const a = window.__audioCapture, v = window.__game.view
      await a.ctx.resume()
      const audio = a.ctx.createMediaStreamDestination(); a.master.connect(audio)
      const stream = v.canvas.captureStream(60)
      stream.addTrack(audio.stream.getAudioTracks()[0])
      const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 3500000 })
      const chunks = []; rec.ondataavailable = e => chunks.push(e.data)
      const done = new Promise(resolve => { rec.onstop = resolve })
      rec.start()
      await new Promise(resolve => setTimeout(resolve, 10000))
      rec.stop(); await done
      a.master.disconnect(audio); stream.getTracks().forEach(t => t.stop())
      const blob = new Blob(chunks, { type: 'video/webm' })
      return new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob) })
    })
    writeFileSync(`${output}/gameplay-with-audio.webm`, Buffer.from(data, 'base64'))
    await video.screenshot({ path: `${output}/gameplay.png` })
    await video.close()
    console.log('Actual gameplay recording saved with live game audio.')
  }
} finally { await browser.close(); await server.close() }
