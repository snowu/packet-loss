import { afterEach, expect, it, vi } from 'vitest'
import { Baker } from '../src/pixel/baker.js'

class FakeWorker {
  messages = []
  terminate = vi.fn()
  postMessage(message) { this.messages.push(message) }
  reply(message) { this.onmessage({ data: message }) }
}
afterEach(() => vi.unstubAllGlobals())

it('rejects an old world result even when a restarted world reuses its key and palette', () => {
  vi.stubGlobal('Worker', FakeWorker)
  const done = vi.fn(), baker = new Baker(done), worker = baker.worker
  baker.want('c0:b', 0, ['old world'])
  const old = worker.messages[0]
  worker.reply(old)
  baker.drop(() => true)
  baker.want('c0:b', 0, ['new world'])
  const fresh = worker.messages[1]
  worker.reply(old)
  baker.flush()
  expect(done).not.toHaveBeenCalled()
  expect(baker.pending.get('c0:b')).toBe(0)
  worker.reply(fresh)
  baker.flush()
  expect(done).toHaveBeenCalledTimes(1)
  expect(done).toHaveBeenCalledWith('c0:b', 0, fresh)
  expect(baker.pending.size).toBe(0)
  expect(baker.requests.size).toBe(0)
})

it('spreads a burst of completed sprite uploads across frames', () => {
  vi.stubGlobal('Worker', FakeWorker)
  const done = vi.fn(), baker = new Baker(done), worker = baker.worker
  for (let i = 0; i < 4; i++) baker.want(`tower${i}`, 0, [])
  for (const message of worker.messages) worker.reply(message)
  expect(done).not.toHaveBeenCalled()
  expect(baker.flush(1)).toBe(1)
  expect(done).toHaveBeenCalledTimes(1)
  expect(baker.results).toHaveLength(3)
  expect(baker.flush(1)).toBe(1)
  expect(done).toHaveBeenCalledTimes(2)
})

it('deduplicates current jobs and switches to the synchronous fallback after worker failure', () => {
  vi.stubGlobal('Worker', FakeWorker)
  const baker = new Baker(vi.fn()), worker = baker.worker
  baker.want('sky', 0, [])
  baker.want('sky', 0, [])
  expect(worker.messages).toHaveLength(1)
  worker.onerror()
  expect(worker.terminate).toHaveBeenCalledOnce()
  expect(baker.ready).toBe(false)
  expect(baker.pending.size).toBe(0)
  expect(baker.requests.size).toBe(0)
})
