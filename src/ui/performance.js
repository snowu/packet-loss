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
    this.el.title = 'Frame cadence / 95th percentile frame time / CPU work. F6 toggles.'
    document.body.append(this.el)
    window.addEventListener('keydown', e => {
      if (e.code !== 'F6') return
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
    this.el.textContent = `${Math.round(this.stats.fps)} FPS · ${this.stats.p95.toFixed(1)} ms p95 · ${this.stats.work.toFixed(1)} ms CPU`
  }
}
