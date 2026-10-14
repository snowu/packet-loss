// Bakes the big sprites (facades, fog, street mist) so the frame never
// waits on one. Transferred pixel buffers also keep software 2D drawing fast.
import { runJob } from './bakes.js'

self.onmessage = ({ data: { key, version, request, job } }) => {
  const b = runJob(job)
  // Some bakers reuse their buffers. Transfer a copy so a repeated job does
  // not detach the baker's cached pixels.
  const data = b.data.slice()
  self.postMessage({ key, version, request, w: b.w, h: b.h, data }, [data.buffer])
}
