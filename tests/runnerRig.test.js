import { describe, it, expect } from 'vitest'
import { BONES, solve, soleBottom, bottomOf, CHANNELS } from '../src/pixel/rig/skeleton.js'
import { runChannels, sampleState, CLIPS } from '../src/pixel/rig/clips.js'
import { Animator } from '../src/pixel/rig/animator.js'
import { SKINS, defineSkin, rulesFor, recolorPixels } from '../src/pixel/rig/skins.js'
import { atlasCell } from '../src/pixel/conceptArt.js'
import { decodePng } from '../scripts/png.mjs'
import { readFileSync } from 'node:fs'
import { STANCE, RUN_STRIDE, CONTACT_X } from '../src/pixel/runGait.js'
import { SHOE, PART } from '../src/pixel/runnerModel.js'

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

// One representative actor per simulation state, at a few moments.
const STATES = [
  ...[0, 0.13, 0.31, 0.5, 0.77].map(phase => ({ name: `run ${phase}`, p: { state: 'run', speed: 14 }, phase })),
  { name: 'idle', p: { state: 'run' }, idle: true },
  ...[9, 2, -1, -6, -14].map(vy => ({ name: `air ${vy}`, p: { state: 'air', vy } })),
  ...['slide', 'vault', 'mantle', 'climb', 'wallslide', 'wallrun', 'zip', 'roll', 'stumble', 'blocked', 'dead']
    .flatMap(state => [0, 0.12, 0.3, 0.6].map(t => ({ name: `${state} ${t}`, p: { state, t, speed: 14, vy: 0, kin: { t, T: 0.32 } } }))),
]

function bones(j) {
  return [
    [j.near.hip, j.near.knee, BONES.thigh], [j.near.knee, j.near.ankle, BONES.shin],
    [j.far.hip, j.far.knee, BONES.thigh], [j.far.knee, j.far.ankle, BONES.shin],
    [j.nearArm.shoulder, j.nearArm.elbow, BONES.upper], [j.nearArm.elbow, j.nearArm.wrist, BONES.fore], [j.nearArm.wrist, j.nearArm.knuckles, BONES.hand],
    [j.farArm.shoulder, j.farArm.elbow, BONES.upper], [j.farArm.elbow, j.farArm.wrist, BONES.fore], [j.farArm.wrist, j.farArm.knuckles, BONES.hand],
  ]
}

function settle(s, frames = 30) {
  const a = new Animator()
  for (let i = 0; i <= frames; i++) a.update(s.p, 1 / 60, s.phase ?? 0, s.idle, i * 0.2, 0)
  return a
}

describe('runner skeleton', () => {
  it('keeps every bone its own length in every state and mid-blend', () => {
    for (const from of STATES) for (const to of STATES.filter((_, i) => i % 3 === 0)) {
      const a = settle(from, 6)
      for (let i = 0; i < 8; i++) {
        a.update(to.p, 1 / 60, to.phase ?? 0, to.idle, 0, 0)
        for (const [p, q, l] of bones(a.joints)) expect(dist(p, q)).toBeCloseTo(l, 8)
      }
    }
  })

  it('never hyperextends a knee or elbow', () => {
    for (const s of STATES) {
      const pose = settle(s).out
      const j = solve(pose)
      for (const leg of [j.near, j.far]) {
        // The knee sits forward of the hip-ankle line (side view, facing +x).
        const [h, k, a] = [leg.hip, leg.knee, leg.ankle]
        expect((a[0] - h[0]) * (k[1] - h[1]) - (a[1] - h[1]) * (k[0] - h[0]), s.name).toBeLessThanOrEqual(1e-6)
      }
    }
  })

  it('plants run soles on the roof and moves them back exactly with the ground', () => {
    for (let i = 0; i < 400; i++) {
      const phase = i / 400, j = solve(runChannels(phase, 0.5))
      for (const [leg, offset] of [[j.near, 0], [j.far, 0.5]]) {
        const u = (phase + offset) % 1
        expect(soleBottom(leg)).toBeLessThanOrEqual(1e-6)
        if (u < STANCE) {
          expect(soleBottom(leg)).toBeCloseTo(0, 6)
          const pivot = leg.foot < 0 ? SHOE.x : SHOE.x + SHOE.w
          const contactX = leg.ankle[0] + pivot * Math.cos(leg.foot) - (SHOE.y + SHOE.h) * Math.sin(leg.foot)
          expect(contactX + u * RUN_STRIDE * 14).toBeCloseTo(CONTACT_X + pivot, 6)
        }
      }
    }
  })

  it('stands every grounded pose on the roof', () => {
    for (const name of ['idle', 'brace', 'air', 'slide', 'vault', 'mantle', 'climb', 'wallslide', 'stumble', 'dead']) {
      for (const t of [0, 0.25, 0.5, 0.9]) {
        const p = sampleState(name === 'brace' ? 'brace' : name, { state: name, t, vy: 0, kin: { t, T: 1 } }, { phase: 0, time: t })
        expect(bottomOf(solve(p)), `${name} ${t}`).toBeCloseTo(0, 6)
      }
    }
    expect(Object.keys(CLIPS)).toEqual(expect.arrayContaining(['idle', 'air', 'slide', 'vault', 'mantle', 'climb', 'wallslide', 'zip', 'roll', 'stumble']))
  })
})

describe('runner animation', () => {
  it('crossfades between any two states without a pop', () => {
    // At 60 fps no joint may jump more than a few pixels between frames,
    // whatever the simulation switches to.
    const points = j => [j.hip, j.shoulder, j.near.knee, j.near.ankle, j.far.knee, j.far.ankle, j.nearArm.elbow, j.nearArm.knuckles, j.farArm.elbow, j.farArm.knuckles, j.head.o]
    let worst = 0, where = ''
    for (const from of STATES) for (const to of STATES) {
      if (to.p.state === 'roll' || from.p.state === 'roll' || to.p.state === from.p.state) continue
      const a = settle(from, 20), before = points(a.joints)
      a.update(to.p, 1 / 60, to.phase ?? 0, to.idle, 0, 0)
      const after = points(a.joints)
      for (let i = 0; i < before.length; i++) if (dist(before[i], after[i]) > worst) { worst = dist(before[i], after[i]); where = `${from.name} -> ${to.name}` }
    }
    expect(worst, where).toBeLessThan(7)
  })

  it('turns exactly once in a roll and does not unwind afterwards', () => {
    const a = new Animator()
    a.update({ state: 'run', speed: 14 }, 1 / 60, 0, false)
    let last = 0, turned = 0
    for (let t = 0; t <= 0.5 + 1e-9; t += 1 / 60) {
      a.update({ state: 'roll', t }, 1 / 60, 0, false)
      turned += Math.max(0, a.out.spin - last); last = a.out.spin
    }
    expect(turned).toBeGreaterThan(Math.PI * 1.7)
    const spins = []
    for (let i = 0; i < 12; i++) { a.update({ state: 'run', speed: 14 }, 1 / 60, i / 60, false); spins.push(Math.abs(a.out.spin)) }
    expect(Math.max(...spins)).toBeLessThan(0.6)
    expect(spins.at(-1)).toBeLessThan(1e-9)
  })

  it('squashes on landing without sliding the planted feet', () => {
    const a = new Animator()
    for (let i = 0; i < 20; i++) a.update({ state: 'air', vy: -14 }, 1 / 60, 0, false)
    const hips = []
    for (let i = 0; i < 24; i++) {
      a.update({ state: 'run', speed: 14 }, 1 / 60, 0, false)
      hips.push(a.joints.hip[1])
      if (i > 8) {
        const planted = a.joints.near
        expect(soleBottom(planted)).toBeCloseTo(0, 5)
      }
    }
    expect(Math.max(...hips)).toBeGreaterThan(hips.at(-1) + 1.5)
  })

  it('keeps the ponytail attached, finite and calm after a teleport', () => {
    const a = new Animator()
    for (let i = 0; i < 120; i++) a.update({ state: 'run', speed: 15 }, 1 / 60, i * 0.06, false, i * 0.25, 0)
    a.update({ state: 'run', speed: 15 }, 1 / 60, 0, false, 5000, 300)
    for (let i = 0; i < 30; i++) a.update({ state: i < 15 ? 'roll' : 'air', t: i / 30, vy: -10 }, 1 / 60, 0, false, 5000 + i * 0.2, 300)
    for (const pt of a.hairPoints) for (const v of pt) expect(Number.isFinite(v)).toBe(true)
    for (let i = 1; i < a.hairPoints.length; i++) expect(dist(a.hairPoints[i], a.hairPoints[i - 1])).toBeLessThan(2.1)
  })

  it('accepts recorded ghosts, which carry no kinematic or speed data', () => {
    const a = new Animator()
    for (const state of ['run', 'air', 'vault', 'mantle', 'roll', 'zip', 'wallrun', 'unknown']) {
      a.update({ state, t: 0.1 }, 1 / 60, NaN, false, NaN, NaN)
      for (const k of CHANNELS) expect(Number.isFinite(a.out[k]), `${state} ${k}`).toBe(true)
    }
  })
})

describe('runner skins', () => {
  it('binds every outfit sheet to the same nine parts', () => {
    for (const skin of Object.values(SKINS)) {
      const { w, h, rgba } = decodePng(readFileSync(new URL(`../public/concept-art/${skin.sheet}`, import.meta.url)))
      for (let i = 0; i < 9; i++) {
        const c = atlasCell(w, h, i, 3, 3)
        let opaque = 0
        for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) if (rgba[(y * w + x) * 4 + 3] > 32) opaque++
        expect(opaque, `${skin.sheet} part ${i}`).toBeGreaterThan(500)
      }
    }
    expect(Object.keys(PART)).toHaveLength(9)
  })

  it('recolours a part without touching its silhouette or unmatched hues', () => {
    // red glove, skin-tone fingers, grey strap, transparent
    const px = new Uint8ClampedArray([200, 30, 40, 255, 230, 170, 130, 255, 120, 120, 120, 255, 200, 30, 40, 0])
    const before = Array.from(px)
    recolorPixels(px, { where: [330, 15], tint: '#2b7fff' })
    expect(px[2]).toBeGreaterThan(px[0])                      // the glove is blue now
    expect(Array.from(px.slice(4, 12))).toEqual(before.slice(4, 12)) // skin and grey untouched
    expect(Array.from(px.slice(12))).toEqual(before.slice(12))       // transparent pixels untouched
    for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(before[i])
    const all = new Uint8ClampedArray([200, 30, 40, 255])
    recolorPixels(all, [{ hue: 120 }, { light: 0.5 }])
    expect(all[1]).toBeGreaterThan(all[0])
    expect(all[1]).toBeLessThan(120)
  })

  it('defines a skin as a sheet plus optional per-part recolours', () => {
    const night = defineSkin({ name: 'Night', sheet: SKINS.courier.sheet, recolor: { all: { light: 0.9 }, torso: { hue: 200 }, shoe: [{ where: [330, 15], tint: '#35e0ff' }] } })
    expect(rulesFor(night, 'torso')).toEqual([{ light: 0.9 }, { hue: 200 }])
    expect(rulesFor(night, 'head')).toEqual([{ light: 0.9 }])
    expect(rulesFor(SKINS.courier, 'torso')).toEqual([])
    expect(() => defineSkin({ name: 'Broken' })).toThrow(/sheet/)
    expect(() => defineSkin({ name: 'Broken', sheet: 'x.png', recolor: { cape: { hue: 1 } } })).toThrow(/unknown part/)
  })
})
