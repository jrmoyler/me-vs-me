import test from 'node:test';
import assert from 'node:assert/strict';
import { characters } from '../src/characters.js';
import { createAttack } from '../src/combat-rules.js';
import { paintPower } from '../src/stage-effects.js';

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
};
for (const [id, methods] of Object.entries(expected)) test(`${id}: signature effect dispatches from its gameplay style in both directions`, () => {
  const character = characters.find(c => c.id === id);
  for (const face of [-1, 1]) for (const reducedMotion of [false, true]) {
    const calls = draw(character, face, reducedMotion);
    for (const method of methods) assert.ok(calls.some(call => call[0] === method), method);
    if (id !== 'aether') assert.ok(!calls.some(call => call[0] === 'arc'), 'must not use generic arc fallback');
  }
});
test('all nine expansion powers emit different graphics command sequences', () => {
  const signatures = Object.keys(expected).map(id => JSON.stringify(draw(characters.find(c => c.id === id), 1, true)));
  assert.equal(new Set(signatures).size, 9);
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
