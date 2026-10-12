# Art handoff

The game draws all of its pixel art in code (`src/pixel/`). These PNGs are that art, exported at native size with transparency, using the **Neon Dusk** district palette, so artists can redraw it in any pixel editor (or open the repository in spritewright).

| Folder | What | Notes |
| --- | --- | --- |
| `runner/<look>/` | `run_0..7` and `sprint_0..7` stride cycles; `poses/` has one frame of every move | 64×64 canvas, feet at (32, 52) on every frame. Posed live from a skeleton in game, so these are **reference** for now. The far-side limbs are drawn darker on purpose. |
| `security/` | drones (2-frame rotor animation, normal and alarm), laser emitters | magenta = armed, amber = alarm |
| `decor/` | rooftop props and branded signs | the game tints these toward the sky when they stand behind the runner |
| `obstacles/` | vents, high boxes, housings, springs, pipes (back and front layers), fence | sizes follow the level generator |
| `billboards/` | one of each mount; `_0/_1` are the two rotating campaigns | |
| `ads/` | the hand-drawn mascots and products from `src/pixel/art.js` | coloured per billboard in game |
| `sky/`, `city/` | birds (3-frame flap), cars, clouds, towers, facades | |

Numbered files (`bird_0`, `bird_1`…) are animation frames; spritewright plays them as an animation and onion-skins them.

`manifest.json` lists every file with the function and arguments that drew it. Run `npm run art:export` again for a fresh export from the code; it replaces this folder.

Edited PNGs do not flow back into the game yet: the game still draws from code. Wiring a PNG override (load `public/art/<id>.png` when it exists, fall back to the code) is the next step.
