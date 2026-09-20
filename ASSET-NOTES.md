# Me vs Me asset notes

The eleven playable character animations come from the supplied “Me vs Me battle animation gifs.zip” archive. The original GIFs are retained in `public/assets/originals/`.

Each GIF contains sixteen frames. The transparent PNG sheets in `public/assets/characters/` contain those same supplied frames, resized using nearest-neighbor sampling and positioned on a consistent canvas. They are not newly drawn animation or a reconstruction of unseen character views. Portraits are cropped from each supplied ready pose. Names, titles, combat statistics, and signature move names are game-specific interpretations of the visible characters.

Each sheet is 5120×320 pixels: sixteen horizontal 320×320 frames. Frame zero is the ready pose. The nominal body height is 176 pixels, with a shared horizontal center of 160 and ground anchor of 296. Animation coordinates remain relative to the original ready pose, preserving attack extension and effects. Gameplay uses a 65 ms frame interval for responsive combat, faster than the supplied GIF playback. No external artwork was substituted for these characters.

The five arena SVGs are original game backgrounds created for this implementation. They are not screenshots or extracted artwork from the linked reference video. Reference-video fidelity requires direct visual comparison; this asset pipeline does not establish that claim.

Run `node --test tests/assets.test.mjs` to verify roster and arena counts, path availability, distinct identities, PNG dimensions, stats, transparency margins, and grounded bounds for all 176 animation frames. The test uses only Node built-ins and decodes the PNG alpha channel to inspect actual frame bounds.

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
