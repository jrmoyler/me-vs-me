// Promo renderer entry: builds every shot, then exposes promoRender(t) for the frame grabber.
import { THREE, Post, studioEnv, loadFonts, tex, Fighter } from './core.js';
import { SHOTS, DURATION } from './timeline.js';
import { W, H } from './hud.js';
import * as build from './shots.js';
import { characters } from '/src/characters.js';

const params = new URLSearchParams(location.search);
const scale = Number(params.get('scale') || 1);
const width = Math.round(1920 * scale), height = Math.round(1080 * scale);

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(width, height);
renderer.toneMapping = THREE.NoToneMapping;
document.body.appendChild(renderer.domElement);

const post = new Post(renderer, width, height);
const hudCanvas = document.createElement('canvas');
hudCanvas.width = width; hudCanvas.height = height;
const hud = hudCanvas.getContext('2d');
const hudTex = new THREE.CanvasTexture(hudCanvas);
hudTex.colorSpace = THREE.NoColorSpace;
hudTex.minFilter = THREE.LinearFilter;
hudTex.generateMipmaps = false;
hudTex.flipY = true;
post.final.u.tHud.value = hudTex;

const byId = Object.fromEntries(characters.map((c) => [c.id, c]));
const cache = new Map();
async function fighter(id, opts = {}) {
  const char = byId[id];
  if (!char) throw new Error(`no fighter ${id}`);
  const key = `${id}:${opts.idleOnly ? 'idle' : 'all'}`;
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const sheet = await tex(char.sheet, { pixel: true });
      if (opts.idleOnly) return { sheet };
      const [combat, motion] = await Promise.all([tex(char.combatSheet, { pixel: true }), tex(char.motionSheet, { pixel: true })]);
      return { sheet, combat, motion };
    })());
  }
  return new Fighter(char, await cache.get(key), opts);
}

async function init() {
  await loadFonts();
  const env = studioEnv(renderer);
  const ctx = { renderer, env, characters, fighter, scale };
  const builders = { open: build.buildOpen, mirror: build.buildMirror, title: build.buildTitle, roster: build.buildRoster, fight: build.buildFight, modes: build.buildModes, clash: build.buildClash, end: build.buildEnd };
  const only = params.get('shots')?.split(',');
  for (const s of SHOTS) {
    if (only && !only.includes(s.id)) continue;
    s.shot = await builders[s.id](ctx);
  }
  // Compile every shader up front so the first frame of a shot does not stall.
  for (const s of SHOTS) if (s.shot) renderer.compile(s.shot.scene, s.shot.camera);
  return DURATION;
}

window.promoReady = init();
window.promoRender = (t) => {
  const s = SHOTS.find((x) => t >= x.start && t < x.end) ?? SHOTS[SHOTS.length - 1];
  const lt = t - s.start;
  const shot = s.shot;
  shot.update(lt);
  hud.setTransform(1, 0, 0, 1, 0, 0);
  hud.clearRect(0, 0, width, height);
  hud.setTransform(width / W, 0, 0, height / H, 0, 0);
  shot.hud?.(hud, lt);
  hudTex.needsUpdate = true;
  post.render(shot.scene, shot.camera, { time: t, ...shot.post(lt) });
  return renderer.domElement.toDataURL('image/jpeg', 0.95);
};
