// Tuning constants for the simulation. Units are meters and seconds.
// Values are mutable at runtime through the dev tuning panel (F2).

export const PHYS = {
  FIXED_DT: 1 / 120,

  // body
  W: 0.6,
  H: 1.8,
  H_LOW: 0.9,
  REACH: 0.7,           // hands above head when grabbing a ledge
  STEP: 0.3,            // ledges this small are walked over

  // gravity and jumping
  G: 34,
  JUMP_V: 11,
  JUMP_HOLD_TIME: 0.25,
  JUMP_HOLD_GRAVITY: 0.5,
  COYOTE: 0.1,
  JUMP_BUFFER: 0.12,
  MAX_FALL: 40,
  AIR_JUMPS: 0,         // mid-air jumps per airtime (chrome can add one)
  AIR_JUMP_V: 10,

  // running speed
  SPEED_START: 7,
  SPEED_MIN: 9,
  SPEED_MAX: 17,
  ACCEL: 1.3,
  ACCEL_FALLOFF: 0.85,  // share of ACCEL gone by top speed: the last km/h come from moves
  RECOVER_ACCEL: 7,
  // momentum: after a setback, speed comes back quickly to this share of what
  // you had; the memory of it fades at MOMENTUM_DECAY m/s per second
  MOMENTUM_KEEP: 0.85,
  MOMENTUM_DECAY: 0.6,

  // ground moves
  SLIDE_TIME: 0.7,
  ROLL_TIME: 0.5,
  ROLL_WINDOW: 0.45,
  HARD_LAND_V: 17,
  // landing slide: press slide right as you touch down from a soft landing
  LANDSLIDE_PRE: 0.1,   // seconds before touchdown that still count
  LANDSLIDE_POST: 0.08, // seconds after touchdown that still count
  LANDSLIDE_GAIN: 1.4,  // speed gained by a perfect landing slide at top speed
  LANDSLIDE_MIN: 0.6,   // timing × pace below this is just a plain slide
  STUMBLE_TIME: 0.45,
  STUMBLE_SPEED: 5.5,

  // obstacles
  VAULT_MAX: 1.25,
  VAULT_REACH: 1.6,     // jump this close to a low obstacle and you vault it
  CLAMBER_MAX: 2.1,
  VAULT_STEP_TIME: 0.22,
  MANTLE_TIME: 0.32,
  MANTLE_KEEP: 0.95,    // speed kept through a ledge grab

  // walls
  CLIMB_V: 10,
  CLIMB_G: 16,
  CLIMB_TIME: 0.45,
  WALLSLIDE_V: 4,
  WALLRUN_G: 7,
  WALLRUN_ENTER_VY: 4,
  WALLRUN_MAX_FALL: 2.5,
  WALLRUN_JUMP_V: 11.5,

  // ziplines and springboards
  ZIP_HANG: 1.95,       // line height above feet while hanging
  ZIP_CATCH: 0.5,
  ZIP_ACCEL: 9,
  ZIP_MIN: 10,
  ZIP_MAX: 21,
  SPRING_V: 16,

  // speed rewards for clean moves
  BONUS_VAULT: 0.5,
  BONUS_ROLL: 0.8,
  BONUS_WALLRUN: 1.2,
  BONUS_SPRING: 0.3,
  BONUS_PAD: 0.3,
  PAD_CLEAR: 0.5,       // how far above the wall top a pad jump carries you
  PAD_MAX_V: 24,
  PAD_MANTLE_TIME: 0.18, // a pad jump that meets the wall below its top steps up it
}

export const WORLD = {
  ROOF_MIN: -2,
  ROOF_MAX: 30,
  KILL_DEPTH: 12,       // fall this far below the lowest nearby roof and you're gone
  BUILDING_FRONT_Z: 2,
  STREET_Y: -70,
  DIFFICULTY_DISTANCE: 3500,
  FENCE_H: 2.6,         // electrified fences: only a full, well-timed jump clears one
  PAD_LEN: 2.6,         // jump pad length at the roof edge before every climb wall
}

export const RUN = {
  CHECKPOINT_EVERY: 250,
  RESPAWN_TIME: 0.9,
  LIVES: 3,
}

export const HEIST = {
  SECTORS: 5,
  SECTOR_LEN: 450,
  INTEGRITY: 3,
  TRACE_RATE: 0.027,     // per second at a jog, before moves pull it back down
  TRACE_PER_SECTOR: 0.25,
  TRACE_FLOW_SPEED: 16,  // m/s: at this pace and above, speed hides you best
  TRACE_FLOW_HIDE: 0.5,  // share of the build-up that full speed hides
  TRACE_MOVE: 0.03,      // each clean move jams the trace
  TRACE_SHARD: 0.004,
  TRACE_ZAP: 0.22,
  TRACE_SPOT: 0.14,
  TRACE_TAKEDOWN: 0.08,
  TRACE_STUMBLE: 0.06,   // a trip, a bonk or a hard landing is noise security hears
  TRACE_CARRY: 0.5,      // share of the meter that follows you through an uplink
  TRACE_AFTER_BURN: 0.4, // where the meter drops after ICE burns you
  SHARD_RADIUS: 0.45,
  SHARD_EDDIES: 5,
  DRONE_W: 1.1,
  DRONE_H: 0.5,
  TAKEDOWN_VY: 9,
  REPAIR_COST: 60,
  REPAIR_STEP: 30,
  REROLL_COST: 30,
  // the first piece of chrome at an uplink is free; more cost creds, and each
  // one bought in a run raises the price of the next
  CHROME_COST: 70,
  CHROME_COST_RARE: 120,
  CHROME_COST_STEP: 25,
  // sector payouts at the uplink
  CLEAN_BONUS: 40,       // no laser tripped, never spotted or burned, no fall
  FAST_BONUS: 25,        // through the sector at SECTOR_PAR_SPEED or better
  SECTOR_PAR_SPEED: 13.5,
}

export const FOCUS = {
  TIME_SCALE: 0.4,
  DRAIN: 0.33,
  MIN_TO_START: 0.25,
  GAIN: { vault: 0.08, clamber: 0.04, roll: 0.15, wallrun: 0.18, walljump: 0.1, zip: 0.1, spring: 0.05, padjump: 0.08, grab: 0.04, airjump: 0.05, takedown: 0.2 },
  GAIN_AT_SPEED: 0.03,
}

// Run-scoped overrides on top of PHYS (chrome upgrades). Each entry maps a
// PHYS key to a function of its current value; calling again first restores
// whatever the previous call changed, so setPhysMods({}) undoes everything.
const physSaved = {}

export function setPhysMods(mods) {
  for (const k of Object.keys(physSaved)) {
    PHYS[k] = physSaved[k]
    delete physSaved[k]
  }
  for (const [k, fn] of Object.entries(mods)) {
    physSaved[k] = PHYS[k]
    PHYS[k] = fn(PHYS[k])
  }
}
