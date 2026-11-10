// Contracts: one optional job per sector, paid at the uplink. Each asks for
// something different of the same roofs: take the drones out, stay fast,
// keep quiet. Pure data; the heist state tracks them.
//
//   target(contents)  how much is asked, from what the sector holds
//                     ({ shards, drones, lasers }); 0 means it can't be offered
//   avoid             done unless it is failed (nothing to count up)

const FLOW_SPEED = 15.25   // m/s, about 55 km/h

export const CONTRACTS = [
  { id: 'takedowns', text: (n) => `${n} TAKEDOWNS`, target: (c) => (c.drones >= 3 ? Math.min(4, Math.ceil(c.drones * 0.6)) : 0) },
  { id: 'shards', text: (n) => `${n} SHARDS`, target: (c) => (c.shards >= 12 ? Math.round(c.shards * 0.6) : 0) },
  { id: 'flow', text: (n) => `${n} S ABOVE 55 KM/H`, target: () => 12 },
  { id: 'combo', text: (n) => `BANK A ×${n} COMBO`, target: () => 6 },
  { id: 'landslides', text: (n) => `${n} LANDING SLIDES`, target: () => 3 },
  { id: 'ghost', text: () => 'TRACE UNDER 50%', avoid: true, target: () => 1 },
  { id: 'untouched', text: () => 'NO STUMBLES', avoid: true, target: () => 1 },
]

export function rollContract(rng, contents, pay) {
  const pool = CONTRACTS.map((c) => [c, c.target(contents)]).filter(([, n]) => n > 0)
  const [def, target] = rng.pick(pool)
  return { id: def.id, text: def.text(target), avoid: !!def.avoid, target, progress: 0, failed: false, pay }
}

export const contractDone = (c) => !!c && !c.failed && (c.avoid || c.progress >= c.target)

// Count an event or a moment of running toward a contract. Returns true the
// moment it completes or fails, so the HUD can say so once.
export function trackContract(c, what, amount = 1, dt = 0) {
  if (!c || c.failed) return false
  const before = contractDone(c)
  switch (c.id) {
    case 'takedowns': if (what === 'takedown') c.progress += amount; break
    case 'shards': if (what === 'shard') c.progress += amount; break
    case 'landslides': if (what === 'landslide') c.progress += amount; break
    case 'combo': if (what === 'bank') c.progress = Math.max(c.progress, amount); break
    case 'flow': if (what === 'speed' && amount >= FLOW_SPEED) c.progress += dt; break
    case 'ghost': if (what === 'trace' && amount >= 0.5) c.failed = true; break
    case 'untouched': if (what === 'stumble') c.failed = true; break
  }
  if (c.failed) return true
  return !c.avoid && !before && contractDone(c)
}
