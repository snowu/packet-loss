// All sound is synthesized: wind, footsteps, move effects, and a
// chiptune score. Nothing loads until the first user gesture.

const CHORDS = [
  [57, 64, 67, 71, 74],   // Am9
  [53, 60, 64, 69, 72],   // Fmaj7
  [48, 55, 64, 67, 71],   // Cmaj7
  [55, 62, 66, 69, 74],   // G6/9-ish
]
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12)

export class Audio {
  constructor() {
    this.ctx = null
    this.muted = false
    try { this.muted = localStorage.getItem('fil.muted') === '1' } catch { /* storage unavailable */ }
  }

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.8
    this.muffle = ctx.createBiquadFilter()
    this.muffle.type = 'lowpass'
    this.muffle.frequency.value = 18000
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.ratio.value = 4
    this.muffle.connect(this.master)
    this.master.connect(comp)
    comp.connect(ctx.destination)

    this.sfx = ctx.createGain()
    this.sfx.gain.value = 0.9
    this.sfx.connect(this.muffle)

    // noise source shared by everything percussive
    const len = ctx.sampleRate * 2
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = this.noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1

    // wind bed
    const wind = ctx.createBufferSource()
    wind.buffer = this.noiseBuf
    wind.loop = true
    this.windFilter = ctx.createBiquadFilter()
    this.windFilter.type = 'bandpass'
    this.windFilter.Q.value = 0.7
    this.windGain = ctx.createGain()
    this.windGain.gain.value = 0
    wind.connect(this.windFilter).connect(this.windGain).connect(this.sfx)
    wind.start()

    // zipline hiss
    const zip = ctx.createBufferSource()
    zip.buffer = this.noiseBuf
    zip.loop = true
    const zf = ctx.createBiquadFilter()
    zf.type = 'bandpass'
    zf.frequency.value = 3200
    zf.Q.value = 4
    this.zipGain = ctx.createGain()
    this.zipGain.gain.value = 0
    zip.connect(zf).connect(this.zipGain).connect(this.sfx)
    zip.start()

    this.initMusic()
  }

  initMusic() {
    const ctx = this.ctx
    this.music = ctx.createGain()
    this.music.gain.value = 0.32
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 3600
    const delay = ctx.createDelay(1)
    delay.delayTime.value = 0.45
    const fb = ctx.createGain()
    fb.gain.value = 0.38
    const wet = ctx.createGain()
    wet.gain.value = 0.35
    lp.connect(this.music)
    lp.connect(delay)
    delay.connect(fb).connect(delay)
    delay.connect(wet).connect(this.music)
    this.music.connect(this.muffle)
    this.musicIn = lp
    this.beat = 0
    this.nextBeat = ctx.currentTime + 0.1
    this.chord = 0
    this.intensity = 0
  }

  setMuted(m) {
    this.muted = m
    try { localStorage.setItem('fil.muted', m ? '1' : '0') } catch { /* storage unavailable */ }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05)
  }

  // ── scheduling helpers ───────────────────────────────────────────────────

  noise(t, dur, { freq = 1000, type = 'bandpass', q = 1, gain = 0.3, sweep = null } = {}) {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.setValueAtTime(freq, t)
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur)
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.connect(f).connect(g).connect(this.sfx)
    src.start(t, Math.random() * 1.5)
    src.stop(t + dur + 0.05)
  }

  tone(t, dur, f0, f1, { type = 'sine', gain = 0.3, dest = this.sfx, attack = 0.004 } = {}) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(dest)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  // ── game events ──────────────────────────────────────────────────────────

  step(kind = 'run') {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const wall = kind !== 'run'
    this.noise(t, 0.06, { freq: wall ? 1800 : 900, q: 1.2, gain: wall ? 0.12 : 0.16, type: 'lowpass' })
    this.tone(t, 0.07, wall ? 160 : 110, 60, { gain: 0.12 })
  }

  event(type, data = {}) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    switch (type) {
      case 'jump': case 'slidejump': case 'zipjump':
        this.noise(t, 0.18, { freq: 600, sweep: 2400, q: 0.8, gain: 0.12 })
        this.noise(t, 0.05, { freq: 700, type: 'lowpass', gain: 0.15 })
        break
      case 'walljump':
        this.noise(t, 0.08, { freq: 1500, q: 2, gain: 0.18 })
        this.noise(t, 0.22, { freq: 800, sweep: 3000, q: 0.8, gain: 0.12 })
        break
      case 'land': {
        const g = Math.min(0.35, 0.08 + (data.impact ?? 8) / 50)
        this.tone(t, 0.14, 130, 50, { gain: g })
        this.noise(t, 0.09, { freq: 1200, type: 'lowpass', gain: g * 0.6 })
        break
      }
      case 'hardland': case 'bonk': case 'trip':
        this.tone(t, 0.25, 110, 38, { gain: 0.45 })
        this.noise(t, 0.2, { freq: 900, type: 'lowpass', gain: 0.35 })
        break
      case 'roll':
        this.tone(t, 0.12, 120, 55, { gain: 0.25 })
        this.noise(t, 0.45, { freq: 500, sweep: 200, type: 'lowpass', gain: 0.25 })
        this.tone(t + 0.05, 0.4, 523, 1046, { gain: 0.05, type: 'triangle' })
        break
      case 'slide':
        this.noise(t, 0.6, { freq: 1800, sweep: 600, q: 0.6, gain: 0.16 })
        break
      case 'landslide':
        this.noise(t, 0.6, { freq: 1800, sweep: 600, q: 0.6, gain: 0.18 })
        this.tone(t + 0.03, 0.3, 659, 1318, { gain: 0.05, type: 'triangle' })
        break
      case 'vault': case 'clamber':
        this.noise(t, 0.05, { freq: 2500, q: 2, gain: 0.14 })
        this.noise(t + 0.06, 0.2, { freq: 900, sweep: 2000, q: 0.8, gain: 0.08 })
        break
      case 'grab': case 'climb':
        this.noise(t, 0.04, { freq: 2200, q: 1.5, gain: 0.22 })
        this.tone(t, 0.08, 220, 120, { gain: 0.08 })
        break
      case 'wallrun':
        this.noise(t, 0.08, { freq: 2000, q: 1.5, gain: 0.15 })
        this.tone(t, 0.5, 392, 784, { gain: 0.05, type: 'triangle' })
        break
      case 'spring': case 'padjump':
        this.tone(t, 0.35, 180, 720, { gain: 0.2, type: 'triangle' })
        this.noise(t, 0.08, { freq: 300, type: 'lowpass', gain: 0.3 })
        break
      case 'zip':
        this.noise(t, 0.06, { freq: 3500, q: 3, gain: 0.25 })
        break
      case 'dead':
        this.tone(t, 1.6, 300, 40, { gain: 0.15, type: 'triangle' })
        this.noise(t, 1.4, { freq: 3000, sweep: 300, q: 0.7, gain: 0.25 })
        break
      case 'checkpoint':
        ;[0, 7].forEach((n, i) => this.tone(t + i * 0.07, 0.25, mtof(79 + n), mtof(79 + n), { gain: 0.07, type: 'square' }))
        break
      case 'finish':
        ;[0, 4, 7, 12, 16].forEach((n, i) => this.tone(t + i * 0.08, 0.45, mtof(72 + n), mtof(72 + n), { gain: 0.07, type: 'square' }))
        break
      case 'count':
        this.tone(t, 0.15, 660, 660, { gain: 0.1, type: 'square' })
        break
      case 'go':
        this.tone(t, 0.35, 1320, 1320, { gain: 0.1, type: 'square' })
        break
      case 'bank': {
        const m = Math.min(10, data.mult ?? 1)
        for (let i = 0; i < 3; i++) this.tone(t + i * 0.05, 0.18, mtof(76 + m + i * 4), mtof(76 + m + i * 4), { gain: 0.06, type: 'square' })
        break
      }
      case 'bail':
        this.tone(t, 0.4, 440, 110, { gain: 0.1, type: 'sawtooth' })
        break
      case 'respawn':
        this.tone(t, 0.3, 220, 880, { gain: 0.07, type: 'triangle' })
        break
      case 'focus':
        this.tone(t, 0.6, 880, 220, { gain: 0.12, type: 'sine' })
        break
      case 'airjump':
        this.noise(t, 0.16, { freq: 900, sweep: 3200, q: 0.8, gain: 0.12 })
        this.tone(t, 0.18, 660, 1320, { gain: 0.05, type: 'triangle' })
        break
      case 'shard': {
        const n = 84 + ((this.shardStep = ((this.shardStep ?? 0) + 1) % 5) * 2)
        this.tone(t, 0.09, mtof(n), mtof(n), { gain: 0.05, type: 'square' })
        this.tone(t + 0.04, 0.12, mtof(n + 7), mtof(n + 7), { gain: 0.04, type: 'square' })
        break
      }
      case 'zap': case 'shock':
        this.tone(t, 0.35, 1800, 90, { gain: 0.12, type: 'sawtooth' })
        this.noise(t, 0.3, { freq: 4000, q: 2, gain: 0.2 })
        break
      case 'spotted':
        ;[0, 0.12].forEach((d) => this.tone(t + d, 0.09, 1568, 1568, { gain: 0.07, type: 'square' }))
        break
      case 'takedown':
        this.noise(t, 0.08, { freq: 2600, q: 2, gain: 0.3 })
        this.tone(t, 0.5, 400, 60, { gain: 0.2, type: 'square' })
        this.noise(t + 0.05, 0.6, { freq: 700, sweep: 150, type: 'lowpass', gain: 0.25 })
        break
      case 'traced':
        for (let i = 0; i < 4; i++) this.tone(t + i * 0.14, 0.12, i % 2 ? 880 : 1175, i % 2 ? 880 : 1175, { gain: 0.1, type: 'sawtooth' })
        this.noise(t, 0.6, { freq: 3000, sweep: 400, q: 0.6, gain: 0.2 })
        break
      case 'uplink':
        ;[0, 7, 12, 19].forEach((n, i) => this.tone(t + i * 0.06, 0.3, mtof(67 + n), mtof(67 + n), { gain: 0.06, type: 'square' }))
        break
      case 'install':
        this.tone(t, 0.5, 220, 1760, { gain: 0.08, type: 'sawtooth' })
        ;[0, 4, 7, 11].forEach((n, i) => this.tone(t + 0.25 + i * 0.05, 0.25, mtof(79 + n), mtof(79 + n), { gain: 0.05, type: 'square' }))
        break
      case 'buy':
        this.tone(t, 0.08, 1320, 1320, { gain: 0.07, type: 'square' })
        this.tone(t + 0.07, 0.12, 1760, 1760, { gain: 0.07, type: 'square' })
        break
      case 'deny':
        this.tone(t, 0.18, 180, 160, { gain: 0.1, type: 'square' })
        break
      case 'best':
        ;[0, 4, 7, 12].forEach((n, i) => this.tone(t + i * 0.09, 0.5, mtof(72 + n), mtof(72 + n), { gain: 0.08, type: 'triangle' }))
        break
    }
  }

  // Chiptune score: square arps, triangle bass, noise hats; builds with speed.
  scheduleMusic() {
    const ctx = this.ctx
    const spb = 60 / 128 / 4
    const I = this.intensity
    // Frames stop while the tab is hidden but the audio clock doesn't: pick
    // the score up from now rather than playing every missed beat at once
    // (hundreds of oscillators in one frame).
    if (this.nextBeat < ctx.currentTime - 0.25) {
      const missed = Math.ceil((ctx.currentTime + 0.05 - this.nextBeat) / spb)
      this.beat += missed
      this.nextBeat += missed * spb
    }
    while (this.nextBeat < ctx.currentTime + 0.2) {
      const t = this.nextBeat
      const b = this.beat
      if (b % 64 === 0) this.chord = (b / 64) % CHORDS.length
      const notes = CHORDS[this.chord]
      // arpeggio: 16ths, octave jumps once the run heats up
      if (b % 2 === 0 || I > 0.35) {
        const n = notes[[0, 1, 2, 3, 2, 1, 4, 2][b % 8]] + (I > 0.6 && b % 32 >= 16 ? 12 : 0)
        this.tone(t, spb * 0.9, mtof(n), mtof(n), { type: 'square', gain: 0.022 + I * 0.012, dest: this.musicIn, attack: 0.002 })
      }
      // bass on 8ths
      if (b % 2 === 0) {
        const root = notes[0] - 24 + (b % 16 === 12 ? 7 : 0)
        this.tone(t, spb * 1.8, mtof(root), mtof(root), { type: 'triangle', gain: 0.07, dest: this.musicIn, attack: 0.003 })
      }
      // hats and kick
      if (b % 4 === 2 && I > 0.15) this.noiseTo(t, 0.03, 7000, 0.03 + I * 0.03)
      if (b % 8 === 0 && I > 0.3) this.tone(t, 0.12, 140, 40, { gain: 0.08 + I * 0.06, dest: this.musicIn })
      if (b % 16 === 8 && I > 0.5) this.noiseTo(t, 0.1, 1800, 0.06)
      this.beat++
      this.nextBeat += spb
    }
  }

  noiseTo(t, dur, freq, gain) {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const f = ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.connect(f).connect(g).connect(this.musicIn)
    src.start(t, Math.random())
    src.stop(t + dur + 0.02)
  }

  // ── per-frame ────────────────────────────────────────────────────────────

  update(dt, { speed = 0, zip = false, focus = 0, playing = false } = {}) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const k = Math.max(0, Math.min(1, (speed - 6) / 12))
    this.windGain.gain.setTargetAtTime(playing ? 0.02 + k * k * 0.22 : 0.015, t, 0.15)
    this.windFilter.frequency.setTargetAtTime(300 + k * 1400, t, 0.2)
    this.zipGain.gain.setTargetAtTime(zip ? 0.12 : 0, t, 0.05)
    this.muffle.frequency.setTargetAtTime(focus > 0.01 ? 900 : 18000, t, 0.15)
    this.intensity += ((playing ? k : 0.1) - this.intensity) * Math.min(1, dt * 0.5)
    this.scheduleMusic()
  }
}
