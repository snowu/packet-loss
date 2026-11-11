# Runner rig

The runner is one skeleton, posed every frame from the simulation, and
drawn as outlined pixel art through a palette. Courier, Windbreaker and
Techwear are three palettes on that skeleton. Every outfit covers exactly
the same pixels in every frame, so a new skin can never break the rigging,
the animation or the hitbox read.

![Runner rig model sheet](screenshots/runner-rig/model-sheet.png)

![Every move, with crossfades](screenshots/runner-rig/moves.png)

![Run cycle, all skins](screenshots/runner-rig/run-cycle.png)

## How it fits together

| File | Job |
| --- | --- |
| `src/pixel/rig/skeleton.js` | Bones, pose channels, forward kinematics, two-bone IK, roof registration |
| `src/pixel/rig/clips.js` | Authored key poses per move, spline sampling, the run pose from the gait |
| `src/pixel/rig/animator.js` | Simulation state → pose: crossfades, landing squash, ponytail physics |
| `src/pixel/rig/paint.js` | Dresses the solved skeleton: limbs, torso, head, shoes, details |
| `src/pixel/rig/raster.js` | Scanline rasterizer writing material indices, per-layer outlines |
| `src/pixel/rig/skins.js` | Skin definitions and their palettes |
| `src/pixel/runGait.js` | Distance-driven stride, planted feet and footstep timing (unchanged) |

**Skeleton.** Bone lengths come from `runnerModel.js` and never change.
A pose is a flat record of angles (`lean`, `nThigh`, `nKnee`, `fArm`, …),
so any two poses blend channel by channel. Knee and elbow flex are clamped
when solved, so no blend can bend a joint backwards.

**Animation.** Each move is a short clip of key poses sampled with a
Catmull-Rom spline, so motion carries its speed through each key instead of
stopping on it. Clips are timed by what the simulation knows: vault and
mantle by kinematic progress, air poses by vertical speed, roll by its
duration (exactly one turn), climb and zip as loops. The run is not keyed.
It converts the existing gait's planted-foot IK into joint angles, so
footsteps, sounds and the visible contact stay in lockstep.

On every state change the animator crossfades from the pose currently on
screen over 60–300 ms. Landings drop the pelvis with the feet held in
place by IK, scaled by how hard you hit the roof. The ponytail is a damped
five-segment spring chain driven by the body's real motion. It streams
back at speed, lifts when falling and whips through rolls.

**Drawing.** The rasterizer draws material indices, not colours, in six
layers (far arm, far leg, ponytail, body, near leg, near arm). Each layer
gets a one-pixel outline over what is behind it, and limbs are shaded as lit
cylinders. Colour is applied at the very end through the skin's palette.
Each material gets a three-tone ramp, with shadows shifted toward violet and
highlights toward warm white. Far limbs are darkened.

## Adding a skin

Add an entry to `SKINS` in `src/pixel/rig/skins.js`. Colours are all you
need; everything else has a default:

```js
night: defineSkin({
  name: 'Night Shift',
  colors: {
    skin: '#c98a62', hair: '#1c1420', top: '#3a2f58', trim: '#ff2fa0',
    pants: '#1d1b2a', shoe: '#ff2fa0', sole: '#e9e4ee', belt: '#141220',
  },
  style: { sleeves: 'long', zip: true, collar: true },
}),
```

The required colours are `skin`, `hair`, `top`, `trim`, `pants`, `shoe`,
`sole` and `belt`. `glove`, `pad`, `band`, `sleeve` and `collar` default to
related colours, and `outline` and `eye` have house defaults. `ramps`
overrides the shade/light strength per material.

`style` switches choose which material a region uses. They never add or
remove pixels:

| Switch | Values | Effect |
| --- | --- | --- |
| `sleeves` | `none` · `short` · `long` | Bare arms, T-shirt sleeves, or jacket sleeves with a trim cuff |
| `midriff` | boolean | Bare waist between top and belt |
| `gloves` | boolean | Fingerless gloves over the fists |
| `collar` | boolean | Scarf / high collar over the neck |
| `zip` | boolean | Jacket zip and hem in the light tone and trim colour |
| `kneepads` | boolean | Pads over the knees |

The rig draws whatever `view.setRunner(id)` names. To offer a skin on the
title screen today, register its id in `RUNNERS` and `RUNNER_STYLES`
(`src/pixel/runner.js`, which also feeds the legacy renderer and unlocks)
and give it a Heist loadout in `LOADOUTS` (`src/sim/heist.js`). Runner
selection currently ties a look to a loadout.

`tests/runnerRig.test.js` checks that every skin covers identical pixels in
every move, so a skin that changed the silhouette would fail.

## Adding or tuning a move

Edit the key poses in `CLIPS` (`clips.js`). Values are radians:
limb angles are measured forward from hanging straight down, `lean` tilts
the torso forward, and `nKnee`/`nElbow` are flex. Grounded clips are lifted
onto the roof automatically. Map a new simulation state in `clipFor` and
`sampleState`, and give it a blend-in time in `BLEND` (`animator.js`).

## Review

```sh
node bench/rig-sheet.js        # model sheet + animated run cycle and moves
node bench/gait-review.js      # footstep audio vs rendered contacts in the real game
node bench/concept-verify.js   # every state and outfit, all modes, cache bounds
```

Unit tests (`tests/runnerRig.test.js`) cover fixed bone lengths through
every move and mid-blend, knees and elbows never hyperextending, run soles
planted and moving with the roof, grounded poses on the roof, transitions
between every pair of states without a pop, one turn per roll with no
unwinding, landing squash without foot sliding, ponytail stability through
teleports, ghosts without kinematic data, identical silhouettes across skins
and no pose clipping the sprite edge.
