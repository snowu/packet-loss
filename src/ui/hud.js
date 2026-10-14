// DOM HUD, menu and result screens.

const SEGMENTS = 14
const MEDALS = ['GOLD', 'SILVER', 'BRONZE']

const HINTS = {
  vault: { key: '<kbd>SPACE</kbd> as you reach low obstacles to <b>VAULT</b>', touch: 'Tap <b>JUMP</b> as you reach low obstacles to <b>VAULT</b>' },
  jump: { key: '<kbd>SPACE</kbd> to <b>JUMP</b> · hold for height', touch: 'Tap the <b>RIGHT</b> side to <b>JUMP</b> · hold for height' },
  slide: { key: '<kbd>S</kbd> to <b>SLIDE</b> under pipes', touch: 'Tap the <b>LEFT</b> side to <b>SLIDE</b> under pipes' },
  roll: { key: 'Big drop — <kbd>S</kbd> just before landing to <b>ROLL</b>', touch: 'Big drop — tap <b>LEFT</b> just before landing to <b>ROLL</b>' },
  grab: { key: 'Jump at walls to <b>GRAB</b> the ledge', touch: 'Jump at walls to <b>GRAB</b> the ledge' },
  climb: { key: 'Jump into a wall to <b>CLIMB</b> it', touch: 'Jump into a wall to <b>CLIMB</b> it' },
  wallrun: { key: 'Jump at the red wall to <b>WALLRUN</b> · jump again to kick off', touch: 'Jump at the red wall to <b>WALLRUN</b> · jump again to kick off' },
  zip: { key: '<b>JUMP</b> to catch the <b>ZIPLINE</b>', touch: '<b>JUMP</b> to catch the <b>ZIPLINE</b>' },
  spring: { key: 'Hit the red ramp to <b>LAUNCH</b>', touch: 'Hit the red ramp to <b>LAUNCH</b>' },
  pad: { key: 'Wall ahead — <kbd>SPACE</kbd> on the red <b>PAD</b> to clear it at full speed', touch: 'Wall ahead — <b>JUMP</b> on the red <b>PAD</b> to clear it at full speed' },
  focus: { key: 'Focus charged — <kbd>E</kbd> to <b>SLOW TIME</b>', touch: 'Focus charged — tap <b>◎</b> to <b>SLOW TIME</b>' },
  heist: { key: 'Speed and clean moves jam the <b>TRACE</b> · stay out of <b>MAGENTA</b>', touch: 'Speed and clean moves jam the <b>TRACE</b> · stay out of <b>MAGENTA</b>' },
  laserLow: { key: 'Low <b>LASER</b> — <kbd>SPACE</kbd> to jump it', touch: 'Low <b>LASER</b> — tap <b>RIGHT</b> to jump it' },
  laserHigh: { key: 'High <b>LASER</b> — <kbd>S</kbd> to slide under', touch: 'High <b>LASER</b> — tap <b>LEFT</b> to slide under' },
  drone: { key: 'Security <b>DRONE</b> — jump into it for a <b>TAKEDOWN</b>, never run under it', touch: 'Security <b>DRONE</b> — jump into it for a <b>TAKEDOWN</b>, never run under it' },
  combo: { key: 'Chain moves to build a <b>COMBO</b> · mistakes lose it', touch: 'Chain moves to build a <b>COMBO</b> · mistakes lose it' },
}

const $ = (id) => document.getElementById(id)

export function formatTime(t) {
  if (t == null || !Number.isFinite(t)) return '--:--.--'
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`
}

export function formatDelta(d) {
  return `${d < 0 ? '−' : '+'}${Math.abs(d).toFixed(2)}`
}

export function medalFor(time, medals) {
  if (!medals || time == null) return -1
  return medals.findIndex((m) => time <= m)
}

function chromeTags(list) {
  const counts = new Map()
  for (const c of list) counts.set(c, (counts.get(c) ?? 0) + 1)
  return [...counts].map(([c, n]) => `<i class="${c.rare ? 'rare' : ''}" title="${c.name}: ${c.desc}">${c.short}${n > 1 ? ` ×${n}` : ''}</i>`).join('')
}

export class Hud {
  constructor(touch) {
    this.touch = touch
    document.body.classList.toggle('touch', touch)
    this.el = {
      hud: $('hud'), score: $('score'), scoreUnit: $('score-unit'), subA: $('sub-a'), subB: $('sub-b'), lives: $('lives'),
      trial: $('trial-hud'), timer: $('timer'), progress: $('progress-fill'), ticks: $('progress-ticks'), delta: $('delta'),
      speedVal: $('speed-val'), speedSegs: $('speed-segs'), focusFill: $('focus-fill'),
      focus: $('focus-fill').parentElement, focusBtn: $('btn-focus'), mute: $('btn-mute'),
      combo: $('combo'), comboMoves: $('combo-moves'), comboPts: $('combo-pts'), comboMult: $('combo-mult'), comboFill: $('combo-fill'),
      countdown: $('countdown'), banner: $('banner'), hint: $('hint'), toasts: $('toasts'), zones: $('touch-zones'),
      title: $('title'), menu: $('menu'),
      over: $('over'), overKicker: $('over-kicker'), overTitle: $('over-title'), overMain: $('over-main'), overUnit: $('over-unit'),
      overBest: $('over-best'), overMedals: $('over-medals'), overStats: $('over-stats'), overSplits: $('over-splits'),
      paused: $('paused'),
      traceFill: $('trace-fill'), traceVal: $('trace-val'), trace: $('trace-wrap'), chromeRow: $('chrome-row'),
      shop: $('shop'), shopKicker: $('shop-kicker'), shopCreds: $('shop-creds'), shopIntegrity: $('shop-integrity'),
      shopOffer: $('shop-offer'), repair: $('btn-repair'), reroll: $('btn-reroll'), shopOwned: $('shop-owned'),
    }
    this.segs = []
    for (let i = 0; i < SEGMENTS; i++) {
      const s = document.createElement('i')
      this.el.speedSegs.appendChild(s)
      this.segs.push(s)
    }
    this.last = {}
    this.toastTimes = {}
  }

  set(key, value, fn) {
    if (this.last[key] === value) return
    this.last[key] = value
    fn(value)
  }

  // ── screens ─────────────────────────────────────────────────────────────

  showHud(on) { this.el.hud.classList.toggle('is-hidden', !on) }
  showTitle(on) { this.el.title.classList.toggle('is-hidden', !on) }
  showPaused(on) { this.el.paused.classList.toggle('is-hidden', !on) }
  showShop(on) { this.el.shop.classList.toggle('is-hidden', !on) }

  // items: [{ name, sub, best, medal }]
  menu(items, selected, onPick) {
    const ul = this.el.menu
    ul.innerHTML = ''
    items.forEach((it, i) => {
      const li = document.createElement('li')
      li.className = i === selected ? 'sel' : ''
      li.innerHTML = `<span class="m-name">${it.name}</span><span class="m-sub">${it.sub}</span>` +
        `<span class="m-best">${it.medal >= 0 ? `<i class="medal m${it.medal}"></i>` : ''}${it.best}</span>`
      li.addEventListener('click', () => onPick(i))
      ul.appendChild(li)
    })
  }

  setupRun(kind, { title, best, checkpoints = [], length = 1, lives = 0 }) {
    this.kind = kind
    this.last = {}
    this.el.hud.classList.toggle('trial', kind === 'trial')
    this.el.hud.classList.toggle('endless', kind === 'endless')
    this.el.hud.classList.toggle('heist', kind === 'heist')
    this.el.scoreUnit.textContent = kind === 'trial' ? 'M LEFT' : 'PTS'
    this.el.subA.textContent = best
    this.el.subB.textContent = title
    this.el.delta.className = 'delta'
    this.el.ticks.innerHTML = checkpoints.map((c) => `<i style="left:${(c.x / length) * 100}%"></i>`).join('')
    this.setLives(lives)
    this.el.chromeRow.innerHTML = ''
    this.el.combo.classList.remove('show')
    this.el.countdown.textContent = ''
  }

  setLives(n) {
    this.el.lives.innerHTML = Array.from({ length: n }, () => '<i></i>').join('')
    delete this.last.lives
  }

  // Installed chrome as small tags under the integrity pips.
  chrome(list) {
    this.el.chromeRow.innerHTML = chromeTags(list)
  }

  // The street doc between heist sectors. Items 0-2 are the offer, 3 is
  // repair, 4 is reroll.
  shop(d, sel, onPick) {
    const e = this.el
    e.shopKicker.textContent = `UPLINK ${d.sector}/${d.sectors - 1} · SECTOR ${d.sector + 1} NEXT`
    e.shopCreds.textContent = `¢ ${d.creds.toLocaleString()}`
    e.shopIntegrity.innerHTML = Array.from({ length: d.maxIntegrity }, (_, i) => `<i class="${i < d.integrity ? '' : 'lost'}"></i>`).join('')
    e.shopOffer.innerHTML = ''
    const cards = d.offer.length ? d.offer : [{ name: 'Nothing left', maker: 'STREET DOC', tag: '—', desc: 'You are all chrome. Jack back in.', none: true }]
    cards.forEach((c, i) => {
      const li = document.createElement('li')
      li.className = `${i === sel ? 'sel' : ''} ${c.rare ? 'rare' : ''}`
      const stack = c.max > 1 ? `<span class="stack">${c.have}/${c.max}</span>` : ''
      li.innerHTML = `<div class="o-top"><span class="o-maker">${c.maker}</span><span class="o-tag">${c.rare ? 'RARE · ' : ''}${c.tag}</span></div>` +
        `<div class="o-name">${c.name}${stack}</div><div class="o-desc">${c.desc}</div>`
      li.addEventListener('click', () => onPick(i))
      e.shopOffer.appendChild(li)
    })
    e.repair.innerHTML = d.repair.full ? 'REPAIR · FULL' : `REPAIR +1 · ¢ ${d.repair.cost}`
    e.reroll.innerHTML = `REROLL · ¢ ${d.reroll.cost}`
    e.repair.classList.toggle('sel', sel === 3)
    e.reroll.classList.toggle('sel', sel === 4)
    e.repair.classList.toggle('off', !d.repair.ok)
    e.reroll.classList.toggle('off', !d.reroll.ok)
    e.repair.onclick = () => onPick(3)
    e.reroll.onclick = () => onPick(4)
    e.shopOwned.innerHTML = d.owned.length ? `<span>INSTALLED</span>${chromeTags(d.owned)}` : ''
  }

  showOver(on, r) {
    this.el.over.classList.toggle('is-hidden', !on)
    if (!on) return
    const e = this.el
    e.overSplits.innerHTML = ''
    e.overMedals.innerHTML = ''
    if (r.kind === 'trial') {
      const medal = medalFor(r.time, r.medals)
      e.overKicker.textContent = `${r.track.toUpperCase()} · FINISHED`
      e.overTitle.innerHTML = r.newBest ? 'NEW <em>BEST</em>' : medal >= 0 ? `${MEDALS[medal]} <em>MEDAL</em>` : 'TIME <em>SET</em>'
      e.overMain.textContent = formatTime(r.time)
      e.overUnit.textContent = ''
      e.overBest.classList.toggle('new', r.newBest)
      e.overBest.innerHTML = r.prevBest != null
        ? `BEST <b>${formatTime(Math.min(r.prevBest, r.time))}</b> <span class="${r.time < r.prevBest ? 'good' : 'bad'}">${formatDelta(r.time - r.prevBest)}</span>`
        : 'FIRST TIME ON THIS COURSE'
      if (r.medals) {
        e.overMedals.innerHTML = r.medals.map((m, i) => `<span class="${medal >= 0 && medal <= i ? 'got' : ''}"><i class="medal m${i}"></i>${formatTime(m)}</span>`).join('')
      }
      e.overStats.innerHTML = `<div><b>${r.falls}</b><span>FALLS</span></div><div><b>${(r.topSpeed * 3.6).toFixed(0)}</b><span>TOP KM/H</span></div><div><b>${r.moves}</b><span>MOVES</span></div>`
      e.overSplits.innerHTML = r.splits.map((t, i) => {
        const pb = r.prevSplits?.[i]
        const d = pb != null ? `<span class="${t < pb ? 'good' : 'bad'}">${formatDelta(t - pb)}</span>` : ''
        return `<li><span>${i === r.splits.length - 1 ? 'FINISH' : `CP ${i + 1}`}</span><b>${formatTime(t)}</b>${d}</li>`
      }).join('')
    } else if (r.kind === 'heist') {
      e.overKicker.textContent = r.extracted ? 'HEIST · EXTRACTED' : `HEIST · SECTOR ${r.sector + 1}/${r.sectors}`
      e.overTitle.innerHTML = r.extracted ? 'CLEAN <em>EXIT</em>' : r.newBest ? 'NEW <em>BEST</em>' : '<em>FLAT</em>LINED'
      e.overMain.textContent = Math.floor(r.score).toLocaleString()
      e.overUnit.textContent = 'PTS'
      e.overBest.classList.toggle('new', r.newBest)
      e.overBest.innerHTML = `BEST <b>${Math.floor(r.best).toLocaleString()}</b>${r.bonus ? ` · EXTRACTION <b>+${r.bonus.toLocaleString()}</b>` : ''}`
      e.overStats.innerHTML = `<div><b>${r.stats.shards}</b><span>SHARDS</span></div><div><b>${r.stats.takedowns}</b><span>TAKEDOWNS</span></div>` +
        `<div><b>${Math.floor(r.bestCombo).toLocaleString()}</b><span>BEST COMBO</span></div>`
      e.overMedals.innerHTML = r.chrome.length ? `<div class="chrome-row big">${chromeTags(r.chrome)}</div>` : ''
    } else {
      e.overKicker.textContent = 'ENDLESS · RUN OVER'
      e.overTitle.innerHTML = r.newBest ? 'NEW <em>BEST</em>' : 'OUT OF <em>LIVES</em>'
      e.overMain.textContent = Math.floor(r.score).toLocaleString()
      e.overUnit.textContent = 'PTS'
      e.overBest.classList.toggle('new', r.newBest)
      e.overBest.innerHTML = `BEST <b>${Math.floor(r.best).toLocaleString()}</b>`
      e.overStats.innerHTML = `<div><b>${Math.floor(r.distance).toLocaleString()}</b><span>METERS</span></div><div><b>${Math.floor(r.bestCombo).toLocaleString()}</b><span>BEST COMBO</span></div><div><b>${(r.topSpeed * 3.6).toFixed(0)}</b><span>TOP KM/H</span></div>`
    }
  }

  // ── per-frame ───────────────────────────────────────────────────────────

  // Bars that move every frame scale instead of changing width, so they
  // repaint without a layout.
  update({ score, speed, focus, focusActive, focusReady, time, progress, lives, combo, sub, trace }) {
    if (trace !== undefined) {
      const prev = this.last.trace
      this.set('trace', Math.round(Math.min(1, trace) * 100), (v) => {
        // flash on a drop the size of a clean move, not on the reset at an uplink
        if (prev !== undefined && prev - v >= 2 && v > 0) {
          this.el.trace.classList.add('jam')
          clearTimeout(this.jamTimer)
          this.jamTimer = setTimeout(() => this.el.trace.classList.remove('jam'), 260)
        }
        this.el.traceFill.style.transform = `scaleX(${v / 100})`
        this.el.traceVal.textContent = `${v}%`
        this.el.trace.classList.toggle('hot', v >= 75)
      })
    }
    if (score !== undefined) this.set('score', Math.floor(score), (v) => { this.el.score.textContent = v.toLocaleString() })
    if (time !== undefined) this.set('timer', Math.floor(time * 100), () => { this.el.timer.textContent = formatTime(time) })
    if (progress !== undefined) this.set('progress', Math.round(progress * 400), (v) => { this.el.progress.style.transform = `scaleX(${v / 400})` })
    if (sub !== undefined) this.set('sub', sub, (v) => { this.el.subB.textContent = v })
    if (lives !== undefined) this.set('lives', lives, (n) => [...this.el.lives.children].forEach((c, i) => c.classList.toggle('lost', i >= n)))
    this.set('speedVal', Math.round(speed * 3.6), (v) => { this.el.speedVal.textContent = `${v} KM/H` })
    const lit = Math.round(Math.min(1, Math.max(0, (speed - 4) / 13)) * SEGMENTS)
    this.set('segs', lit, (n) => this.segs.forEach((s, i) => {
      s.classList.toggle('on', i < n)
      s.classList.toggle('hot', i < n && i >= SEGMENTS - 3)
    }))
    this.set('focus', Math.round(focus * 100), (v) => { this.el.focusFill.style.transform = `scaleX(${v / 100})` })
    this.set('focusState', `${focusActive}${focusReady}`, () => {
      this.el.focus.classList.toggle('active', focusActive)
      this.el.focus.classList.toggle('ready', focusReady && !focusActive)
      this.el.focusBtn.classList.toggle('ready', focusReady && !focusActive)
    })
    if (combo) {
      this.set('comboShow', combo.mult > 0, (v) => this.el.combo.classList.toggle('show', v))
      if (combo.mult > 0) {
        this.set('comboPts', Math.floor(combo.points), (v) => { this.el.comboPts.textContent = v.toLocaleString() })
        this.set('comboMult', combo.mult, (v) => { this.el.comboMult.textContent = `×${v}` })
        this.set('comboMoves', combo.moves, (v) => { this.el.comboMoves.textContent = v })
        this.set('comboFill', Math.round(combo.timer * 100), (v) => { this.el.comboFill.style.transform = `scaleX(${v / 100})` })
      }
    }
  }

  split(delta) {
    const el = this.el.delta
    el.textContent = delta == null ? '' : formatDelta(delta)
    el.className = `delta show ${delta == null ? '' : delta < 0 ? 'good' : 'bad'}`
    clearTimeout(this.deltaTimer)
    this.deltaTimer = setTimeout(() => { el.className = 'delta' }, 2600)
  }

  countdown(text) {
    this.el.countdown.textContent = text
    this.el.countdown.classList.remove('pop')
    void this.el.countdown.offsetWidth
    if (text) this.el.countdown.classList.add('pop')
  }

  comboResult(type, points) {
    const el = this.el.combo
    el.classList.remove('banked', 'bailed')
    void el.offsetWidth
    el.classList.add(type === 'bank' ? 'banked' : 'bailed')
    if (type === 'bank') this.toast(`+${points.toLocaleString()}`, 'BANKED')
    else this.toast('COMBO LOST', `−${points.toLocaleString()}`)
  }

  district(name) {
    this.el.banner.textContent = name.toUpperCase()
    this.el.banner.classList.add('show')
    clearTimeout(this.bannerTimer)
    this.bannerTimer = setTimeout(() => this.el.banner.classList.remove('show'), 2600)
  }

  hint(key) {
    clearTimeout(this.hintTimer)
    if (!key) {
      this.el.hint.classList.remove('show')
      return
    }
    const h = HINTS[key]
    this.el.hint.innerHTML = this.touch ? h.touch : h.key
    this.el.hint.classList.add('show')
    this.hintTimer = setTimeout(() => this.el.hint.classList.remove('show'), 3200)
  }

  toast(text, sub = '', now = performance.now()) {
    if (this.toastTimes[text] && now - this.toastTimes[text] < 450) return
    this.toastTimes[text] = now
    const el = document.createElement('div')
    el.className = 'toast'
    el.innerHTML = sub ? `${text}<small>${sub}</small>` : text
    this.el.toasts.appendChild(el)
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove()
    setTimeout(() => el.remove(), 1150)
  }

  setMuted(m) { this.el.mute.classList.toggle('off', m) }
  hideZones() { this.el.zones.classList.add('gone') }
  showZones() { this.el.zones.classList.remove('gone') }
}
