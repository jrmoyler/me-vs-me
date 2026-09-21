# Nine-fighter expansion validation

September21,2026. Base: ded3ab75 (merged PR2).

## Completed

-20 fighters,5 arenas; original11 assets unchanged.
-9 new reference-based pixel fighters, each28 combat and24 movement key poses.
-9 unique powers, including directional graphics regression coverage.
-174 automated tests pass, including140 actual-scene attack simulations using a Phaser graphics stub,19-opponent arcade progression, opponent selection, pause, asset alpha/margins, visible grounding, and power effects.
-Production build and self-contained offline build pass.
-36 new runtime PNGs and45 export PNGs fully decode.
-126 transparent GIFs validated:117 four-frame move/reaction GIFs and9 signature GIFs. Signature GIFs encode16 timeline cells as6 stored frames with holds,1120ms duration.
-Combat and movement contact sheets visually reviewed. Sources with omitted rows, clipped effects, touching neighboring powers, or ambiguous kick extension were corrected.
-Near-transparent outer padding no longer shrinks or floats Binary; visible body/ground regression check added.

## Pending publication checks

Git push was blocked by automatic approval review because generated sprite assets derive from private reference files and the destination repository is public. Origin and GitHub metadata both verify jrmoyler/me-vs-me, with push permission. No original photographic reference files are included in the commit.

Hosted browser playtest and Vercel checks must run after approved publication. Local browser navigation was unavailable in this session. Do not report this branch as merge-ready until those checks complete. Physical GalaxyA15 and physical gamepad performance remain unverified.

The art is a stylized interpretation of the supplied photographs; exact photographic likeness is not claimed.
