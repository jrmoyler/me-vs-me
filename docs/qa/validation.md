# Combat edition validation

## Completed

- 104 Node tests pass, including all 77 attacks through the actual Fight scene with a stub graphics renderer, motion-state selection, bonus strikes, and UI flows.
- PNG decoding validates 308 attack poses and 264 motion poses across all eleven fighters: dimensions, nonempty content, transparency, grounding, and distinct action rows.
- All five 1536×864 arena files decode successfully. Reviewed arena, attack, and motion contact sheets; corrected neighboring-frame bleed during packing.
- Production Vite build and 38.2 MB self-contained offline package succeed.
- Live Vercel browser review covered title, selection, all seven move previews, stage selection, training, pause/resume/exit, all six strike keys, Crown Breaker, and an Ion Burst projectile hit. Screenshots are included in this directory.
- Vercel build now runs the same test suite before packaging. GitHub Actions failed before starting any job steps on the first PR commit and exposed no logs; the existing workflow remains enabled.

- PR review corrections: idle and round reset use the original ready frame; Duel and Training move manuals follow the currently selected opponent. Regression coverage exercises all eleven ready poses and both opponent-selection flows.

## Limits

Logic tests use a stub renderer and are not performance measurements. Physical Galaxy A15 and gamepad testing, exact original-video comparison, and human AAA/art-direction acceptance remain unverified. Browser captures were taken on the first combat-art deployment; motion-state artwork was additionally inspected in contact sheets and exercised in runtime tests.

## Non-audio systems (defense, kits, versus, CPU, training, impact, arcade)

The audio path is unchanged: `beep()` and the Web Audio oscillator stay as they were, and no audio assets were added under `public/`.

### Invariants under test

- Combos come only from cancels. For every fighter and kit, every legal chain lands inside hitstun, and no normal followed by any normal can link. The smallest recovery + 0.07 s cooldown + next startup is 0.39 s (rushdown jab), down from 0.41 s. **This is a documented relaxation:** the brief asked for a 0.02 s faster rushdown jab and a ≥ 0.41 s gap, and both cannot hold. The gap stays above the 0.36 s jab hitstun with a 0.03 s margin.
- Whiffs never cancel. Nothing cancels into itself. POWER cancels into nothing. Air normals cancel into nothing. THROW is never a cancel source or target.
- Guard persists through the full blockstun; inside blockstun any height is blocked, so a blocked string stays blocked.
- Standing guard blocks mid and overhead but fails lows. Crouching guard blocks low and mid but fails overheads. Throws beat both.
- A jump-in never links: the 0.08 s landing cooldown plus the fastest startup is greater than the 0.2 s air hitstun.
- The knockdown is 0.75 s. The first 0.57 s is inert and invulnerable, and the last 0.18 s (0.22 s for the grappler) accepts guard, jump or a reversal.
- Easy CPU never cancels, throws or anti-airs. Hard CPU throws a turtle and anti-airs a jumper in seeded bouts.
- Training keeps infinite HP/meter. RESET clears the dummy recording, the trial and both fighters.
- Reduced motion still freezes stage atmosphere, the POWER glow and menu previews. It now also skips hit shake, white flash and rumble, and keeps hitstop.
- 140 runtime attacks still resolve with one hit each. POWER damage, reach and variant are unchanged except for the documented kit modifiers (counter +2 damage, +0.04 s startup; zoner +18 px block push).
- Sparks are capped at 12 and projectiles at 6. Each atmosphere painter stays at or under 400 draw calls.
- Touch targets pass `scripts/qa-screens.mjs` on five phone and tablet viewports: at least 44 px on phones and 64 px on tablets, inside the viewport, and clear of Pause and the HUD. The same run checks the Versus title button and the help modal's THROW hint.
- No new network calls, accounts or services.

### Automated results for this pass

- `npm test`: 231 tests pass (191 before this pass).
- `npm run build`: passes and emits hashed `assets/index-*.js/css`.
- `node scripts/qa-screens.mjs` against the build: all six checks pass (title/help plus five controller viewports).
- `npm run package:offline`: 70.1 MB.
- A headless Chromium pass looked at the title (Versus button), player-two selection with role tags, the move manual with the defensive system, the settings input panel, and training with TRIAL and DATA. These are headless screenshots, not device recordings.

### Manual checklist

| Check | Status |
|---|---|
| Title shows Versus | Automated (UI test + qa-screens on the build) |
| Local P2 can walk and jab from arrows/numpad in one match | Automated (runtime test); not checked on a physical keyboard |
| Holding guard vs hard CPU eventually eats a throw | Automated (seeded runtime test) |
| Crouch LK hits a standing-guard dummy | Automated (runtime test) |
| Jump jab is possible and lands in training | Automated (runtime test) |
| Wakeup block works | Automated (runtime test) |
| Trial can pass | Automated for all 20 fighters (runtime test) |
| Short arcade ends on a mirror match | Automated (UI test) |
| Sound path unchanged (oscillator beeps still fire; no new audio assets in `public/`) | Verified by diff: `beep()` untouched, no files added under `public/` |

Physical Galaxy A15 performance, physical gamepad and rumble behaviour, two physical pads in one Versus match, and human feel or art-direction acceptance are **not established** by these checks.
