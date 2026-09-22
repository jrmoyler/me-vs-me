import {cpSync, mkdirSync} from 'node:fs';

const fighters = ['aether','binary','civic','gaia','glyph','hybrid','nexus','quilt','zenith'];
const shots = [
  'browser-title',
  'browser-neon-training',
  'browser-ion-burst',
  'browser-roundhouse',
  'browser-crown-breaker',
  'browser-uppercut',
  'browser-stage-select',
  'expansion-combat-peaks',
  'expansion-motion-peaks',
  'five-arenas',
];

mkdirSync('public/characters', {recursive:true});
mkdirSync('public/gameplay', {recursive:true});

for (const id of fighters) {
  cpSync(`public/assets/characters/${id}-combat.png`, `public/characters/${id}-combat.png`);
}
for (const id of shots) {
  cpSync(`docs/qa/${id}.jpg`, `public/gameplay/${id}.jpg`);
}
console.log('Promo assets staged in root public directory');
