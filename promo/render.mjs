// Renders the promo scene frame by frame in headless Chromium and encodes it to MP4.
// Usage: node render.mjs [--from s] [--to s] [--workers n] [--scale 0.5] [--out name]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const FPS = 30;
const scale = Number(arg('scale', 1));
const workers = Number(arg('workers', 3));
const outName = arg('out', 'draft');
const only = arg('frames', null); // comma list of seconds for stills
const frameDir = path.join(here, 'out', `frames-${outName}`);
fs.mkdirSync(frameDir, { recursive: true });

const executablePath = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}/?scale=${scale}`;

async function openPage() {
  const browser = await chromium.launch({
    executablePath,
    args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: Math.round(1920 * scale), height: Math.round(1080 * scale) } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(base);
  const duration = await page.evaluate(() => window.promoReady);
  return { browser, page, duration };
}

async function renderList(list, id) {
  const { browser, page } = await openPage();
  let n = 0;
  const t0 = Date.now();
  for (const f of list) {
    const file = path.join(frameDir, `${String(f).padStart(5, '0')}.jpg`);
    if (fs.existsSync(file) && !only) continue;
    const data = await page.evaluate((t) => window.promoRender(t), f / FPS);
    fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
    n++;
    if (n % 30 === 0) console.log(`worker ${id}: ${n}/${list.length} frames, ${((Date.now() - t0) / n / 1000).toFixed(2)} s/frame`);
  }
  await browser.close();
}

const probe = await openPage();
const duration = probe.duration;
await probe.browser.close();
let frames;
if (only) frames = only.split(',').map((s) => Math.round(Number(s) * FPS));
else {
  const from = Math.round(Number(arg('from', 0)) * FPS);
  const to = Math.round(Number(arg('to', duration)) * FPS);
  frames = [];
  for (let f = from; f < to; f++) frames.push(f);
}
// Interleave so every worker gets a mix of heavy and light shots.
const lists = Array.from({ length: workers }, (_, w) => frames.filter((_, i) => i % workers === w));
await Promise.all(lists.map((l, i) => renderList(l, i)));
server.close();
console.log(`rendered ${frames.length} frames into ${frameDir}`);
