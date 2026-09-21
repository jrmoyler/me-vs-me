# Expansion sprite prompts: Hybrid, Civic, Nexus

Tool: built-in image_gen; reference originals inspected before generation. Each combat references source photo plus existing gauntlet portrait for pixel style. Motion references its completed combat atlas.

## Combat base

Use case: stylized-concept. Game sprite atlas for Me vs Me fighting game. Transparent alpha background, no grid lines, no labels, no text outside clothing. Sharp detailed pixel art, 1990s premium fighting-game sprites, stylized slightly large heads, dark outlines. Reference 1 supplies exact man identity and clothing; reference 2 supplies pixel-art rendering style only. Every cell contains one complete fighter facing RIGHT, same body scale and grounded baseline, ample blank padding, all extremities/effects inside cell. Exactly FOUR equally spaced columns and SEVEN equally spaced rows, 28 full-body poses. Row1 jab; row2 cross punch; row3 rising uppercut; row4 low kick; row5 side kick; row6 roundhouse kick; row7 signature power. In each row four frames are neutral anticipation, winding-up, extended impact, recovery. Each attack must actually change the arms/legs, no repeated standing poses. Frame row1col1 is neutral guard. Keep sprite size consistent across atlas. 

### hybrid

Reference filename suffix: 1609.png

Man with black bucket hat, shoulder-length curly dark hair, navy sweatshirt with gold orbit chest graphic, black text-pattern joggers, black shoes, black shoulder bag. Signature is amber orbit palm: gather golden rings, thrust right palm, radiant amber orbital sphere, fading rings.

### civic

Reference filename suffix: 390.png

Man with pink/navy knit CC beanie, short dark twists, sage green utility jacket, navy tee and navy joggers with pink markings, navy/white sneakers. Signature is jade ward shoulder: crouch behind jade shield, wind shoulder, rightward charging shoulder with bright green shield crescent, recover.

### nexus

Reference filename suffix: 339.png

Man with curly shoulder length hair and black beanie, black tracksuit with white sleeve and leg stripes, small black crossbody chest bag, black sneakers. Signature is purple sonic palm: charge violet sound rings, wind right palm, thrust palm with purple concentric sonic blast, fade rings.

## Motion base

Use case: stylized-concept. Create motion atlas for exact SAME pixel fighter as supplied combat atlas, identical face clothing pixel shading accessories and body proportions. Genuinely transparent background. EXACTLY FOUR COLUMNS and SIX ROWS: 24 full body sprites in regular equally spaced grid. Row1 WALK four distinct stride stages; Row2 JUMP crouch/takeoff/apex/landing; Row3 GUARD raise forearms/brace/block/release; Row4 HURT recoil/torso twist/stagger/recover; Row5 KO buckling/falling/down/prone; Row6 VICTORY rise/raise fist/triumph/settle. All facing RIGHT. Strong actual articulated pose changes, no copy-paste poses. Full body and all effects inside each cell with generous padding. No grid lines, no captions, no scenery. 

## Row correction

Hybrid and Nexus initial combat images contained six rows and were rejected. Corrective prompt:

Correct this transparent pixel fighter atlas. It has only SIX rows; must be EXACTLY SEVEN ROWS and FOUR COLUMNS, 28 sprites. Keep exact same character identity pixel style and clothing. Re-layout all sprites on regular 4x7 grid, equal height rows, taller canvas. Required rows in order: 1 jab, 2 cross, 3 uppercut, 4 LOW KICK aimed at shin, 5 straight SIDE KICK horizontal, 6 ROUNDHOUSE KICK arcing high, 7 amber orbit PALM power. Every row FOUR stages: anticipation, windup, impact, recovery. Add the missing kick row; do not omit any row. No text/lines, transparent background, keep entire body inside each cell.

Nexus used same corrective prompt with purple sonic PALM instead of amber orbit PALM.

## Validation note

Nexus corrected combat first failed packaging because adjacent purple power effects touched. Preserved as nexus-combat-rejected-gutters.png and regenerated with the following targeted correction:

Edit sprite atlas maintaining EXACTLY 4 columns x7 rows, 28 complete fighter poses. Keep identical character black beanie curly hair black white-stripe tracksuit chest bag, exact pixel style and all poses. CRITICAL FIX: all sprites and effects must be SEPARATED by large empty transparent gutters, including the purple sonic effects in bottom row which currently touch. Reduce all sprite/effect drawings to fit CENTERED within 70% of each equal cell width and 80% of cell height. The bottom row purple auras MUST be MUCH SMALLER tightly hugging hands only, NO large circular background halos. Bottom row poses: charge small purple orb, wind up with small purple palm glow, extended palm with SMALL purple sound rings, recovery with tiny fading glow. All four bottom row drawings entirely disconnected by transparent strips. Preserve 7 rows and4columns. Actual transparent background.

Motion previews display a dark gradient, but saved PNGs have real alpha. Checked RGBA min/max; packaging agent validates and extracts poses. Hybrid motion first generated version selected after verifying alpha; unnecessary background extraction alternatives were not selected.
