# Me vs Me asset notes

The eleven playable character animations come from the supplied “Me vs Me battle animation gifs.zip” archive. The original GIFs are retained in `public/assets/originals/`.

Each GIF contains sixteen frames. The transparent PNG sheets in `public/assets/characters/` contain those same supplied frames, resized using nearest-neighbor sampling and positioned on a consistent canvas. They are not newly drawn animation or a reconstruction of unseen character views. Portraits are cropped from each supplied ready pose. Names, titles, combat statistics, and signature move names are game-specific interpretations of the visible characters.

Each sheet is 5120×320 pixels: sixteen horizontal 320×320 frames. Frame zero is the ready pose. The nominal body height is 176 pixels, with a shared horizontal center of 160 and ground anchor of 296. Animation coordinates remain relative to the original ready pose, preserving attack extension and effects. Gameplay uses a 65 ms frame interval for responsive combat, faster than the supplied GIF playback. No external artwork was substituted for these characters.

The five arena SVGs are original game backgrounds created for this implementation. They are not screenshots or extracted artwork from the linked reference video. Reference-video fidelity requires direct visual comparison; this asset pipeline does not establish that claim.

Run `node --test tests/assets.test.mjs` to verify roster and arena counts, path availability, distinct identities, PNG dimensions, stats, transparency margins, and grounded bounds for all 176 animation frames. The test uses only Node built-ins and decodes the PNG alpha channel to inspect actual frame bounds.
