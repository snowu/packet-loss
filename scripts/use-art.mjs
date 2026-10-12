// Puts artists' PNGs into the game. An art ID listed in public/art/manifest.json with public/art/<id>.png
// replaces the sprite the game draws in code (src/pixel/overrides.js).
//   npm run art:use -- --changed        every art-handoff PNG that differs from what the code draws
//   npm run art:use -- drone_0 bird_1   these IDs (from art-handoff/)
//   npm run art:use -- --remove bird_1  go back to the built-in art
//   npm run art:check                   every override is a known, redrawable ID at the right size (for CI)
// Options: --handoff <dir> (default art-handoff), --public <dir> (default public/art).
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng } from './png.mjs'

const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf(n); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v }
const handoff = resolve(opt('--handoff', 'art-handoff')), pub = resolve(opt('--public', 'public/art'))
const has = (f) => { const i = args.indexOf(f); if (i >= 0) args.splice(i, 1); return i >= 0 }
const changed = has('--changed'), remove = has('--remove'), check = has('--check')
const here = dirname(fileURLToPath(import.meta.url))

const manifest = JSON.parse(readFileSync(join(handoff, 'manifest.json'), 'utf8'))
const byId = new Map(manifest.files.map((f) => [f.id, f]))
const listFile = join(pub, 'manifest.json')
const current = existsSync(listFile) ? JSON.parse(readFileSync(listFile, 'utf8')) : []
const save = (ids) => { mkdirSync(pub, { recursive: true }); writeFileSync(listFile, JSON.stringify([...new Set(ids)].sort(), null, 2) + '\n') }
const fail = (m) => { console.error(m); process.exitCode = 1 }

if (check) {
  for (const id of current) {
    const f = byId.get(id), file = join(pub, id + '.png')
    if (!f) { fail(`public/art: ${id} is not an art ID in art-handoff/manifest.json`); continue }
    if (!f.overridable) { fail(`public/art: ${id} cannot replace in-game art yet (see art-handoff/README.md)`); continue }
    if (!existsSync(file)) { fail(`public/art: ${id}.png is listed but missing`); continue }
    try { const img = decodePng(readFileSync(file)); if (img.w !== f.width || img.h !== f.height) fail(`public/art: ${id}.png is ${img.w}×${img.h}, the game draws it at ${f.width}×${f.height}`) } catch (e) { fail(`public/art: ${id}.png: ${e.message}`) }
  }
  if (!process.exitCode) console.log(`public/art: ${current.length} override${current.length === 1 ? '' : 's'} OK`)
} else if (remove) {
  for (const id of args) { const p = join(pub, id + '.png'); if (existsSync(p)) unlinkSync(p) }
  save(current.filter((id) => !args.includes(id))); console.log(`back to the built-in art for: ${args.join(', ')}`)
} else {
  let ids = args
  if (changed) { // compare every handoff PNG with a fresh export of the code art
    const fresh = mkdtempSync(join(tmpdir(), 'art-fresh-'))
    try {
      execFileSync(process.execPath, [join(here, 'export-art.mjs'), fresh])
      ids = manifest.files.filter((f) => {
        const a = decodePng(readFileSync(join(handoff, f.file))), b = decodePng(readFileSync(join(fresh, f.file)))
        return a.w !== b.w || a.h !== b.h || Buffer.compare(Buffer.from(a.rgba), Buffer.from(b.rgba)) !== 0
      }).map((f) => f.id)
    } finally { rmSync(fresh, { recursive: true, force: true }) }
    if (!ids.length) console.log('No art-handoff PNG differs from the built-in art.')
  }
  const used = []
  for (const id of ids) {
    const f = byId.get(id)
    if (!f) { fail(`${id}: not an art ID (see art-handoff/manifest.json)`); continue }
    if (!f.overridable) { console.warn(`${id}: changed, but the game cannot use a PNG for it yet (${f.file}); skipped`); continue }
    const img = decodePng(readFileSync(join(handoff, f.file)))
    if (img.w !== f.width || img.h !== f.height) { fail(`${id}: ${img.w}×${img.h}, but the game draws it at ${f.width}×${f.height}; keep the canvas size`); continue }
    mkdirSync(pub, { recursive: true }); copyFileSync(join(handoff, f.file), join(pub, id + '.png')); used.push(id)
  }
  if (used.length) { save([...current, ...used]); console.log(`In the game now: ${used.join(', ')} (public/art/)`) }
}
