// Chrome: cyberware the runner installs between sectors of a heist.
// Each piece stacks up to `max`; effects fold into PHYS overrides plus a
// handful of run modifiers that main.js and the heist state read.

export const CHROME = [
  { id: 'tendons', short: 'TENDONS', name: 'Reinforced Tendons', maker: 'KITE', tag: 'LEGS', rare: true, max: 1,
    desc: 'Jump once more in mid-air.' },
  { id: 'calves', short: 'CALVES', name: 'Overclocked Calves', maker: 'VOLT', tag: 'LEGS', max: 3,
    desc: '+4 km/h top speed and faster acceleration.' },
  { id: 'pneumatic', short: 'ANKLES', name: 'Pneumatic Ankles', maker: 'KITE', tag: 'LEGS', max: 2,
    desc: 'Jumps go 6% higher.' },
  { id: 'dampers', short: 'DAMPERS', name: 'Kinetic Dampers', maker: 'STRATA', tag: 'SKELETON', max: 2,
    desc: 'Survive harder drops and a wider roll window.' },
  { id: 'grip', short: 'GRIP', name: 'Gecko Grip', maker: 'HELIX', tag: 'ARMS', max: 2,
    desc: 'Longer ledge reach and stronger wall climbs.' },
  { id: 'optics', short: 'OPTICS', name: 'Tachyon Optics', maker: 'ORBIT', tag: 'EYES', max: 2,
    desc: 'Focus charges 50% faster.' },
  { id: 'dilator', short: 'DILATOR', name: 'Chrono Dilator', maker: 'PULSE', tag: 'NERVOUS', rare: true, max: 1,
    desc: 'Focus slows time harder and lasts longer.' },
  { id: 'synapse', short: 'SYNAPSE', name: 'Synaptic Buffer', maker: 'PULSE', tag: 'NERVOUS', max: 2,
    desc: 'Combos stay alive 1 second longer.' },
  { id: 'plating', short: 'PLATING', name: 'Subdermal Plating', maker: 'NOVA', tag: 'SKIN', max: 3,
    desc: '+1 max integrity, and repairs one.' },
  { id: 'insulated', short: 'DERMIS', name: 'Insulated Dermis', maker: 'NOVA', tag: 'SKIN', max: 1,
    desc: 'Laser grids no longer break your combo, and trip half the trace.' },
  { id: 'ghost', short: 'GHOST', name: 'Ghost Protocol', maker: 'ZEN 24', tag: 'DECK', max: 2,
    desc: 'Trace builds 20% slower.' },
  { id: 'jammer', short: 'JAMMER', name: 'Signal Jammer', maker: 'STRATA', tag: 'DECK', max: 2,
    desc: 'Drones spot you for half the trace.' },
  { id: 'siphon', short: 'SIPHON', name: 'Data Siphon', maker: 'ZEN 24', tag: 'DECK', max: 2,
    desc: 'Shards are worth double and pull in from further away.' },
  { id: 'adrenal', short: 'ADRENAL', name: 'Adrenal Pump', maker: 'VOLT', tag: 'NERVOUS', max: 2,
    desc: 'Every drone takedown kicks you +5 km/h and charges focus.' },
  { id: 'secondwind', short: 'WIND', name: 'Second Wind', maker: 'HELIX', tag: 'SKELETON', rare: true, max: 1,
    desc: 'The first fall in each sector costs no integrity.' },
  // deals: more of one thing for less of another
  { id: 'hotwire', short: 'HOTWIRE', name: 'Hotwired Deck', maker: 'ORBIT', tag: 'DECK', deal: true, max: 1,
    desc: 'Shards are worth triple. Trace builds 30% faster.' },
  { id: 'overdrive', short: 'OVERDRV', name: 'Overdrive Core', maker: 'PULSE', tag: 'HEART', deal: true, rare: true, max: 1,
    desc: '+7 km/h top speed and clean moves jam twice the trace. −1 max integrity.' },
]

const BY_ID = Object.fromEntries(CHROME.map((c) => [c.id, c]))

export function chromeById(id) { return BY_ID[id] }

export function countOf(owned, id) {
  let n = 0
  for (const o of owned) if (o === id) n++
  return n
}

// Up to n distinct offers that the runner can still install.
export function rollOffer(rng, owned, n = 3) {
  const pool = CHROME.filter((c) => countOf(owned, c.id) < c.max).map((c) => [c, c.rare ? 1 : 3])
  const out = []
  while (out.length < n && pool.length) {
    const pick = rng.weighted(pool)
    out.push(pick)
    pool.splice(pool.findIndex(([c]) => c === pick), 1)
  }
  return out
}

// Fold installed chrome into PHYS overrides and run modifiers.
export function chromeEffects(owned) {
  const n = (id) => countOf(owned, id)
  const phys = {}
  if (n('tendons')) phys.AIR_JUMPS = (v) => v + n('tendons')
  if (n('calves') || n('overdrive')) {
    phys.SPEED_MAX = (v) => v + 1.1 * n('calves') + 1.9 * n('overdrive')
    phys.ACCEL = (v) => v * (1 + 0.25 * n('calves'))
  }
  if (n('pneumatic')) phys.JUMP_V = (v) => v * (1 + 0.03 * n('pneumatic'))
  if (n('dampers')) {
    phys.HARD_LAND_V = (v) => v + 4 * n('dampers')
    phys.ROLL_WINDOW = (v) => v * (1 + 0.4 * n('dampers'))
  }
  if (n('grip')) {
    phys.REACH = (v) => v + 0.3 * n('grip')
    phys.CLIMB_V = (v) => v * (1 + 0.1 * n('grip'))
  }
  const run = {
    focusGain: 1 + 0.5 * n('optics'),
    focusScale: n('dilator') ? 0.25 : null,
    focusDrain: n('dilator') ? 0.6 : 1,
    comboBonus: 1 * n('synapse'),
    maxIntegrity: n('plating') - n('overdrive'),
    zapKeepsCombo: n('insulated') > 0,
    zapTrace: n('insulated') ? 0.5 : 1,
    traceRate: Math.pow(0.8, n('ghost')) * (n('hotwire') ? 1.3 : 1),
    spotTrace: Math.pow(0.5, n('jammer')),
    shardValue: (1 + n('siphon')) * (n('hotwire') ? 3 : 1),
    magnet: 0.6 * n('siphon'),
    moveJam: n('overdrive') ? 2 : 1,
    takedownSpeed: 1.4 * n('adrenal'),
    takedownFocus: 0.15 * n('adrenal'),
    freeFalls: n('secondwind'),
  }
  return { phys, run }
}
