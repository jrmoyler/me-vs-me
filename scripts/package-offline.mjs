import { build } from 'esbuild';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { characters } from '../src/characters.js';
// Usage: node scripts/package-offline.mjs [output.html]   (default release/Me-vs-Me.html)
const out = process.argv[2] || 'release/Me-vs-Me.html';
const assets = {};
for (const folder of ['characters', 'arenas']) {
  for (const name of await readdir(`public/assets/${folder}`)) {
    const mime = name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.webp') ? 'image/webp' : 'image/png';
    const bytes = await readFile(`public/assets/${folder}/${name}`);
    assets[`/assets/${folder}/${name}`] = `data:${mime};base64,${bytes.toString('base64')}`;
  }
}
for (const c of characters)
  for (const key of ['sheet', 'combatSheet', 'motionSheet', 'portrait'])
    if (!assets[c[key]]) throw new Error(`${c.id}.${key}: ${c[key]} is not in public/assets/characters`);
// Fighter paths are built from each id at runtime, so literal replacement cannot find them.
// Rewrite every roster field that names an asset once the roster module has evaluated.
const rosterAssets = {
  name: 'offline-roster-assets',
  setup(b) {
    b.onLoad({ filter: /src[\\/]characters\.js$/ }, async ({ path: file }) => {
      const source = await readFile(file, 'utf8');
      // Keyed by bare file name so the literal pass below cannot rewrite the keys too.
      const prefix = '/assets/characters/';
      const table = Object.fromEntries(
        Object.entries(assets).filter(([key]) => key.startsWith(prefix)).map(([key, url]) => [key.slice(prefix.length), url]),
      );
      return {
        loader: 'js',
        contents: `${source}\nconst OFFLINE_ASSETS = ${JSON.stringify(table)};\nfor (const c of characters) for (const [k, v] of Object.entries(c)) if (typeof v === "string" && v.startsWith("${prefix}") && OFFLINE_ASSETS[v.slice(${prefix.length})]) c[k] = OFFLINE_ASSETS[v.slice(${prefix.length})];\n`,
      };
    });
  },
};
const result = await build({ entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: true, write: false, outfile: 'offline.js', loader: { '.css': 'css' }, external: ['/assets/*'], plugins: [rosterAssets] });
let js = result.outputFiles.find((f) => f.path.endsWith('.js')).text;
let css = result.outputFiles.find((f) => f.path.endsWith('.css'))?.text || '';
// Arena backgrounds and stylesheet art are still literal paths.
for (const [key, url] of Object.entries(assets)) {
  js = js.split(key).join(url);
  css = css.split(key).join(url);
}
const leftover = `${js}${css}`.match(/\/assets\/(characters|arenas)\/[\w.-]+\.(png|webp|svg)/);
if (leftover) throw new Error(`Offline package still references ${leftover[0]}`);
const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#101223"><title>Me vs Me — Offline Arcade</title><style>${css}</style></head><body><div id="app"></div><script>${js.replaceAll('</script', '<\\/script')}</script></body></html>`;
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, html);
console.log(`Offline arcade written to ${out} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB).`);
