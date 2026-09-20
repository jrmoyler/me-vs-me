# ME VS ME — The Mirror Tournament

A browser arcade fighter with 11 versions of Hataalii, five illustrated arenas, and 77 combat animations. Phaser 3 + Vite; keyboard, touch, and standard gamepad inputs.

## Play

- **Arcade:** face the other ten identities, with destruction bonuses after wins 3/6/9 and a champion ending. Two rounds win each match. Defeat offers a ten-second continue.
- **Quick duel:** choose both fighters, including a mirror match.
- **Training:** infinite health/meter, reset controls, optional guarding dummy, move-phase and hit feedback.
- **Move list:** preview all seven attacks from character selection, training, or the pause menu.

| Action | Keyboard | Touch |
|---|---|---|
| Move / jump / crouch | A D / W / S | Direction pad |
| Jab / cross / uppercut | J / K / L | LP / MP / HP |
| Low kick / sidekick / roundhouse | U / I / O | LK / MK / HK |
| Signature power | Q | POWER |
| Guard / pause | Shift / Escape | GUARD / PAUSE |

Tap once per attack. A 160 ms input buffer catches quick taps and late recovery inputs. Powers cost **35 meter**; the meter marks the threshold and shows readiness. Each fighter has separately illustrated normal attacks and a named power with its own gameplay profile and effect style. Standard controllers map face buttons/bumpers to strikes, left trigger to guard, right trigger to power, and Start to pause.

## Develop and build

```sh
npm ci
npm test
npm run dev
npm run build
npm run package:offline
```

Vercel runs the test suite before building `dist` using the included configuration. The offline command produces `release/Me-vs-Me.html`, including new arena and combat assets. Settings and local records persist in browser storage when available. No game backend or account is required.

## Assets

See [ASSET-NOTES.md](ASSET-NOTES.md). Original supplied GIFs, sheets, and portraits are preserved. The combat edition adds 308 attack poses across 77 four-pose sequences, plus 264 poses for walking, jumping, guarding, hurt reactions, knockouts, and victories. Every move's impact pose is synchronized to its damage window. New stages are WebP backgrounds, with bounded runtime rain, petals, furnace glow, and lighting details. Reduced motion disables environmental movement and menu preview loops.

Review [all 77 impact poses](docs/qa/all-77-move-peaks.jpg) and [five arenas](docs/qa/five-arenas.jpg). These are asset contact sheets, not browser screenshots.

## Verification boundaries

101 automated checks cover original and new asset integrity, all 77 runtime attacks, meter costs, one-hit damage, tap buffering, pause, progression, bonus stages, and UI navigation. Runtime tests use a Phaser graphics stub; they exercise actual game scene logic but do not establish GPU performance or visual acceptance. See [QA notes](docs/qa/validation.md) for rendered-playtest status.

The structural reference is Street Fighter II arcade progression. Exact video matching, physical Galaxy A15 performance, and physical gamepad validation are not established by these checks. This is a substantial combat and presentation upgrade, not a claim of independently certified AAA quality.
