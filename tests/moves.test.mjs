import test from 'node:test';
import assert from 'node:assert/strict';
import { characters } from '../src/characters.js';
import { MOVES, POWERS, moveFrame, movePhase } from '../src/moves.js';
import { createAttack, SPECIAL_COST } from '../src/combat-rules.js';
for(const c of characters) test(`${c.name}: all six strikes and power map impact to their own artwork`,()=>{
 const f={c,energy:100,cooldown:0,stun:0,guard:false,attack:null};
 assert.ok(POWERS[c.id]);const impactFrames=[];
 for(const spec of MOVES){
  const move=createAttack(f,spec.type);assert.ok(move);
  assert.equal(moveFrame(move),spec.row*4);
  move.t=move.start*.75;assert.equal(moveFrame(move),spec.row*4+1);assert.equal(movePhase(move),'STARTUP');
  move.t=move.start;impactFrames.push(moveFrame(move));assert.equal(moveFrame(move),spec.row*4+2);assert.equal(movePhase(move),'ACTIVE');
  move.t=move.start+move.active+.001;assert.equal(moveFrame(move),spec.row*4+3);assert.equal(movePhase(move),'RECOVERY');
  assert.ok(move.start+move.active<move.duration);
 }
 assert.equal(new Set(impactFrames).size,7);
 f.energy=SPECIAL_COST-1;assert.equal(createAttack(f,'special'),null);
});
test('all signature powers have distinct art styles and authored gameplay profiles',()=>{
 assert.equal(Object.keys(POWERS).length,characters.length);
 assert.equal(new Set(Object.values(POWERS).map(p=>p.style)).size,characters.length);
 assert.equal(new Set(Object.values(POWERS).map(p=>JSON.stringify([p.variant,p.damage,p.reach,p.duration,p.travel,p.lift,p.projectileSpeed]))).size,characters.length);
});
