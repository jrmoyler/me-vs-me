# ME VS ME — The Mirror Tournament

A browser arcade fighter with 20 versions of Hataalii, ten illustrated arenas, and 140 combat animations. Phaser 3 + Vite; keyboard, touch, and standard gamepad inputs.

## Play

- **Arcade:** face the other nineteen identities, with destruction bonuses after every third win before the final match and a champion ending. Two rounds win each match. Defeat offers a ten-second continue.
- **Quick duel:** choose both fighters, including a mirror match.
- **Training:** infinite health/meter, reset controls, optional guarding dummy, move-phase and hit feedback.
- **Move list:** preview all seven attacks from character selection, training, or the pause menu.

| Action | Keyboard | Touch |
|---|---|---|
| Move / jump / crouch | A D / W / S | Slide pad (eight directions; slide up-forward to jump in) |
| Jab / cross / uppercut | J / K / L | LP / MP / HP |
| Low kick / sidekick / roundhouse | U / I / O | LK / MK / HK |
| Signature power | Q | POWER (glows when the meter is ready) |
| Guard / pause | Shift / Escape | GUARD (hold) / PAUSE in the HUD |

Tap once per attack. A 160 ms input buffer catches quick taps and late recovery inputs; a press during a move is held until that move can be cancelled or has recovered. Powers cost **35 meter**; the meter marks the threshold and shows readiness. Each fighter has separately illustrated normal attacks and a named power with its own gameplay profile and effect style. Standard controllers map face buttons/bumpers to strikes, left trigger to guard, right trigger to power, and Start to pause.

### Touch controller

The on-screen controller lives in `src/controller.js` and follows the game's keycap styling. The left pad is a single slide surface: one thumb walks, crouches and jumps, and diagonals give jump-forward without lifting. The right side is a staggered six-key arcade cluster with POWER and GUARD bars beneath. Targets scale with the viewport (at least 44 px on phones, 64 px and up on tablets) and respect safe-area insets. In portrait the canvas sits at the top and the controller fills the free band below it; in landscape the pads overlay the bottom corners on translucent plates. `node scripts/qa-screens.mjs` (after `npm run build`) drives a match on five phone and tablet viewports, screenshots the controller into `docs/qa/controller-*.jpg`, and fails if any target is too small, leaves the viewport, or overlaps Pause or the HUD.

### Combos

Hits and blocks now follow shared frame data in `src/combat-rules.js`:

- **Chains.** When a strike lands (hit or block) it can be cancelled into a stronger strike of the same family (LP→MP→HP, LK→MK→HK), a punch into a kick of equal or higher tier, and any *hit* into POWER. Whiffs never cancel, nothing cancels into the same move, and POWER cancels into nothing. Every legal chain lands inside the rival's hitstun, and no move recovers fast enough to link into another, so combos come only from cancels and always end.
- **Hitstun and blockstun** are separate and scale with the strike (0.36–0.48 s hitstun for normals, 0.24–0.34 s blockstun). Guard holds for the entire blockstun window even if the block input is released, so a blocked string stays blocked. Every normal leaves the blocker free before the attacker.
- **Scaling.** Damage in a combo scales 100 → 90 → 80 → 70 → 60 → 50 %, and hitstun decays 4 % per hit, floored at 75 %.
- **Launches and knockdowns.** An uppercut or roundhouse inside a combo (or as a counter hit) launches; one juggle hit is allowed. POWER knocks down. A launched fighter lands into a 0.75 s knockdown during which they cannot be hit, ending the combo.
- **Counter hits.** Striking a rival during their startup deals 125 % damage and adds hitstun, with a COUNTER! callout.
- The HUD counts true combos only (hits landing while the rival is still reeling or airborne); the result screen reports the best combo of the match.

## Stages

| # | Stage | Setting | Atmosphere |
|---|---|---|---|
| 01 | Neon Avenue | Columbus, after hours | Rain, neon reflections |
| 02 | Sunset Court | Rooftop, golden hour | Light rays |
| 03 | Mirror Garden | Sakura temple garden | Drifting petals |
| 04 | The Foundry | Industrial furnace hall | Furnace glow, embers |
| 05 | Midnight Terrace | Penthouse terrace | Rail lights |
| 06 | Terminal Nine | Subway platform, last train | Passing train, flickering tubes, steam |
| 07 | Glasshouse | Botanical lab at first light | Dawn shafts, pollen, floor mist |
| 08 | Overtime Field | Stadium sideline under the lights | Camera flashes, confetti |
| 09 | Redline Overpass | Desert highway at dusk | Heat shimmer, passing headlights |
| 10 | Null Vault | Underground server hall | Rack status lights, scan sweep |

Arcade cycles through all ten. Stage select shows two rows on desktop and a swipeable strip on phones.

## Develop and build

```sh
npm ci
npm test
npm run dev
npm run build
npm run package:offline
node scripts/render-arenas.mjs --check      # validate the ten WebP backgrounds
node scripts/qa-screens.mjs                 # controller screenshots + layout assertions (needs dist/)
```

Vercel runs the test suite before building `dist` using the included configuration. The offline command produces `release/Me-vs-Me.html`, including every arena and combat asset. Settings and local records persist in browser storage when available. No game backend or account is required. `render-arenas.mjs` and `qa-screens.mjs` use Playwright's Chromium; a global `playwright` install is found automatically, or point `PLAYWRIGHT_MODULE` at one.

## Assets

See [ASSET-NOTES.md](ASSET-NOTES.md). Original supplied GIFs, sheets, and portraits are preserved. The combat edition contains 560 attack poses across 140 four-pose sequences, plus 480 poses for walking, jumping, guarding, hurt reactions, knockouts, and victories. Every move's impact pose is synchronized to its damage window. Stages are 1536×864 WebP backgrounds with bounded runtime atmosphere effects. Reduced motion disables environmental movement, the POWER glow, and menu preview loops.

Review the original [77 impact poses](docs/qa/all-77-move-peaks.jpg), the [ten arenas](docs/qa/ten-arenas.jpg), and the [controller captures](docs/qa/). These are asset contact sheets and headless-browser screenshots, not device recordings.

## Verification boundaries

Automated checks cover original and new asset integrity, all 140 runtime attacks, meter costs, one-hit damage, tap buffering, the cancel tree and its frame-data invariants, a three-hit runtime combo with scaling, launch and knockdown, blockstun guard persistence, whiff safety, counter hits, the slide pad and multi-touch cluster, every stage's atmosphere, pause, progression, bonus stages, and UI navigation. Runtime tests use a Phaser graphics stub; they exercise actual game scene logic but do not establish GPU performance or visual acceptance. See [QA notes](docs/qa/validation.md) and [docs/qa/ten-arenas-controller-combos.md](docs/qa/ten-arenas-controller-combos.md).

The structural reference is Street Fighter II arcade progression. Exact video matching, physical device performance, and physical gamepad validation are not established by these checks.
