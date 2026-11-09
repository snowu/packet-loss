// Fixed-seed time-trial courses: the same course every attempt, so times compare.
// Medals are [gold, silver, bronze] seconds. Silver is the autopilot's time
// (so it is provably reachable); gold asks for real flow.

export const TRACKS = [
  { id: 'sprint', name: 'Sprint', seed: 1101, length: 600, checkpointEvery: 150, difficulty: { start: 0.15, ramp: 2400 }, medals: [44, 51, 61] },
  { id: 'relay', name: 'Relay', seed: 2207, length: 1200, checkpointEvery: 200, difficulty: { start: 0.35, ramp: 2400 }, medals: [70, 82, 98] },
  { id: 'gauntlet', name: 'Gauntlet', seed: 3313, length: 2000, checkpointEvery: 250, difficulty: { start: 0.65, ramp: 1600 }, medals: [124, 145, 173] },
]

export function dailyTrack(date = new Date()) {
  const key = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  let h = 2166136261
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return { id: `daily-${key}`, name: 'Daily', seed: h >>> 0, length: 1000, checkpointEvery: 200, difficulty: { start: 0.4, ramp: 2400 }, medals: null, daily: key }
}

export function levelOptions(track) {
  return { tutorial: false, length: track.length, checkpointEvery: track.checkpointEvery, difficulty: track.difficulty }
}
