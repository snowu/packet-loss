// Render benchmarks: drives the real game in headless Chromium on a fixed
// clock, and measures what each frame asks of the canvas.
//
//   npm run bench                 run every scenario, print work and timing
//   npm run bench:check           fail if the work counters went over budget
//   npm run bench -- --update     write the current counters as the budget
//   npm run bench -- --only=rain  run the scenarios whose name matches
//   npm run bench -- --root=../other-checkout   benchmark another checkout
//
// Two kinds of numbers come out:
//
// - Work per frame (canvas calls, colour parses, gradients, state saves,
//   readbacks, sprite bakes, cached canvases). Time, input and randomness
//   are all pinned, so these come out the same on any machine. They are
//   what the check gates on: bench/baseline.json holds the budget.
// - Time per frame with the CPU throttled 4x (roughly a mid-range phone),
//   including the worst frame. Headless Chromium rasterizes on the CPU and
//   machines differ, so time is reported for comparison between runs on the
//   same machine, never gated. A plain run yields between frames like the
//   game does, so sprites baked on the worker arrive in the background.
//   --check and --update run frames back to back instead, so the counters
//   don't depend on when the worker finishes; their timings are pessimistic
//   (anything the worker would have baked is baked on the main thread).
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as pause } from 'node:timers/promises'

const here = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v = 'true'] = a.replace(/^--/, '').split('=')
  return [k, v]
}))
const root = resolve(args.root ?? resolve(here, '..'))
const BASELINE = resolve(here, 'baseline.json')
// how far a counter may drift over its budget before the check fails
const TOLERANCE = 0.1

// mode: index into the title menu (0 heist, 1 endless); view: viewport size
const LANDSCAPE = [844, 390], PORTRAIT = [390, 844]
const SCENARIOS = [
  { name: 'title', mode: null, view: LANDSCAPE },
  { name: 'endless', mode: 1, view: LANDSCAPE },
  { name: 'endless-rain', mode: 1, view: LANDSCAPE, rain: true },
  { name: 'heist', mode: 0, view: LANDSCAPE },
  { name: 'heist-rain-portrait', mode: 0, view: PORTRAIT, rain: true },
  // the trace alarm and focus (a full-canvas readback) on top
  { name: 'heist-alarm-focus', mode: 0, view: LANDSCAPE, trace: true, focus: true },
  // a long run: sprites for scenery that has scrolled away must not pile up
  { name: 'endless-long', mode: 1, view: LANDSCAPE, frames: 3600, warm: 60, timed: false },
]

// Runs in the page before any game code: pins time, randomness and timers,
// and turns audio off (it consumes randomness on its own schedule).
function pinWorld() {
  let seed = 1
  window.__seed = (v) => { seed = v }
  Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
  window.AudioContext = undefined
  window.webkitAudioContext = undefined
  const realNow = performance.now.bind(performance)
  const realTimeout = window.setTimeout.bind(window)
  window.__yield = () => new Promise((r) => realTimeout(r, 4))
  let now = 0, rafs = [], timers = [], id = 0
  performance.now = () => now
  window.requestAnimationFrame = (f) => { rafs.push(f); return rafs.length }
  window.setTimeout = (f, ms = 0) => { timers.push({ id: ++id, at: now + ms, f }); return id }
  window.clearTimeout = (t) => { timers = timers.filter((x) => x.id !== t) }
  window.setInterval = () => 0
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
}

// Runs in the page: counts what the game asks of 2D canvases.
function countWork() {
  const P = CanvasRenderingContext2D.prototype
  const work = (window.__work = { main: {}, offscreen: {}, gpu: {} })
  const bump = (ctx, k) => {
    const into = ctx.canvas.classList.contains('pixel-canvas') ? work.main : work.offscreen
    into[k] = (into[k] ?? 0) + 1
  }
  const methods = ['fillRect', 'drawImage', 'save', 'clip', 'createLinearGradient', 'getImageData', 'putImageData']
  for (const m of methods) {
    const o = P[m]
    P[m] = function (...a) { bump(this, m); return o.apply(this, a) }
  }
  for (const prop of ['fillStyle', 'globalCompositeOperation']) {
    const d = Object.getOwnPropertyDescriptor(P, prop)
    Object.defineProperty(P, prop, { get: d.get, set(v) { bump(this, `${prop}=`); d.set.call(this, v) } })
  }
  const G = WebGLRenderingContext.prototype
  for (const m of ['texImage2D', 'texSubImage2D', 'drawArrays']) {
    const original = G[m]
    G[m] = function (...args) { work.gpu[m] = (work.gpu[m] ?? 0) + 1; return original.apply(this, args) }
  }
}

async function runScenario(browser, base, sc, pace, tag = '') {
  const ctx = await browser.newContext({ viewport: { width: sc.view[0], height: sc.view[1] }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  // Benchmarks must not depend on Google Fonts availability or font swaps.
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort())
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(pinWorld)
  await page.addInitScript(countWork)
  await page.goto(`${base}?seed=12345`)
  // RAF and page timers are pinned above; poll from Node so startup cannot
  // deadlock while the PNG loader is still finishing after the load event.
  const deadline = Date.now() + 30000
  let loaded = false
  while (!loaded && Date.now() < deadline) {
    loaded = await page.evaluate(() => !!window.__game)
    if (!loaded) await pause(20)
  }
  if (!loaded) throw new Error(`${sc.name}: game did not load (${errors.join('; ') || 'startup timeout'})`)
  await page.evaluate(async (sc) => {
    const G = window.__game
    window.__seed(7)
    if (sc.mode !== null) {
      const { Bot } = await import('/packet-loss/src/sim/bot.js')
      G.start(sc.mode)
      G.g.bot = new Bot(G.g.level)
    }
    const w = G.view.weather
    Object.assign(w, { ready: true, rain: sc.rain ? 1 : 0, target: sc.rain ? 1 : 0, wet: sc.rain ? 1 : 0, clock: 1e9 })
  }, sc)
  const frames = sc.frames ?? 600, warm = sc.warm ?? 120
  const cdp = await ctx.newCDPSession(page)
  if (sc.timed !== false) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  if (args.profile) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start') }
  const result = await page.evaluate(async ({ sc, frames, warm, pace, flush }) => {
    const G = window.__game, v = G.view
    const hold = () => {
      if (sc.trace && G.g.heist) G.g.heist.trace = 0.9
      if (sc.focus && G.g.mode === 'run') { G.g.focusActive = true; G.g.focus = 1 }
    }
    for (let i = 0; i < warm; i++) { hold(); window.__tick(); if (pace) await window.__yield() }
    window.__work.main = {}
    window.__work.offscreen = {}
    window.__work.gpu = {}
    const times = []
    for (let i = 0; i < frames; i++) {
      if (pace) await window.__yield()
      hold()
      const t0 = window.__realNow()
      window.__tick()
      if (flush) {
        v.ctx.getImageData(0, 0, 1, 1)   // flush, so rasterizing is timed too
        if (v.focusFilter?.source) v.focusFilter.gl.finish()
      }
      times.push(window.__realNow() - t0)
    }
    const per = (o) => Object.fromEntries(Object.entries(o).map(([k, n]) => [k, +(n / frames).toFixed(2)]))
    const main = per(window.__work.main)
    main.getImageData = +((main.getImageData ?? 0) - (flush ? 1 : 0)).toFixed(2)   // minus our flush
    times.sort((a, b) => a - b)
    return {
      main,
      offscreen: per(window.__work.offscreen),
      gpu: per(window.__work.gpu),
      cache: v.cache.size,
      mode: G.g.mode,
      x: Math.round(G.g.player.x),
      ms: { avg: times.reduce((a, b) => a + b, 0) / times.length, p50: times[times.length >> 1], p95: times[Math.floor(times.length * 0.95)], max: times.at(-1), slow: times.filter((t) => t > 33.4).length },
    }
  }, { sc, frames, warm, pace, flush: !args['no-flush'] })
  if (args.profile) {
    const { profile } = await cdp.send('Profiler.stop')
    writeFileSync(resolve(args.profile, `${sc.name}${tag ? `-${tag}` : ''}.cpuprofile`), JSON.stringify(profile))
  }
  await ctx.close()
  if (errors.length) throw new Error(`${sc.name}: page errors\n${errors.join('\n')}`)
  return result
}

// The numbers the budget covers, flattened.
function counters(r) {
  const out = {}
  for (const [k, n] of Object.entries(r.main)) out[`canvas.${k}`] = n
  for (const [k, n] of Object.entries(r.offscreen)) out[`offscreen.${k}`] = n
  for (const [k, n] of Object.entries(r.gpu ?? {})) out[`gpu.${k}`] = n
  out.cachedSprites = r.cache
  return out
}

const server = await createServer({ root, configFile: resolve(root, 'vite.config.js'), logLevel: 'error', server: { port: 0, strictPort: false } })
await server.listen()
const base = server.resolvedUrls.local[0]
let comparisonServer
if (args.compare) {
  const comparisonRoot = resolve(args.compare)
  comparisonServer = await createServer({ root: comparisonRoot, configFile: resolve(comparisonRoot, 'vite.config.js'), logLevel: 'error', server: { port: 0, strictPort: false } })
  await comparisonServer.listen()
}
const browser = await chromium.launch({ executablePath: args.chromium || process.env.CHROMIUM_PATH || undefined })
const results = {}
const before = {}
try {
  for (const sc of SCENARIOS) {
    if (args.only && !sc.name.includes(args.only)) continue
    if (comparisonServer) before[sc.name] = await runScenario(browser, comparisonServer.resolvedUrls.local[0], sc, !args.check && !args.update, 'before')
    results[sc.name] = await runScenario(browser, base, sc, !args.check && !args.update, comparisonServer ? 'after' : '')
    const r = results[sc.name]
    const c = counters(r)
    const main = Object.entries(r.main).filter(([, n]) => n >= 0.05).map(([k, n]) => `${k} ${n}`).join(', ')
    console.log(`\n${sc.name}  (${r.mode} at x=${r.x})`)
    if (sc.timed !== false) console.log(`  ${args['no-flush'] ? 'CPU submission' : 'time'} @4x CPU   avg ${r.ms.avg.toFixed(2)} ms  p50 ${r.ms.p50.toFixed(2)}  p95 ${r.ms.p95.toFixed(2)}  worst ${r.ms.max.toFixed(1)}  frames over 33 ms: ${r.ms.slow}`)
    console.log(`  canvas/frame   ${main}`)
    console.log(`  bakes/frame    ${c['offscreen.putImageData'] ?? 0}   cached sprites ${r.cache}`)
    if (Object.keys(r.gpu).length) console.log(`  GPU/frame      ${Object.entries(r.gpu).map(([k, n]) => `${k} ${n}`).join(', ')}`)
    if (before[sc.name] && sc.timed !== false) {
      const b = before[sc.name]
      console.log(`  before → after avg ${b.ms.avg.toFixed(2)} → ${r.ms.avg.toFixed(2)} ms; p95 ${b.ms.p95.toFixed(2)} → ${r.ms.p95.toFixed(2)}; over 33 ms ${b.ms.slow} → ${r.ms.slow}`)
    }
  }
} finally {
  await browser.close()
  await server.close()
  await comparisonServer?.close()
}

if (args.json) writeFileSync(resolve(args.json), `${JSON.stringify(comparisonServer ? { before, after: results } : results, null, 2)}\n`)

if (args.update) {
  const old = (() => { try { return JSON.parse(readFileSync(BASELINE, 'utf8')) } catch { return {} } })()
  for (const [name, r] of Object.entries(results)) old[name] = counters(r)
  writeFileSync(BASELINE, `${JSON.stringify(old, null, 2)}\n`)
  console.log(`\nbudget written to ${BASELINE}`)
}

if (args.check) {
  const budget = JSON.parse(readFileSync(BASELINE, 'utf8'))
  const over = []
  for (const [name, r] of Object.entries(results)) {
    const b = budget[name]
    if (!b) { over.push(`${name}: no budget (run npm run bench -- --update)`); continue }
    for (const [k, n] of Object.entries(counters(r))) {
      const limit = (b[k] ?? 0) * (1 + TOLERANCE) + 0.5
      if (n > limit) over.push(`${name}: ${k} ${n} per frame, budget ${b[k] ?? 0}`)
    }
  }
  if (over.length) {
    console.error(`\nOver budget:\n  ${over.join('\n  ')}\n\nIf the extra work is worth it, raise the budget with: npm run bench -- --update`)
    process.exit(1)
  }
  console.log('\nAll scenarios within budget.')
}
