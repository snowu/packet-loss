// Frame cadence includes missed vsyncs; work measures the CPU game loop.
// Fixed buffers and twice-a-second DOM updates keep the meter cheap.
export class FrameMeter {
  constructor() {
    this.intervals = new Float32Array(120)
    this.work = new Float32Array(120)
    this.sorted = new Float32Array(120)
    this.count = this.index = this.previous = this.updated = 0
    this.el = document.createElement('div')
    this.el.className = 'frame-meter'
    this.el.textContent = 'FPS —'
    this.el.title = 'Frame cadence / 95th percentile frame time / CPU work. F8 toggles.'
    document.body.append(this.el)
    window.addEventListener('keydown', e => {
      if (e.code !== 'F8') return
      e.preventDefault()
      if (!e.repeat) this.el.hidden = !this.el.hidden
    })
    document.addEventListener('visibilitychange', () => this.reset())
  }

  reset() { this.count = this.index = this.previous = this.updated = 0 }

  sample(now, work) {
    if (!this.previous) { this.previous = now; return }
    const interval = now - this.previous
    this.previous = now
    if (document.hidden || interval <= 0) { this.reset(); return }
    this.intervals[this.index] = interval
    this.work[this.index] = work
    this.index = (this.index + 1) % this.intervals.length
    this.count = Math.min(this.count + 1, this.intervals.length)
    if (now - this.updated < 500 || this.el.hidden) return
    this.updated = now
    let total = 0, cpu = 0
    for (let i = 0; i < this.count; i++) {
      total += this.intervals[i]
      cpu += this.work[i]
      this.sorted[i] = this.intervals[i]
    }
    const sorted = this.sorted.subarray(0, this.count).sort()
    this.stats = { fps: 1000 * this.count / total, p95: sorted[Math.ceil(this.count * 0.95) - 1], work: cpu / this.count }
    this.el.textContent = `${Math.round(this.stats.fps)} FPS · ${this.stats.p95.toFixed(1)} ms p95 · ${this.stats.work.toFixed(1)} ms CPU${this.note ? ` · ${this.note}` : ''}`
  }
}

// Keeps the game at a pace the device can hold. A phone that runs the game
// flat out for a few runs heats up and gets its CPU and GPU clocked down;
// what was 60 fps becomes a juddering 40. Rather than miss frames, the
// governor sheds work a step at a time, and takes it back when there is
// room again:
//
//   level   0 full, 1 lean, 2 minimal: how much ornament the view draws
//   stride  draw every other display frame; physics and input still run
//           on every one
//
// Fed one display frame at a time; pure, so it can be tested without a DOM.
export const QUALITY_NAMES = ['FULL', 'LEAN', 'MINIMAL']
const WINDOW = 120            // display frames per verdict
const SLOW_WINDOWS = 2        // slow verdicts in a row before shedding
const MAX_REFRESH_MS = 1000 / 60

export class Governor {
  constructor({ pin = null } = {}) {
    this.pin = pin              // a fixed level (0-2) switches the governor off
    this.level = pin ?? 0
    this.stride = 1
    this.step = 0
    this.refresh = MAX_REFRESH_MS   // display frame time, the fastest cadence seen
    this.patience = 6           // good verdicts in a row before taking work back
    this.intervals = new Float32Array(WINDOW)
    this.reset()
    this.slow = this.good = 0
    this.sinceUp = Infinity
  }

  // Forget the frames in hand (the tab was hidden, the game was paused).
  reset() { this.n = 0; this.work = 0; this.drawn = 0 }

  // The steps down, cheapest to notice first. A fast display halves its
  // draw rate before anything else (that still leaves 60 fps or more); a
  // 60 Hz one only does as the last resort, where a steady 30 beats a
  // juddering 40.
  get ladder() {
    return this.refresh < 11.5
      ? [[1, 0], [2, 0], [2, 1], [2, 2]]
      : [[1, 0], [1, 1], [1, 2], [2, 2]]
  }

  get steps() { return this.step }

  go(step) {
    const ladder = this.ladder
    if (step < 0 || step >= ladder.length) return false
    this.step = step
    ;[this.stride, this.level] = ladder[step]
    return true
  }

  // interval: ms since the previous display frame. work: ms the game loop
  // spent on this one. drew: whether it rendered. Returns true when the
  // level or stride changed.
  sample(interval, work, drew = true) {
    if (this.pin !== null || !(interval > 0) || interval > 250) return false
    this.intervals[this.n++] = interval
    if (drew) { this.work += work; this.drawn++ }
    if (this.n < WINDOW) return false
    const sorted = this.intervals.sort()
    // the display's own cadence: the fastest tenth of frames, never slower
    // than 60 Hz, and only ever revised downward
    this.refresh = Math.max(4, Math.min(this.refresh, sorted[Math.floor(WINDOW * 0.1)]))
    // hitches (a bake, a GC) aren't what this is watching for
    let total = 0
    const kept = Math.floor(WINDOW * 0.95)
    for (let i = 0; i < kept; i++) total += sorted[i]
    const cadence = total / kept
    const budget = this.refresh * this.stride
    const work1 = this.drawn ? this.work / this.drawn : 0
    this.reset()
    const late = cadence > this.refresh * 1.2 || work1 > budget * 0.7
    const easy = cadence < this.refresh * 1.08 && work1 < budget * 0.35
    this.sinceUp++
    if (late) {
      this.good = 0
      if (++this.slow < SLOW_WINDOWS) return false
      this.slow = 0
      // stepping back down right after stepping up: wait longer next time
      if (this.sinceUp <= 4) this.patience = Math.min(48, this.patience * 2)
      return this.shed()
    }
    this.slow = 0
    if (!easy) { this.good = 0; return false }
    if (++this.good < this.patience) return false
    this.good = 0
    return this.restore()
  }

  shed() { return this.go(this.step + 1) }

  restore() {
    if (!this.go(this.step - 1)) return false
    this.sinceUp = 0
    return true
  }
}
