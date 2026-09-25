# ME VS ME — The Mirror Tournament

A browser arcade fighter with 35 versions of Hataalii, ten illustrated arenas, and 245 combat animations. Phaser 3 + Vite; keyboard, touch, and standard gamepad inputs.

## Play

**Live:** https://me-vs-me-three.vercel.app

- **Choose your match:** a quick duel against the CPU. Pick both fighters, including a mirror match.
- **Versus / two players:** two people on one cabinet. Player one picks, then player two, then a shared stage. Player one uses the keyboard's left side (or the first pad, or the on-screen controller); player two uses the arrows and numpad (or a second pad).
- **Arcade ladder:** eight reflections dealt from the other thirty-four identities with the roles mixed, then a final against **your shadow**: a mirror match of your own fighter. A destruction bonus follows wins three and six, and each win or loss ends with a one-line quote from the winner. Turn on **FULL CIRCLE** on the stage or route screen to face all thirty-four before the shadow, with a bonus after every third win; the choice is saved. Two rounds win each match. Defeat offers a ten-second continue.
- **Tournament:** an eight-fighter single-elimination bracket: quarterfinals, semifinals, final. You pick your fighter. The other seven entrants are drawn at random from the remaining thirty-four, with a fresh draw every time a tournament starts and no repeats. The bracket screen appears before each of your matches. It shows all eight entrants with portraits, every round, results so far, your next opponent and the stage, which is picked at random for each match. You play your own matches against the CPU, two rounds to win. CPU-vs-CPU matches are simulated from each fighter's speed, power and reach plus some randomness. One loss knocks you out, and the rest of the bracket is played out so you can see who took the crown. Win the final to become tournament champion. Bracket logic lives in `src/tournament.js`.
- **Training:** infinite health and meter, RESET, and a dummy that cycles OPEN → GUARD → CROUCH GUARD → RECORD → PLAY. Also TRIAL (jab → cross → uppercut → POWER, pass or fail), DATA (live frame data and LOW / OVERHEAD / THROW / AIR tags) and the move manual.
- **Move list:** preview all seven attacks, the fighter's role and the defensive system from character selection, training, or the pause menu.

| Action | Player 1 keys | Player 2 keys | Touch (player 1) |
|---|---|---|---|
| Move / jump / crouch | A D / W / S | ← → / ↑ / ↓ | Slide pad (eight directions; slide up-forward to jump in) |
| Jab / cross / uppercut | J / K / L | Num 1 / 2 / 3 | LP / MP / HP |
| Low kick / sidekick / roundhouse | U / I / O | Num 4 / 5 / 6 | LK / MK / HK |
| Signature power | Q | Num 0 | POWER (glows when the meter is ready) |
| Guard | Shift | Space | GUARD (hold) |
| Throw | Shift + J | Space + Num 1 | Hold GUARD, tap LP |
| Pause | Escape | Escape | PAUSE in the HUD |

Keys can be remapped in **Settings → Input**: click a key, then press the new one. The choice is stored in `mvm-settings`. The same panel shows whether pad 1 and pad 2 are connected. Standard controllers map face buttons/bumpers to strikes, left trigger to guard (left trigger + A throws), right trigger to power, and Start to pause. With `reducedMotion` off, hits pulse the pad's rumble motor (20 ms light, 40 ms heavy, 70 ms POWER) and phone vibration. On a touch screen in Versus, the on-screen controller always drives player one. A hint asks player two to plug in a second pad or use the keyboard.

Tap once per attack. A 160 ms input buffer catches quick taps and late recovery inputs; a press during a move is held until that move can be cancelled or has recovered. Powers cost **35 meter**; the meter marks the threshold and shows readiness. Each fighter has separately illustrated normal attacks and a named power with its own gameplay profile and effect style.

### Defense: throw, high/low, air, wakeup

- **Throw** (GUARD + LP): 72 px range, which is shorter than any jab. Startup 0.18 s, active 0.10 s, recovery 0.42 s. It beats standing and crouching guard. It loses to a jump, a backstep, or a faster normal's startup, and a whiff is punishable. On hit it deals a flat 12 damage and a hard knockdown with no juggle and no meter cost. It is never a cancel source or target. It reuses the jab row and has its own magenta spark.
- **Lows and overheads.** Crouching LK is a low: standing guard fails, crouching guard blocks it. Standing LK stays mid. The roundhouse and every jumping attack are overheads, which crouching guard fails. Inside blockstun the guard is already set, so a blocked string stays blocked.
- **Air normals.** In the air you can use LP, MP or LK, not HP, HK, POWER or throw. Air normals have 70% reach and short hitstun. Landing ends the attack and adds a 0.08 s grounded cooldown, so a jump-in never links into a ground normal. HP and HK get a 25% taller hitbox against airborne targets.
- **Wakeup.** A knockdown lasts 0.75 s. The first 0.57 s is invulnerable and inert. The last 0.18 s accepts GUARD (wake block), jump, or a reversal: LP, LK, THROW, or POWER, which still costs 35 and is punishable on block.

### Fighter kits

One shared move table; each fighter's role comes from its POWER profile. Roles only change data. Select cards and the move manual print the role, its job, and the POWER class.

| Role | Fighters | Modifiers |
|---|---|---|
| Zoner (projectile zoning) | Iron Will, Shadow Self, Nexus, Zenith, Evergreen, Nomad | POWER pushes 18 px further on block; jumping LP reach +8 |
| Rushdown (command dash / rising launcher pressure) | Hataalii, Green Light, Fast Lane, Old Soul, Glyph, Overclock | Throw range +12; jab recovery −0.02 s (startup unchanged) |
| Counter (counter hit specialist) | Quiet Luxury, Civic Sage, Quilt, Eon | First punish after a successful block is a counter hit; POWER startup +0.04 s, damage +2 |
| Grappler (close-range throws) | Varsity, Juris | Throw damage 16, range +18; wakeup window +0.04 s |
| Balanced (long-range footsies) | After Hours, Blueprint, Wild Card, Hybrid, Binary, Aether, Gaia, Sketch, Student | None |

Varsity's Overtime Elbow is a travel/elbow power. The kit brief grouped it with rushdown or counter, but it was made the grappler so the role has a fighter; Juris (Verdict Shield) now joins it. The rushdown jab change lowers the smallest recovery-plus-next-startup gap from 0.41 s to 0.39 s. That is still above the 0.36 s jab hitstun, and tests assert no link combos for any kit.

### CPU personality

| | Think | Block | Cancels | Throws | Anti-air | Wakeup |
|---|---|---|---|---|---|---|
| Easy | 0.29 s | 23% | never | never | never | never reverses |
| Normal | 0.19 s | 48% | yes | vs guard held ≥ 0.6 s | no | occasional wake block |
| Hard | 0.11 s | 80% vs visible active frames, reads lows | yes | vs turtles | times HP/HK to the jump | GUARD or THROW 50/50 |

Hard also punishes whiffs in range and fires POWER only when it can land: projectile lane or melee reach. On top of difficulty, the role sets the plan. Zoners hold space and fire POWER past 180 px. Rushdown walks in and mixes in a throw after two blocked strings. Counter kits wait and punish with MP/HP. The grappler feints a jab, then throws. Balanced keeps the mixed behaviour.

### Impact

`beep()` and the oscillator sound path are unchanged. Hitstop is weighted: light 0.04 s, medium 0.06 s, heavy/HK 0.09 s, POWER 0.12 s, throw 0.10 s. Blocks freeze for 60% of that. A clean hit flashes the struck sprite white for one render tick. Sparks grow with the strike's tier. Blocks get a smaller cyan-grey spark and a smaller shake. The combo counter pops each time it grows. Reduced motion skips the shake, flash and rumble but keeps hitstop, so frame advantage never changes.

### Touch controller

The on-screen controller lives in `src/controller.js` and follows the game's keycap styling. The left pad is a single slide surface: one thumb walks, crouches and jumps, and diagonals give jump-forward without lifting. The right side is a staggered six-key arcade cluster with POWER and GUARD bars beneath. Targets scale with the viewport (at least 44 px on phones, 64 px and up on tablets) and respect safe-area insets. In portrait the canvas sits at the top and the controller fills the free band below it; in landscape the pads overlay the bottom corners on translucent plates. `node scripts/qa-screens.mjs` (after `npm run build`) drives a match on five phone and tablet viewports, screenshots the controller into `docs/qa/controller-*.jpg`, and fails if any target is too small, leaves the viewport, or overlaps Pause or the HUD.

### Combos

Hits and blocks now follow shared frame data in `src/combat-rules.js`:

- **Chains.** When a strike lands (hit or block) it can be cancelled into a stronger strike of the same family (LP→MP→HP, LK→MK→HK), a punch into a kick of equal or higher tier, and any *hit* into POWER. Whiffs never cancel, nothing cancels into the same move, and POWER cancels into nothing. Every legal chain lands inside the rival's hitstun, and no move recovers fast enough to link into another, so combos come only from cancels and always end.
- **Hitstun and blockstun** are separate and scale with the strike (0.36–0.48 s hitstun for normals, 0.24–0.34 s blockstun). Guard holds for the entire blockstun window even if the block input is released, so a blocked string stays blocked. Every normal leaves the blocker free before the attacker.
- **Scaling.** Damage in a combo scales 100 → 90 → 80 → 70 → 60 → 50 %, and hitstun decays 4 % per hit, floored at 75 %.
- **Launches and knockdowns.** An uppercut or roundhouse inside a combo (or as a counter hit) launches; one juggle hit is allowed. POWER knocks down. A launched fighter lands into a 0.75 s knockdown during which they cannot be hit, ending the combo.
- **Counter hits.** Striking a rival during their startup deals 125 % damage and adds hitstun, with a COUNTER! callout. Counter kits also score one after a successful block.
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

Arcade advances one stage per fight; the bonus stage borrows the upcoming arena's atmosphere id and colour. Stage select shows two rows on desktop and a swipeable strip on phones.

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

Vercel runs the test suite before building `dist` using the included configuration. The Vite build emits content-hashed `assets/index-*.js` and `.css`, which `vercel.json` serves as immutable. Character and arena art stays at stable paths and revalidates. `npm run package:offline` produces `release/Me-vs-Me.html` (**93.9 MB**, last measured; pass another path to write elsewhere). It embeds every combat atlas, motion atlas, portrait and arena as data URIs and fails if any fighter asset is left as a network path, so it is not part of the Vercel build. Settings (including remapped keys and FULL CIRCLE) and local records persist in browser storage when available. No game backend, account or network call is required. `render-arenas.mjs` and `qa-screens.mjs` use Playwright's Chromium; a global `playwright` install is found automatically, or point `PLAYWRIGHT_MODULE` at one. `qa-screens.mjs` also checks that the built title has the Versus button and the help modal has the THROW hint.

**Performance target:** 60 fps in desktop Chromium, with 30 fps as the acceptable floor on a mid-range phone, at the 960×540 internal resolution. Runtime tests keep sparks (≤ 12), projectiles (≤ 6) and each stage's atmosphere (≤ 400 draw calls) bounded. These are not device measurements.

## License

MIT. See [LICENSE](LICENSE).

## Assets

See [ASSET-NOTES.md](ASSET-NOTES.md). Original supplied GIFs, sheets, and portraits are preserved. The combat edition contains 980 attack poses across 245 four-pose sequences, plus 840 poses for walking, jumping, guarding, hurt reactions, knockouts, and victories. Every move's impact pose is synchronized to its damage window. Stages are 1536×864 WebP backgrounds with bounded runtime atmosphere effects. Reduced motion disables environmental movement, the POWER glow, and menu preview loops.

Review the original [77 impact poses](docs/qa/all-77-move-peaks.jpg), the [seven-fighter impact poses](docs/qa/seven-fighter-combat-peaks.jpg), the [ten arenas](docs/qa/ten-arenas.jpg), and the [controller captures](docs/qa/). These are asset contact sheets and headless-browser screenshots, not device recordings.

## Verification boundaries

Automated checks cover original and new asset integrity (including that each fighter's motion atlas shows that fighter at its combat height), all 245 runtime attacks, per-style POWER and projectile painters, meter costs, one-hit damage, and tap buffering. They cover the cancel tree and its frame-data invariants for every kit, a three-hit runtime combo with scaling, launch and knockdown, blockstun guard persistence, whiff safety, and counter hits. They cover throws (keyboard and touch chord), lows and overheads against both guards, air normals and landing, wakeup guard/jump/reversal, and kit modifiers. They cover CPU personality: a hard CPU throws a turtle and anti-airs a jumper in a seeded bout, and an easy CPU never cancels. They cover the training recorder, trial and data readout, weighted hitstop, the flash and reduced motion, a spark/projectile budget, local two-player input, and Versus, arcade (short, full circle, shadow final, bonuses, quotes), tournament (seeded random draw, 4→2→1 bracket, simulated CPU matches, elimination, championship) and settings/remap flows. They also cover the slide pad and multi-touch cluster, every stage's atmosphere, pause, and UI navigation. Runtime tests use a Phaser graphics stub; they exercise actual game scene logic but do not establish GPU performance or visual acceptance. See [QA notes](docs/qa/validation.md) and [docs/qa/ten-arenas-controller-combos.md](docs/qa/ten-arenas-controller-combos.md).

The structural reference is Street Fighter II arcade progression. Exact video matching, physical device performance, and physical gamepad validation are not established by these checks.
