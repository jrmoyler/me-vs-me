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
  for(const type of ['light','medium','heavy','kick','mediumKick','heavyKick','special']){const m=createAttack(fighter(),type);assert.ok(Math.floor(m.start/m.duration*16)>=6);assert.ok(m.start+m.active<m.duration);}
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

test('six normal strikes have increasing damage by strength and distinct timing',()=>{
 const f=fighter();
 for(const names of [['light','medium','heavy'],['kick','mediumKick','heavyKick']]){
  const moves=names.map(type=>createAttack(f,type));
  assert.ok(moves[0].damage<moves[1].damage&&moves[1].damage<moves[2].damage);
  assert.ok(moves[0].duration<moves[1].duration&&moves[1].duration<moves[2].duration);
 }
 assert.equal(createAttack(f,'unknown'),null);
});
test('projectiles retain travel direction when their owner turns after launch',()=>{
 const f=fighter({face:-1}),target=fighter({guard:true,face:-1});
 const move={...createAttack(f,'special'),face:1};
 assert.equal(hitOutcome(f,target,move).blocking,true);
 target.face=1;assert.equal(hitOutcome(f,target,move).blocking,false);
});
test('simultaneous lethal hits yield a rematch without awarding either round',()=>{
 const result=roundOutcome(fighter({hp:0,rounds:1}),fighter({hp:0,rounds:1}));
 assert.deepEqual(result,{winner:null,playerRounds:1,opponentRounds:1,complete:false});
});

// --- Frame data and the cancel tree ----------------------------------------
import { canCancel, cancelAttack, canBeHit, comboScale, hitstunDecay, MOVE_TABLE, freshFighterState, JUGGLE_LIMIT } from '../src/combat-rules.js';
const NORMALS=['light','medium','heavy','kick','mediumKick','heavyKick'];
const landed=(type,how='hit')=>{const m=createAttack(fighter(),type);m.landed=how;m.t=m.start+0.01;return m;};
test('cancel tree: stronger same-family, punch into kick, any hit into power; never same move, whiff, kick into punch or out of power',()=>{
  const legal=[['light','medium'],['light','heavy'],['medium','heavy'],['kick','mediumKick'],['kick','heavyKick'],['mediumKick','heavyKick'],['light','kick'],['light','heavyKick'],['medium','mediumKick'],['heavy','heavyKick']];
  for(const [a,b] of legal){assert.ok(canCancel(landed(a),b),`${a}→${b}`);assert.ok(canCancel(landed(a,'block'),b),`${a}→${b} on block`);}
  for(const [a,b] of [['medium','light'],['heavy','medium'],['light','light'],['kick','light'],['heavyKick','heavy'],['medium','kick'],['heavyKick','light']]) assert.equal(canCancel(landed(a),b),false,`${a}→${b}`);
  for(const a of NORMALS){assert.ok(canCancel(landed(a),'special'),`${a}→special on hit`);assert.equal(canCancel(landed(a,'block'),'special'),false,`${a}→special on block`);}
  assert.equal(canCancel(landed('special'),'light'),false);
  const whiff=createAttack(fighter(),'light');whiff.t=whiff.start+0.05;assert.equal(canCancel(whiff,'medium'),false);
  const expired=landed('light');expired.t=expired.duration;assert.equal(canCancel(expired,'medium'),false);
  assert.equal(canCancel(null,'medium'),false);assert.equal(canCancel(landed('light'),'nope'),false);
});
test('every legal chain connects inside hitstun, no link ever does, and every normal is unsafe on block for the attacker',()=>{
  const eff=t=>createAttack(fighter(),t).start;
  let chains=0;
  for(const a of NORMALS)for(const b of NORMALS){
    const ma=createAttack(fighter(),a);
    if(canCancel(landed(a),b)){chains++;assert.ok(MOVE_TABLE[a].hitstun*hitstunDecay(1)>eff(b)+0.05,`${a}→${b} must land inside hitstun`);}
    assert.ok(ma.duration-ma.start+0.07+eff(b)>MOVE_TABLE[a].hitstun,`${a} then ${b} cannot link into a combo`);
  }
  assert.equal(chains,12,'3 punch chains, 3 kick chains, 6 punch-into-kick chains');
  for(const a of NORMALS){const m=createAttack(fighter(),a);assert.ok(m.duration-m.start+0.07>MOVE_TABLE[a].blockstun,`${a}: blocker recovers before the attacker`);}
});
test('combo scaling and hitstun decay floor',()=>{
  [1,.9,.8,.7,.6,.5,.5].forEach((v,i)=>assert.ok(Math.abs(comboScale(i===6?9:i)-v)<1e-9));
  assert.equal(hitstunDecay(0),1);assert.equal(hitstunDecay(20),.75);
});
test('hit outcome scales with combo count, keeps block values below open hits and rewards counter hits',()=>{
  const f=fighter(),m=createAttack(f,'medium');
  const first=hitOutcome(f,fighter(),m),third=hitOutcome(f,fighter({comboHits:2}),m);
  assert.ok(Math.abs(third.damage-first.damage*.8)<1e-9);assert.equal(third.comboHits,3);assert.ok(third.stun<first.stun);assert.equal(first.stun,MOVE_TABLE.medium.hitstun);
  const block=hitOutcome(f,fighter({face:-1,guard:true}),m);
  assert.equal(block.stun,0);assert.equal(block.blockstun,MOVE_TABLE.medium.blockstun);assert.ok(block.knockback<first.knockback);assert.equal(block.comboHits,0);assert.equal(block.launch,0);
  const counter=hitOutcome(f,fighter({attack:{t:0.02,start:0.2}}),m);
  assert.ok(counter.counter);assert.ok(counter.damage>first.damage&&counter.stun>first.stun);
  assert.equal(hitOutcome(f,fighter({face:-1,guard:true,attack:{t:0.02,start:0.2}}),m).counter,false);
  assert.equal(hitOutcome(f,fighter({attack:{t:0.3,start:0.2}}),m).counter,false,'active or recovering moves are not counter hit');
});
test('heavies launch only inside a combo or as counters; the power knocks down; downed and juggled targets cannot be hit',()=>{
  const f=fighter(),heavy=createAttack(f,'heavy');
  assert.equal(hitOutcome(f,fighter(),heavy).launch,0,'a raw uppercut does not launch');
  assert.equal(hitOutcome(f,fighter({comboHits:1}),heavy).launch,420);
  assert.equal(hitOutcome(f,fighter({attack:{t:0,start:.2}}),heavy).launch,420);
  assert.equal(hitOutcome(f,fighter({comboHits:1}),createAttack(f,'heavyKick')).launch,420);
  assert.equal(hitOutcome(f,fighter({comboHits:1}),createAttack(f,'medium')).launch,0);
  const air=hitOutcome(f,fighter({comboHits:2,launched:true,y:380}),heavy);assert.equal(air.launch,0);assert.equal(air.juggle,true);
  assert.equal(hitOutcome(f,fighter(),createAttack(f,'special')).knockdown,true);
  assert.equal(hitOutcome(f,fighter(),createAttack(f,'light')).knockdown,false);
  assert.equal(canBeHit(fighter()),true);assert.equal(canBeHit(fighter({down:.3})),false);
  assert.equal(canBeHit(fighter({launched:true,juggles:JUGGLE_LIMIT})),false);assert.equal(canBeHit(fighter({launched:true,juggles:0})),true);
});
test('cancelAttack needs a landed cancellable move and meter for the power; createAttack refuses mid-move, in blockstun, downed or airborne from a hit',()=>{
  const f=fighter({energy:100});f.attack=landed('light');
  assert.equal(cancelAttack(f,'medium').type,'medium');assert.equal(cancelAttack(f,'light'),null);
  f.energy=SPECIAL_COST-1;assert.equal(cancelAttack(f,'special'),null);f.energy=SPECIAL_COST;assert.ok(cancelAttack(f,'special'));
  f.attack.landed=null;assert.equal(cancelAttack(f,'medium'),null);
  for(const patch of [{attack:{}},{blockstun:.1},{down:.2},{launched:true}])assert.equal(createAttack(fighter(patch),'light'),null,JSON.stringify(patch));
  assert.deepEqual(Object.keys(freshFighterState()).sort(),['attack','blockstun','combo','comboDisplay','comboFlash','comboHits','cooldown','down','juggles','launched','stun']);
});
