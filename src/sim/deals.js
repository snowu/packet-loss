// Deals: at every uplink the street doc has one offer on the side, good
// once. Each is a trade the run can go either way on. Pure data; `apply`
// changes the heist state and may return a line for the HUD.
import { CHROME, countOf } from './chrome.js'

const pieces = (n) => CHROME.filter((c) => n.available(c) && countOf(n.owned, c.id) < c.max)

export const DEALS = [
  { id: 'blood', name: 'BLOOD DRAW', text: '−1 INTEGRITY · +¢150',
    can: (n) => n.integrity >= 2,
    apply: (n) => { n.integrity--; n.creds += 150 } },
  { id: 'scrub', name: 'SCRUB', text: '¢60 · TRACE TO ZERO',
    can: (n) => n.creds >= 60 && n.trace > 0.05,
    apply: (n) => { n.creds -= 60; n.trace = 0 } },
  { id: 'crate', name: 'MYSTERY CRATE', text: '¢50 · A RANDOM PIECE',
    can: (n) => n.creds >= 50 && pieces(n).length > 0,
    apply: (n) => {
      n.creds -= 50
      const c = n.rng.pick(pieces(n))
      n.grant(c.id)
      return c.name.toUpperCase()
    } },
  { id: 'tipoff', name: 'TIP-OFF', text: '¢40 · NEXT CONTRACT PAYS TRIPLE',
    can: (n) => n.creds >= 40,
    apply: (n) => { n.creds -= 40; n.contractBoost = 3 } },
  { id: 'burner', name: 'BURNER', text: '+30% TRACE · +¢110',
    can: (n) => n.trace < 0.6,
    apply: (n) => { n.trace += 0.3; n.creds += 110 } },
]

export function rollDeal(rng) {
  return { ...rng.pick(DEALS), taken: false }
}
