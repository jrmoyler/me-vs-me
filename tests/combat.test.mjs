import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAttack, inMeleeRange, hitOutcome, roundOutcome, specialVariant, SPECIAL_COST } from '../src/combat-rules.js';
const fighter = (patch={}) => ({c:{id:'gauntlet',name:'Iron Will',move:'Ion Burst',power:5,reach:5},attack:null,cooldown:0,stun:0,energy:35,hp:100,guard:false,face:1,x:200,y:450,rounds:0,...patch});
test('special requires exactly 35 meter and cannot bypass cooldown, stun, guard or an active move',()=>{
  assert.equal(createAttack(fighter({energy:SPECIAL_COST-1}),'special'),null);
  assert.ok(createAttack(fighter({energy:SPECIAL_COST}),'special'));
  for(const patch of [{cooldown:.1},{stun:.1},{guard:true},{attack:{}}]) assert.equal(createAttack(fighter(patch),'light'),null);
});
test('melee misses out of reach, behind attacker and above the hitbox',()=>{
  const f=fighter(),m=createAttack(f,'light');
  assert.ok(inMeleeRange(f,fighter({x:300}),m));
  assert.equal(inMeleeRange(f,fighter({x:400}),m),false);
  assert.equal(inMeleeRange(f,fighter({x:170}),m),false);
  assert.equal(inMeleeRange(f,fighter({x:270,y:310}),m),false);
  assert.ok(inMeleeRange(fighter({face:-1}),fighter({x:170}),m));
});
test('guard cuts damage only when facing the attacker',()=>{
  const f=fighter(),m=createAttack(f,'heavy');
  const open=hitOutcome(f,fighter({face:-1}),m);
  const block=hitOutcome(f,fighter({face:-1,guard:true}),m);
  const back=hitOutcome(f,fighter({face:1,guard:true}),m);
  assert.equal(block.damage,open.damage*.16);assert.equal(back.damage,open.damage);
  assert.ok(block.stun<open.stun);assert.ok(block.knockback<open.knockback);
});
test('health and meter remain bounded on lethal hits',()=>{
  const f=fighter({energy:99}),m=createAttack(f,'heavy'),outcome=hitOutcome(f,fighter({hp:1}),m);
  assert.equal(outcome.health,0);assert.equal(outcome.energy,100);
});
test('higher power causes more damage and heavy exceeds light',()=>{
  const f=fighter(),low=hitOutcome(f,fighter(),createAttack(f,'light'));
  const stronger=fighter({c:{...f.c,power:10}});
  assert.ok(hitOutcome(stronger,fighter(),createAttack(stronger,'light')).damage>low.damage);
  assert.ok(hitOutcome(f,fighter(),createAttack(f,'heavy')).damage>low.damage);
});
test('supplied character identities select distinct projectile, dash and rising specials',()=>{
  const identities=['gauntlet','elbow','sweep'];
  assert.deepEqual(identities.map(id=>specialVariant({id})),[3,1,2]);
  const moves=identities.map(id=>createAttack(fighter({c:{id}}),'special'));
  assert.equal(new Set(moves.map(m=>m.reach)).size,3);
  assert.equal(inMeleeRange(fighter(),fighter({x:210}),moves[0]),false);
});
test('impact windows align with sprite peak and finish within attack duration',()=>{
  for(const type of ['light','heavy','special']){const m=createAttack(fighter(),type);assert.ok(Math.floor(m.start/m.duration*16)>=6);assert.ok(m.start+m.active<m.duration);}
});
test('best of three finishes after two wins; draws award no round',()=>{
  let p=fighter({hp:100}),o=fighter({hp:0});
  const first=roundOutcome(p,o);assert.equal(first.complete,false);assert.equal(first.playerRounds,1);
  p.rounds=first.playerRounds;p.hp=20;o.hp=80;
  const second=roundOutcome(p,o);assert.equal(second.complete,false);assert.equal(second.opponentRounds,1);
  o.rounds=second.opponentRounds;p.hp=0;o.hp=60;
  const third=roundOutcome(p,o);assert.equal(third.complete,true);assert.equal(third.winner,'opponent');assert.equal(third.opponentRounds,2);
  const draw=roundOutcome(fighter({rounds:1}),fighter({rounds:1}));assert.equal(draw.winner,null);assert.equal(draw.complete,false);assert.equal(draw.playerRounds,1);
});
