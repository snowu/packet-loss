// Reproduce the art PR's actual game frames in either checkout.
// node bench/art-review.js [--root=../packet-loss-before] [--tag=before]
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route(/https:\/\/fonts\./, r => r.abort())
    await page.addInitScript(`${pin}; pinWorld()`)
    await page.goto(`${server.resolvedUrls.local[0]}?seed=12345&quality=0`)
    await page.waitForFunction(() => !!window.__game, null, { polling: 50 })
    const data = await page.evaluate(async ({ district, rain }) => {
      const { pinPalette } = await import('/packet-loss/src/pixel/palette.js')
      const { Bot } = await import('/packet-loss/src/sim/bot.js')
      pinPalette(district)
      const G = window.__game
      window.__seed(7); G.start(0)
      G.g.bot = new Bot(G.g.level)
      // Synchronous sprite bakes make captures independent of worker timing.
      G.view.baker.worker?.terminate(); G.view.baker.worker = null
      Object.assign(G.view.weather, { ready: true, rain, wet: rain, target: rain, clock: 1e9 })
      for (let i = 0; i < 420; i++) window.__tick()
      return G.view.canvas.toDataURL('image/png').split(',')[1]
    }, { district, rain })
    if (errors.length) throw new Error(errors.join('\n'))
    writeFileSync(resolve(output, `${tag}-${name}.png`), Buffer.from(data, 'base64'))
    console.log(`${tag}-${name}: actual game canvas captured`)
    await page.close()
  }
} finally { await browser.close(); await server.close() }
