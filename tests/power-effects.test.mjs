import test from 'node:test';
import assert from 'node:assert/strict';
import { characters } from '../src/characters.js';
import { createAttack } from '../src/combat-rules.js';
import { paintPower, paintProjectile } from '../src/stage-effects.js';
import { POWERS } from '../src/moves.js';

// Record actual Graphics calls to verify dispatch from gameplay power profiles.
function draw(character, face, reducedMotion) {
  const calls = [];
  const g = new Proxy({}, { get: (_, name) => (...args) => {
    assert.ok(args.every(value => typeof value !== 'number' || Number.isFinite(value)));
    calls.push([name, ...args]);
  } });
  const attack = createAttack({ c: character, energy: 100 }, 'special');
  attack.t = attack.start + attack.active / 2;
  paintPower(g, { c: character, attack, x: 400, y: 450, face }, 2, reducedMotion);
  return calls;
}
const expected = {
  hybrid: ['strokeEllipse', 'fillCircle'], civic: ['closePath', 'lineBetween'],
  nexus: ['strokeEllipse'], glyph: ['fillTriangle', 'lineTo'],
  quilt: ['strokeRoundedRect', 'strokeEllipse'], binary: ['moveTo', 'lineTo'],
  aether: ['arc', 'strokeEllipse'], gaia: ['lineTo', 'lineBetween'],
  zenith: ['fillCircle', 'strokeEllipse', 'lineBetween'],
  archer: ['lineBetween', 'fillTriangle'], cyborg: ['fillEllipse', 'strokeCircle', 'fillCircle'],
  eon: ['strokeTriangle', 'strokeEllipse'], juris: ['closePath', 'fillCircle', 'strokeRect'],
  nomad: ['fillTriangle', 'fillCircle'], sketch: ['lineBetween'],
  student: ['strokeRect', 'fillRect'],
};
for (const [id, methods] of Object.entries(expected)) test(`${id}: signature effect dispatches from its gameplay style in both directions`, () => {
  const character = characters.find(c => c.id === id);
  for (const face of [-1, 1]) for (const reducedMotion of [false, true]) {
    const calls = draw(character, face, reducedMotion);
    for (const method of methods) assert.ok(calls.some(call => call[0] === method), method);
    if (id !== 'aether') assert.ok(!calls.some(call => call[0] === 'arc'), 'must not use generic arc fallback');
  }
});
test('all sixteen expansion powers emit different graphics command sequences', () => {
  const signatures = Object.keys(expected).map(id => JSON.stringify(draw(characters.find(c => c.id === id), 1, true)));
  assert.equal(new Set(signatures).size, 16);
});
test('every roster POWER style has its own painter, never the generic fallback arc', () => {
  const fallback = JSON.stringify(draw({ ...characters[0], id: 'unlisted' }, 1, true));
  for (const c of characters) assert.notEqual(JSON.stringify(draw(c, 1, true)), fallback, c.id);
});
function shot(character, face, time = 0) {
  const calls = [];
  const g = new Proxy({}, { get: (_, name) => (...args) => {
    assert.ok(args.every(value => typeof value !== 'number' || Number.isFinite(value)));
    calls.push([name, ...args]);
  } });
  paintProjectile(g, { x: 500, y: 355, face, owner: { c: character }, move: createAttack({ c: character, energy: 100 }, 'special') }, time);
  return calls;
}
test('each projectile POWER travels as its own shape in both directions', () => {
  const projectile = characters.filter(c => POWERS[c.id].variant === 3);
  assert.deepEqual(projectile.map(c => c.id), ['gauntlet', 'pixel', 'nexus', 'zenith', 'archer', 'nomad', 'student', 'starscribe', 'circuitbreaker', 'eventhorizon']);
  const shapes = projectile.map(c => JSON.stringify(shot(c, 1, 0.4)));
  assert.equal(new Set(shapes).size, projectile.length);
  for (const c of projectile) {
    const calls = shot(c, -1, 0.4);
    assert.ok(calls.length > 1 && calls.length <= 24, `${c.id}: bounded draw calls`);
  }
  // Mirrored shots reflect around their own centre.
  const right = shot(characters.find(c => c.id === 'archer'), 1).find(call => call[0] === 'lineBetween');
  const left = shot(characters.find(c => c.id === 'archer'), -1).find(call => call[0] === 'lineBetween');
  assert.equal(right[1] - 500, -(left[1] - 500));
});
test('an unknown projectile style keeps the classic orb', () => {
  const calls = shot({ ...characters[0], id: 'unlisted' }, 1);
  assert.deepEqual(calls.map(c => c[0]), ['fillStyle', 'fillEllipse', 'lineStyle', 'strokeCircle', 'fillStyle', 'fillCircle', 'fillStyle', 'fillRect']);
});
test('Aether cyclone arcs reflect their centers, angles and sweep when facing left', () => {
  const character = characters.find(c => c.id === 'aether');
  for (const reducedMotion of [false, true]) {
    const right = draw(character, 1, reducedMotion).filter(call => call[0] === 'arc');
    const left = draw(character, -1, reducedMotion).filter(call => call[0] === 'arc');
    assert.equal(right.length, 4);
    assert.equal(left.length, right.length);
    right.forEach((arc, i) => {
      const reflected = left[i];
      assert.equal(reflected[1], 800 - arc[1]);
      assert.equal(reflected[2], arc[2]);
      assert.equal(reflected[3], arc[3]);
      assert.equal(reflected[4], Math.PI - arc[4]);
      assert.equal(reflected[5], Math.PI - arc[5]);
      assert.equal(arc[6], false);
      assert.equal(reflected[6], true);
    });
  }
});
