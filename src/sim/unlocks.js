// What a runner earns between heists. Every heist pays rep, win or lose;
// the fixer trades it for things that turn up in later runs: new chrome in
// the street doc's stock, new ways on, and standing perks. Pure data.

export const UNLOCKS = [
  { id: 'pockets', kind: 'perk', cost: 50, name: 'Deep Pockets', desc: 'Start every heist with ¢60.' },
  { id: 'shocksoles', kind: 'chrome', cost: 60, name: 'Shock Soles', desc: 'New chrome: slide through a laser grid to short it out.' },
  { id: 'blackout', kind: 'route', cost: 70, name: 'Route: Blackout', desc: 'A new way on: no lasers, no drones, and a trace that climbs fast.' },
  { id: 'glide', kind: 'chrome', cost: 80, name: 'Glide Fins', desc: 'New chrome: hold jump in the air to glide.' },
  { id: 'favor', kind: 'perk', cost: 90, name: 'Fixer’s Favor', desc: 'The first reroll at every uplink is free.' },
  { id: 'goldrush', kind: 'route', cost: 90, name: 'Route: Gold Rush', desc: 'A new way on: shards worth triple under heavy security.' },
  { id: 'deadman', kind: 'chrome', cost: 110, name: 'Deadman Switch', desc: 'New rare chrome: come back once from a flatline.' },
  { id: 'phase', kind: 'chrome', cost: 130, name: 'Phase Shifter', desc: 'New rare chrome: security can’t see you while Focus is on.' },
  { id: 'medic', kind: 'perk', cost: 140, name: 'Field Medic', desc: 'Repairs cost ¢30 less.' },
]

export const unlockById = (id) => UNLOCKS.find((u) => u.id === id)

// Rep for a finished heist: getting further, doing the jobs, and getting out.
export function repFor({ sector, extracted, contracts, threat = 0 }) {
  return 10 * sector + 5 * contracts + (extracted ? 40 + 20 * threat : 0)
}
