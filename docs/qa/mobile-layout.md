# Mobile layout and opponent selection — PR 2

Changes are based on merged PR 1. The primary title action now starts a Duel, with explicit player and opponent selection; Arcade Ladder remains a separately labeled mode with automatic opponents.

## Verification

- 108 automated checks pass, including pointer-only selection of different player/rival identities, explicit editing tabs, preserved roster scroll, primary keyboard flow, and Pause opening from the HUD.
- Production and offline builds pass.
- Hosted Vercel preview reviewed using `/qa/mobile.html`, which embeds the actual app at selectable viewport sizes.
- 390 × 780: visually inspected title; artwork/caption and mode buttons occupy separate rows. Selected Quiet Luxury as player and Old Soul as rival, confirmed stage selection and observed both identities in combat.
- Pause opened, resumed, and reopened; leaving the match returned to the title.
- Combat DOM rectangle checks at 390 × 780, 320 × 568 and 780 × 390 found no overlap between Pause and any fighting button. At 320 pixels, all fighting buttons remained within viewport width.
- Title checks at 360 × 640 and 320 × 568 found no horizontal content overflow and confirmed the action region begins after the artwork ends.

These are hosted Chromium viewport checks, not physical Galaxy A15 or physical touch-performance measurements.
