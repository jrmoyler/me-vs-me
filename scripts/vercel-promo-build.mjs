import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import chromium from '@sparticuz/chromium';

mkdirSync('dist', {recursive:true});
const log=[];

const run=(label, command, args)=>{
  log.push('\n=== '+label+' ===\n$ '+[command,...args].join(' ')+'\n');
  const r=spawnSync(command,args,{encoding:'utf8',env:process.env,maxBuffer:50*1024*1024});
  log.push(r.stdout||'');
  log.push(r.stderr||'');
  log.push('\nexit='+r.status+' signal='+(r.signal||'')+'\n');
  return r;
};

const vite=run('VITE BUILD','./node_modules/.bin/vite',['build']);
if (vite.status!==0) {
  writeFileSync('dist/render-log.txt',log.join(''));
  console.log(log.join(''));
  process.exit(0);
}

const stage=run('STAGE ASSETS',process.execPath,['scripts/stage-promo.mjs']);
if (stage.status!==0) {
  writeFileSync('dist/render-log.txt',log.join(''));
  console.log(log.join(''));
  process.exit(0);
}

let browserPath='';
try {
  browserPath=await chromium.executablePath();
  log.push('\n=== CHROMIUM ===\n'+browserPath+'\n');
} catch (error) {
  log.push('\n=== CHROMIUM ERROR ===\n'+String(error)+'\n');
}

const args=[
  'render','video/src/index.ts','Promo','dist/me-vs-me-nine-fighters-30s.mp4',
  '--codec=h264','--crf=18','--pixel-format=yuv420p'
];
if (browserPath) args.push('--browser-executable='+browserPath);

const remotion=run('REMOTION RENDER','./node_modules/.bin/remotion',args);
writeFileSync('dist/render-log.txt',log.join(''));
console.log(log.join(''));

if (remotion.status===0) {
  writeFileSync('dist/render-success.txt','rendered\n');
}
process.exit(0);
