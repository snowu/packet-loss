// Run-to-run stability: plays the same seeded course over and over on the
// autopilot, restarting the way a player does, and reports what each run
// costs. The course, weather and randomness are identical every time, so
// anything that rises from one run to the next was left behind by the runs
// before it. Canvas memory is counted as if the garbage collector never ran.
//
//   npm run bench:runs                       8 endless runs of 1500 frames
//   npm run bench:runs -- --track=0          heist (0), endless (1), trials (2+)
//   npm run bench:runs -- --runs=12 --frames=2400
//   npm run bench:runs -- --via=menu         go back to the title between runs
//   npm run bench:runs -- --quality=2       pin the picture quality (0 full, 1 lean, 2 minimal)
//   npm run bench:runs -- --check            fail if the last run costs >15% more than the second
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as pause } from 'node:timers/promises'

const here = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v = 'true'] = a.replace(/^--/, '').split('=')
  return [k, v]
}))
const RUNS = +(args.runs ?? 8)
const FRAMES = +(args.frames ?? 1500)
const TRACK = +(args.track ?? 1)

function pinWorld() {
  let seed = 1
  window.__seed = (v) => { seed = v }
  Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
  window.AudioContext = undefined
  window.webkitAudioContext = undefined
  const realNow = performance.now.bind(performance)
  const realTimeout = window.setTimeout.bind(window)
  window.__yield = () => new Promise((r) => realTimeout(r, 0))
  let now = 0, rafs = [], timers = [], id = 0
  performance.now = () => now
  window.requestAnimationFrame = (f) => { rafs.push(f); return rafs.length }
  window.setTimeout = (f, ms = 0) => { timers.push({ id: ++id, at: now + ms, f }); return id }
  window.clearTimeout = (t) => { timers = timers.filter((x) => x.id !== t) }
  window.setInterval = () => 0
  window.__timers = () => timers.length
  window.__tick = () => {
    now += 1000 / 60
    const due = timers.filter((t) => t.at <= now)
    timers = timers.filter((t) => t.at > now)
    for (const t of due) if (typeof t.f === 'function') t.f()
    const fs = rafs
    rafs = []
    for (const f of fs) f(now)
  }
  window.__realNow = realNow
  // Every canvas the page makes is kept here, so none is ever collected:
  // the pixels they hold between them is what a browser holds when its
  // garbage collector hasn't run, which on a phone can be most of a session.
  const made = (window.__canvases = [])
  const create = document.createElement.bind(document)
  document.createElement = (tag, ...a) => {
    const el = create(tag, ...a)
    if (String(tag).toLowerCase() === 'canvas') made.push(el)
    return el
  }
  const P = CanvasRenderingContext2D.prototype
  const work = (window.__work = {})
  for (const m of ['fillRect', 'drawImage', 'putImageData', 'getImageData']) {
    const o = P[m]
    P[m] = function (...a) { work[m] = (work[m] ?? 0) + 1; return o.apply(this, a) }
  }
}

const browser = await chromium.launch({
  executablePath: args.chromium || process.env.CHROMIUM_PATH || undefined,
  args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'],
})
const root = resolve(args.root ?? resolve(here, '..'))
const server = await createServer({ root, configFile: resolve(root, 'vite.config.js'), logLevel: 'error', server: { port: 0, strictPort: false } })
await server.listen()
let failed = false
try {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort())
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(pinWorld)
  await page.goto(`${server.resolvedUrls.local[0]}?seed=12345`)
  const deadline = Date.now() + 30000
  while (Date.now() < deadline && !(await page.evaluate(() => !!window.__game))) await pause(20)
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const rows = []
  for (let run = 0; run < RUNS; run++) {
    rows.push(await page.evaluate(async ({ track, frames, menu, run, args_quality }) => {
      const G = window.__game, v = G.view
      const { Bot } = await import('/packet-loss/src/sim/bot.js')
      if (menu && run) { document.getElementById('btn-quit').click(); for (let i = 0; i < 120; i++) window.__tick() }
      window.__seed(7)
      if (run && !menu) G.newRun(); else G.start(track)
      G.g.bot = new Bot(G.g.level)
      Object.assign(v.weather, { ready: true, rain: 0.8, target: 0.8, wet: 0.8, clock: 1e9 })
      for (const k in window.__work) delete window.__work[k]
      const times = []
      let n = 0
      for (; n < frames; n++) {
        if (G.g.mode === 'over') break
        if (G.g.mode === 'shop') document.querySelector('#shop-offer li')?.click()
        if (args_quality !== null) v.quality = args_quality
        if (n % 4 === 0) await window.__yield()
        const t0 = window.__realNow()
        window.__tick()
        v.ctx.getImageData(0, 0, 1, 1)
        times.push(window.__realNow() - t0)
      }
      const s = [...times].sort((a, b) => a - b)
      const per = (k) => Math.round((window.__work[k] ?? 0) / times.length)
      return {
        frames: times.length, x: Math.round(G.g.player.x), mode: G.g.mode,
        avg: times.reduce((a, b) => a + b, 0) / times.length, p50: s[s.length >> 1], p95: s[Math.floor(s.length * 0.95)], max: s.at(-1),
        drawImage: per('drawImage'), fillRect: per('fillRect'), put: per('putImageData'),
        cache: v.cache.size, canvases: window.__canvases.filter((c) => c.width * c.height > 0).length,
        held: Math.round(window.__canvases.reduce((a, c) => a + c.width * c.height * 4, 0) / 1e5) / 10,
        heap: Math.round(performance.memory.usedJSHeapSize / 1e5) / 10, dom: document.getElementsByTagName('*').length,
        timers: window.__timers(), particles: v.particles.length, birds: v.birds.length, views: v.views.size,
      }
    }, { track: TRACK, frames: FRAMES, menu: args.via === 'menu', run, args_quality: args.quality === undefined ? null : +args.quality }))
  }
  if (errors.length) throw new Error(`page errors\n${errors.join('\n')}`)
  console.log(`\n${RUNS} runs of ${FRAMES} frames, track ${TRACK}, restart via ${args.via === 'menu' ? 'menu' : 'R'}, CPU 4x`)
  console.log('  run frames     x    avg    p50    p95    max  drawImg fillRect  put cache canvases canvasMB heapMB  dom timers')
  rows.forEach((r, i) => {
    const f = (n) => n.toFixed(2).padStart(6)
    console.log(`  ${String(i).padStart(3)} ${String(r.frames).padStart(6)} ${String(r.x).padStart(5)} ${f(r.avg)} ${f(r.p50)} ${f(r.p95)} ${f(r.max)} ${String(r.drawImage).padStart(8)} ${String(r.fillRect).padStart(8)} ${String(r.put).padStart(4)} ${String(r.cache).padStart(5)} ${String(r.canvases).padStart(8)} ${String(r.held).padStart(8)} ${String(r.heap).padStart(6)} ${String(r.dom).padStart(4)} ${String(r.timers).padStart(6)}`)
  })
  const a = rows[1] ?? rows[0], b = rows.at(-1)
  const grow = (k) => `${a[k]} → ${b[k]}`
  console.log(`  run 1 → last: avg ${a.avg.toFixed(2)} → ${b.avg.toFixed(2)} ms (${((b.avg / a.avg - 1) * 100).toFixed(0)}%), canvases ${grow('canvases')} holding ${grow('held')} MB, cache ${grow('cache')}, heap ${grow('heap')} MB`)
  if (args.check) {
    const bad = []
    if (b.canvases > a.canvases * 1.15 + 10) bad.push(`canvases with pixels grew ${grow('canvases')}`)
    if (b.held > a.held * 1.15 + 2) bad.push(`canvas memory grew ${grow('held')} MB`)
    if (b.cache > a.cache * 1.15 + 10) bad.push(`sprite cache grew ${grow('cache')}`)
    if (b.drawImage > a.drawImage * 1.1 || b.fillRect > a.fillRect * 1.1) bad.push('per-frame canvas work grew')
    if (bad.length) { failed = true; console.error(`\nFAIL: ${bad.join('; ')}`) }
    else console.log('  OK: nothing accumulates from run to run')
  }
  await ctx.close()
} finally { await server.close(); await browser.close() }
if (failed) process.exit(1)
