// Reproduce the art PR's actual game frames in either checkout.
// node bench/art-review.js [--root=../packet-loss-before] [--tag=before]
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')))
const root = resolve(args.root || '.')
const output = resolve(args.out || 'docs/screenshots/courier-pass')
const tag = args.tag || 'after'
const source = readFileSync(new URL('./bench.js', import.meta.url), 'utf8')
const pin = source.slice(source.indexOf('function pinWorld()'), source.indexOf('// Runs in the page: counts'))
const server = await createServer({ root, configFile: resolve(root, 'vite.config.js'), logLevel: 'error', server: { port: 0 } })
await server.listen()
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
try {
  mkdirSync(output, { recursive: true })
  for (const [name, district, rain, width, height] of [
    ['kowloon', 1, 0, 1280, 720], ['kowloon-wet', 1, 1, 1280, 720], ['phone', 1, 1, 390, 844],
    ...(args.all ? [['acid-rain', 2, 1, 1280, 720], ['neon-dusk', 0, 0, 1280, 720], ['smog-noon', 3, 0, 1280, 720], ['blackout', 4, 1, 1280, 720]] : []),
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route(/https:\/\/fonts\./, r => r.abort())
    await page.addInitScript(`${pin}; pinWorld()`)
    await page.goto(`${server.resolvedUrls.local[0]}?seed=12345&quality=0${args.legacy ? '&art=legacy' : ''}`)
    // The page's timers are pinned, so poll from Node (as bench.js does).
    const deadline = Date.now() + 30000
    let ready = false
    while (!ready && Date.now() < deadline) {
      ready = await page.evaluate(() => !!window.__game)
      if (!ready) await pause(20)
    }
    if (!ready) throw new Error(`${name}: game startup failed: ${errors.join('; ') || 'timeout'}`)
    await page.evaluate(async ({ district, rain, frames }) => {
      const { pinPalette } = await import('/packet-loss/src/pixel/palette.js')
      const { Bot } = await import('/packet-loss/src/sim/bot.js')
      pinPalette(district)
      const G = window.__game
      window.__seed(7); G.start(0)
      G.g.bot = new Bot(G.g.level)
      // Synchronous sprite bakes make captures independent of worker timing.
      G.view.baker.worker?.terminate(); G.view.baker.worker = null
      Object.assign(G.view.weather, { ready: true, rain, wet: rain, target: rain, clock: 1e9 })
      for (let i = 0; i < frames; i++) window.__tick()
    }, { district, rain, frames: Number(args.frame || 420) })
    if (errors.length) throw new Error(errors.join('\n'))
    await page.screenshot({ path: resolve(output, `${tag}-${name}.png`), animations: 'disabled' })
    console.log(`${tag}-${name}: actual game viewport captured`)
    await page.close()
  }
} finally { await browser.close(); await server.close() }
