import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
const builtAt = new Date().toISOString()
let id = process.env.PACKET_LOSS_BUILD_ID || process.env.GITHUB_SHA
if (!id) {
  try { id = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() }
  catch { id = builtAt }
}
const release = { id, version, builtAt }

// The offline service worker: src/sw.js with the release and the files to
// precache filled in. The art lab only runs locally, so it stays out.
const PUBLIC = ['./', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']
// the sprite PNGs (see src/pixel/artPng.js), so they work offline too
export function artFiles(dir = new URL('./public/art/', import.meta.url)) {
  try {
    return readdirSync(dir, { recursive: true }).map((f) => String(f).replaceAll('\\', '/')).filter((f) => f.endsWith('.png')).sort().map((f) => `art/${f}`)
  } catch { return [] }
}
export function serviceWorker(releaseId, files, art = artFiles()) {
  const precache = [...PUBLIC, ...art, ...files.filter((f) => !['index.html', 'lab.html', 'version.json', 'sw.js'].includes(f) && !/(^|\/)lab[-.]/.test(f) && !f.endsWith('.map'))]
  const source = readFileSync(new URL('./src/sw.js', import.meta.url), 'utf8')
  return `self.__RELEASE__ = ${JSON.stringify(releaseId)}\nself.__PRECACHE__ = ${JSON.stringify(precache)}\n${source}`
}

export default defineConfig({
  base: '/packet-loss/',
  define: { __APP_RELEASE__: JSON.stringify(release) },
  plugins: [{
    name: 'release-info',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    <meta name="packet-loss-build" content="${id.replace(/[^a-zA-Z0-9._:-]/g, '')}" />`)
    },
    generateBundle(_, bundle) {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(release) })
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorker(release.id, Object.keys(bundle)) })
    },
  }],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: { game: resolve('index.html'), lab: resolve('lab.html') },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
