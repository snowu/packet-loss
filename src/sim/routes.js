// Routes: at every uplink the runner picks which way to cross the next
// sector. The buildings are the same either way; what changes is the security
// laid over them and what the sector pays. Pure data plus a seeded roll.
//
//   laser, drone, shards   density of each, as a multiple of a standard sector
//   trace                  how fast the trace builds
//   shardValue             what a shard is worth
//   takedownCreds          creds for every drone taken down
//   payout                 multiple on the sector's clean and fast bonuses

export const STANDARD = { id: 'standard', name: 'Main Line', desc: 'Standard security.', laser: 1, drone: 1, shards: 1, trace: 1, shardValue: 1, takedownCreds: 0, payout: 1, heat: 0 }

const route = (r) => ({ ...STANDARD, ...r })

// heat: 0 easier than standard, 1 a trade, 2 clearly hotter
export const ROUTES = [
  route({ id: 'alleys', name: 'Back Alleys', desc: 'Light security. Half the shards.', laser: 0.5, drone: 0.5, shards: 0.5, heat: 0 }),
  route({ id: 'deadzone', name: 'Dead Zone', desc: 'Trace builds 40% slower. Sector bonuses pay nothing.', trace: 0.6, payout: 0, heat: 0 }),
  route({ id: 'lockdown', name: 'Lockdown', desc: 'Twice the laser grids. Shards are worth double.', laser: 2, shardValue: 2, heat: 1 }),
  route({ id: 'sweep', name: 'Drone Sweep', desc: 'Twice the drones. Takedowns pay ¢10.', drone: 1.8, takedownCreds: 10, heat: 1 }),
  route({ id: 'vault', name: 'Data Vault', desc: 'A shard on every obstacle and more lines. Trace builds 35% faster.', shards: 2.2, trace: 1.35, heat: 1 }),
  route({ id: 'redline', name: 'Red Line', desc: 'Heavy security everywhere. Sector bonuses pay triple.', laser: 1.6, drone: 1.5, trace: 1.2, payout: 3, heat: 2 }),
]

export function routeById(id) {
  return id === STANDARD.id ? STANDARD : ROUTES.find((r) => r.id === id)
}

// Two ways on: never two easy ones, so there is always a reason to push.
export function rollRoutes(rng) {
  const first = rng.pick(ROUTES)
  const rest = ROUTES.filter((r) => r !== first && (first.heat > 0 || r.heat > 0))
  const second = rng.pick(rest)
  return first.heat <= second.heat ? [first, second] : [second, first]
}
