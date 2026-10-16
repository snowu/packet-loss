// Long-run stability: plays a whole run on the autopilot and reports how
// frame time and per-frame canvas work change from start to finish, in
// windows. Weather runs as in play (it starts dry and turns 10-40 s in), and
// trials first set a time so the measured run races its own ghost.
//
//   npm run bench:long                          Sprint vs its ghost, pinned clock, 4x CPU
//   npm run bench:long -- --compare=../other    the other checkout first, then this one
//   npm run bench:long -- --track=1 --frames=7200   endless (0 heist, 2+ trials) for 2 min
//   npm run bench:long -- --window=300          frames per reported window
//   npm run bench:long -- --sections            time each draw step (raster flushed around it)
//   npm run bench:long -- --profile=dir         a CPU profile per window
//   npm run bench:long -- --realtime [--throttle=4] [--audio]
//       real clock and rAF on a GPU canvas (ANGLE on the system GL driver),
//       reporting delivered fps per window; noisier, closer to a real browser
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as pause } from 'node:timers/promises'

const here = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v = 'true'] = a.replace(/^--/, '').split('=')
  return [k, v]
}))
const WINDOW = +(args.window ?? 300)
const TRACK = +(args.track ?? 2)   // index into the title menu: 0 heist, 1 endless, 2 Sprint
const LIMIT = +(args.frames ?? 20000)

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

function countWork() {
  const P = CanvasRenderingContext2D.prototype
  const work = (window.__work = {})
  const bump = (k) => { work[k] = (work[k] ?? 0) + 1 }
  for (const m of ['fillRect', 'drawImage', 'save', 'createLinearGradient', 'getImageData', 'putImageData']) {
    const o = P[m]
    P[m] = function (...a) { bump(m); return o.apply(this, a) }
  }
  const d = Object.getOwnPropertyDescriptor(P, 'fillStyle')
  Object.defineProperty(P, 'fillStyle', { get: d.get, set(v) { bump('fillStyle='); d.set.call(this, v) } })
}

// Runs in the page for --realtime: real clock and rAF, only randomness
// pinned. Records each frame's interval and the game loop's CPU time.
function recordFrames(audio) {
  let seed = 1
  window.__seed = (v) => { seed = v }
  Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
  if (!audio) {
    window.AudioContext = undefined
    window.webkitAudioContext = undefined
  } else {
    // count the nodes the score and effects create, to see audio load grow
    const AC = window.AudioContext
    window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__ac = this } }
    for (const m of ['createOscillator', 'createBufferSource', 'createGain', 'createBiquadFilter']) {
      const o = AC.prototype[m]
      AC.prototype[m] = function (...a) { window.__audioNodes = (window.__audioNodes ?? 0) + 1; return o.apply(this, a) }
    }
  }
  const raf = window.requestAnimationFrame.bind(window)
  const rec = (window.__frames = { on: false, list: [], last: 0 })
  window.requestAnimationFrame = (f) => raf((t) => {
    const t0 = performance.now()
    f(t)
    if (!rec.on) return
    const G = window.__game
    rec.list.push([t, t - rec.last, performance.now() - t0, G ? G.g.player.x : 0, G ? G.view.weather.rain : 0, window.__audioNodes ?? 0])
    rec.last = t
  })
}

async function runRealtime(browser, base, tag) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort())
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(recordFrames, !!args.audio)
  await page.goto(`${base}?seed=12345`)
  const deadline = Date.now() + 30000
  while (Date.now() < deadline && !(await page.evaluate(() => !!window.__game))) await pause(50)
  await pause(2000)
  const go = (track) => page.evaluate(async (track) => {
    const G = window.__game
    window.__seed(7)
    const { Bot } = await import('/packet-loss/src/sim/bot.js')
    G.start(track)
    G.g.bot = new Bot(G.g.level)
  }, track)
  const waitOver = async (limitS) => {
    const end = Date.now() + limitS * 1000
    while (Date.now() < end && (await page.evaluate(() => window.__game.g.mode)) !== 'over') await pause(250)
  }
  if (TRACK >= 2) { await go(TRACK); await waitOver(240) }   // a first run sets the ghost
  if (args.throttle) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: +args.throttle }) }
  await go(TRACK)
  await page.evaluate(() => { window.__frames.on = true; window.__frames.last = performance.now() })
  await waitOver(LIMIT / 60)
  const out = await page.evaluate(() => ({ audio: window.__ac?.state ?? 'off', list: window.__frames.list, ghost: !!window.__game.g.ghost, clock: window.__game.g.clock }))
  await ctx.close()
  if (errors.length) throw new Error(`${tag}: page errors\n${errors.join('\n')}`)
  // windows of WINDOW frames worth of wall time (WINDOW/60 seconds)
  const span = (WINDOW / 60) * 1000
  const windows = []
  const t0 = out.list[0][0]
  for (const f of out.list) {
    const i = Math.floor((f[0] - t0) / span)
    ;(windows[i] ??= []).push(f)
  }
  const ws = windows.filter(Boolean).map((fs) => {
    const iv = fs.map((f) => f[1]).sort((a, b) => a - b), cpu = fs.map((f) => f[2])
    const n = fs.length
    return {
      frames: n, x0: Math.round(fs[0][3]), x1: Math.round(fs.at(-1)[3]), rain: +fs.at(-1)[4].toFixed(2),
      fps: 1000 * n / iv.reduce((a, b) => a + b, 0), avg: cpu.reduce((a, b) => a + b, 0) / n,
      p95: iv[Math.floor(n * 0.95)], max: iv[n - 1], slow: iv.filter((t) => t > 20).length,
      nodesPerS: Math.round((fs.at(-1)[5] - fs[0][5]) / ((fs.at(-1)[0] - fs[0][0]) / 1000 || 1)),
    }
  })
  return { realtime: true, audio: out.audio, hasGhost: out.ghost, frames: out.list.length, time: out.clock, windows: ws }
}

async function runOnce(browser, base, tag) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort())
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(pinWorld)
  await page.addInitScript(countWork)
  await page.goto(`${base}?seed=12345`)
  const deadline = Date.now() + 30000
  while (Date.now() < deadline && !(await page.evaluate(() => !!window.__game))) await pause(20)
  // First pass, untimed: the autopilot sets a time so the timed pass has a ghost.
  const first = await page.evaluate(async (track) => {
    const G = window.__game
    window.__seed(7)
    const { Bot } = await import('/packet-loss/src/sim/bot.js')
    G.start(track)
    G.g.bot = new Bot(G.g.level)
    Object.assign(G.view.weather, { ready: true, rain: 0, target: 0, wet: 0, clock: 1e9 })
    let n = 0
    while (track >= 2 && G.g.mode !== 'over' && n < 20000) { window.__tick(); n++; if (n % 60 === 0) await window.__yield() }
    return { frames: n, mode: G.g.mode, time: G.g.clock }
  }, TRACK)
  if (TRACK >= 2 && first.mode !== 'over') throw new Error(`${tag}: first pass never finished (${JSON.stringify(first)})`)
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await cdp.send('Performance.enable')
  // Start the timed run, then step it a window at a time from here so each
  // window can be profiled on its own.
  const hasGhost = await page.evaluate(async ({ track, sections }) => {
    const G = window.__game
    window.__seed(7)
    const { Bot } = await import('/packet-loss/src/sim/bot.js')
    G.start(track)
    G.g.bot = new Bot(G.g.level)
    // weather runs as it does in play: it starts dry (or wet) and turns mid-run
    window.__lr = { startX: 0, total: 0 }
    if (sections) {
      // time each draw step with the raster flushed on both sides
      const v = G.view, ctx = v.ctx, sec = (window.__sec = {})
      const flush = () => ctx.getImageData(0, 0, 1, 1)
      const wrap = (obj, name, label = name) => {
        const o = obj[name]
        obj[name] = function (...a) {
          flush()
          const t0 = window.__realNow()
          const r = o.apply(this, a)
          flush()
          sec[label] = (sec[label] ?? 0) + window.__realNow() - t0
          return r
        }
      }
      for (const m of ['drawSky', 'drawClouds', 'drawLayers', 'drawLaneHaze', 'drawCourse', 'drawHeist', 'drawBirds', 'drawGates', 'drawGhost', 'drawRunner', 'drawLandCue', 'drawBeams', 'drawLasers', 'drawParticles', 'drawPopups', 'drawMist', 'drawWeather', 'drawSpeedLines']) if (v[m]) wrap(v, m)
      wrap(v.water, 'draw', 'water.draw')
      wrap(v.effects, 'draw', 'effects.draw')
      wrap(v, 'frame', 'frame(total)')
    }
    return !!G.g.ghost
  }, { track: TRACK, sections: !!args.sections })
  const windows = []
  let profiles = 0
  for (;;) {
    if (args.profile) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start') }
    const w = await page.evaluate(async ({ WINDOW, LIMIT }) => {
      const G = window.__game, v = G.view, lr = window.__lr
      for (const k in window.__work) delete window.__work[k]
      if (window.__sec) for (const k in window.__sec) delete window.__sec[k]
      const times = []
      while (G.g.mode !== 'over' && lr.total < LIMIT && times.length < WINDOW) {
        await window.__yield()
        const t0 = window.__realNow()
        window.__tick()
        v.ctx.getImageData(0, 0, 1, 1)   // flush, so rasterizing is timed too
        times.push(window.__realNow() - t0)
        lr.total++
      }
      const n = times.length
      if (!n) return null
      const work = Object.fromEntries(Object.entries(window.__work).map(([k, c]) => [k, +(c / n).toFixed(1)]))
      const s = [...times].sort((a, b) => a - b)
      const x0 = lr.startX
      lr.startX = Math.round(G.g.player.x)
      return {
        frames: n, x0, x1: lr.startX, mode: G.g.mode, done: G.g.mode === 'over' || lr.total >= LIMIT, clock: G.g.clock,
        avg: times.reduce((a, b) => a + b, 0) / n, p50: s[n >> 1], p95: s[Math.floor(n * 0.95)], max: s[n - 1],
        work, cache: v.cache?.size ?? 0, rain: +v.weather.rain.toFixed(2),
        sections: window.__sec ? Object.fromEntries(Object.entries(window.__sec).map(([k, ms]) => [k, +(ms / n).toFixed(2)])) : null,
        heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null,
        dom: document.getElementsByTagName('*').length,
      }
    }, { WINDOW, LIMIT })
    if (args.profile) {
      const { profile } = await cdp.send('Profiler.stop')
      if (w) writeFileSync(resolve(args.profile, `${tag}-w${String(profiles++).padStart(2, '0')}.cpuprofile`), JSON.stringify(profile))
    }
    if (!w) break
    windows.push(w)
    if (w.done) break
  }
  const result = { hasGhost, frames: windows.reduce((a, w) => a + w.frames, 0), time: windows.at(-1).clock, windows }
  await ctx.close()
  if (errors.length) throw new Error(`${tag}: page errors\n${errors.join('\n')}`)
  return result
}

function reportRealtime(tag, r) {
  console.log(`\n${tag} (real time, GPU canvas, audio ${r.audio}): ${r.frames} frames, ghost ${r.hasGhost ? 'on' : 'OFF'}, run ${r.time.toFixed(2)} s`)
  console.log('  window      x       fps  cpu ms  p95 interval  worst  frames>20ms  rain  audio nodes/s')
  r.windows.forEach((w, i) => {
    console.log(`  ${String(i).padStart(3)} ${`${w.x0}-${w.x1}`.padStart(10)} ${w.fps.toFixed(1).padStart(6)} ${w.avg.toFixed(2).padStart(7)} ${w.p95.toFixed(1).padStart(13)} ${w.max.toFixed(1).padStart(6)} ${String(w.slow).padStart(12)} ${String(w.rain).padStart(5)} ${String(w.nodesPerS).padStart(8)}`)
  })
  const full = r.windows.slice(0, -1)
  const a = full[0], b = full.at(-1)
  console.log(`  first → last full window: ${a.fps.toFixed(1)} → ${b.fps.toFixed(1)} fps, CPU ${a.avg.toFixed(2)} → ${b.avg.toFixed(2)} ms`)
}

function report(tag, r) {
  if (r.realtime) return reportRealtime(tag, r)
  console.log(`\n${tag}: ${r.frames} frames, ghost ${r.hasGhost ? 'on' : 'OFF'}, run ${r.time.toFixed(2)} s`)
  console.log('  window      x        avg     p50     p95     max   drawImage fillRect fillStyle=  cache heapMB  dom  rain')
  r.windows.forEach((w, i) => {
    const f = (n) => n.toFixed(2).padStart(7)
    console.log(`  ${String(i).padStart(3)} ${`${w.x0}-${w.x1}`.padStart(10)} ${f(w.avg)} ${f(w.p50)} ${f(w.p95)} ${f(w.max)}  ${String(w.work.drawImage ?? 0).padStart(8)} ${String(w.work.fillRect ?? 0).padStart(8)} ${String(w.work['fillStyle='] ?? 0).padStart(10)} ${String(w.cache).padStart(6)} ${String(w.heap).padStart(6)} ${String(w.dom).padStart(5)} ${String(w.rain).padStart(5)}`)
  })
  if (r.windows[0].sections) {
    const keys = Object.keys(r.windows[0].sections).sort((a, b) => r.windows.at(-2).sections[b] - r.windows.at(-2).sections[a])
    console.log(`  ms/frame by step ${r.windows.map((_, i) => String(i).padStart(6)).join('')}`)
    for (const k of keys) console.log(`  ${k.padEnd(16)} ${r.windows.map((w) => (w.sections[k] ?? 0).toFixed(2).padStart(6)).join('')}`)
  }
  const full = r.windows.filter((w) => w.frames >= WINDOW / 2)
  const a = full[0], b = full.at(-1)
  console.log(`  first → last window: avg ${a.avg.toFixed(2)} → ${b.avg.toFixed(2)} ms (${((b.avg / a.avg - 1) * 100).toFixed(0)}%), p95 ${a.p95.toFixed(2)} → ${b.p95.toFixed(2)} ms`)
}

// --realtime wants the GPU: ANGLE on the system GL driver gives headless
// Chromium a hardware-accelerated canvas like a desktop browser's.
const browser = await chromium.launch({
  executablePath: args.chromium || process.env.CHROMIUM_PATH || undefined,
  args: ['--enable-precise-memory-info', ...(args.realtime ? ['--headless=new', '--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--autoplay-policy=no-user-gesture-required'] : [])],
})
const out = {}
try {
  const roots = args.compare ? [['before', resolve(args.compare)], ['after', resolve(here, '..')]] : [['run', resolve(args.root ?? resolve(here, '..'))]]
  for (const [tag, root] of roots) {
    const server = await createServer({ root, configFile: resolve(root, 'vite.config.js'), logLevel: 'error', server: { port: 0, strictPort: false } })
    await server.listen()
    try {
      out[tag] = await (args.realtime ? runRealtime : runOnce)(browser, server.resolvedUrls.local[0], tag)
      report(tag, out[tag])
    } finally { await server.close() }
  }
} finally { await browser.close() }
if (args.json) writeFileSync(resolve(args.json), `${JSON.stringify(out, null, 2)}\n`)
