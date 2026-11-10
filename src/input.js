// Keyboard, touch and gamepad folded into two buttons (jump, down) plus focus.
// Press edges are latched until a physics step consumes them.

const JUMP_KEYS = new Set(['Space', 'KeyW', 'ArrowUp', 'KeyK'])
const DOWN_KEYS = new Set(['KeyS', 'ArrowDown', 'ShiftLeft', 'ShiftRight', 'KeyJ'])
const FOCUS_KEYS = new Set(['KeyE', 'KeyF', 'KeyL'])

export class Input {
  constructor() {
    this.jump = false
    this.down = false
    this.jumpPressed = false
    this.downPressed = false
    this.focusPressed = false
    this.anyPressed = false
    this.handlers = {}
    this.touches = new Map()
    this.pad = { a: false, b: false, f: false, start: false }

    window.addEventListener('keydown', (e) => this.key(e, true))
    window.addEventListener('keyup', (e) => this.key(e, false))
    window.addEventListener('blur', () => { this.jump = false; this.down = false })

    const opts = { passive: false }
    window.addEventListener('touchstart', (e) => this.touchStart(e), opts)
    window.addEventListener('touchend', (e) => this.touchEnd(e), opts)
    window.addEventListener('touchcancel', (e) => this.touchEnd(e), opts)
    window.addEventListener('mousedown', (e) => {
      if (e.target.closest('button, a, li, .city-pick')) return
      this.anyPressed = true
    })
  }

  on(name, fn) { this.handlers[name] = fn }

  key(e, down) {
    if (e.repeat) { if (JUMP_KEYS.has(e.code) || DOWN_KEYS.has(e.code)) e.preventDefault(); return }
    if (down) {
      // menu-level actions; main decides what they mean in each mode
      if (e.code === 'ArrowUp' || e.code === 'KeyW') this.handlers.nav?.(-1)
      if (e.code === 'ArrowDown' || e.code === 'KeyS') this.handlers.nav?.(1)
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.handlers.side?.(-1)
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.handlers.side?.(1)
      if (e.code === 'KeyQ') this.handlers.runner?.(-1)
      if (e.code === 'KeyE') this.handlers.runner?.(1)
      if (e.code === 'KeyT') this.handlers.threat?.()
      if (e.code === 'KeyF') this.handlers.fixer?.()
      if (e.code === 'Space') this.handlers.confirm?.()
      if (e.code === 'Enter') this.handlers.enter?.()
      if (e.code === 'KeyR') this.handlers.restart?.()
      if (e.code === 'Escape') this.handlers.back?.()
    }
    if (JUMP_KEYS.has(e.code)) {
      e.preventDefault()
      if (down && !this.jump) this.jumpPressed = true
      this.jump = down
    } else if (DOWN_KEYS.has(e.code)) {
      e.preventDefault()
      if (down && !this.down) this.downPressed = true
      this.down = down
    } else if (FOCUS_KEYS.has(e.code) && down) {
      this.focusPressed = true
    } else if (down && e.code === 'KeyP') {
      this.handlers.pause?.()
    } else if (down && e.code === 'KeyM') {
      this.handlers.mute?.()
    } else if (down && e.code === 'F2') {
      this.handlers.debug?.()
    }
  }

  touchStart(e) {
    if (e.target.closest && e.target.closest('button, a, li, .city-pick')) return
    e.preventDefault()
    this.anyPressed = true
    for (const t of e.changedTouches) {
      const side = t.clientX < window.innerWidth * 0.4 ? 'down' : 'jump'
      this.touches.set(t.identifier, side)
      if (side === 'jump') { if (!this.jump) this.jumpPressed = true; this.jump = true }
      else { if (!this.down) this.downPressed = true; this.down = true }
    }
  }

  touchEnd(e) {
    for (const t of e.changedTouches) {
      this.touches.delete(t.identifier)
    }
    const sides = new Set(this.touches.values())
    this.jump = sides.has('jump')
    this.down = sides.has('down')
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []
    const gp = [...pads].find((p) => p && p.connected)
    if (!gp) return
    const b = (i) => !!gp.buttons[i]?.pressed
    const a = b(0) || b(3)
    const d = b(1) || b(2) || (gp.axes[1] ?? 0) > 0.6
    const f = b(5) || b(7) || b(4) || b(6)
    const start = b(9)
    const up = b(12), dn = b(13)
    if (up && !this.pad.up) this.handlers.nav?.(-1)
    if (dn && !this.pad.dn) this.handlers.nav?.(1)
    if (b(8) && !this.pad.sel) this.handlers.restart?.()
    if (a && !this.pad.a) { this.jumpPressed = true; this.anyPressed = true }
    if (d && !this.pad.b) this.downPressed = true
    if (f && !this.pad.f) this.focusPressed = true
    if (start && !this.pad.start) this.handlers.pause?.()
    if (a !== this.pad.a) this.jump = a
    if (d !== this.pad.b) this.down = d
    this.pad = { a, b: d, f, start, up, dn, sel: b(8) }
  }

  // Input for one physics step; edges are delivered once.
  consume() {
    const out = { jump: this.jump, jumpPressed: this.jumpPressed, down: this.down, downPressed: this.downPressed }
    this.jumpPressed = false
    this.downPressed = false
    return out
  }

  takeFocus() {
    const f = this.focusPressed
    this.focusPressed = false
    return f
  }

  takeAny() {
    const a = this.anyPressed
    this.anyPressed = false
    return a
  }

  clearEdges() {
    this.jumpPressed = false
    this.downPressed = false
    this.focusPressed = false
    this.anyPressed = false
  }
}
