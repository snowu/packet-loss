// Look check: renders the same pinned frames in two checkouts and compares
// the canvas pixel for pixel.
//
//   npm run bench:look -- --compare=../master-checkout [--save=dir]
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as pause } from 'node:timers/promises'

const here = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v = 'true'] = a.replace(/^--/, '').split('=')
  return [k, v]
}))
const bench = readFileSync(resolve(here, 'bench.js'), 'utf8')
const pinWorld = bench.slice(bench.indexOf('function pinWorld()'), bench.indexOf('// Runs in the page: counts'))

// mode: title menu index; ghost: run the trial once first so it has one
const SCENES = [
  { name: 'endless-dry', mode: 1, rain: 0, frames: [300, 900, 1500, 2400] },
  { name: 'endless-rain', mode: 1, rain: 1, frames: [300, 900, 1500, 2400] },
  { name: 'sprint-ghost', mode: 2, rain: null, ghost: true, frames: [400, 1200, 2000, 2550] },
]

async function capture(browser, root, sc) {
  const server = await createServer({ root, configFile: resolve(root, 'vite.config.js'), logLevel: 'error', server: { port: 0, strictPort: false } })
  await server.listen()
  try {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort())
    await page.addInitScript(`${pinWorld}; pinWorld()`)
    await page.goto(`${server.resolvedUrls.local[0]}?seed=12345`)
    while (!(await page.evaluate(() => !!window.__game))) await pause(20)
    const shots = await page.evaluate(async (sc) => {
      const G = window.__game, v = G.view
      const { Bot } = await import('/packet-loss/src/sim/bot.js')
      const go = () => {
        window.__seed(7)
        G.start(sc.mode)
        G.g.bot = new Bot(G.g.level)
        if (sc.rain !== null) Object.assign(v.weather, { ready: true, rain: sc.rain, target: sc.rain, wet: sc.rain, clock: 1e9 })
      }
      if (sc.ghost) {
        go()
        let n = 0
        while (G.g.mode !== 'over' && n++ < 20000) { window.__tick(); if (n % 120 === 0) await window.__yield() }
      }
      go()
      const out = []
      for (let f = 1; f <= sc.frames.at(-1); f++) {
        window.__tick()
        if (f % 120 === 0) await window.__yield()
        if (sc.frames.includes(f)) {
          const img = v.ctx.getImageData(0, 0, v.W, v.canvas.height)
          out.push({ f, w: img.width, h: img.height, px: Array.from(new Uint32Array(img.data.buffer)), ghost: !!G.g.ghost, rain: v.weather.rain })
        }
      }
      return out
    }, sc)
    await ctx.close()
    return shots
  } finally { await server.close() }
}

const browser = await chromium.launch({ executablePath: args.chromium || process.env.CHROMIUM_PATH || undefined })
let worst = 0
try {
  for (const sc of SCENES) {
    const a = await capture(browser, resolve(args.compare), sc)
    const b = await capture(browser, resolve(here, '..'), sc)
    for (let i = 0; i < a.length; i++) {
      const A = a[i].px, B = b[i].px
      let diff = 0, max = 0
      for (let j = 0; j < A.length; j++) {
        if (A[j] === B[j]) continue
        diff++
        for (let s = 0; s < 32; s += 8) max = Math.max(max, Math.abs(((A[j] >>> s) & 255) - ((B[j] >>> s) & 255)))
      }
      worst = Math.max(worst, max)
      console.log(`${sc.name.padEnd(14)} frame ${String(a[i].f).padStart(5)}  ghost ${a[i].ghost ? 'on ' : 'off'} rain ${a[i].rain.toFixed(2)}  pixels differing ${String(diff).padStart(6)} of ${A.length} (${(100 * diff / A.length).toFixed(2)}%)  largest channel difference ${max}`)
      if (args.save) {
        mkdirSync(resolve(args.save), { recursive: true })
        writeFileSync(resolve(args.save, `${sc.name}-${a[i].f}.json`), JSON.stringify({ w: a[i].w, h: a[i].h, before: A, after: B }))
      }
    }
  }
} finally { await browser.close() }
console.log(`\nlargest channel difference anywhere: ${worst} / 255`)
