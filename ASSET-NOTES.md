# Me vs Me asset notes

The original eleven playable character animations come from the supplied “Me vs Me battle animation gifs.zip” archive. The original GIFs are retained in `public/assets/originals/`.

Each GIF contains sixteen frames. The transparent PNG sheets in `public/assets/characters/` contain those same supplied frames, resized using nearest-neighbor sampling and positioned on a consistent canvas. They are not newly drawn animation or a reconstruction of unseen character views. Portraits are cropped from each supplied ready pose. Names, titles, combat statistics, and signature move names are game-specific interpretations of the visible characters.

Each sheet is 5120×320 pixels: sixteen horizontal 320×320 frames. Frame zero is the ready pose. The nominal body height is 176 pixels, with a shared horizontal center of 160 and ground anchor of 296. Animation coordinates remain relative to the original ready pose, preserving attack extension and effects. Gameplay uses a 65 ms frame interval for responsive combat, faster than the supplied GIF playback. No external artwork was substituted for these characters.

The five arena SVGs are original game backgrounds created for this implementation. They are not screenshots or extracted artwork from the linked reference video. Reference-video fidelity requires direct visual comparison; this asset pipeline does not establish that claim.

Run `node --test tests/assets.test.mjs` to verify roster and arena counts, path availability, distinct identities, PNG dimensions, stats, transparency margins, and grounded bounds for every ready-sheet, combat and motion frame (35 fighters × 16 + 28 + 24). The test uses only Node built-ins and decodes the PNG alpha channel to inspect actual frame bounds.

## Combat edition — September 20, 2026

`*-combat.png` are **new illustrations**, generated with the built-in image-generation tool using each original portrait as the identity reference. They do not relabel or replay the original GIF as seven different attacks. Each atlas is 1280×2240, four 320×320 cells across and seven rows:

1. Jab (LP / J)
2. Cross (MP / K)
3. Uppercut (HP / L)
4. Low kick (LK / U)
5. Sidekick (MK / I)
6. Roundhouse (HK / O)
7. Character signature (POWER / Q)

Columns are anticipation, extension, impact, and recovery. The runtime uses one shared attack clock for pose selection and hit activation. The 28-frame atlas is loaded instead of the supplied 16-frame sheet in standard combat. Original artwork remains preserved for provenance and existing portraits.

Generation brief: preserve each reference's identity, hair, face, clothing, colors, accessories, footwear, proportions and right-facing stance; create a transparent 4×7 grid with separate articulated attack poses, no text or scenery, crisp detailed pixel art. Signature row briefs:

| Fighter | Signature brief |
|---|---|
| Hataalii | Crown Breaker: red charge, double-fist launch, crown shockwave |
| After Hours | Midnight Backfist: spinning coat and silver slash |
| Iron Will | Ion Burst: cyan gauntlet charge and energy orb |
| Quiet Luxury | Executive Counter: bag brace, golden counterpunch |
| Blueprint | Vector Sidekick: indigo kick with blue echoes |
| Green Light | Kinetic Shoulder: green shoulder rush and ground shockwave |
| Fast Lane | Redline Kick: airborne kick with orange flame trail |
| Wild Card | Ground Zero Sweep: crouched sweep and silver crescent |
| Shadow Self | Mirror Shatter: violet dual punch and shard burst |
| Old Soul | Heritage Uppercut: rising fist with amber arc |
| Varsity | Overtime Elbow: jumping elbow and rose starburst |

`normalize-combat-assets.py` packs source art using connected alpha regions rather than assuming perfectly equal generated gutters. A touching cross/uppercut effect is split at its narrowest boundary. Detached effect pixels stay with the nearest pose. One scale applies to every pose within a fighter; alpha bounds are grounded at y=296 with transparent margins. Pillow, NumPy and SciPy are only needed to repack source art, not to run or build the shipped game. Source inputs are a JSON object with `fighters` and `arenas` dictionaries mapping IDs to local generated-image paths.

Five newly generated 1536×864 WebP arena illustrations replace the original SVG backgrounds in menus and combat. Briefs specify a clear horizontal fighting lane at approximately 83% of frame height, detailed side-view arcade environments, no fighters or UI: rainy neon Columbus street, sunset rooftop court, sakura temple garden, industrial furnace hall, and moonlit penthouse terrace. The originals remain in the repository. The generator interprets unseen poses and architecture; exact likeness or exact reference-video matching requires human review.


## Locomotion and reactions

Each `*-motion.png` adds a 1280×1920 atlas: four poses across six rows (walk, jump, guard, hurt, knockout, victory). All 11 identities receive this set, adding 66 sequences / 264 poses. The same image-generation process and original portrait references apply. The brief requires actual limb changes, four-step walk cycles, takeoff/ascent/descent/landing, a held forearm block, recoil and recovery, falling to a held grounded knockout, and a raised-fist victory. `motion.js` maps the runtime state and physics to these frames. Combat no longer substitutes whole-sprite squash/rotation for these actions. KO and victory settle into their last pose instead of looping back upright. Source packing accepts a `motions` dictionary in addition to `fighters` and `arenas`.

The bonus stage now uses the new six strike rows too. Rendered browser evidence in `docs/qa/browser-*.jpg` is captured from the Vercel preview; contact sheets remain separately identified.


## Nine-fighter expansion — September 21, 2026

Nine supplied photographic references are interpreted as pixel fighters, bringing the roster to 20. Original fighters and supplied GIFs remain unchanged. Each addition has 28 authored combat key poses and 24 authored movement/reaction key poses. Names and signature powers are game interpretations of the references.

| ID | Reference outfit | Power |
|---|---|---|
| hybrid | Navy bucket hat, Hybrid Living sweatshirt, black printed pants, shoulder bag | Fusion Orbit |
| civic | Pale green Civic Core overshirt, knit beanie, matching joggers | Accord Ward |
| nexus | Black-and-white Nexus Labs tracksuit, headband, crossbody bag | Pulse Relay |
| glyph | Burgundy beanie, dark hoodie with red graphic | Crimson Forge |
| quilt | White quilted jacket, navy/pink Civic Core set, striped beanie, tote | Cloudburst Counter |
| binary | Black turtleneck, patterned scarf, cargo pants, boots | Null Sweep |
| aether | Orange bucket hat, cream quilted jacket, orange cargo pants/boots | Solar Cyclone |
| gaia | Curly-haired scientist in white lab coat | Root Uprising |
| zenith | Long braids, black glasses/turtleneck, gray trousers | Apex Pulse |

Accepted raw generations are in `asset-sources/expansion`. Prompts are recorded in `docs/qa/expansion-prompts-*.md`. Repack with `python3 scripts/package-expansion-assets.py` (Pillow, NumPy, SciPy required only for repacking). The packer trims near-transparent outer padding using alpha >16 bounds, retains generated alpha inside each crop, aligns feet to y=296, and preserves cell-relative attack extension. It does not synthesize poses or remove backgrounds.

Each export includes seven combat GIFs, six movement/reaction GIFs, and one signature GIF, plus both atlases, portrait, horizontal signature sheet, 4×4 signature sheet, and a provenance/timing manifest. The signature sheet has **16 timeline cells using ready plus four power key poses with holds**, not 16 independently drawn poses. PNG keeps alpha inside the packed crops; GIF uses binary transparency. Signature GIFs use 70 ms timeline ticks (GIF only supports 10 ms increments); the runtime sheet uses 65 ms. The game uses four key poses for each attack, matching the existing 11 fighters' combat format.

These are stylized interpretations with newly authored unseen poses, not pixel-for-pixel reproductions of photographic references. Review artwork and gameplay separately from automated structural checks.


## Ten-arena expansion — September 22, 2026

Five new 1536×864 WebP stage backgrounds join the original five: Terminal Nine (`terminal-nine`), Glasshouse (`glasshouse`), Overtime Field (`overtime-field`), Redline Overpass (`redline-overpass`) and Null Vault (`null-vault`). They were generated through the connected Higgsfield connector (`gpt_image_2_5`, quality high, 2k, 16:9) with `neon-avenue-v2.webp` supplied as a style reference so the new stages share the rendering of the existing set. Prompts, scene briefs and job ids are recorded in `docs/qa/arena-prompts.md`. The 2688×1520 raw outputs are not committed (`asset-sources/arenas/` is ignored).

`scripts/render-arenas.mjs` turns a source image into the shipped asset: cover-fit onto an opaque 1536×864 canvas in Playwright's Chromium, export as lossy WebP, and rewrite the RIFF wrapper to the simple `VP8 ` container when Chromium emits `VP8X` without alpha. `--check` validates container, dimensions, size and distinct hashes for all ten; `--sheet docs/qa/ten-arenas.jpg` renders the contact sheet. Each stage also has a bounded atmosphere painter in `src/stage-effects.js` (train sweep and tube flicker, dawn shafts and pollen, camera flashes and confetti, heat shimmer and headlights, rack LEDs and a scan sweep).

The touch controller (`src/controller.js`) draws its own keycap-style pad, cluster and bars in CSS; no bitmap assets were added for it. Screenshots in `docs/qa/controller-*.jpg` are headless Chromium captures produced by `scripts/qa-screens.mjs`.

These are stylized generated illustrations; art direction acceptance is a human review, separate from the automated structural checks.


## Seven-fighter expansion — September 25, 2026

Seven more fighters bring the roster to 27. They were supplied already packed (`Me-vs-Me-Seven-Fighter-Sprites-and-GIFs.zip`) in the same export format as the nine-fighter expansion: a 1280×2240 combat atlas (28 authored key poses), a 1280×1920 motion atlas (24 authored key poses), a 5120×320 ready sheet and a 320×320 portrait each, all on 320×320 cells with feet at y=296. The twenty existing fighters, their art and their order are unchanged; the new seven are appended as roster slots 21–27.

| ID | Name | Look | Power | Role / POWER class |
|---|---|---|---|---|
| archer | EVERGREEN | Leaf cloak, longbow | Verdant Volley: green arrow fan | Zoner / projectile |
| cyborg | OVERCLOCK | Black trench coat, gold circuitry, cyan fist | Plasma Rush: cyan comet blast | Rushdown / command dash |
| eon | EON | Cream sweats, gray beanie | Hourglass Rift: violet hourglass beam | Counter / sweep |
| juris | JURIS | Navy beret, jacket with gold crest | Verdict Shield: crest shield charge | Grappler / command dash |
| nomad | NOMAD | Black tracksuit with gold stripes, gray beanie | Caravan Flare: gold fireball | Zoner / projectile |
| sketch | SKETCH | Graphite-grayscale suit | Graphite Stroke: white pencil streak | Balanced / sweep |
| student | STUDENT | Black hoodie, backpack, open book | Page Storm: flurry of pages | Balanced / projectile |

Names, titles, stats, quotes and POWER profiles are game interpretations of the supplied art; each profile's reach matches the illustrated impact pose (dashes) or follows the existing sweep and projectile ranges.

**Scale.** Four fighters were packed smaller in their cells (visible ready-pose height: cyborg 169, eon 156, sketch 168, student 143, against 176). Each fighter's `bodyHeight` comes from its export manifest, so combat scales all 27 to the same on-screen height, and menu portraits and the bonus stage apply the matching `--body-scale` from the feet. `tests/assets.test.mjs` checks the manifests against the roster and the visible portrait height against `bodyHeight`.

**Motion atlas fix (September 25, 2026).** The supplied export filed three motion atlases under the wrong fighter: `eon-motion.png` showed Student, `juris-motion.png` showed Eon, and `student-motion.png` showed Juris, so walking, jumping, guarding, hurt, KO and victory swapped those three fighters' looks. Portraits, ready sheets and combat atlases were correct. The three files now sit with their real owners. Each was packed to its old filename's body height (Eon's art at 176, Juris's at 143, Student's at 156), so those fighters carry a `motionBodyHeight` and combat scales the motion atlas separately. The art is not resampled, and all three keep one on-screen height between attacks and movement. `tests/assets.test.mjs` now compares each motion atlas's colours with every combat atlas and fails if one looks like another fighter, or if any two would match better swapped. It also checks each expansion fighter's guard height against its ready pose. A runtime test checks that all 27 fighters draw at the same height in ready, attack, walk and guard art.

**Provenance.** Each export's `manifest.json` is kept as `asset-sources/seven-fighters/{id}-manifest.json`. Its `sources` SHA-256 values identify the raw pre-pack generations, which were not part of the supplied archive, so they do not match the packed atlases. The per-move GIFs, signature sheets and 4×4 signature grids in the archive are review exports and are not committed, matching how the nine-fighter exports were handled (`asset-exports/` is ignored). Contact sheets: [`docs/qa/seven-fighter-combat-peaks.jpg`](docs/qa/seven-fighter-combat-peaks.jpg) (impact pose of all seven attacks) and [`docs/qa/seven-fighter-motion-peaks.jpg`](docs/qa/seven-fighter-motion-peaks.jpg) (walk, jump, guard, hurt, KO, victory).

**Effects.** Each new POWER has its own painter in `src/stage-effects.js`. Projectile POWERs now also travel as their own shape through `paintProjectile` (arrows, fireball, pages, and matching shapes for Ion Burst, Mirror Shatter, Pulse Relay and Apex Pulse) instead of one shared orb; hit detection is unchanged.

These are stylized generated illustrations; art direction acceptance is a human review, separate from the automated structural checks.

## Eight-fighter pack — September 25, 2026

Eight more fighters bring the roster to 35. They were supplied already packed (`Me-vs-Me-Eight-Playable-Fighters.zip`) in the same export format: a 1280×2240 combat atlas, a 1280×1920 motion atlas, a 5120×320 ready sheet and a 320×320 portrait each, on 320×320 cells with feet at y=296. The previous twenty-seven fighters, their art, order, ids, stats and POWER profiles are unchanged; the new eight are appended as roster slots 28–35.

| ID | Name | Power | Role |
|---|---|---|---|
| patchrunner | PATCHRUNNER | Circuit Cascade | Rushdown |
| starscribe | STAR SCRIBE | Orbit Collapse | Zoner / projectile |
| sovereign | SOVEREIGN | Royal Gambit | Grappler-lite |
| circuitbreaker | CIRCUIT BREAKER | System Override | Zoner / projectile |
| ironchef | IRON CHEF | Inferno Platter | Balanced |
| eventhorizon | EVENT HORIZON | Singularity Drive | Zoner / projectile |
| crimsonoracle | CRIMSON ORACLE | Blood Moon Seal | Counter |
| dunevoyager | DUNE VOYAGER | Sandstorm Break | Rushdown |

Shorter packed bodies (starscribe 148, sovereign 136, ironchef 172, eventhorizon 172, crimsonoracle 157) use `bodyHeight` from `asset-sources/eight-fighters/{id}-manifest.json`. The per-move GIFs and source sheets stay out of the repo, same as the earlier expansions. Each new POWER has its own painter; the three projectile styles travel as their own shapes.
