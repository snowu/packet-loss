// The art handoff export draws through the same functions as the game; this keeps it working as the art code changes.
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'

function opaque(file) {
  const b = readFileSync(file), idat = []
  let o = 8, w = 0, h = 0
  while (o < b.length) {
    const len = b.readUInt32BE(o), type = b.toString('ascii', o + 4, o + 8)
    if (type === 'IHDR') { w = b.readUInt32BE(o + 8); h = b.readUInt32BE(o + 12) }
    if (type === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + len))
    o += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * 4 + 1
  let n = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (raw[y * stride + 1 + x * 4 + 3]) n++
  return { w, h, n }
}

describe('art:export', () => {
  it('exports every category as non-empty PNGs that match the manifest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pl-art-'))
    try {
      execFileSync(process.execPath, ['scripts/export-art.mjs', dir])
      const { files } = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
      const folders = new Set(files.map((f) => f.file.split('/')[0]))
      expect([...folders].sort()).toEqual(['ads', 'billboards', 'city', 'decor', 'obstacles', 'runner', 'security', 'sky'])
      expect(files.filter((f) => /_run_\d\.png$/.test(f.file)).length).toBe(24) // 8-frame cycle for each of the 3 looks
      for (const f of files) {
        const img = opaque(join(dir, f.file))
        expect([img.w, img.h], f.file).toEqual([f.width, f.height])
        expect(img.n, f.file).toBeGreaterThan(2)
      }
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }, 60000)
})
