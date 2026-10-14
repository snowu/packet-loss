// Browser checks for renderer optimizations that unit tests cannot exercise.
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'

const server = await createServer({ logLevel: 'error', server: { port: 0, strictPort: false } })
await server.listen()
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(server.resolvedUrls.local[0])
  await page.waitForFunction(() => window.__game?.frameMeter.stats)
  assert.match(await page.locator('.frame-meter').textContent(), /\d+ FPS.*p95.*CPU/)
  await page.keyboard.press('F6')
  assert.equal(await page.locator('.frame-meter').isVisible(), false)
  await page.keyboard.press('F6')
  assert.equal(await page.locator('.frame-meter').isVisible(), true)

  const focus = await page.evaluate(async () => {
    const { FocusFilter } = await import('/packet-loss/src/pixel/focus.js')
    const { PixelView } = await import('/packet-loss/src/pixel/view.js')
    const cv = document.createElement('canvas')
    cv.width = 16; cv.height = 16
    const ctx = cv.getContext('2d')
    const original = new Uint8ClampedArray(16 * 16 * 4)
    for (let i = 0; i < original.length; i += 4) {
      original[i] = (i * 17 + 150) % 256
      original[i + 1] = (i * 31 + 90) % 256
      original[i + 2] = (i * 13 + 60) % 256
      original[i + 3] = 255
    }
    // Red cue, exact threshold boundary, black and white.
    original.set([255, 47, 60, 255, 150, 40, 40, 255, 0, 0, 0, 255, 255, 255, 255, 255])
    const filter = new FocusFilter()
    if (!filter.ready) throw new Error('WebGL test context unavailable')
    let maxError = 0
    for (const [amount, flash, fade] of [[0, 0, 0], [0.25, 0, 0], [0.5, 0, 0], [1, 0, 0], [1, 0.3, 0.6]]) {
      ctx.putImageData(new ImageData(original.slice(), 16, 16), 0, 0)
      PixelView.prototype.postFocus.call({ ctx, W: 16, focusFilter: { draw: () => false } }, amount)
      if (flash) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, 16, 16) }
      if (fade) { ctx.fillStyle = `rgba(8,6,16,${fade})`; ctx.fillRect(0, 0, 16, 16) }
      // CPU method uses the view's global height: canvas clips its writes.
      const expected = ctx.getImageData(0, 0, 16, 16).data
      ctx.putImageData(new ImageData(original.slice(), 16, 16), 0, 0)
      filter.draw(ctx, amount, { flash, fade })
      const actual = ctx.getImageData(0, 0, 16, 16).data
      for (let i = 0; i < actual.length; i++) maxError = Math.max(maxError, Math.abs(actual[i] - expected[i]))
    }
    // Resize and simulate context loss: fallback must remain available.
    cv.width = 7; cv.height = 9
    filter.draw(ctx, 0.5)
    const resized = filter.canvas.width === 7 && filter.canvas.height === 9
    filter.gl.getExtension('WEBGL_lose_context').loseContext()
    const lost = filter.draw(ctx, 1) === false
    return { maxError, resized, lost }
  })
  assert.ok(focus.maxError <= 2, `focus and overlays differ from CPU by ${focus.maxError} levels`)
  assert.ok(focus.resized && focus.lost)

  const workerPaths = await page.evaluate(async () => {
    const { paletteAt } = await import('/packet-loss/src/pixel/palette.js')
    const run = async () => {
      const source = `
        await import('${location.origin}/packet-loss/src/pixel/bakeWorker.js');
        self.postMessage({ ready: true });`
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
      const worker = new Worker(url, { type: 'module' })
      try {
        await new Promise((resolve, reject) => { worker.onmessage = resolve; worker.onerror = reject })
        const job = ['pipe', ['beam', 30, 8, 16, paletteAt(0), 7, {}]]
        let previous
        for (let i = 0; i < 2; i++) {
          const response = new Promise((resolve, reject) => { worker.onmessage = e => resolve(e.data); worker.onerror = reject })
          worker.postMessage({ key: 'repeat', version: i, job })
          const result = await response
          if (!result.data?.byteLength) return false
          if (previous && result.data.some((pixel, i) => pixel !== previous[i])) return false
          previous = result.data
        }
        return true
      } finally { worker.terminate(); URL.revokeObjectURL(url) }
    }
    return await run()
  })
  assert.ok(workerPaths, 'repeated worker jobs detached or changed cached pixels')

  const towers = await page.evaluate(async () => {
    const { pinPalette, paletteAt } = await import('/packet-loss/src/pixel/palette.js')
    const { bakeTower } = await import('/packet-loss/src/pixel/city.js')
    const { toCanvas } = await import('/packet-loss/src/pixel/pixels.js')
    const v = window.__game.view
    pinPalette(0)
    // Cached skyline sprites must keep their original pixels after scrolling
    // and world rebinding.
    const check = () => {
      v.budget = Infinity
      const pal = paletteAt(0)
      v.drawLayers(pal)
      for (let li = 0; li < v.layers.length; li++) {
        const L = v.layers[li]
        for (const it of L.items) {
          const ref = toCanvas(bakeTower(it.w, it.h, li, pal[L.color], pal[L.win], pal, it.seed))
          const a = ref.getContext('2d').getImageData(0, 0, ref.width, ref.height).data
          const actual = document.createElement('canvas')
          actual.width = ref.width; actual.height = ref.height
          const c = actual.getContext('2d')
          c.drawImage(it.canvas, 0, 0)
          const b = c.getImageData(0, 0, ref.width, ref.height).data
          if (a.some((n, i) => n !== b[i])) return false
        }
      }
      return true
    }
    const worker = v.baker.worker
    // Force current sprites for this exact pixel comparison.
    v.baker.worker = null
    const first = check()
    v.camPX += 301
    const scrolled = check()
    const [carKey, carSprite] = [...v.cache].find(([key]) => key.startsWith('car'))
    v.bind(window.__game.g.level)
    const rebound = check()
    const keptCar = v.cache.get(carKey) === carSprite
    v.setClassic(true)
    const cancelled = v.baker.pending.size === 0
    v.setClassic(false)
    v.baker.worker = worker
    return first && scrolled && rebound && keptCar && cancelled
  })
  assert.ok(towers, 'cached skyline sprites differ from the original tower pixels')
  await page.evaluate(async () => {
    const { Bot } = await import('/packet-loss/src/sim/bot.js')
    const G = window.__game
    G.start(0); G.g.bot = new Bot(G.g.level)
    Object.assign(G.view.weather, { ready: true, rain: 1, wet: 1, target: 1, clock: 1e9 })
  })
  await page.waitForFunction(() => window.__game.g.mode === 'run')
  await page.evaluate(() => { window.__game.g.focusActive = true; window.__game.g.focus = 1 })
  await page.waitForFunction(() => window.__game.view.focusFilter?.ready)
  await page.screenshot({ path: '/tmp/packet-loss-performance-landscape.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => window.__game.view.canvas.height > 700)
  await page.screenshot({ path: '/tmp/packet-loss-performance-portrait.png' })
  assert.deepEqual(errors, [])
  console.log('FPS toggle, focus pixel parity/fallback/resize, repeated worker jobs, skyline pixel parity, and rain/focus/portrait smoke checks passed.')
} finally {
  await browser.close()
  await server.close()
}
