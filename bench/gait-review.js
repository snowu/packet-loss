// Verify actual game audio callbacks against the displayed gait, then capture
// every outfit's stride and an optional real gameplay recording with sound.
// CHROMIUM_PATH=... node bench/gait-review.js [--record]
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { setTimeout as pause } from 'node:timers/promises'

const output = 'docs/screenshots/gait'
mkdirSync(output, { recursive: true })
const server = await createServer({ logLevel: 'error', server: { port: 0 } }); await server.listen()
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required'] })
const base = server.resolvedUrls.local[0]
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.route(/https:\/\/fonts\./, r => r.abort())
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  const source = readFileSync(new URL('./bench.js', import.meta.url), 'utf8')
  const pin = source.slice(source.indexOf('function pinWorld()'), source.indexOf('// Runs in the page: counts'))
  await page.addInitScript(`${pin}; pinWorld()`)
  await page.goto(`${base}?seed=12345&quality=0`)
  while (!(await page.evaluate(() => !!window.__game))) await pause(20)
  const report = await page.evaluate(async () => {
    const G = window.__game, v = G.view
    const { Audio } = await import('/packet-loss/src/audio.js')
    const { Bot } = await import('/packet-loss/src/sim/bot.js')
    const { runFrame, runPose } = await import('/packet-loss/src/pixel/runGait.js')
    const sounds = [], rendered = [], states = new Set()
    let pending = null, focusSteps = 0
    Audio.prototype.step = function (kind) {
      if (kind !== 'run') return
      const phase = v.gait.phase, foot = Math.floor(phase * 2) & 1
      const contact = runPose(phase)[foot ? 'far' : 'near']
      if (!contact.planted) throw new Error('Footstep while the foot is airborne')
      pending = phase
      sounds.push({ phase, frame: runFrame(phase), state: G.g.player.state })
      if (G.g.focusActive) focusSteps++
    }
    const drawActor = v.drawActor.bind(v)
    v.drawActor = function (p, x, y, time, idle, ghost, phase) {
      if (!ghost) {
        states.add(p.state)
        if (pending !== null) {
          if (p.state !== 'run' || phase !== pending) throw new Error('Sound and rendered gait disagree')
          rendered.push(phase); pending = null
        }
      }
      return drawActor(p, x, y, time, idle, ghost, phase)
    }
    for (const outfit of ['courier', 'windbreaker', 'techwear']) {
      G.start(1); v.setRunner(outfit); G.g.bot = new Bot(G.g.level)
      for (let i = 0; i < 1100; i++) {
        if (i === 360) { G.g.focus = 1; G.g.focusActive = true }
        window.__tick()
        if (i % 120 === 0) await window.__yield()
      }
      const phase = v.gait.phase, count = sounds.length
      G.g.mode = 'paused'
      for (let i = 0; i < 60; i++) window.__tick()
      if (v.gait.phase !== phase || sounds.length !== count) throw new Error('Paused gait advanced')
    }
    return { sounds: sounds.length, matchedDraws: rendered.length, focusSteps, states: [...states], pending }
  })
  assert.ok(report.sounds > 20); assert.equal(report.sounds, report.matchedDraws)
  assert.ok(report.focusSteps > 0); assert.equal(report.pending, null)
  const sheet = await page.evaluate(async () => {
    const v = window.__game.view
    const cv = document.createElement('canvas'); cv.width = 1440; cv.height = 780
    const c = cv.getContext('2d'); c.fillStyle = '#0c091b'; c.fillRect(0, 0, cv.width, cv.height)
    c.fillStyle = '#eee8db'; c.font = 'bold 24px monospace'; c.fillText('RUN CYCLE / ALTERNATING CONTACTS', 30, 40)
    c.fillStyle = '#bfaecf'; c.font = '16px monospace'; c.fillText('NEAR CONTACT                                   FAR CONTACT', 44, 78)
    for (const [row, outfit] of ['courier', 'windbreaker', 'techwear'].entries()) {
      c.fillStyle = '#bfaecf'; c.fillText(outfit.toUpperCase(), 30, 115 + row * 220)
      for (let col = 0; col < 8; col++) {
        const im = v.runFrames[outfit][col * 8]
        c.drawImage(im, 8 + col * 178, 122 + row * 220, im.width * 1.5, im.height * 1.5)
        c.fillStyle = col === 0 || col === 4 ? '#ff6654' : '#44394f'
        c.fillRect(30 + col * 178, 258 + row * 220, 135, 2)
        c.fillStyle = '#bfaecf'; c.fillText(String(col + 1), 88 + col * 178, 285 + row * 220)
      }
    }
    return cv.toDataURL('image/png').split(',')[1]
  })
  writeFileSync(`${output}/run-cycle.png`, Buffer.from(sheet, 'base64'))
  // A portable, animated review: scrubbing and a skeleton overlay expose
  // registration errors that an eight-frame contact sheet can hide.
  const study = await page.evaluate(async () => {
    const { RUN_FRAMES, runPose } = await import('/packet-loss/src/pixel/runGait.js')
    const { RUN_ORIGIN, armPose, shoulderAt } = await import('/packet-loss/src/pixel/runRig.js')
    const outfits = ['courier', 'windbreaker', 'techwear'], v = window.__game.view
    const cv = document.createElement('canvas'); cv.width = 112 * RUN_FRAMES; cv.height = 96 * outfits.length
    const c = cv.getContext('2d')
    const skeletons = outfits.map((outfit, row) => Array.from({ length: RUN_FRAMES }, (_, frame) => {
      c.drawImage(v.runFrames[outfit][frame], frame * 112, row * 96)
      const pose = runPose(frame / RUN_FRAMES), torso = v.art.rigs[outfit][0]
      const shoulder = shoulderAt(pose, torso.width / torso.height)
      return [pose.far, pose.near].map(l => [l.hip, l.knee, l.ankle]).concat([-pose.arm, pose.arm].map(angle => {
        const a = armPose(shoulder, angle); return [a.shoulder, a.elbow, a.wrist]
      })).map(chain => chain.map(p => p.map((x, i) => (x + RUN_ORIGIN[i]) * 2)))
    }))
    return { atlas: cv.toDataURL(), skeletons, outfits }
  })
  const reviewHtml = study => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Runner rig review</title><style>
body{background:#16121f;color:#eee8db;font:16px system-ui;margin:32px auto;max-width:1080px;padding:0 16px}button,input{accent-color:#ff6654}button{padding:8px 16px}main{display:flex;flex-wrap:wrap;gap:20px}canvas{width:300px;height:258px;image-rendering:pixelated;background:#292331}label{display:inline-block;margin:12px}p{color:#bfaecf}input[type=range]{width:280px}
</style><h1>Runner rig review</h1><p>All 64 cached gameplay frames. Slow playback or scrub to check shoulder, knee and shoe registration.</p>
<button id="play">Pause</button><label>Frame <input id="frame" type="range" min="0" max="63" value="0"><output id="number">0</output></label><label><input id="bones" type="checkbox"> Skeleton</label><label><input id="slow" type="checkbox" checked> Slow motion</label><main></main>
<script>const study=${JSON.stringify(study)};
const image=new Image();image.src=study.atlas;let running=true,phase=0,last=0;
const slider=document.getElementById('frame'),bones=document.getElementById('bones'),slow=document.getElementById('slow'),play=document.getElementById('play');
const contexts=study.outfits.map(name=>{const box=document.createElement('section');const title=document.createElement('h2');title.textContent=name;const cv=document.createElement('canvas');cv.width=112;cv.height=96;box.append(title,cv);document.querySelector('main').append(box);return cv.getContext('2d')});
function draw(){const frame=Math.floor(phase)%64;slider.value=frame;document.getElementById('number').value=frame;contexts.forEach((c,row)=>{c.clearRect(0,0,112,96);c.strokeStyle='#7a6a83';c.lineWidth=.5;c.beginPath();c.moveTo(0,90);c.lineTo(112,90);c.stroke();c.drawImage(image,frame*112,row*96,112,96,0,0,112,96);if(bones.checked)study.skeletons[row][frame].forEach((chain,i)=>{c.strokeStyle=i%2?'#ffcf66':'#55ddeb';c.lineWidth=.6;c.beginPath();chain.forEach((p,j)=>j?c.lineTo(...p):c.moveTo(...p));c.stroke();chain.forEach(p=>{c.beginPath();c.arc(...p,1,0,Math.PI*2);c.fillStyle=c.strokeStyle;c.fill()})})})}
play.onclick=()=>{running=!running;play.textContent=running?'Pause':'Play'};slider.oninput=()=>{running=false;play.textContent='Play';phase=Number(slider.value);draw()};bones.onchange=draw;
function tick(now){if(last&&running)phase=(phase+Math.min(now-last,100)/1000*64*(slow.checked?.6:2.8))%64;last=now;if(image.complete)draw();requestAnimationFrame(tick)}requestAnimationFrame(tick);
</script>`
  writeFileSync(`${output}/run-cycle.html`, reviewHtml(study))
  const compare = process.argv.find(arg => arg.startsWith('--compare='))?.slice('--compare='.length)
  if (compare) {
    const previousHtml = execFileSync('git', ['show', `${compare}:${output}/run-cycle.html`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    const previous = JSON.parse(previousHtml.match(/const study=(.*);\nconst image=/)[1])
    const comparison = await page.evaluate(async ({ previous, current }) => {
      const images = await Promise.all([previous, current].map(s => new Promise(resolve => {
        const im = new Image(); im.onload = () => resolve(im); im.src = s.atlas
      })))
      const cv = document.createElement('canvas'); cv.width = 112 * 64; cv.height = 192
      const c = cv.getContext('2d')
      images.forEach((im, row) => c.drawImage(im, 0, 0, im.width, 96, 0, row * 96, im.width, 96))
      const sheet = document.createElement('canvas'); sheet.width = 1440; sheet.height = 500
      const sc = sheet.getContext('2d'); sc.fillStyle = '#16121f'; sc.fillRect(0, 0, 1440, 500)
      const labels = ['Previous PR stride', 'Reworked stride']
      images.forEach((im, row) => {
        sc.fillStyle = '#eee8db'; sc.font = 'bold 24px monospace'; sc.fillText(labels[row], 30, 35 + row * 240)
        for (let col = 0; col < 8; col++) sc.drawImage(im, col * 8 * 112, 0, 112, 96, 8 + col * 178, 55 + row * 240, 168, 144)
      })
      return { atlas: cv.toDataURL(), skeletons: [previous.skeletons[0], current.skeletons[0]], outfits: labels, sheet: sheet.toDataURL().split(',')[1] }
    }, { previous, current: study })
    writeFileSync(`${output}/stride-before-after.png`, Buffer.from(comparison.sheet, 'base64'))
    delete comparison.sheet
    writeFileSync(`${output}/stride-comparison.html`, reviewHtml(comparison))
  }
  assert.deepEqual(errors, [])
  console.log('Gait/audio browser check:', JSON.stringify(report))
  await page.close()

  if (process.argv.includes('--record')) {
    const video = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    await video.route(/https:\/\/fonts\./, r => r.abort())
    await video.goto(`${base}?seed=12345&quality=0`)
    await video.waitForFunction(() => !!window.__game)
    await video.evaluate(async () => {
      const { Audio } = await import('/packet-loss/src/audio.js')
      const start = Audio.prototype.start
      Audio.prototype.start = function () { start.call(this); window.__audioCapture = this }
      window.__game.start(1)
      const { Bot } = await import('/packet-loss/src/sim/bot.js')
      window.__game.g.bot = new Bot(window.__game.g.level)
    })
    await video.waitForFunction(() => window.__game.g.mode === 'run')
    const data = await video.evaluate(async () => {
      const a = window.__audioCapture, v = window.__game.view
      await a.ctx.resume()
      const audio = a.ctx.createMediaStreamDestination(); a.master.connect(audio)
      const stream = v.canvas.captureStream(60)
      stream.addTrack(audio.stream.getAudioTracks()[0])
      const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 3500000 })
      const chunks = []; rec.ondataavailable = e => chunks.push(e.data)
      const done = new Promise(resolve => { rec.onstop = resolve })
      rec.start()
      await new Promise(resolve => setTimeout(resolve, 10000))
      rec.stop(); await done
      a.master.disconnect(audio); stream.getTracks().forEach(t => t.stop())
      const blob = new Blob(chunks, { type: 'video/webm' })
      return new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob) })
    })
    writeFileSync(`${output}/gameplay-with-audio.webm`, Buffer.from(data, 'base64'))
    await video.screenshot({ path: `${output}/gameplay.png` })
    await video.close()
    console.log('Actual gameplay recording saved with live game audio.')
  }
} finally { await browser.close(); await server.close() }
