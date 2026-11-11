# Running gait and model registration

Running drives the [runner rig](runner-rig.md). The full
left/right stride covers 4.2 world metres, and stance lasts 24% of a cycle.
Phase advances from interpolated player position; footstep audio fires at the
same alternating half-stride contacts. Focus slows both motion and audio,
pause stops them, and new runs, teleports and airborne transitions reset the
contact phase. Ghosts have an independent gait clock.

The pose solver keeps thigh and shin lengths constant. Grounded ankles track
the roof while each shoe rolls about its heel or toe. Continuous Hermite
recovery matches ankle and shoe-angle velocity at lift-off and strike. In
flight, the shoe follows the solved shin with a small ankle flex rather than
holding an unrelated angle in world space. All four shoe corners are checked
for clearance through the full cycle.

The rig converts each gait pose (hip, knee and ankle positions, shoe roll)
into joint angles on its one skeleton, so every outfit runs on identical
planted feet. Speed adds lean and arm drive; the arms counter the thigh drive.
The ponytail is a spring chain driven by the body's real motion rather than
a fixed loop.

## Review

![Run cycle, all skins](screenshots/runner-rig/run-cycle.png)

```sh
node bench/gait-review.js --out=docs/screenshots/runner-rig --record
```

The browser check matches actual game audio callbacks to rendered contacts,
checks focus and pause, and checks that the live runner sprite never clips its
edges. Unit coverage includes distance-driven phase, contact alternation,
fixed bone lengths, sole registration, recovery continuity and ankle angles
(`tests/runGait.test.js`), plus the rig's own checks (`tests/runnerRig.test.js`).
