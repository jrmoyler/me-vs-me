# Ten-arena expansion: generation record

September 22, 2026. Five new stage backgrounds were generated through the connected Higgsfield connector with `gpt_image_2_5` (variant flare, quality high, resolution 2k, aspect 16:9), one job each, no re-rolls. Every job used `neon-avenue-v2.webp` as an `image_references` input so the new stages keep the rendering style of the existing five. Raw outputs are 2688×1520 PNG and are not committed (`asset-sources/arenas/` is ignored); `scripts/render-arenas.mjs --encode` produces the shipped 1536×864 WebP files.

## Shared brief

> Side-view arcade fighting game stage background in exactly the rendering style of the reference image: crisp detailed 16-bit pixel art, rich palette, layered depth, dramatic lighting. Scene: … A wide flat empty horizontal fighting lane runs across the lower part of the frame with the ground line at about 83 percent of frame height, clear of obstacles for two fighters. Foreground details only at the far left and right edges. No people, no fighters, no characters, no UI, no text, no letters, no readable words.

## Scenes

| id | Scene brief | Job |
|---|---|---|
| terminal-nine | Underground subway station platform late at night: mint and teal glazed tile walls, long fluorescent tubes, a stopped silver commuter train with warmly lit windows behind the platform edge, steel pillars, a hanging departure board with blank glowing panels, wet reflective concrete floor, faint steam, a distant tunnel glow. | 3bdabd77-35e6-4963-a34d-d1dc41c24451 |
| glasshouse | Victorian botanical greenhouse laboratory at dawn: iron and glass roof, pale gold first light, lush lime and emerald foliage, hanging planters, brass laboratory equipment and glowing specimen jars on side benches, a wide stone walkway through the center, low mist hugging the floor. | 9ee244e3-44ea-4822-8f38-e5ed37543d4a |
| overtime-field | American football stadium sideline at night: towering floodlights, packed stands in rose pink and white, a glowing scoreboard with blank panels, painted turf with white yard lines, team benches and equipment crates only at the far edges, confetti drifting, camera flashes in the crowd. | b4e16a56-c3c2-494c-8763-38af01d93a63 |
| redline-overpass | Desert highway overpass at dusk: orange and red sky fading to violet, flat-topped mesas on the horizon, a raised concrete road deck with faded lane paint and guardrails, sodium lamps starting to glow, a parked classic muscle car far off at one edge, heat haze and drifting dust. | 9a36864a-9773-4565-b854-d721eae7bc89 |
| null-vault | Deep underground data center vault: rows of tall black server racks with violet and electric blue status LEDs, overhead cable trays, cold mist, a polished dark floor with a faint grid, a huge sealed circular vault door centered on the back wall, indigo and purple lighting, quiet and minimal. | 83d4169a-8e81-4d7a-9e63-f49e139e1901 |

## Encoding

Chromium's canvas encoder wraps output in the extended `VP8X` container even for opaque images. The game's asset test reads dimensions from the simple `VP8 ` container, so the script requests an opaque 2D context and, when a `VP8X` header still appears without an `ALPH` chunk, rewrites the RIFF wrapper around the unchanged VP8 bitstream. `--check` verifies container, 1536×864, size and distinct hashes for all ten stages; `--sheet` renders `docs/qa/ten-arenas.jpg`.
