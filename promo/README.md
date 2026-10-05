# ME VS ME: trailer

`ME-VS-ME-trailer.mp4` is a 66-second, 1920×1080, 30 fps promo with a stereo soundtrack. It uses no generated imagery and no audio samples. Picture and sound both come from code in this folder. The only images on screen are the game's own fighter atlases from `public/assets/characters`. Everything around them is built in Three.js: the wet reflective floors, volumetric light cones, dust, glass, the chrome title, and the particles.

## Shots

| Time | Shot | What it shows |
|---|---|---|
| 0:00 | Cold open | A work light strikes on Hataalii: "Every version of me started as this one." |
| 0:07 | Mirror | His reflection cycles through other fighters, settles on Shadow Self, then the glass shatters |
| 0:13 | Title | Extruded chrome ME VS ME with a red flare and drifting shards |
| 0:19 | Roster | A corridor of the other 48 fighters on name-plated plinths that ends at the original |
| 0:28 | Fight | Hataalii vs Overclock: jab → cross → uppercut combo, high and low blocks, a throw, then a roundhouse cancelled into the Crown Breaker POWER and a K.O. |
| 0:42 | Modes | Arcade Ladder, Tournament, Versus and Training on lit monoliths |
| 0:50 | Clash | "Your toughest opponent is you": Hataalii and his shadow charge POWERs and collide |
| 0:57 | End card | Title, mode list and the play URL |

## Rebuild it

```sh
cd promo
npm install
node score.mjs                       # out/score.wav, synthesised from scene/timeline.js
node render.mjs --workers 3 --out full   # out/frames-full/*.jpg via headless Chromium (SwiftShader)
FFMPEG=/path/to/ffmpeg node encode.mjs   # ME-VS-ME-trailer.mp4
```

`render.mjs --scale 0.5 --frames 3,15,30` renders single half-size stills for quick review. Frames are a pure function of time, so a render can be stopped and resumed: existing frames are skipped.

- `scene/timeline.js` holds the shot list, the fight choreography and the sound cues. It is shared by the picture and the score, so every hit lands on its sound.
- `scene/core.js` is the engine. It has the sprite shader (atlas cells, rim light, fog, hit flash), the reflector floor, light cones, dust, bokeh and particle bursts. It also has the post chain: depth of field, bloom, ACES, grade, grain, chromatic aberration and letterbox.
- `scene/shots.js` builds and animates each shot. `scene/hud.js` sets the type on a canvas that is composited inside the grade pass.
- `scene/body-metrics.json` stores the measured standing height of each atlas, so fighters keep the same scale across sheets.
