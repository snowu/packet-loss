# Packet Loss

**[Play it in your browser →](https://snowu.github.io/packet-loss/)**

![Title screen over Kowloon Night](docs/screenshots/title.png)

A cyberpunk side-scrolling rooftop runner with Mirror's Edge–style movement. You auto-run across a procedurally generated city and keep your momentum by vaulting, sliding, rolling out of drops, grabbing ledges, climbing walls, wall-running, riding ziplines and launching off springboards. The city is cyberpunk, with five district palettes: Neon Dusk, Kowloon Night, Acid Rain, Smog Noon and a red-moon Blackout. Pick one on the title screen, or choose Drift to pass through them all as you run. Weather comes and goes on its own: rain rolls in, fog thickens between the skyline layers and the city fades into haze.

| | |
|---|---|
| ![A Heist run in Neon Dusk: shards, a low laser and the trace meter](docs/screenshots/heist.png) | ![Kowloon Night skyline with a rooftop billboard](docs/screenshots/kowloon.png) |
| *Heist: data shards, laser grids and the trace meter* | *Kowloon Night: posters, an LED ticker and a rooftop billboard* |
| ![Rain rolling in over Acid Rain, next to a wall-run mural](docs/screenshots/rain.png) | ![Smog Noon rooftops with water tanks and billboards](docs/screenshots/smog.png) |
| *Acid Rain, mid-storm* | *Smog Noon: screens, neon and a rooftop board* |
| ![Blackout under a red moon](docs/screenshots/blackout.png) | |
| *Blackout* | |

## Modes

- **Heist** is the roguelike run. You're a data courier crossing five sectors of city, one district each, on a fresh random seed every time. Corp security **traces** you while you run. It builds more slowly at full speed and every clean move knocks it back, while tripped laser grids, drones that spot you and your own stumbles (a trip, a bonk, a hard landing) push it up, so a careful, fast run stays hidden and mistakes are what burn you. It builds faster every sector, and half of it follows you through each uplink, so a quiet first sector becomes a hot last one. When it fills, ICE burns a point of integrity. Security wears one livery: magenta is armed (keep out of beams and drone scans), amber is an alarm you already set off, cyan is data. Grab cyan **data shards** for creds, slide under or jump over **laser grids**, and jump into hovering **drones** for a takedown, or clear them overhead; running underneath gets you spotted. At the uplink between sectors the sector pays out (a bonus for a **clean** one with no alarm, burn or fall, and another for a **fast** one) and a **street doc** offers three pieces of chrome. One is free; creds buy the others (each purchase in a run raises the next price), repairs and rerolls. Falls and ICE burns cost integrity, and losing it all flatlines the run. Extracting with integrity left pays a bonus. No two heists run the same way:
  - **Routes.** You leave every uplink by one of two ways on, and the choice lays the next sector's security: Back Alleys (light security, half the shards), Dead Zone (slow trace, no sector bonuses), Lockdown (twice the lasers, shards worth double), Drone Sweep (twice the drones, takedowns pay), Data Vault (a shard on every obstacle, faster trace) or Red Line (heavy security, triple bonuses). The buildings are the same whichever you take.
  - **Contracts.** Each sector has one optional job, shown under the trace meter and paid at the uplink: take down so many drones, grab so many shards, hold 50 km/h, bank a ×8 combo, chain landing slides, keep the trace under half, or never stumble.
  - **Exfil.** Over the last stretch before the finish security knows where you're going: the trace climbs hard and only moves hold it back.
  - **Threat.** Extracting unlocks the next threat level (up to 5), picked on the title screen: faster trace, denser security, a higher score multiplier.
  - **Deals.** The street doc has one side offer at every uplink, good once: Blood Draw (−1 integrity for ¢150), Scrub (¢60 clears the trace), Mystery Crate (¢50 for a random piece), Tip-off (¢40 triples the next contract) or Burner (+30% trace for ¢110).
  - **Rep and the fixer.** Every heist pays rep, win or lose: for each sector cleared, each contract done, and for getting out. On the title screen the fixer (F) trades it for things that turn up in later heists: new chrome that changes what you do (Shock Soles: slide through a laser grid to short it out; Glide Fins: hold jump to glide; Deadman Switch: come back once from a flatline; Phase Shifter: security can't see you while Focus is on), two more ways on (Blackout, Gold Rush) and standing perks (starting creds, a free reroll per uplink, cheaper repairs). The Daily Heist ignores all of it, so it stays the same for everyone.
  - **Runners.** Each runner starts a heist differently: the Courier with three integrity and no strings, the Windbreaker with an air jump but two integrity, the Techwear with Tachyon Optics and ¢100 but a faster trace. Trials and Endless are the same for all three.
- **Daily Heist** is one heist a day on a seed from the date: the same city, the same street-doc offers and the same ways on for everyone, at standard threat, with its own best score.
- **Time Trials** (Sprint 600 m, Relay 1200 m, Gauntlet 2000 m, plus a Daily course seeded by the date). Each trial is a fixed-seed course, identical on every attempt, so times are comparable. The clock counts up, checkpoint splits show green/red deltas against your personal best, and your best run plays back as a cyan ghost. Medals are gold, silver and bronze; silver is the autopilot's time, so it's provably reachable, and gold needs real flow. The Daily is a new 1000 m course every day, the same for everyone on that date; it's picked when you start a run, and its medals are set by timing the autopilot on it in the background the first time you open the game that day.
- **Endless** is a combo score attack on a fresh random city every run. Every move feeds a combo whose multiplier grows with each chained move and scales with your speed. Keep moving to bank it; a hard landing, a bonk or a fall throws the combo away. Distance also scores, more when you're fast. You have three lives, and running a whole leg between checkpoints without falling wins one back.

Falling never ends a trial. You respawn at the last checkpoint and the clock keeps running, so mistakes cost time. In Endless, a fall also costs a life and your current combo.

### Chrome

| Chrome | Effect |
|---|---|
| Reinforced Tendons *(rare)* | A mid-air jump |
| Overclocked Calves | Higher top speed, faster acceleration (stacks ×3) |
| Pneumatic Ankles | Higher jumps (×2) |
| Kinetic Dampers | Survive harder drops, wider roll window (×2) |
| Gecko Grip | Longer ledge reach, stronger wall climbs (×2) |
| Tachyon Optics | Focus charges faster (×2) |
| Chrono Dilator *(rare)* | Focus slows time harder and lasts longer |
| Synaptic Buffer | Longer combo window (×2) |
| Subdermal Plating | +1 max integrity (×3) |
| Insulated Dermis | Lasers don't break combos and trip less trace |
| Ghost Protocol | Trace builds slower (×2) |
| Signal Jammer | Drones add less trace (×2) |
| Data Siphon | Shards are worth double and pull in from further away (×2) |
| Adrenal Pump | Drone takedowns kick your speed up and charge focus (×2) |
| Second Wind *(rare)* | The first fall in each sector costs no integrity |
| Hotwired Deck *(deal)* | Shards are worth triple, but trace builds 30% faster |
| Overdrive Core *(rare deal)* | Higher top speed and clean moves jam twice the trace, for −1 max integrity |

Two pieces from the same maker (stacks count) switch on that maker's set:

| Maker | Pieces | Set |
|---|---|---|
| KITE | Tendons, Ankles | **Tailwind**: landing slides are far easier to time |
| VOLT | Calves, Adrenal Pump | **Live Wire**: full speed hides you from the trace almost completely |
| STRATA | Dampers, Jammer | **Bulwark**: stumbles are over in half the time and make no noise |
| HELIX | Gecko Grip, Second Wind | **Lifeline**: ledge grabs keep all your speed and jam twice the trace |
| ORBIT | Optics, Hotwired Deck | **Overwatch**: every shard charges focus |
| PULSE | Dilator, Synaptic Buffer, Overdrive Core | **Reflex**: banking a combo jams the trace, more the bigger it was |
| NOVA | Plating, Insulated Dermis | **Hardened**: the first ICE burn in each sector costs no integrity |
| ZEN 24 | Ghost Protocol, Data Siphon | **Ghost Market**: rerolls are free and every uplink pays ¢30 |

## Look

The default renderer uses the approved art-sheet design: a rigged, live-animated runner with three palette-swapped outfits, a detailed rooftop kit, textured facades and roofs, and a scrolling cyberpunk skyline on a canvas with twice the previous raster resolution in each axis. The [runner rig](docs/runner-rig.md) poses one skeleton every frame and crossfades between moves; new outfits are a recolour. Red marks traversal, magenta marks security, and cyan marks data. Heist, Endless and Trials use the same movement simulation, with all five district treatments, rain, focus and ghost playback.

See [the art-sheet prototype](docs/concept-art.md) for actual gameplay captures, production poses, asset sources and validation. Add `?art=legacy` to compare with the original procedural renderer. The original renderer and its skeletal runner also remain the automatic fallback when production artwork cannot load.

## Setup

```bash
npm install
npm run dev
```

## Controls

| | Desktop | Touch | Gamepad |
|---|---|---|---|
| Jump (hold for height; hold into a wall to climb) | Space / W / ↑ | Right side of screen | A / Y |
| Slide, or roll if pressed just before a hard landing | S / ↓ / Shift | Left side of screen | B / X / stick down |
| Focus (slow time once the meter is charged) | E / F / Q | ◎ button | Shoulders / triggers |
| Pause · mute | Esc or P · M | Buttons | Start |
| Instant restart | R | Pause menu | Select |
| Menu | ↑ ↓ then Space · ← → city palette · Q E runner · T threat · F fixer · Esc to leave results | Tap | D-pad |

## Movement

- **Vault**: press jump as you reach anything waist-high and you speed-vault it. Run into it without pressing and you trip, losing speed and your combo. Taller crates stop you dead until you climb them.
- **Slide**: duck under red-striped pipes. Running into one standing up makes you stumble.
- **Roll**: big drops cause a hard landing that kills your speed unless you press slide just before you land.
- **Landing slide**: on a normal landing, press slide right as your feet touch down (within a few hundredths of a second either side) to land straight into a slide with a speed boost and a combo move. Jump out of it as a slide jump and land into another to keep a chain going. It only boosts when you're fast (about 46 km/h and up with perfect timing) and the cleaner the timing the bigger the boost; otherwise it's a plain slide, which keeps your speed. While you fall, brackets close in on your landing spot and a diamond lights up inside the timing window (cyan for a landing slide, red when the landing will be hard and you should roll); a label tells you how it went: PERFECT, GREAT, GOOD, or EARLY, LATE, TOO SLOW.
- **Ledge grab / climb**: jump at walls to grab the edge, which keeps nearly all your speed. Jump into a wall too tall to grab and you climb it; that stops you, but you win most of your speed back within a couple of seconds.
- **Jump pad**: every wall you have to climb has a red pad at the roof edge before it. Jump on it and you launch clean over the wall, keeping your speed. The window is generous: a press a moment early waits for the pad, and one just past it still counts. Jump well before it and you'll have to grab the ledge or climb.
- **Momentum**: speed builds over several seconds of running and tops out with clean moves. Setbacks such as a climb, a trip or a hard landing knock you down, but you quickly win back most of the speed you had.
- **Wall-run**: jump at a red chevron wall to run along it, then jump again to kick off.
- **Zipline**: jump to catch red cables across wide gaps.
- **Springboard**: red ramps launch you up to taller roofs.

Anything you can use is painted runner-vision red. Puddles and broken neon reflections sit behind the front roof edge, equipment and feet have contact shadows, and surfaces dry gradually after rain stops.

## Code layout

- `src/sim/` is the pure, deterministic simulation with no rendering or DOM: player physics (`player.js`), seeded course generation with checkpoints and finish lines (`generator.js`), the heist run state with trace, pickups and hazards (`heist.js`), the ways on between sectors (`routes.js`), sector contracts (`contracts.js`), the street doc's side deals (`deals.js`), what the fixer sells between heists (`unlocks.js`), chrome upgrades and maker sets (`chrome.js`), level streaming (`level.js`), trial tracks (`tracks.js`), combo scoring (`score.js`), ghost recording (`ghost.js`), and a lookahead autopilot (`bot.js`) that drives the title-screen demo, the traversal tests and the medal times.
- `src/pixel/` is the renderer: palettes, pixel buffers and dithering, sprite bakers, the skeletal runner sprite, and the view.
- `src/ui/`, `src/input.js` and `src/audio.js` are the HUD, the input layer (keyboard, touch and gamepad), and fully synthesized audio and music.

## Redrawing the art

The production renderer loads the 4×4 character and environment atlases in `public/concept-art/`; see [the atlas layout and generation prompts](docs/concept-art.md). Preserve the grid and transparent gutters when editing those files.

The workflow below applies to the **legacy renderer**, available with `?art=legacy`:


The drones, birds, sky cars, rooftop props and brand signs, and the ad mascots are drawn from PNGs in `public/art/<folder>/<id>.png`. That folder is what the game ships, so painting over a PNG there (same name, same canvas size) and merging it is all it takes: there is no second copy and no command to run. Open the repository in [spritewright](https://snowu.github.io/spritewright/?repo=snowu/packet-loss) or use any pixel editor.

- The PNGs start out drawn by the code, in the **Neon Dusk** palette. Every colour of that original follows the district (and, for ads, the billboard's hue), so keep those exact colours where you want the sprite to change with the city. Colours you add stay as painted in every district.
- A PNG at the wrong size, or missing, is ignored with a console warning and the code art is drawn instead, so layout and hitboxes never move. `npm test` fails on either.
- Numbered files (`bird_0`, `bird_1`…) are animation frames.
- Not drawn from PNGs yet: the runner (posed live from a skeleton), obstacles, pipes, billboards, clouds, towers, facades and the antenna, whose sizes change with the level.

A new sprite is registered with `defineArt` (`src/pixel/artPng.js`); `node scripts/art-placeholders.mjs` then writes its first PNG from the code art. Existing PNGs are never rewritten.

## Development

The game plays offline. A service worker caches the whole game and its fonts the first time you open it online; after that, the page or the installed home-screen app starts without a network, with records and settings intact. Update checks simply wait until you're back online.

Installed apps check for new releases on launch, every minute while visible, and when returning to the app or reconnecting. A **NEW VERSION AVAILABLE / UPDATE NOW** prompt appears on the menu, pause screen or results; it never reloads an active run automatically. The version label also has a manual **CHECK UPDATES** button. Updating preserves saved records and settings. Existing installations need one normal refresh to receive this checker.

Production builds emit `version.json` and embed the same release ID in the game. GitHub Pages uses the deployment commit as the ID, so every deployment is discoverable even without changing the package version. Local builds use the Git commit, with `PACKET_LOSS_BUILD_ID` available for testing distinct releases. Update checks are disabled in the development server; use `npm run build` and `npm run preview` to test them.

- `npm test` runs physics unit tests, sprite and palette checks, generator invariants, course fairness and variety checks (every jump makeable at the slowest running pace, landings clear at top speed, a run-up after every landing, no flat or empty stretches), heist balance (whole heists simulated for a clean, a sloppy and a careless runner, by the safe ways on and the hot ones, and at higher threat), scoring and ghost tests, and autopilot runs that drive the real physics through 2.5 km of several seeds, survive courses without ever rolling, and finish every trial within its silver time.
- `npm run build` creates the production build that GitHub Pages deploys.
- The FPS counter shows frame cadence, p95 frame time over the last 120 frames, and average CPU time spent in the game loop. F8 toggles it. CPU time excludes asynchronous GPU work; the frame cadence includes missed frames. Sampling resets when the app is hidden or the art lab opens.
- `npm run test:render` checks the FPS toggle, focus shader colors and fallback, repeated worker jobs, skyline pixel parity, and rain/focus rendering in landscape and portrait. Set `CHROMIUM_PATH` to use an installed Chromium executable for either browser command. `npm run bench -- --profile=/tmp --json=/tmp/frames.json` also exports CPU profiles and structured benchmark results. `--no-flush` measures CPU submission time without forcing software rasterization; the default includes rasterization and GPU completion. External font requests are blocked for consistent measurements.
- `npm run bench` plays scripted scenarios (title demo, Endless, Heist, rain, portrait, trace alarm with focus, and a one-minute run) in headless Chromium on a fixed clock. It prints each frame's canvas work and its time with the CPU throttled 4× (about a mid-range phone). `npm run bench:check` fails when that work goes more than 10% over the budget in `bench/baseline.json`, and CI runs it on every pull request. Time is printed for comparisons on one machine only and is never gated. When extra work is worth it, `npm run bench -- --update` raises the budget; commit the new baseline with the change. `--only=rain` runs matching scenarios, and `--root=../other-checkout` benchmarks another checkout for before/after numbers.
- `npm run bench:runs` plays the same seeded run over and over, restarting the way a player does, and reports what each run costs and how much canvas memory the page is holding, counted as if the garbage collector never ran. `--check` (run in CI) fails when anything grows from run to run. `--track=0` is Heist, `--via=menu` goes through the title screen between runs, `--quality=2` pins the picture quality.
- The game looks after its own frame rate. Sprites that scroll away hand their canvas memory back at once instead of waiting for the garbage collector; a paused game stops drawing and the results and street-doc screens tick over at 20 fps, so the device cools between runs; and a governor watches the frame cadence during play: when the device can't keep up it sheds ornament a step at a time (LEAN: fewer rain drops and speed lines, no skyline glows or steam; MINIMAL: no clouds, stars, roof light spill or afterimages), halves the draw rate as a last resort (first, on displays faster than 60 Hz), and takes it all back when there is room. Physics and input always run every frame. The FPS counter shows the current step; `?quality=0`, `1` or `2` pins it.
- `npm run bench -- --compare=../before-checkout --json=/tmp/comparison.json` interleaves each before/after scenario in the same browser to reduce differences in machine load. Worker results use one upload slot per frame from the existing sprite budget, and stale results from restarted worlds are discarded.
- F4 (localhost) cycles clarity checks over the running game: the classic look from before the clarity pass, a value (grayscale) check and a squint (blur) check.
- `?seed=123` fixes the course seed. In development, F2 opens a tuning panel for physics and chase values.
- F3 opens the local art lab and freezes the current game until you return. It includes a live autopilot course, synchronized runner comparisons, every traversal pose, pipe variants, obstacle strips across all five districts, scenery, a matching dry/wet roof lighting scene, an effects preview with landing, launch and pickup triggers, every heist hazard state across the districts, and a trace-balance chart that runs a whole heist for the current seed with a careful autopilot and one that ignores hazards. Pause, step, change seeds, inspect collision boxes, and export native-resolution PNGs. F3 works in development and in a production build served on localhost (`npm run build` then `npm run preview`). You can also open `lab.html` directly on the local server.
