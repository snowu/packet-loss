import './ui/style.css'
import { PHYS, FOCUS, RUN, HEIST } from './sim/config.js'
import { Level } from './sim/level.js'
import { createPlayer, stepPlayer, predictLanding, landSlideSpeed } from './sim/player.js'
import { Bot } from './sim/bot.js'
import { ScoreKeeper, COMBO_WINDOW } from './sim/score.js'
import { GhostRecorder, GhostPlayer } from './sim/ghost.js'
import { TRACKS, dailyTrack, levelOptions } from './sim/tracks.js'
import { HeistState, heistOptions } from './sim/heist.js'
import { chromeById } from './sim/chrome.js'
import { Input } from './input.js'
import { Audio } from './audio.js'
import { Hud, formatTime, medalFor } from './ui/hud.js'
import { PixelView } from './pixel/view.js'
import { loadArtOverrides } from './pixel/overrides.js'
import { PALETTE_NAMES, pinPalette } from './pixel/palette.js'
import { RUNNERS, RUNNER_STYLES } from './pixel/runner.js'
import { localLab } from './lab/local.js'
import { installAppUpdates } from './ui/update.js'
import { installOffline } from './ui/offline.js'

const DEMO_SEED = 20261007
const TOAST = {
  vault: 'SPEED VAULT', clamber: 'CLAMBER', roll: 'ROLL', wallrun: 'WALLRUN', walljump: 'WALL KICK',
  zip: 'ZIPLINE', spring: 'LAUNCH', padjump: 'PAD JUMP', grab: 'LEDGE', climb: 'WALL CLIMB', slidejump: 'SLIDE JUMP', landslide: 'LANDING SLIDE', airjump: 'AIR JUMP',
}

const store = {
  get(key, fallback) { try { return localStorage.getItem(key) ?? fallback } catch { return fallback } },
  set(key, value) { try { localStorage.setItem(key, value) } catch { /* storage unavailable */ } },
  json(key) { try { return JSON.parse(localStorage.getItem(key)) } catch { return null } },
}

const isTouch = window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0
const params = new URLSearchParams(location.search)
const fixedSeed = params.has('seed') ? Number(params.get('seed')) : null

// artist PNGs (public/art) must be in before the first sprite is baked and cached
await loadArtOverrides()
const view = new PixelView()
const input = new Input()
const audio = new Audio()
const hud = new Hud(isTouch)
hud.setMuted(audio.muted)
let artLabOpen = false
let artLabAudioRunning = false
if (localLab) {
  import('./lab/host.js').then(({ installArtLab }) => installArtLab({
    onOpen() {
      artLabOpen = true
      input.clearEdges()
      input.jump = input.down = input.anyPressed = false
      artLabAudioRunning = audio.ctx?.state === 'running'
      audio.ctx?.suspend()
    },
    onClose() {
      artLabOpen = false
      input.clearEdges()
      input.jump = input.down = input.anyPressed = false
      if (artLabAudioRunning) audio.ctx?.resume()
    },
  }))
}

// F4 (local only): clarity checks. Compare against the look before the
// clarity pass, or judge the frame by value (grayscale) and at a squint.
if (localLab) {
  const CLARITY = [
    { name: '', classic: false, filter: '' },
    { name: 'CLASSIC LOOK', classic: true, filter: '' },
    { name: 'VALUE CHECK', classic: false, filter: 'grayscale(1)' },
    { name: 'SQUINT CHECK', classic: false, filter: 'blur(5px)' },
  ]
  let clarity = 0
  const badge = Object.assign(document.createElement('div'), { className: 'clarity-badge' })
  document.body.append(badge)
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'F4' || artLabOpen) return
    e.preventDefault()
    if (e.repeat) return
    clarity = (clarity + 1) % CLARITY.length
    const c = CLARITY[clarity]
    view.setClassic(c.classic)
    view.canvas.style.filter = c.filter
    badge.textContent = c.name ? `${c.name} · F4` : ''
  })
}

const MODES = [{ kind: 'heist' }, { kind: 'endless' }, ...TRACKS.map((track) => ({ kind: 'trial', track })), { kind: 'trial', daily: true }]

// The daily course comes from the date when you look at it or start it, so a
// page left open past midnight moves on. Its medals come from timing the
// autopilot on it in a worker, cached for the day.
const dailyMedals = { pending: null, worker: null }
function dailyWithMedals() {
  const track = dailyTrack()
  track.medals = store.json(`fil.medals.${track.id}`)
  if (!track.medals) requestDailyMedals(track)
  return track
}
function requestDailyMedals(track) {
  if (dailyMedals.pending === track.id) return
  try {
    dailyMedals.worker ??= new Worker(new URL('./medalWorker.js', import.meta.url), { type: 'module' })
  } catch { return }
  dailyMedals.pending = track.id
  dailyMedals.worker.onmessage = (e) => {
    const { id, medals } = e.data
    dailyMedals.pending = null
    if (!medals) return
    try {
      for (const key of Object.keys(localStorage)) if (key.startsWith('fil.medals.daily-')) localStorage.removeItem(key)
    } catch { /* storage unavailable */ }
    store.set(`fil.medals.${id}`, JSON.stringify(medals))
    if (g.track?.id === id) g.track.medals = medals
    if (g.mode === 'title') renderMenu()
  }
  dailyMedals.worker.postMessage({ date: Date.now() })
}
const trackOf = (m) => (m.daily ? dailyWithMedals() : m.track)

const g = {
  mode: 'title',            // title | countdown | run | respawn | finish | over | paused | shop | flatline
  pausedFrom: null,
  sel: Math.min(MODES.length - 1, Number(store.get('fil.sel', 0)) || 0),
  kind: 'endless',
  track: null,
  level: null,
  player: null,
  bot: null,
  prevX: 0, prevY: 0,
  acc: 0,
  clock: 0,
  phaseT: 0,
  topSpeed: 0,
  moves: 0,
  falls: 0,
  focus: 0,
  focusActive: false,
  focusVis: 0,
  flash: 0,
  fade: 1,
  district: '',
  runner: 'courier',
  city: 0,                  // index into CITIES
  hintsShown: new Set(),
  cpNext: 0,
  splits: [],
  pb: null,
  ghost: null,
  recorder: null,
  score: null,
  lives: 0,
  overAt: 0,
  heist: null,
  sectors: [],              // heist sector boundaries, start to finish
  shopSel: 0,
  tutorialDone: store.get('fil.tutorial', '0') === '1',
  focusHinted: store.get('fil.focusHint', '0') === '1',
  comboHinted: store.get('fil.comboHint', '0') === '1',
  seenHints: new Set(store.json('fil.seen') ?? []),
}

// ── records ──────────────────────────────────────────────────────────────

const endlessBest = () => Number(store.get('fil.best.endless', 0)) || 0
const heistBest = () => store.json('fil.best.heist')
const trialPB = (track) => store.json(`fil.pb.${track.id}`)

function menuItems() {
  return MODES.map((m) => {
    if (m.kind === 'heist') {
      const best = heistBest()
      const sub = `roguelike · ${HEIST.SECTORS} sectors · chrome`
      return { name: 'HEIST', sub, best: best ? `${best.extracted ? 'OUT' : `S${best.sector + 1}`} · ${best.score.toLocaleString()}` : '—', medal: -1 }
    }
    if (m.kind === 'endless') {
      return { name: 'ENDLESS', sub: 'combo score attack', best: `${endlessBest().toLocaleString()} PTS`, medal: -1 }
    }
    const track = trackOf(m)
    const pb = trialPB(track)
    const sub = track.daily ? `${track.daily.slice(4, 6)}/${track.daily.slice(6)} · ${track.length} M` : `time trial · ${track.length} M`
    return { name: track.name.toUpperCase(), sub, best: pb ? formatTime(pb.time) : '—', medal: pb ? medalFor(pb.time, track.medals) : -1 }
  })
}

// City palette: drift through every district, or pin a favorite.
const CITIES = [null, ...PALETTE_NAMES.map((_, i) => i)]
const cityName = document.getElementById('city-name')
function setCity(i, animate = false) {
  g.city = (i + CITIES.length) % CITIES.length
  if (animate) view.crossfade()
  store.set('fil.city', String(g.city))
  pinPalette(CITIES[g.city])
  cityName.textContent = CITIES[g.city] === null ? 'DRIFT' : PALETTE_NAMES[CITIES[g.city]].toUpperCase()
}
setCity(Number(store.get('fil.city', 0)) || 0)

// Runners: Courier is free; the other outfits unlock with gold medals.
const UNLOCKS = {
  windbreaker: { label: 'gold on any trial', test: (gold) => gold.size > 0 },
  techwear: { label: 'gold on Sprint, Relay and Gauntlet', test: (gold) => TRACKS.every((t) => gold.has(t.id)) },
}
function golds() {
  const gold = new Set(store.json('fil.golds') ?? [])
  for (const t of TRACKS) if (medalFor(trialPB(t)?.time, t.medals) === 0) gold.add(t.id)
  return gold
}
const unlocked = (id) => !UNLOCKS[id] || UNLOCKS[id].test(golds())
const runnerName = document.getElementById('runner-name')
function setRunner(id, animate = false) {
  if (!RUNNERS.includes(id) || !unlocked(id)) id = RUNNERS[0]
  g.runner = id
  store.set('fil.runner', id)
  if (animate) view.crossfade()
  view.setRunner(id)
  runnerName.textContent = RUNNER_STYLES[id].name.toUpperCase()
  const locked = Object.entries(UNLOCKS).filter(([style]) => !unlocked(style))
  document.getElementById('unlock-note').textContent = locked.map(([style, u]) => `${RUNNER_STYLES[style].name}: ${u.label}`).join(' · ')
}
// step through the runners you have, skipping locked ones
function stepRunner(d) {
  let i = RUNNERS.indexOf(g.runner)
  for (let n = 0; n < RUNNERS.length; n++) {
    i = (i + d + RUNNERS.length) % RUNNERS.length
    if (unlocked(RUNNERS[i])) break
  }
  setRunner(RUNNERS[i], true)
}
setRunner(store.get('fil.runner', RUNNERS[0]).split(':')[0])

function renderMenu() {
  hud.menu(menuItems(), g.sel, (i) => start(i))
}

// ── worlds and runs ──────────────────────────────────────────────────────

function buildWorld(level, demo) {
  g.level = level
  level.ensure(260)
  view.bind(level)
  g.player = createPlayer(0, level.roofAt(0))
  g.prevX = g.player.x
  g.prevY = g.player.y
  g.bot = demo ? new Bot(level) : null
  g.acc = 0
  g.focus = 0
  g.focusActive = false
  g.district = ''
  view.snap(g.player.x, g.player.y)
}

function endHeistState() {
  g.heist?.dispose()
  g.heist = null
}

function toTitle() {
  endHeistState()
  hud.showShop(false)
  buildWorld(new Level(DEMO_SEED), true)
  g.mode = 'title'
  hud.showHud(false)
  hud.showOver(false)
  hud.showPaused(false)
  hud.showTitle(true)
  renderMenu()
}

function start(i) {
  g.sel = i
  store.set('fil.sel', String(i))
  newRun()
}

function newRun() {
  audio.start()
  endHeistState()
  hud.showShop(false)
  const m = MODES[g.sel]
  g.kind = m.kind
  g.track = m.kind === 'trial' ? trackOf(m) : null
  const seed = fixedSeed ?? (Math.random() * 2 ** 32) >>> 0
  const level = g.kind === 'trial'
    ? new Level(g.track.seed, levelOptions(g.track))
    : g.kind === 'heist' ? new Level(seed, heistOptions()) : new Level(seed)
  buildWorld(level, false)
  g.clock = 0
  g.phaseT = 0
  g.topSpeed = 0
  g.moves = 0
  g.falls = 0
  g.cpNext = 0
  g.splits = []
  g.hintsShown.clear()
  g.heist = g.kind === 'heist' ? new HeistState(seed) : null
  g.score = new ScoreKeeper()
  g.score.teleport(g.player.x)
  g.lives = RUN.LIVES
  g.fade = 1
  view.passed = 0

  if (g.kind === 'trial') {
    level.ensure(g.track.length + 120)
    g.pb = trialPB(g.track)
    g.ghost = g.pb?.ghost ? new GhostPlayer(g.pb.ghost) : null
    g.recorder = new GhostRecorder()
    hud.setupRun('trial', {
      title: g.track.name.toUpperCase(),
      best: g.pb ? `PB ${formatTime(g.pb.time)}` : 'NO TIME YET',
      checkpoints: level.checkpoints,
      length: level.finish.x,
    })
    g.mode = 'countdown'
    g.countShown = -1
  } else if (g.kind === 'heist') {
    level.ensure(HEIST.SECTORS * HEIST.SECTOR_LEN + 120)
    g.sectors = [0, ...level.checkpoints.map((c) => c.x), level.finish.x]
    g.pb = null
    g.ghost = null
    g.recorder = null
    const best = heistBest()
    hud.setupRun('heist', {
      title: '',
      best: best ? `BEST ${best.score.toLocaleString()}` : 'FIRST RUN',
      lives: g.heist.maxIntegrity,
      checkpoints: level.checkpoints,
      length: level.finish.x,
    })
    hud.chrome([])
    if (!g.seenHints.has('heist')) {
      g.seenHints.add('heist')
      store.set('fil.seen', JSON.stringify([...g.seenHints]))
      setTimeout(() => hud.hint('heist'), 1900)
    }
    g.mode = 'countdown'
    g.countShown = -1
  } else {
    g.pb = null
    g.ghost = null
    g.recorder = null
    hud.setupRun('endless', { title: '', best: `BEST ${endlessBest().toLocaleString()}`, lives: RUN.LIVES })
    g.mode = 'run'
    if (!g.comboHinted && g.tutorialDone) {
      g.comboHinted = true
      store.set('fil.comboHint', '1')
      hud.hint('combo')
    }
  }
  input.clearEdges()
  hud.showTitle(false)
  hud.showOver(false)
  hud.showPaused(false)
  hud.showHud(true)
  hud.showZones()
  setTimeout(() => hud.hideZones(), 3500)
}

function toMenu() {
  audio.ctx?.resume()
  toTitle()
}

function setPaused(on) {
  if (on && (g.mode === 'run' || g.mode === 'countdown' || g.mode === 'respawn')) {
    g.pausedFrom = g.mode
    g.mode = 'paused'
    hud.showPaused(true)
    audio.ctx?.suspend()
  } else if (!on && g.mode === 'paused') {
    g.mode = g.pausedFrom
    hud.showPaused(false)
    input.clearEdges()
    audio.ctx?.resume()
  }
}

function toggleMute() {
  audio.start()
  audio.setMuted(!audio.muted)
  hud.setMuted(audio.muted)
}

const playing = () => ['countdown', 'run', 'respawn', 'finish', 'paused', 'over', 'shop', 'flatline'].includes(g.mode)

input.on('nav', (d) => {
  if (g.mode === 'shop') {
    g.shopSel = (g.shopSel + d + 5) % 5
    renderShop()
    return
  }
  if (g.mode !== 'title') return
  g.sel = (g.sel + d + MODES.length) % MODES.length
  renderMenu()
})
input.on('runner', (d) => {
  if (g.mode === 'title') stepRunner(d)
})
input.on('side', (d) => {
  if (g.mode === 'title') setCity(g.city + d, true)
})
input.on('confirm', () => {
  if (g.mode === 'shop') shopAction(g.shopSel)
  else if (g.mode === 'title') start(g.sel)
  else if (g.mode === 'over' && performance.now() - g.overAt > 400) newRun()
})
input.on('enter', () => {
  if (g.mode === 'shop') shopAction(g.shopSel)
  else if (g.mode === 'title') start(g.sel)
  else if (g.mode === 'paused') { hud.showPaused(false); toMenu() }
  else if (g.mode === 'over') newRun()
})
input.on('restart', () => {
  if (!playing()) return
  audio.ctx?.resume()
  newRun()
})
input.on('back', () => {
  if (g.mode === 'paused') setPaused(false)
  else if (g.mode === 'over') toMenu()
  else setPaused(true)
})
input.on('pause', () => setPaused(g.mode !== 'paused'))
input.on('mute', toggleMute)

const click = (id, fn) => document.getElementById(id).addEventListener('click', fn)
click('btn-pause', () => setPaused(g.mode !== 'paused'))
click('btn-mute', toggleMute)
click('btn-retry', () => newRun())
click('btn-menu', () => toMenu())
click('btn-resume', () => setPaused(false))
click('btn-restart', () => { audio.ctx?.resume(); newRun() })
click('btn-quit', () => toMenu())
// blur after a click so Space starts the run instead of pressing the arrow again
click('city-prev', (e) => { setCity(g.city - 1, true); e.currentTarget.blur() })
click('city-next', (e) => { setCity(g.city + 1, true); e.currentTarget.blur() })
click('runner-prev', (e) => { stepRunner(-1); e.currentTarget.blur() })
click('runner-next', (e) => { stepRunner(1); e.currentTarget.blur() })
// Fullscreen: toggled from the title screen or the HUD. Landscape is locked
// where the browser allows it. iPhone Safari has no fullscreen API, so it gets
// a hint to install to the home screen (the manifest launches fullscreen).
const docEl = document.documentElement
const canFullscreen = !!(docEl.requestFullscreen || docEl.webkitRequestFullscreen)
const isStandalone = window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement
document.body.classList.toggle('no-fs', !canFullscreen || isStandalone)
document.body.classList.toggle('ios-browser', !!(isIOS && !isStandalone))

async function toggleFullscreen() {
  try {
    if (fullscreenElement()) {
      await (document.exitFullscreen || document.webkitExitFullscreen).call(document)
    } else {
      await (docEl.requestFullscreen || docEl.webkitRequestFullscreen).call(docEl, { navigationUI: 'hide' })
      await screen.orientation?.lock?.('landscape').catch(() => {})
    }
  } catch { /* the browser refused; nothing to undo */ }
}
const syncFullscreen = () => document.body.classList.toggle('fs', !!fullscreenElement())
document.addEventListener('fullscreenchange', syncFullscreen)
document.addEventListener('webkitfullscreenchange', syncFullscreen)
for (const btn of document.querySelectorAll('.fs-toggle')) btn.addEventListener('click', toggleFullscreen)

document.getElementById('btn-focus').addEventListener('touchstart', (e) => { e.preventDefault(); input.focusPressed = true }, { passive: false })
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true) })

if (import.meta.env.DEV) {
  input.on('debug', async () => {
    if (g.gui) { g.gui.destroy(); g.gui = null; return }
    const { default: GUI } = await import('lil-gui')
    g.gui = new GUI({ title: 'Tuning' })
    const phys = g.gui.addFolder('Physics')
    for (const k of Object.keys(PHYS)) if (typeof PHYS[k] === 'number' && k !== 'FIXED_DT') phys.add(PHYS, k)
  })
}

// ── game events ──────────────────────────────────────────────────────────

function onEvent(e) {
  const p = g.player
  const live = g.mode === 'run'
  if (live || g.mode === 'title') audio.event(e.type, e)
  view.event(e, p)
  if (e.type === 'bonk') g.flash = 0.12
  if (g.heist && live) heistEvent(e)
  if (e.type === 'dead') {
    if (g.mode === 'title') toTitle()
    else if (live) startRespawn()
    return
  }
  if (!live) return
  if (e.type === 'hardland') hud.toast('HARD LANDING', 'ROLL IT NEXT TIME')
  if (e.type === 'trip') hud.toast('TRIPPED', 'JUMP TO VAULT')
  if (e.type === 'shock') { hud.toast('SHOCKED', 'JUMP THE FENCE'); g.flash = 0.15 }
  if (TOAST[e.type]) {
    g.moves++
    if (g.kind === 'trial') hud.toast(TOAST[e.type])
  }
  if (g.kind !== 'trial') {
    const result = g.score.event(e.type, p.speed)
    if (result === 'bail') { hud.comboResult('bail', g.score.log.at(-1).points); audio.event('bail') }
  }
  const gain = FOCUS.GAIN[e.type]
  if (gain) g.focus = Math.min(1, g.focus + gain * (g.heist?.mods.focusGain ?? 1))
}

// ── heist ───────────────────────────────────────────────────────────────

function heistEvent(e) {
  const n = g.heist
  n.move(e.type)
  switch (e.type) {
    case 'zap':
      hud.toast('LASER GRID', e.keepsCombo ? 'INSULATED' : 'ALARM TRIPPED')
      if (!e.keepsCombo && g.score.bail() === 'bail') hud.comboResult('bail', g.score.log.at(-1).points)
      break
    case 'spotted':
      hud.toast('SPOTTED', 'TRACE +')
      break
    case 'takedown':
      hud.toast('TAKEDOWN')
      break
    case 'traced':
      hud.toast('ICE BURN', 'INTEGRITY −1')
      g.flash = 0.25
      if (g.score.bail() === 'bail') hud.comboResult('bail', g.score.log.at(-1).points)
      if (n.integrity <= 0) {
        g.mode = 'flatline'
        g.phaseT = 0
        g.focusActive = false
      }
      break
  }
}

function openShop() {
  const n = g.heist
  n.advance()
  n.openShop()
  if (g.score.bank() === 'bank') hud.comboResult('bank', g.score.log.at(-1).points)
  g.mode = 'shop'
  g.focusActive = false
  g.shopSel = 0
  input.clearEdges()
  renderShop()
  hud.hint(null)
  hud.showShop(true)
  audio.event('uplink')
}

function renderShop() {
  const n = g.heist
  hud.shop({
    sector: n.sector,
    sectors: HEIST.SECTORS,
    creds: n.creds,
    integrity: n.integrity,
    maxIntegrity: n.maxIntegrity,
    offer: n.offer.map((c) => ({ ...c, have: n.owned.filter((o) => o === c.id).length })),
    repair: { cost: n.repairCost, ok: n.canRepair, full: n.integrity >= n.maxIntegrity },
    reroll: { cost: n.rerollCost, ok: n.canReroll },
    owned: n.owned.map(chromeById),
  }, g.shopSel, shopAction)
}

function shopAction(i) {
  if (g.mode !== 'shop') return
  const n = g.heist
  g.shopSel = i
  if (i < 3) {
    const c = n.offer[i]
    if (!c && n.offer.length) return
    if (c) {
      n.install(c.id)
      g.score.window = COMBO_WINDOW + n.mods.comboBonus
      audio.event('install')
      hud.toast(c.name.toUpperCase(), 'INSTALLED')
    }
    hud.showShop(false)
    hud.chrome(n.owned.map(chromeById))
    hud.setLives(n.maxIntegrity)
    g.mode = 'countdown'
    g.countShown = -1
    g.phaseT = 0
    input.clearEdges()
    return
  }
  const ok = i === 3 ? n.repair() : n.reroll()
  audio.event(ok ? 'buy' : 'deny')
  renderShop()
}

function endHeist(extracted) {
  const n = g.heist
  if (g.score.bank() === 'bank') hud.comboResult('bank', g.score.log.at(-1).points)
  const bonus = extracted ? 2500 + 1000 * n.integrity : 0
  const score = Math.floor(g.score.total) + bonus
  const prev = heistBest()
  const newBest = !prev || score > prev.score
  const sector = extracted ? HEIST.SECTORS - 1 : n.sector
  if (newBest) store.set('fil.best.heist', JSON.stringify({ score, sector, extracted }))
  g.result = {
    kind: 'heist', extracted, score, bonus, best: Math.max(prev?.score ?? 0, score), newBest,
    sector, sectors: HEIST.SECTORS, creds: n.creds, stats: { ...n.stats }, chrome: n.owned.map(chromeById),
    topSpeed: g.topSpeed, bestCombo: g.score.bestCombo,
  }
  audio.event(extracted || newBest ? 'best' : 'finish')
  endHeistState()
  showResults()
}

// Heist sectors each get their own district; the palette blends into the
// next one as the uplink comes up.
function paletteDistance(x) {
  if (g.kind !== 'heist' || g.sectors.length < 2) return Math.max(0, x)
  const b = g.sectors
  let i = 0
  while (i < b.length - 2 && x >= b[i + 1]) i++
  const u = Math.max(0, Math.min(0.999, (x - b[i]) / (b[i + 1] - b[i])))
  return i * 1500 + u * 1500
}

function startRespawn() {
  g.mode = 'respawn'
  g.phaseT = 0
  g.falls++
  g.focusActive = false
  view.setFloor(g.player.y + 2)
  audio.event('dead')
  if (g.kind !== 'trial') {
    if (g.score.bail() === 'bail') hud.comboResult('bail', g.score.log.at(-1).points)
  }
  if (g.kind === 'endless') g.lives--
  if (g.heist) {
    g.heist.stats.falls++
    g.lives = g.heist.hurt()
  }
}

function respawn() {
  const r = g.heist ? g.level.roofStartBehind(g.prevX) : g.level.respawnPoint(g.prevX)
  g.player = createPlayer(r.x, r.y)
  g.player.speed = PHYS.SPEED_MIN
  g.prevX = r.x
  g.prevY = r.y
  g.acc = 0
  g.score.teleport(r.x)
  view.snap(r.x, r.y)
  g.fade = 0.8
  g.mode = 'run'
  audio.event('respawn')
}

function passCheckpoint(i) {
  view.passed = i + 1
  if (g.heist) {
    openShop()
    return
  }
  audio.event('checkpoint')
  if (g.kind !== 'trial') {
    hud.toast('CHECKPOINT')
    return
  }
  g.splits.push(g.clock)
  const pbSplit = g.pb?.splits?.[i]
  hud.split(pbSplit != null ? g.clock - pbSplit : null)
}

// Gold medals unlock runners; say so the moment one does.
function awardGold(id) {
  const before = RUNNERS.filter(unlocked)
  const gold = new Set(store.json('fil.golds') ?? [])
  gold.add(id)
  store.set('fil.golds', JSON.stringify([...gold]))
  const fresh = RUNNERS.filter((r) => unlocked(r) && !before.includes(r))
  for (const style of fresh) hud.toast(`UNLOCKED · ${RUNNER_STYLES[style].name.toUpperCase()}`, 'NEW RUNNER ON THE TITLE SCREEN')
  setRunner(g.runner)
}

function finishTrial() {
  g.splits.push(g.clock)
  const time = g.clock
  const prev = g.pb
  const newBest = !prev || time < prev.time
  if (newBest) {
    store.set(`fil.pb.${g.track.id}`, JSON.stringify({ time, splits: g.splits, ghost: g.recorder.data() }))
  }
  g.result = {
    kind: 'trial', track: g.track.name, time, newBest, prevBest: prev?.time ?? null, prevSplits: prev?.splits ?? null,
    medals: g.track.medals, splits: g.splits, falls: g.falls, topSpeed: g.topSpeed, moves: g.moves,
  }
  const pbSplit = prev?.time
  hud.split(pbSplit != null ? time - pbSplit : null)
  audio.event(newBest ? 'best' : 'finish')
  if (medalFor(time, g.track.medals) === 0) awardGold(g.track.daily ? 'daily' : g.track.id)
  g.mode = 'finish'
  g.phaseT = 0
}

function endEndless() {
  const best = endlessBest()
  const score = Math.floor(g.score.total)
  const newBest = score > best
  if (newBest) store.set('fil.best.endless', String(score))
  g.result = {
    kind: 'endless', score, best: Math.max(best, score), newBest, distance: Math.max(0, g.player.x),
    bestCombo: g.score.bestCombo, topSpeed: g.topSpeed,
  }
  if (newBest) audio.event('best')
  showResults()
}

function showResults() {
  g.mode = 'over'
  g.overAt = performance.now()
  input.clearEdges()
  hud.showHud(false)
  hud.showOver(true, g.result)
}

// ── per-frame systems ────────────────────────────────────────────────────

const events = []
const IDLE = { jump: false, jumpPressed: false, down: false, downPressed: false }

function stepPhysics(dt) {
  g.acc += dt
  let steps = 0
  while (g.acc >= PHYS.FIXED_DT && steps < 12) {
    g.acc -= PHYS.FIXED_DT
    steps++
    const p = g.player
    g.prevX = p.x
    g.prevY = p.y
    g.level.ensure(p.x + 200)
    const control = g.bot ? g.bot.input(p) : g.mode === 'run' ? input.consume() : IDLE
    events.length = 0
    stepPlayer(p, control, PHYS.FIXED_DT, g.level, events)
    if (g.heist && g.mode === 'run') g.heist.step(PHYS.FIXED_DT, p, g.level, events)
    for (const e of events) onEvent(e)
    if (g.mode !== 'run' && g.mode !== 'title' && g.mode !== 'finish') break
    // an uplink opens the street doc: stop simulating right there
    if (g.heist) {
      const cps = g.level.checkpoints
      if (g.cpNext < cps.length && p.x >= cps[g.cpNext].x) break
    }
  }
  if (g.acc > PHYS.FIXED_DT * 4) g.acc = 0
}

function updateFocus(dt) {
  const p = g.player
  if (p.speed >= 15) g.focus = Math.min(1, g.focus + FOCUS.GAIN_AT_SPEED * dt)
  const mods = g.heist?.mods
  if (input.takeFocus()) {
    if (g.focusActive) g.focusActive = false
    else if (g.focus >= FOCUS.MIN_TO_START) {
      g.focusActive = true
      audio.event('focus')
    }
  }
  if (g.focusActive) {
    g.focus = Math.max(0, g.focus - FOCUS.DRAIN * (mods?.focusDrain ?? 1) * dt)
    if (g.focus <= 0) g.focusActive = false
  }
  if (!g.focusHinted && g.focus >= FOCUS.MIN_TO_START && p.x > 400) {
    g.focusHinted = true
    store.set('fil.focusHint', '1')
    hud.hint('focus')
  }
}

// First jump pad in sight gets a one-time hint.
function padHint() {
  if (g.seenHints.has('pad')) return
  const p = g.player
  if (!g.level.padsIn(p.x + 6, p.x + 10 + p.speed * 1.2).length) return
  g.seenHints.add('pad')
  store.set('fil.seen', JSON.stringify([...g.seenHints]))
  hud.hint('pad')
}

// First sight of each heist hazard gets a one-time hint.
function heistHints() {
  const p = g.player
  for (const c of g.level.chunksIn(p.x + 6, p.x + 10 + p.speed * 1.2)) {
    const seen = [...c.lasers.map((l) => (l.low ? 'laserLow' : 'laserHigh')), ...(c.drones.length ? ['drone'] : [])]
    for (const key of seen) {
      if (g.seenHints.has(key)) continue
      g.seenHints.add(key)
      store.set('fil.seen', JSON.stringify([...g.seenHints]))
      hud.hint(key)
      return
    }
  }
}

function updateHints() {
  if (g.heist) heistHints()
  padHint()
  if (g.tutorialDone || g.kind !== 'endless') return
  const p = g.player
  for (const h of g.level.hintsIn(p.x + 2, p.x + 8 + p.speed * 1.1)) {
    if (g.hintsShown.has(h)) continue
    g.hintsShown.add(h)
    hud.hint(h.key)
  }
  const tutorialEnd = g.level.chunks.find((c) => c.id === 6)
  if (tutorialEnd && p.x > tutorialEnd.x0 + 20) {
    g.tutorialDone = true
    store.set('fil.tutorial', '1')
  }
}

// Where the runner will touch down, so the view can mark the landing-slide
// (or roll) timing as it closes in.
function landCue(p) {
  if (p.state !== 'air' || p.vy > 0) return null
  const hit = predictLanding(p, g.level)
  if (!hit) return null
  // a press already made counts if it will still be live (and, for a landing
  // slide, still inside the window) at touchdown
  const since = PHYS.ROLL_WINDOW - p.rollTimer
  const armed = p.rollTimer > hit.t && (hit.hard || since + hit.t <= PHYS.LANDSLIDE_PRE)
  return { ...hit, armed, fast: p.speed >= landSlideSpeed() }
}

const COUNT = ['3', '2', '1', 'GO']

let last = performance.now()
let time = 0

function frame(now) {
  requestAnimationFrame(frame)
  const raw = Math.min(0.1, (now - last) / 1000)
  last = now
  if (artLabOpen) return
  time += raw
  input.pollGamepad()
  if (g.mode === 'title' && input.takeAny()) start(g.sel)
  else input.takeAny()

  const p = g.player
  let scale = 1
  if (g.mode === 'run') {
    updateFocus(raw)
    scale = g.focusActive ? (g.heist?.mods.focusScale ?? FOCUS.TIME_SCALE) : 1
  } else if (g.mode === 'respawn') {
    scale = 0.6
  }
  const dt = g.mode === 'paused' ? 0 : raw * scale

  if (g.mode === 'countdown') {
    const beat = Math.min(3, Math.floor(g.phaseT / 0.6))
    if (beat !== g.countShown) {
      g.countShown = beat
      hud.countdown(COUNT[beat])
      audio.event(beat === 3 ? 'go' : 'count')
    }
    g.phaseT += raw
    if (g.phaseT >= 1.8) {
      g.mode = 'run'
      input.clearEdges()
      setTimeout(() => { if (g.mode !== 'countdown') hud.countdown('') }, 500)
    }
  } else if (g.mode === 'run' || g.mode === 'title' || g.mode === 'finish') {
    stepPhysics(dt)
    if (g.mode === 'run' || g.mode === 'respawn') {
      g.clock += dt
      g.topSpeed = Math.max(g.topSpeed, p.speed)
      updateHints()
    }
  } else if (g.mode === 'respawn') {
    g.clock += raw
    g.phaseT += raw
    p.vy = Math.max(p.vy - PHYS.G * dt, -PHYS.MAX_FALL)
    p.y += p.vy * dt
    if (g.phaseT >= RUN.RESPAWN_TIME) {
      if (g.kind === 'endless' && g.lives <= 0) endEndless()
      else if (g.heist && g.heist.integrity <= 0) endHeist(false)
      else respawn()
    }
  } else if (g.mode === 'flatline') {
    g.phaseT += raw
    view.glitch(raw * 2)
    if (g.phaseT >= 1.4) endHeist(false)
  }

  if (g.mode === 'finish') {
    g.phaseT += raw
    if (g.phaseT > 1.3) showResults()
  }

  appUpdates.sync()
  const cur = g.player
  if (g.mode === 'run') {
    const cps = g.level.checkpoints
    while (g.cpNext < cps.length && cur.x >= cps[g.cpNext].x) passCheckpoint(g.cpNext++)
    if (g.kind === 'trial' && g.level.finish && cur.x >= g.level.finish.x) finishTrial()
    if (g.heist && g.mode === 'run' && cur.x >= g.level.finish.x) endHeist(true)
    if (g.kind !== 'trial' && g.mode === 'run') {
      const r = g.score.update(dt, cur)
      if (r === 'bank') { hud.comboResult('bank', g.score.log.at(-1).points); audio.event('bank', { mult: g.score.log.at(-1).mult }) }
    }
    if (g.recorder) g.recorder.sample(g.clock, cur)
  }
  if (g.mode !== 'paused') g.level.prune(cur.x - 90)

  const alpha = g.mode === 'run' || g.mode === 'title' || g.mode === 'finish' ? g.acc / PHYS.FIXED_DT : 1
  const distance = Math.max(0, cur.x)
  // on the title screen Drift previews itself by cycling through every district
  const paletteD = g.mode === 'title' && CITIES[g.city] === null ? (time * 150) % (PALETTE_NAMES.length * 1500) : paletteDistance(cur.x)
  g.focusVis += ((g.focusActive ? 1 : 0) - g.focusVis) * Math.min(1, raw * 6)
  g.flash = Math.max(0, g.flash - raw * 2)
  g.fade = Math.max(0, g.fade - raw * 2.5)
  const ghost = g.ghost && (g.mode === 'run' || g.mode === 'respawn' || g.mode === 'finish') ? g.ghost.at(g.clock) : null

  view.frame({
    raw, dt, time, mode: g.mode === 'countdown' || g.mode === 'shop' ? 'run' : g.mode === 'flatline' ? 'paused' : g.mode, p: cur, level: g.level, distance, paletteD,
    trace: g.heist && g.mode === 'run' ? g.heist.trace : 0,
    rx: g.prevX + (cur.x - g.prevX) * alpha,
    ry: g.prevY + (cur.y - g.prevY) * alpha,
    idle: g.mode === 'countdown' || g.mode === 'shop',
    ghost: ghost && !ghost.done ? ghost : null,
    speedK: smoothstep(cur.speed, 11, PHYS.SPEED_MAX),
    focusVis: g.focusVis, flash: g.flash, fade: g.fade,
    landCue: g.mode === 'run' ? landCue(cur) : null,
  })

  // the street doc opens over the HUD, so it keeps updating behind it
  if (['run', 'respawn', 'countdown', 'finish', 'flatline', 'shop'].includes(g.mode)) {
    const name = view.districtName(g.heist ? g.heist.sector * 1500 : paletteD)
    const base = {
      speed: cur.speed,
      focus: g.focus,
      focusActive: g.focusActive,
      focusReady: g.focus >= FOCUS.MIN_TO_START,
    }
    if (g.kind === 'trial') {
      const finishX = g.level.finish?.x ?? 1
      hud.update({ ...base, score: Math.max(0, finishX - cur.x), time: g.clock, progress: Math.min(1, cur.x / finishX) })
    } else {
      const s = g.score
      const n = g.heist
      hud.update({
        ...base,
        score: s.total,
        lives: n ? n.integrity : g.lives,
        sub: subLine(n, Math.floor(distance), name),
        combo: { mult: s.mult, points: s.pending, moves: s.moves.join(' · '), timer: s.timer / s.window },
        trace: n?.trace,
        progress: n ? Math.min(1, Math.max(0, cur.x) / g.level.finish.x) : undefined,
      })
    }
    if (name !== g.district && g.mode !== 'shop') {
      g.district = name
      hud.district(g.heist ? `SECTOR ${g.heist.sector + 1} · ${name}` : name)
    }
  }

  audio.update(raw, {
    speed: g.mode === 'run' || g.mode === 'title' ? cur.speed : 0,
    zip: cur.state === 'zip' && g.mode === 'run',
    focus: g.focusVis,
    playing: g.mode === 'run',
  })
}

// The HUD's second line, rebuilt only when what it shows changes:
// toLocaleString is too slow to call every frame on a phone.
let subKey = '', subText = ''
function subLine(n, metres, name) {
  const key = n ? `h${n.creds}:${n.sector}` : `${metres}:${name}`
  if (key !== subKey) {
    subKey = key
    subText = n
      ? `¢ ${n.creds.toLocaleString()} · SECTOR ${n.sector + 1}/${HEIST.SECTORS}`
      : `${metres.toLocaleString()} M · ${name.toUpperCase()}`
  }
  return subText
}

function smoothstep(x, a, b) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

view.onStep = (kind) => {
  if (g.mode === 'run') audio.step(kind)
}

toTitle()
installOffline()
const appUpdates = installAppUpdates({ canShow: () => !artLabOpen && ['title', 'paused', 'over'].includes(g.mode) })
requestAnimationFrame(frame)
if (import.meta.env.DEV) window.__game = { g, view, start, newRun, landCue }
