// Exercises the production atlases, real game modes and cache lifecycle.
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
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
      for (const state of states) {
      v.ctx.clearRect(0, 0, v.W, v.logicalH)
      v.drawActor({ state, speed: 12, vy: 3, t: 0.2 }, 100, 150, 1)
      const pixels = v.ctx.getImageData(100, 180, 200, 150).data
      let n = 0
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 20) n++
      if (n < 30) throw new Error(`Missing production pose: ${state}`)
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
    return { poses: poses.size, runs, doubled: v.canvas.width === v.W * 2 && v.canvas.height === v.logicalH * 2, backgrounds: v.backgrounds.size }
  })
  assert.equal(result.poses, 39); assert.ok(result.doubled)
  for (const run of result.runs) { assert.ok(run.distance > 70); assert.ok(run.materials < 12); assert.ok(run.kit <= 96) }
  assert.ok(result.backgrounds <= 5); assert.deepEqual(errors, [])
  const sheet = await page.evaluate(() => {
    const v = window.__game.view, old = v.ctx
    const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 600
    const ctx = cv.getContext('2d'); ctx.scale(2, 2); ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#0c091b'; ctx.fillRect(0, 0, 600, 300)
    ctx.fillStyle = '#eee8db'; ctx.font = 'bold 13px monospace'; ctx.fillText('PACKET LOSS / PRODUCTION ANIMATION', 15, 22)
    const states = ['run', 'air', 'slide', 'vault', 'climb', 'zip']
    v.ctx = ctx
    for (const [row, outfit] of ['courier', 'windbreaker', 'techwear'].entries()) {
      v.setRunner(outfit); ctx.fillStyle = '#bfaecf'; ctx.font = '8px monospace'; ctx.fillText(outfit.toUpperCase(), 15, 42 + row * 85)
      for (let i = 0; i < states.length; i++) {
        v.drawActor({ state: states[i], speed: 12, vy: -2, t: 0.2 }, 62 + i * 93, 94 + row * 85, 0.5)
        ctx.fillStyle = '#bfaecf'; ctx.font = '7px monospace'; ctx.fillText(states[i].toUpperCase(), 49 + i * 93, 107 + row * 85)
      }
    }
    v.ctx = old; v.setRunner('courier')
    return cv.toDataURL('image/png').split(',')[1]
  })
  mkdirSync('docs/screenshots/concept', { recursive: true })
  writeFileSync('docs/screenshots/concept/production-sheet.png', Buffer.from(sheet, 'base64'))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => { for (let i = 0; i < 30; i++) window.__tick() })
  assert.equal(await page.evaluate(() => window.__game.view.canvas.width), 720)
  console.log('Production poses, Heist/Endless/Trial runs, bounded caches and portrait resizing passed.')
} finally { await browser.close(); await server.close() }
