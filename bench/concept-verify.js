// Exercises every runner state and outfit, real game modes and cache lifecycle.
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { setTimeout as pause } from 'node:timers/promises'


const source = readFileSync(new URL('./bench.js', import.meta.url), 'utf8')
const pin = source.slice(source.indexOf('function pinWorld()'), source.indexOf('// Runs in the page: counts'))
const server = await createServer({ logLevel: 'error', server: { port: 0 } }); await server.listen()
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.route(/https:\/\/fonts\./, r => r.abort())
  await page.addInitScript(`${pin}; pinWorld()`)
  await page.goto(`${server.resolvedUrls.local[0]}?seed=12345&quality=0`)
  const deadline = Date.now() + 30000
  while (!(await page.evaluate(() => !!window.__game))) {
    if (Date.now() > deadline) throw new Error('Concept renderer startup timed out')
    await pause(20)
  }
  const result = await page.evaluate(async () => {
    const { Bot } = await import('/packet-loss/src/sim/bot.js')
    const { pinPalette } = await import('/packet-loss/src/pixel/palette.js')
    const G = window.__game, v = G.view
    const states = ['run', 'air', 'slide', 'roll', 'vault', 'mantle', 'climb', 'wallslide', 'wallrun', 'zip', 'stumble', 'blocked', 'dead']
    const poses = new Set()
    for (const outfit of ['courier', 'windbreaker', 'techwear']) {
      v.setRunner(outfit)
      for (const state of states) for (const t of [0.05, 0.2, 0.45, 0.7]) {
      v.ctx.clearRect(0, 0, v.W, v.logicalH)
      // Settle into the move, so the frame is the pose and not a blend into it.
      const p = { state, speed: 12, vy: 3 - t * 20, t, kin: { t: Math.min(t, 0.3), T: 0.3 } }
      for (let i = 0; i < 12; i++) v.rig.update(p, 100 + t + i / 60, t * 3, false, i * 0.2, 0)
      v.drawActor(p, 100, 150, 100 + t + 0.2)
      const pixels = v.ctx.getImageData(50 * v.res, 90 * v.res, 100 * v.res, 75 * v.res).data
      let n = 0
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 20) n++
      if (n < 30) throw new Error(`Missing production pose: ${state}`)
      // The painted sprite must fit its frame: nothing opaque on the border.
      const im = v.rig.image(), edge = im.getContext('2d').getImageData(0, 0, im.width, im.height).data
      for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x += (y && y < im.height - 1 ? im.width - 1 : 1)) {
        if (edge[(y * im.width + x) * 4 + 3]) throw new Error(`${outfit} ${state} at ${t}s clips the sprite edge at ${x},${y}`)
      }
      poses.add(`${outfit}:${state}`)
      }
    }
    v.setRunner('courier')
    const runs = []
    for (const mode of [0, 1, 2, 0]) {
      pinPalette(mode % 2 ? 2 : 1)
      window.__seed(7); G.start(mode); G.g.bot = new Bot(G.g.level)
      Object.assign(v.weather, { ready: true, rain: 1, wet: 1, target: 1, clock: 1e9 })
      for (let i = 0; i < 900; i++) { window.__tick(); if (i % 120 === 0) await window.__yield() }
      runs.push({ mode, distance: G.g.player.x, materials: v.materials.size, kit: v.kitCache.size })
    }
    return { poses: poses.size, runs, doubled: v.res >= 2 && v.res <= 3 && v.canvas.width === v.W * v.res && v.canvas.height === v.logicalH * v.res, backgrounds: v.backgrounds.size }
  })
  assert.equal(result.poses, 39); assert.ok(result.doubled)
  for (const run of result.runs) { assert.ok(run.distance > 70); assert.ok(run.materials < 12); assert.ok(run.kit <= 96) }
  assert.ok(result.backgrounds <= 5); assert.deepEqual(errors, [])
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => { for (let i = 0; i < 30; i++) window.__tick() })
  assert.equal(await page.evaluate(() => window.__game.view.canvas.width), 720)
  console.log('Production poses, Heist/Endless/Trial runs, bounded caches and portrait resizing passed.')
} finally { await browser.close(); await server.close() }
