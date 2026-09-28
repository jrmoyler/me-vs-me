// Muxes rendered frames and the synthesised score into the final MP4.
// Usage: node encode.mjs [--frames out/frames-full] [--out ME-VS-ME-trailer.mp4]
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FPS } from './scene/timeline.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const frames = path.resolve(here, arg('frames', 'out/frames-full'));
const out = path.resolve(here, arg('out', 'ME-VS-ME-trailer.mp4'));
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const r = spawnSync(ffmpeg, [
  '-y', '-framerate', String(FPS), '-i', path.join(frames, '%05d.jpg'), '-i', path.join(here, 'out/score.wav'),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-tune', 'film', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
  '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out,
], { stdio: 'inherit' });
process.exit(r.status ?? 1);
