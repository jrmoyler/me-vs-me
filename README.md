# ME VS ME — The Mirror Tournament

An original browser arcade fighter featuring all 11 supplied versions of Hataalii and five original pixel arenas. Built with Phaser 3 and Vite.

## Play

Open `Me-vs-Me.html` from the release package in a modern desktop or mobile browser. It contains the game and its character/arena assets. On some mobile file viewers you must choose **Open in browser**. A hosted version is recommended for mobile. Source development: `npm ci`, then `npm run dev`.

- **Arcade:** fight the other ten identities in a ladder, travel through the five arenas, play destruction bonuses after wins 3/6/9, and unlock the champion ending. Defeat offers a ten-second continue countdown.
- **Quick duel:** choose both fighters, including a mirror match.
- **Training:** practice against a passive opponent with replenishing health and meter.
- Eleven identities; five selectable stages; three CPU difficulties; two rounds to win; 60-second rounds.
- Move **A/D**, jump **W**, crouch **S**, punches **J/K/L**, kicks **U/I/O**, special **Q**, guard **Shift**, pause **Escape**. Touch controls appear on phones.
- Settings and local match records persist when browser storage is available. No account or server is required.

## Build and deploy

```sh
npm ci
npm run build
```

Vercel configuration is included: Vite framework, `npm run build`, output `dist`. Connect this directory as a Git repository to Vercel or run an authenticated `vercel --prod`. No secrets or API keys are needed by the game.

Create the self-contained offline edition using `node scripts/package-offline.mjs`.

## Assets and reference

The supplied GIFs are retained in `public/assets/originals`; all 176 frames were extracted into normalized transparent PNG sprite sheets. See `ASSET-NOTES.md`. Character identities and unique attack animations are preserved. Other movement states use transformations of the supplied ready pose; additional walk, jump, hurt and guard sprite artwork was not supplied.

The reference URL identifies **Street Fighter II: The World Warrior arcade Ryu Gameplay Playthrough Longplay** by arcadegamesfreak. This implementation follows its arcade fighting structure with original title, roster, stages and interface. The full video could not be visually inspected, so exact video matching is not established.

## Validation and remaining release gates

Asset tests verify all 11 fighters, five arenas and every sprite frame. UI integration and combat rules tests are included. The automated asset, combat, bonus and interface tests and production build pass. These are automated structural/logic checks, not rendered browser acceptance.

Cloud-browser security blocked local preview URLs in this session. Therefore rendered browser playtesting, real-device touch/performance validation, and exact reference comparison remain open. Vercel's advertised deployment action returned `tool not found`. The project-import browser currently requires account sign-in. Do not represent this repository as already deployed or visually signed off until a live deployment has been verified.

## Source and continuous verification

Canonical repository: https://github.com/jrmoyler/me-vs-me. GitHub Actions runs asset, combat and UI checks, builds production output and uploads the offline edition. The repository includes every supplied original GIF, normalized animation sheet, portrait, five arena backgrounds and all game code.

Six normal strikes have distinct strength, reach and timing. Standard gamepads are supported in combat: directional pad or left stick to move, face buttons and bumpers for normal strikes, left trigger to guard, right trigger for power, Start to pause. Controller hardware has not been physically tested in this session.
