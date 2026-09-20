import { build } from 'esbuild';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const result=await build({entryPoints:['src/main.js'],bundle:true,format:'iife',minify:true,write:false,outfile:'offline.js',loader:{'.css':'css'}});
let js=result.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css=result.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'';
for(const folder of ['characters','arenas']){
 for(const name of await readdir(`public/assets/${folder}`)){
  const mime=name.endsWith('.svg')?'image/svg+xml':'image/png';
  const bytes=await readFile(`public/assets/${folder}/${name}`);
  const url=`data:${mime};base64,${bytes.toString('base64')}`;
  js=js.split(`/assets/${folder}/${name}`).join(url);
 }
}
const html=`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#101223"><title>Me vs Me — Offline Arcade</title><style>${css}</style></head><body><div id="app"></div><script>${js.replaceAll('</script','<\\/script')}</script></body></html>`;
await mkdir('release',{recursive:true});
await writeFile('release/Me-vs-Me.html',html);
console.log(`Offline arcade written (${(Buffer.byteLength(html)/1024/1024).toFixed(1)} MB).`);
