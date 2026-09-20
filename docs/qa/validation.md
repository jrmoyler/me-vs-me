# Combat edition validation

## Completed locally

- 84 Node tests pass, including all 77 attacks exercised through the actual Fight scene with a stub graphics renderer.
- PNG decoding validates all 308 new poses: nonempty content, transparent margins, common ground baseline, and seven different impact images per fighter.
- Five distinct WebP stages have 1536×864 headers. All new raster files were fully decoded after packing.
- Production Vite build succeeds.
- Offline self-contained edition packages successfully, including CSS-referenced backgrounds.
- Reviewed contact sheets for all 77 impact poses and five stages. Fixed neighboring-frame bleed found during review.
- Browser local preview attempt returned ERR_BLOCKED_BY_CLIENT. Remote Vercel preview review is pending.

## Limits

Asset contact sheets are not in-engine captures. Logic tests use a stub renderer and are not performance measurements. Physical Galaxy A15 and gamepad testing, exact original-video comparison, and human AAA/art-direction acceptance remain unverified. Locomotion/guard/hurt still use transformations and tint of the ready pose; this pass creates separate artwork for all six strikes and each signature power.
