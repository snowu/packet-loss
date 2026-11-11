# Runner v2 generation prompts and provenance

Generated with the **built-in imagegen tool**, using local reference images.
No API key, CLI fallback or external image host is used by the game. Generated
PNG outputs were copied into the repository; originals remain in the image
tool's generated-images directory. The tool produced a 1536×1024 design sheet
and three genuinely transparent 1280×1280 nine-part kits.

The output files are:

- `docs/screenshots/runner-v2/design-sheet.png`
- `public/concept-art/v2/courier-rig.png`
- `public/concept-art/v2/windbreaker-rig.png`
- `public/concept-art/v2/techwear-rig.png`

The following is the final prompt set. The design sheet is reference artwork;
production sheets, motion comparisons and gameplay images are rendered by the
application and its browser review scripts.

## 1. Design sheet — stylized-concept

References: v1 `courier-rig.png` and `techwear-rig.png`, used for identity,
colors and illustration style, explicitly not for proportions.

> A new professional character design and proportion sheet for the side-scrolling rooftop runner PACKET LOSS. Wide landscape sheet on flat warm pale gray, three complete standing adult female parkour couriers in strict right-facing profile, same character at exactly the same scale and neutral pose in three columns. Athletic credible adult anatomy approximately seven heads tall, modest head, longer balanced legs, narrow natural waist/ribcage, lean defined arms, normal small hands with readable thumb/fingers. Clear hip, knee, elbow and wrist placement. Relaxed slight elbow bend, hands below hips, feet visible on a flat ground line. Practical medium ponytail extending back with loose strands, less fluffy volume. Lightweight slim parkour sneakers with thin flexible soles; slim functional cargo trousers with restrained folds and one modest knee patch. Scrappy determined adult face, warm tan skin, hand-painted crisp pixel illustration with intentional clusters, weathered fabric, restrained highlights; no chibi or child proportions, smooth vector style, glamour, weapons or heavy armor. Courier: worn ivory fitted sleeveless tank, charcoal-purple cargo pants, red fingerless gloves and slim red sneakers, compact belt pouch, brown ponytail. Windbreaker: fitted burnt-orange sleeved running jacket, dark pants, black fingerless gloves, slim off-white sneakers, short cyan scarf, brown ponytail. Techwear: graphite light jacket with muted cyan seams, short dark-red scarf, dark pants, black gloves, slim off-white sneakers, silver ponytail. Identical body proportions and coherent facial identity across outfits. Exact header “PACKET LOSS / RUNNER V2”, outfit names below, restrained horizontal guides for eyes, shoulders, pelvis, knees and soles. Prioritize proportion and readable side-view silhouette over tiny decoration.

## 2. Courier nine-part production kit — stylized-concept

Reference: the new design sheet, left Courier figure only. Requested genuine
alpha transparency with no background haze.

> A production articulated 2D sprite puppet kit on a square transparent canvas, exactly nine isolated cutouts in a regular 3-column × 3-row grid. Preserve the reference Courier's adult athletic anatomy, warm tan skin, determined face, brown hair, red gloves/shoes, slim charcoal-purple cargo trousers, worn ivory tank and crisp detailed pixel illustration. No assembled figure. Each object centered in its equal cell with roomy transparent gutters; no shadows, labels, gridlines or backdrop. Reading order: (1) right-facing head with short neck and swept-back scalp hair, no ponytail; (2) headless armless torso from neck/shoulders to hip belt with ivory tank and compact pouch, clean armhole, no skin stump; (3) separate medium brown ponytail flowing left, tie root on the right; (4) bare upper arm straight down, rounded shoulder top and elbow bottom; (5) bare forearm straight down, elbow top and wrist bottom, no hand/glove; (6) relaxed clenched red fingerless glove fist, cuff top, knuckles/skin fingertips below, folded thumb on right, no forearm; (7) slim cargo thigh straight down, hip top and knee bottom, modest pocket, no kneepad/calf; (8) slim trouser shin straight down, one modest knee patch top and ankle cuff bottom, no shoe; (9) low-profile slim right-facing red parkour sneaker with thin flexible off-white sole and ankle opening over the rear third, no leg or skin stub. Neutral straight segments with clean overlapping joints. Approximately seven heads tall when assembled. Avoid ballooned trousers, huge heads, bulky boots, tiny hands and mitten gloves. All nine objects isolated on true transparency.

## 3. Windbreaker outfit edit — identity-preserve

Edit target: the Courier nine-part kit. Supporting reference: the new design
sheet. Preserve the exact canvas, 3×3 grid, nine part positions/silhouettes,
relative sizes, poses, anatomy, joint ends and alpha gutters.

> Change only wardrobe colors/details to the Windbreaker: burnt-orange fitted light running jacket torso and sleeves on both separate arm segments, with no bare arm skin except wrist transition. Short cyan scarf at the torso neck opening only, no overlap into head or ponytail cells. Keep brown scalp hair and ponytail. Black fingerless glove with skin fingertips and clear thumb. Preserve slim charcoal-purple trouser parts. Off-white low-profile sneaker with thin flexible sole. Preserve face, tan skin, practical proportions, crisp painted pixel style and readable outlines. No extra objects, no hands on the forearm, no arms on the torso, no haze or background; retain real transparency.

## 4. Techwear outfit edit — identity-preserve

Edit target: the Courier nine-part kit. Supporting reference: the new design
sheet. Preserve the same exact canvas/grid/part registration, anatomy,
silhouette, joint ends and transparent gutters.

> Graphite fitted light jacket torso and sleeves on both separate arm segments, with thin restrained muted-cyan seams. Short dark-red scarf at the torso neck opening only, with no overlap into head or ponytail cells. Silver scalp hair and separate ponytail. Black fingerless glove with skin fingertips and clear thumb. Dark graphite-charcoal cargo thigh/shin with a fine cyan seam, same slim silhouette and one modest knee patch. Off-white low-profile parkour sneaker with thin flexible sole. Preserve the same warm tan face, adult proportions, pixel illustration and clean part edges. No weapons, heavy armor, added objects, hands on forearms, arms on torso, background or haze; preserve real transparency.
