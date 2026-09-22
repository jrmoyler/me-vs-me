import test from 'node:test';
import assert from 'node:assert/strict';
import { arenas } from '../src/arenas.js';
import { paintAtmosphere, atmosphereFor } from '../src/stage-effects.js';

function record(arena, time, reducedMotion) {
  const calls = [];
  const g = new Proxy({}, { get: (_, name) => (...args) => {
    assert.ok(args.every((v) => typeof v !== 'number' || Number.isFinite(v)), `${arena.id}.${String(name)} receives finite numbers`);
    calls.push([name, ...args]);
  } });
  paintAtmosphere(g, arena, time, reducedMotion);
  return calls;
}
test('every arena paints a bounded, finite and distinct atmosphere', () => {
  assert.equal(arenas.length, 10);
  const signatures = new Set();
  for (const arena of arenas) {
    for (const t of [0, 1.37, 7.9, 61.3, 3600]) {
      const calls = record(arena, t, false);
      assert.equal(calls[0][0], 'clear');
      assert.ok(calls.length > 1 && calls.length <= 400, `${arena.id}: ${calls.length} draw calls at t=${t}`);
    }
    signatures.add(JSON.stringify(record(arena, 1.37, false)));
  }
  assert.equal(signatures.size, arenas.length, 'no two arenas share an effect');
});
test('reduced motion freezes the animation and unknown stages fall back to the terrace lights', () => {
  for (const arena of arenas) assert.deepEqual(record(arena, 5, true), record(arena, 99, true));
  assert.equal(atmosphereFor('nope'), atmosphereFor('midnight-terrace'));
  assert.ok(record({ id: 'bonus-fake' }, 1, false).length > 1);
  assert.notEqual(atmosphereFor('terminal-nine'), atmosphereFor('null-vault'));
});
