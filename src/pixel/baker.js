// Queue for the bake worker. A sprite asked for here is baked in the
// background; its buffer is handed to `done` only if that version is still
// the one wanted. Without workers (or if the worker fails) `ready` is false
// and callers bake on the main thread as before.
export class Baker {
  constructor(done) {
    this.pending = new Map()      // key -> version being baked
    this.requests = new Map()
    this.results = []
    this.serial = 0
    this.done = done
    try {
      this.worker = new Worker(new URL('./bakeWorker.js', import.meta.url), { type: 'module' })
      this.worker.onmessage = ({ data }) => {
        if (this.pending.get(data.key) !== data.version || this.requests.get(data.key) !== data.request) return
        this.results.push(data)
      }
      this.worker.onerror = () => { this.worker?.terminate(); this.worker = null; this.pending.clear(); this.requests.clear(); this.results.length = 0 }
    } catch {
      this.worker = null
    }
  }

  get ready() { return !!this.worker }

  // Upload only a bounded number of finished sprites in a frame. A burst of
  // worker replies must not turn into an unbounded main-thread upload task.
  flush(limit = 1) {
    let applied = 0
    while (this.results.length && applied < limit) {
      const data = this.results.shift()
      if (this.pending.get(data.key) !== data.version || this.requests.get(data.key) !== data.request) continue
      this.pending.delete(data.key)
      this.requests.delete(data.key)
      this.done(data.key, data.version, data)
      applied++
    }
    return applied
  }

  want(key, version, job) {
    if (this.pending.get(key) === version) return
    this.pending.set(key, version)
    const request = ++this.serial
    this.requests.set(key, request)
    this.worker.postMessage({ key, version, request, job })
  }

  // stop waiting on keys that no longer matter (their chunk scrolled away)
  drop(test) {
    for (const key of this.pending.keys()) if (test(key)) { this.pending.delete(key); this.requests.delete(key) }
  }
}
