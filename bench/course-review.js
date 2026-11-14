// Close-ups of every obstacle in the running game, for judging how clearly
// each one reads. The autopilot plays a fixed seed; a frame is saved the
// first time each kind of obstacle is just ahead of the runner.
//   node bench/course-review.js [--root=../other-checkout] [--tag=after] [--out=docs/screenshots/course-clarity]
// Run it on two checkouts with different tags to get matching before/after
// frames: the simulation is the same, so the frames line up.
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v = 'true'] = a.replace(/^--/, '').split('='); return [k, v] }))
const root = resolve(args.root || '.'), output = resolve(args.out || 'docs/screenshots/course-clarity'), tag = args.tag || 'after'
const source = readFileSync(new URL('./bench.js', import.meta.url), 'utf8')
const pin = source.slice(source.indexOf('function pinWorld()'), source.indexOf('// Runs in the page: counts'))
// name: what to wait for; district: palette index; rain: 0 or 1.
const RUNS = [
  { district: 1, rain: 0, want: { pipe: 'beam', slide: 'slide', crate: 'vent', locker: 'highbox', housing: 'housing', ramp: 'spring', zipline: 'zip' } },
  { district: 3, rain: 0, want: { 'pipe-smog-noon': 'beam', 'crate-smog-noon': 'vent' } },
  { district: 2, rain: 1, want: { 'pipe-acid-rain': 'beam', 'locker-acid-rain': 'highbox' } },
]
const server = await createServer({ root, configFile: resolve(root, 'vite.config.js'), logLevel: 'error', server: { port: 0, strictPort: false } })
await server.listen()
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
try {
  mkdirSync(output, { recursive: true })
  for (const run of RUNS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 })
    const errors = []; page.on('pageerror', e => errors.push(e.message))
    await page.route(/https:\/\/fonts\./, r => r.abort())
    await page.addInitScript(`${pin}; pinWorld()`)
    await page.goto(`${server.resolvedUrls.local[0]}?seed=12345&quality=0`)
    const deadline = Date.now() + 30000
    while (!(await page.evaluate(() => !!window.__game))) { if (Date.now() > deadline) throw new Error(`startup failed: ${errors.join('; ')}`); await pause(20) }
    await page.evaluate(async ({ district, rain }) => {
      const { pinPalette } = await import('/packet-loss/src/pixel/palette.js')
      const { Bot } = await import('/packet-loss/src/sim/bot.js')
      pinPalette(district)
      const G = window.__game
      window.__seed(7); G.start(1); G.g.bot = new Bot(G.g.level)
      G.view.baker?.worker?.terminate(); if (G.view.baker) G.view.baker.worker = null
      Object.assign(G.view.weather, { ready: true, rain, wet: rain, target: rain, clock: 1e9 })
    }, run)
    const left = new Map(Object.entries(run.want))
    for (let i = 0; i < 5000 && left.size; i++) {
      const seen = await page.evaluate(() => {
        window.__tick()
        const G = window.__game, p = G.g.player, tags = [p.state]
        for (const c of G.g.level.chunksIn(p.x - 2, p.x + 14)) for (const s of c.solids) {
          if (s.kind !== 'roof' && s.x0 > p.x + 2.5 && s.x0 < p.x + 5) tags.push(s.sub)
          // Mid-slide, with the pipe overhead.
          if (p.state === 'slide' && s.kind === 'beam' && s.x0 < p.x + 0.6 && s.x1 > p.x - 0.6) tags.push('under')
        }
        return tags
      })
      for (const [name, what] of left) {
        if (what === 'slide' ? !seen.includes('under') : !seen.includes(what)) continue
        left.delete(name)
        await page.screenshot({ path: resolve(output, `${tag}-${name}.png`), clip: { x: 300, y: 300, width: 600, height: 250 } })
      }
    }
    if (errors.length) throw new Error(errors.join('\n'))
    if (left.size) console.warn(`not seen: ${[...left.keys()].join(', ')}`)
    await page.close()
  }
  console.log(`${tag}: obstacle close-ups written to ${output}`)
} finally { await browser.close(); await server.close() }
