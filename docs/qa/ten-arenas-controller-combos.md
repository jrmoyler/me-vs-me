# Ten arenas, touch controller and combo system — validation

September 22, 2026. Base: 4703391 (merged PR 3). Branch `claude/arenas-mobile-controller-60gfcy`.

## Completed

- 191 automated tests pass (`npm test`), up from 174. New coverage:
  - `combat.test.mjs`: the cancel tree (12 legal chains, all illegal cases), the frame-data invariants (every chain lands inside hitstun, no link can ever combo, every normal leaves the blocker free first), combo scaling and hitstun decay, block/counter/launch/knockdown outcomes, `cancelAttack` and the extended `createAttack` guards.
  - `combat-runtime.test.mjs`: a real jab→cross→uppercut chain through the Fight scene (three hits, 100/90/80 % scaling, "3 HIT COMBO", launch, landing knockdown, invulnerable while down); a blocked jab cancelled into a low kick that is still blocked after the guard input is released, with pushback and no combo; whiff safety with the buffered press still coming out after recovery; a counter hit with its callout; the power's knockdown and downed art.
  - `controller.test.mjs`: eight-sector slide pad with dead zone, sliding and diagonals on one pointer, foreign pointers ignored, tap edges vs. guard hold, independent multi-touch, power readiness, release and destroy.
  - `stage-effects.test.mjs`: all ten atmospheres draw finite, bounded (≤ 400 calls) and distinct output; reduced motion freezes them; unknown ids fall back.
  - Existing suites updated for ten arenas (manifest, WebP integrity, stage select) and the per-move runtime loop resets the new fighter state.
- `node scripts/render-arenas.mjs --check`: ten distinct 1536×864 simple-VP8 WebP files, 237–517 KB each.
- `npm run build` passes; `npm run package:offline` writes a 70.1 MB self-contained HTML (five more backgrounds add roughly 2.4 MB before base64).
- `node scripts/qa-screens.mjs` on the built game with touch emulation: 390×844, 844×390, 320×568, 1024×1366 and 1366×1024. Every control is at least 44 px (64 px on tablets), inside the viewport, and never overlaps Pause, the HUD or, in portrait, the canvas. Screenshots: `controller-*.jpg` in this directory.
- Contact sheet of all ten stages: `ten-arenas.jpg`. The five new backgrounds were reviewed for style match and a clear fighting lane; none needed a re-roll.

## Design notes

- Hitstun 0.36–0.48 s and blockstun 0.24–0.34 s per normal; cancels are allowed only from a landed move, into a stronger same-family normal, a punch into an equal-or-higher kick, or any hit into POWER. Links cannot combo by construction (smallest recovery + startup gap is 0.41 s).
- A press during a move is buffered until that move ends plus the usual 160 ms, so the cancel fires on the frame the hit is confirmed even across hitstop.
- Heavies launch only inside a combo or as counters; POWER always knocks down; one juggle hit; landing from a launch is a 0.75 s knockdown during which the fighter cannot be hit.
- The CPU may use cancels on normal and hard difficulty, never on easy.

## Limits

Headless Chromium viewport checks are not physical-device tests; touch latency, haptics and real thumb ergonomics remain unverified on hardware. Runtime tests use the Phaser graphics stub. Art acceptance of the generated stages is a human judgement; the automated checks establish structure only.
