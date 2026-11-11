// Verify actual game audio callbacks against the displayed gait, then capture
// every outfit's stride and an optional real gameplay recording with sound.
// CHROMIUM_PATH=... node bench/gait-review.js [--record]
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { setTimeout as pause } from 'node:timers/promises'

const output = process.argv.find(arg => arg.startsWith('--out='))?.slice('--out='.length) || 'docs/screenshots/gait'
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
  const models = await page.evaluate(() => Object.entries(window.__game.view.art.rigs).map(([outfit, parts]) => {
    if (parts.length !== 9) throw new Error(`${outfit}: missing model parts`)
    const frames = [...window.__game.view.runFrames[outfit], ...window.__game.view.preparedActors[outfit]]
    for (const im of frames) {
      const c = im.getContext('2d'), d = c.getImageData(0, 0, im.width, im.height).data
      for (let x = 0; x < im.width; x++) if (d[x * 4 + 3] || d[((im.height - 1) * im.width + x) * 4 + 3]) throw new Error(`${outfit}: vertically clipped pose`)
      for (let y = 0; y < im.height; y++) if (d[y * im.width * 4 + 3] || d[(y * im.width + im.width - 1) * 4 + 3]) throw new Error(`${outfit}: horizontally clipped pose`)
    }
    return { outfit, parts: parts.length, frames: frames.length }
  }))
  console.log('Model bounds:', JSON.stringify(models))
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
        c.drawImage(im, 8 + col * 178, 122 + row * 220, 160, 160)
        c.fillStyle = col === 0 || col === 4 ? '#ff6654' : '#44394f'
        c.fillRect(30 + col * 178, 262 + row * 220, 135, 2)
        c.fillStyle = '#bfaecf'; c.fillText(String(col + 1), 88 + col * 178, 285 + row * 220)
      }
    }
    return cv.toDataURL('image/png').split(',')[1]
  })
  writeFileSync(`${output}/run-cycle.png`, Buffer.from(sheet, 'base64'))
  // A portable, animated review: scrubbing and a skeleton overlay expose
  // registration errors that an eight-frame contact sheet can hide.
  const study = await page.evaluate(async () => {
    const { RUN_FRAMES, runPose, SHOE } = await import('/packet-loss/src/pixel/runGait.js')
    const { RUN_ORIGIN, armPose, shoulderAt } = await import('/packet-loss/src/pixel/runRig.js')
    const { FRAME } = await import('/packet-loss/src/pixel/runnerModel.js')
    const outfits = ['courier', 'windbreaker', 'techwear'], v = window.__game.view
    const cv = document.createElement('canvas'); cv.width = FRAME.width * RUN_FRAMES; cv.height = FRAME.height * outfits.length
    const c = cv.getContext('2d')
    const skeletons = outfits.map((outfit, row) => Array.from({ length: RUN_FRAMES }, (_, frame) => {
      c.drawImage(v.runFrames[outfit][frame], frame * FRAME.width, row * FRAME.height)
      const pose = runPose(frame / RUN_FRAMES), shoulder = shoulderAt(pose)
      return [pose.far, pose.near].map(l => {
        const x = SHOE.x + SHOE.w - 0.5, y = SHOE.y + SHOE.h * 0.65
        const toe = [l.ankle[0] + x * Math.cos(l.tilt) - y * Math.sin(l.tilt), l.ankle[1] + x * Math.sin(l.tilt) + y * Math.cos(l.tilt)]
        return [l.hip, l.knee, l.ankle, toe]
      }).concat([-pose.arm, pose.arm].map(angle => {
        const a = armPose(shoulder, angle); return [a.shoulder, a.elbow, a.wrist, a.knuckles]
      })).map(chain => chain.map(p => p.map((x, i) => (x + RUN_ORIGIN[i]) * 2)))
    }))
    return { atlas: cv.toDataURL(), skeletons, outfits, frame: FRAME }
  })
  const reviewHtml = study => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Runner rig review</title><style>
body{background:#16121f;color:#eee8db;font:16px system-ui;margin:32px auto;max-width:1080px;padding:0 16px}button,input{accent-color:#ff6654}button{padding:8px 16px}main{display:flex;flex-wrap:wrap;gap:20px}canvas{width:${study.outfits.length === 2 ? 430 : 300}px;height:auto;max-width:100%;image-rendering:pixelated;background:#292331}label{display:inline-block;margin:12px}p{color:#bfaecf}input[type=range]{width:280px}
</style><h1>Runner rig review</h1><p>All 64 cached gameplay frames. Slow playback or scrub to check shoulder, knee and shoe registration.</p>
<button id="play">Pause</button><label>Frame <input id="frame" type="range" min="0" max="63" value="0"><output id="number">0</output></label><label><input id="bones" type="checkbox"> Skeleton</label><label><input id="slow" type="checkbox" checked> Slow motion</label>${study.variants ? `<label>Outfit <select id="outfit">${study.variantNames.map((name, i) => `<option value="${i}">${name}</option>`).join('')}</select></label>` : ''}<main></main>
<script>const study=${JSON.stringify(study)};
const image=new Image();image.src=study.atlas;const FW=study.frame.width,FH=study.frame.height,GY=study.frame.origin[1]*2;let running=true,phase=0,last=0;
const slider=document.getElementById('frame'),bones=document.getElementById('bones'),slow=document.getElementById('slow'),play=document.getElementById('play');
const contexts=study.outfits.map(name=>{const box=document.createElement('section');const title=document.createElement('h2');title.textContent=name;const cv=document.createElement('canvas');cv.width=FW;cv.height=FH;box.append(title,cv);document.querySelector('main').append(box);return cv.getContext('2d')});
function draw(){const frame=Math.floor(phase)%64;slider.value=frame;document.getElementById('number').value=frame;contexts.forEach((c,row)=>{const sourceRow=row*(study.variants||1)+Number(document.getElementById('outfit')?.value||0);c.clearRect(0,0,FW,FH);c.strokeStyle='#7a6a83';c.lineWidth=.5;c.beginPath();c.moveTo(0,GY);c.lineTo(FW,GY);c.stroke();c.drawImage(image,frame*FW,sourceRow*FH,FW,FH,0,0,FW,FH);if(bones.checked)study.skeletons[sourceRow][frame].forEach((chain,i)=>{c.strokeStyle=i%2?'#ffcf66':'#55ddeb';c.lineWidth=.6;c.beginPath();chain.forEach((p,j)=>j?c.lineTo(...p):c.moveTo(...p));c.stroke();chain.forEach(p=>{c.beginPath();c.arc(...p,1,0,Math.PI*2);c.fillStyle=c.strokeStyle;c.fill()})})})}
play.onclick=()=>{running=!running;play.textContent=running?'Pause':'Play'};slider.oninput=()=>{running=false;play.textContent='Play';phase=Number(slider.value);draw()};bones.onchange=draw;if(document.getElementById('outfit'))document.getElementById('outfit').onchange=draw;
function tick(now){if(last&&running)phase=(phase+Math.min(now-last,100)/1000*64*(slow.checked?.6:2.8))%64;last=now;if(image.complete)draw();requestAnimationFrame(tick)}requestAnimationFrame(tick);
</script>`
  writeFileSync(`${output}/run-cycle.html`, reviewHtml(study))
  const compare = process.argv.find(arg => arg.startsWith('--compare='))?.slice('--compare='.length)
  if (compare) {
    const previousHtml = execFileSync('git', ['show', `${compare}:docs/screenshots/gait/run-cycle.html`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    const previous = JSON.parse(previousHtml.match(/const study=(.*);\nconst image=/)[1])
    const comparison = await page.evaluate(async ({ previous, current }) => {
      const images = await Promise.all([previous, current].map(s => new Promise(resolve => {
        const im = new Image(); im.onload = () => resolve(im); im.src = s.atlas
      })))
      const target = current.frame, W = target.width, H = target.height
      const cv = document.createElement('canvas'); cv.width = W * 64; cv.height = H * 6
      const c = cv.getContext('2d'), skeletons = []
      for (const [row, source] of [previous, current].entries()) {
        const f = source.frame || { width: 112, height: 96, origin: [28, 45] }
        const dx = (target.origin[0] - f.origin[0]) * 2, dy = (target.origin[1] - f.origin[1]) * 2
        for (let skin = 0; skin < 3; skin++) {
          for (let i = 0; i < 64; i++) c.drawImage(images[row], i * f.width, skin * f.height, f.width, f.height, i * W + dx, (row * 3 + skin) * H + dy, f.width, f.height)
          skeletons.push(source.skeletons[skin].map(chains => chains.map(chain => chain.map(p => [p[0] + dx, p[1] + dy]))))
        }
      }
      const sheet = document.createElement('canvas'); sheet.width = 1440; sheet.height = 500
      const sc = sheet.getContext('2d'); sc.fillStyle = '#16121f'; sc.fillRect(0, 0, 1440, 500)
      const labels = ['Merged v1', 'Runner v2']
      labels.forEach((label, row) => {
        sc.fillStyle = '#eee8db'; sc.font = 'bold 24px monospace'; sc.fillText(label, 30, 35 + row * 240)
        for (let col = 0; col < 8; col++) sc.drawImage(cv, col * 8 * W, row * 3 * H, W, H, 8 + col * 178, 55 + row * 240, 160, 160)
      })
      return { atlas: cv.toDataURL(), skeletons, outfits: labels, variants: 3, variantNames: current.outfits, frame: target, sheet: sheet.toDataURL().split(',')[1] }
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
