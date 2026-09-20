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
