// Muxes rendered frames and the synthesised score into the final MP4 (two-pass, fixed bitrate:
// film grain makes constant-quality files balloon).
// Usage: node encode.mjs [--frames out/frames-full] [--out ME-VS-ME-trailer.mp4] [--kbps 5200]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FPS } from './scene/timeline.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const frames = path.resolve(here, arg('frames', 'out/frames-full'));
const out = path.resolve(here, arg('out', 'ME-VS-ME-trailer.mp4'));
const kbps = Number(arg('kbps', 5200));
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const passlog = path.join(here, 'out', 'x264pass');
const video = ['-framerate', String(FPS), '-i', path.join(frames, '%05d.jpg')];
const x264 = ['-c:v', 'libx264', '-preset', 'slow', '-tune', 'film', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
  '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.8)}k`, '-bufsize', `${kbps * 3}k`, '-passlogfile', passlog];
const run = (args) => { const r = spawnSync(ffmpeg, args, { stdio: ['ignore', 'ignore', 'inherit'] }); if (r.status) process.exit(r.status); };
run(['-y', ...video, ...x264, '-pass', '1', '-an', '-f', 'mp4', '/dev/null']);
run(['-y', ...video, '-i', path.join(here, 'out/score.wav'), ...x264, '-pass', '2',
  '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]);
for (const f of fs.readdirSync(path.dirname(passlog))) if (f.startsWith('x264pass')) fs.rmSync(path.join(path.dirname(passlog), f));
console.log(`${out}: ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
