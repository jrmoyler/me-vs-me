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
  assert.deepEqual(Object.keys(freshFighterState()).sort(),['attack','blockstun','combo','comboDisplay','comboFlash','comboHits','cooldown','down','flash','guardTime','juggles','launched','punish','stun']);
});

// --- Defense answers, kits and invariants ------------------------------------------
import * as R from '../src/combat-rules.js';
import { characters } from '../src/characters.js';
import { POWERS, KITS, kitFor, ROLES, SYSTEM_MOVES, trialHit, trialDrop, freshTrial, TRIAL_SEQUENCE, buildKeyMap, DEFAULT_KEYS } from '../src/moves.js';
const who=(id,patch={})=>fighter({c:characters.find(c=>c.id===id),...patch});
test('throw: tier 0 grab that never cancels, beats both guards, needs a grounded free target and does flat damage',()=>{
  const f=fighter(),m=createAttack(fighter({guard:true}),'throw');
  assert.ok(m,'GUARD does not stop a throw from starting');
  assert.equal(m.tier,0);assert.equal(m.family,'throw');assert.equal(m.start,0.18);assert.ok(Math.abs(m.duration-m.start-m.active-0.42)<1e-9);
  m.landed='hit';m.t=m.start+0.01;
  for(const t of NORMALS.concat('special'))assert.equal(canCancel(m,t),false,`throw→${t}`);
  for(const a of NORMALS)assert.equal(canCancel(landed(a),'throw'),false,`${a}→throw`);
  for(const guard of [{guard:true,face:-1},{guard:true,crouch:true,face:-1}]){
    const o=hitOutcome(f,fighter({...guard,comboHits:3}),m);
    assert.equal(o.blocking,false);assert.equal(o.damage,12);assert.equal(o.knockdown,true);assert.equal(o.throw,true);assert.equal(o.comboHits,0);assert.equal(o.launch,0);
  }
  assert.ok(inMeleeRange(f,fighter({x:270,face:-1}),m));
  assert.equal(inMeleeRange(f,fighter({x:290,face:-1}),m),false,'shorter than a jab');
  for(const patch of [{y:400},{stun:.1},{blockstun:.1},{down:.3},{launched:true}])assert.equal(R.canBeThrown(fighter(patch)),false,JSON.stringify(patch));
  assert.ok(MOVE_TABLE.throw.reach<MOVE_TABLE.light.reach);
});
test('guard heights: standing blocks mid and overhead, crouching blocks low and mid, blockstun keeps a string blocked',()=>{
  const f=fighter(),low=createAttack(fighter(),'kick',{crouch:true}),mid=createAttack(fighter(),'kick'),over=createAttack(fighter(),'heavyKick');
  assert.equal(low.height,'low');assert.equal(mid.height,'mid');assert.equal(over.height,'overhead');
  const stand=fighter({guard:true,face:-1}),crouch=fighter({guard:true,crouch:true,face:-1});
  assert.equal(hitOutcome(f,stand,low).blocking,false);assert.equal(hitOutcome(f,crouch,low).blocking,true);
  assert.equal(hitOutcome(f,stand,mid).blocking,true);assert.equal(hitOutcome(f,crouch,mid).blocking,true);
  assert.equal(hitOutcome(f,stand,over).blocking,true);assert.equal(hitOutcome(f,crouch,over).blocking,false);
  assert.equal(hitOutcome(f,fighter({guard:true,face:-1,blockstun:.1}),low).blocking,true,'already blocking');
  for(const t of ['light','medium','heavy','mediumKick'])assert.equal(createAttack(fighter(),t,{crouch:true}).height,'mid');
});
test('air normals: LP, MP and LK only, overhead, shorter reach, short hitstun that cannot link after landing',()=>{
  const air=fighter({y:380});
  for(const t of ['heavy','heavyKick','mediumKick','special','throw'])assert.equal(createAttack(air,t),null,t);
  for(const t of R.AIR_TYPES){const m=createAttack(air,t);assert.ok(m.air);assert.equal(m.height,'overhead');assert.ok(m.reach<MOVE_TABLE[t].reach);assert.equal(m.launch,undefined);}
  const m=createAttack(air,'light');m.landed='hit';m.t=m.start+.01;assert.equal(canCancel(m,'medium'),false,'air normals never cancel');
  const fastest=Math.min(...NORMALS.map(t=>createAttack(fighter(),t).start));
  assert.ok(R.AIR_LAND_COOLDOWN+fastest>R.AIR_HITSTUN,'no jump-in link');
  assert.ok(inMeleeRange(air,fighter({x:280,face:-1}),m),'comes down on a grounded rival');
  assert.equal(inMeleeRange(air,fighter({x:330,face:-1}),m),false,'no fullscreen jump-in');
  assert.equal(inMeleeRange(fighter({y:450}),fighter({x:280,face:-1}),{...m}),false,'must be above the target');
  assert.equal(createAttack(who('gauntlet',{y:380}),'light').reach,createAttack(who('urban',{y:380}),'light').reach+8,'zoner jumping light reach +8');
});
test('heavy punch and roundhouse get a 25% taller hitbox against airborne targets only',()=>{
  const f=fighter(),hp=createAttack(f,'heavy'),mp=createAttack(f,'medium');
  const jumper=fighter({x:300,y:450-140,face:-1});
  assert.ok(inMeleeRange(f,jumper,hp));assert.ok(inMeleeRange(f,jumper,createAttack(f,'heavyKick')));
  assert.equal(inMeleeRange(f,jumper,mp),false);
  assert.equal(inMeleeRange(f,fighter({x:300,y:450,face:-1,crouch:false}),hp),true);
});
test('wakeup window is the last 0.18 s of the 0.75 s knockdown (grapplers get 0.04 more)',()=>{
  assert.equal(R.KNOCKDOWN_TIME,0.75);assert.equal(R.WAKEUP_WINDOW,0.18);
  assert.ok(Math.abs(R.KNOCKDOWN_TIME-R.WAKEUP_WINDOW-0.57)<1e-9);
  assert.equal(R.wakeupWindow(fighter()),0.18);assert.ok(Math.abs(R.wakeupWindow(who('varsity'))-0.22)<1e-9);
  assert.deepEqual(R.WAKEUP_REVERSALS,['light','kick','throw','special']);
});
test('kits: every fighter has a role derived from its POWER profile and a printable job',()=>{
  assert.equal(Object.keys(KITS).length,characters.length);
  for(const c of characters){const k=kitFor(c);assert.ok(ROLES[k.role]);assert.ok(k.job.length>5);assert.ok(k.powerClass);}
  for(const id of ['gauntlet','pixel','nexus','zenith']){assert.equal(kitFor({id}).role,'zoner');assert.equal(POWERS[id].variant,3);assert.equal(kitFor({id}).job,'projectile zoning');}
  for(const id of ['tote','quilt','civic'])assert.equal(kitFor({id}).role,'counter');
  for(const id of ['hataalii','corvette','tweed','glyph','kinetic'])assert.equal(kitFor({id}).role,'rushdown');
  for(const id of ['curly','binary','urban','vector','aether','hybrid','gaia'])assert.equal(kitFor({id}).role,'balanced');
  assert.equal(kitFor({id:'varsity'}).role,'grappler-lite');
  assert.equal(kitFor({id:'kinetic'}).job,'command dash');
  assert.deepEqual(SYSTEM_MOVES.map(m=>m.tag),['THROW','LOW','OVERHEAD','AIR','WAKEUP']);
});
test('kit modifiers: only the documented POWER, throw and jab numbers move',()=>{
  for(const c of characters){
    const p=POWERS[c.id],m=createAttack(fighter({c,energy:100}),'special'),role=kitFor(c).role;
    assert.equal(m.variant,p.variant);assert.equal(m.reach,p.reach);
    assert.equal(m.damage,p.damage+(role==='counter'?2:0),c.id);
    assert.ok(Math.abs(m.start-Math.max(p.start+(role==='counter'?0.04:0),p.duration*.43))<1e-9,c.id);
    assert.equal(m.knockback.block,MOVE_TABLE.special.knockback.block+(role==='zoner'?18:0));
    assert.equal(MOVE_TABLE.special.knockback.block,28,'the shared table is never mutated');
  }
  assert.equal(createAttack(who('varsity'),'throw').damage,16);assert.equal(R.throwRange(who('varsity')),90);
  assert.equal(R.throwRange(who('hataalii')),84);assert.equal(R.throwRange(who('urban')),72);
  assert.ok(Math.abs(createAttack(who('hataalii'),'light').duration-(MOVE_TABLE.light.duration-.02))<1e-9);
  assert.equal(createAttack(who('hataalii'),'light').start,createAttack(who('urban'),'light').start,'startup untouched');
});
test('every legal chain lands inside hitstun and no link combos for any kit, including the faster rushdown jab',()=>{
  let minGap=Infinity;
  for(const c of characters){
    const make=(t)=>createAttack(fighter({c,energy:100}),t);
    for(const a of NORMALS){
      const ma=make(a);ma.landed='hit';ma.t=ma.start+.01;
      for(const b of NORMALS.concat('special')){
        if(canCancel(ma,b))assert.ok(MOVE_TABLE[a].hitstun*hitstunDecay(1)>make(b).start+0.05||b==='special',`${c.id} ${a}→${b}`);
        if(b==='special')continue;
        const gap=ma.duration-ma.start+0.07+make(b).start;minGap=Math.min(minGap,gap);
        assert.ok(gap>ma.hitstun+0.029,`${c.id}: ${a} then ${b} cannot link (${gap.toFixed(3)} vs ${ma.hitstun})`);
      }
      assert.ok(ma.duration-ma.start+0.07>ma.blockstun,`${c.id} ${a} is unsafe on block`);
    }
  }
  // Documented relaxation: the rushdown jab tweak lowers the smallest recovery+startup gap from 0.41 s to 0.39 s.
  assert.ok(minGap>=0.39-1e-9,`smallest gap ${minGap}`);
});
test('counter kits: the first punish after a successful block is a counter hit even outside startup',()=>{
  const counter=who('tote'),other=who('urban');
  const m=createAttack(counter,'medium'),m2=createAttack(other,'medium');
  assert.equal(hitOutcome({...counter,punish:.5},fighter({face:-1}),m).counter,true);
  assert.equal(hitOutcome({...counter,punish:0},fighter({face:-1}),m).counter,false);
  assert.equal(hitOutcome({...other,punish:.5},fighter({face:-1}),m2).counter,false,'only counter kits');
  const hit=hitOutcome({...counter,punish:.5},fighter({face:-1}),m),plain=hitOutcome(counter,fighter({face:-1}),m);
  assert.ok(Math.abs(hit.damage-plain.damage*R.COUNTER_DAMAGE)<1e-9);
});
test('hitstop by weight and haptic pulses by weight',()=>{
  const f=fighter({energy:100}),get=t=>createAttack(f,t);
  assert.equal(R.hitstopFor(get('light')),.04);assert.equal(R.hitstopFor(get('kick')),.04);
  assert.equal(R.hitstopFor(get('medium')),.06);assert.equal(R.hitstopFor(get('heavy')),.09);assert.equal(R.hitstopFor(get('heavyKick')),.09);
  assert.equal(R.hitstopFor(get('special')),.12);assert.equal(R.hitstopFor(get('throw')),.1);
  assert.ok(Math.abs(R.hitstopFor(get('heavy'),true)-.054)<1e-9);
  assert.equal(R.impactPulse(get('light')),20);assert.equal(R.impactPulse(get('heavy')),40);assert.equal(R.impactPulse(get('special')),70);
});
test('trial recognizer accepts jab → cross → uppercut → POWER as one live combo and fails after three drops',()=>{
  const t=freshTrial();
  TRIAL_SEQUENCE.forEach((type,i)=>trialHit(t,type,i+1));
  assert.equal(t.status,'pass');
  const d=freshTrial();
  trialHit(d,'light',1);trialHit(d,'medium',2);trialHit(d,'special',3);
  assert.equal(d.drops,1,'skipping the uppercut drops');assert.equal(d.step,0);
  trialHit(d,'light',1);trialDrop(d);assert.equal(d.drops,2);
  trialHit(d,'light',1);trialHit(d,'medium',2,true);assert.equal(d.status,'fail','blocked follow-up is a drop');
  trialHit(d,'light',1);assert.equal(d.step,0,'a failed trial stays failed');
});
test('keyboard map defaults to WASD + JKL/UIO/Q/Shift and arrows + numpad, and remaps replace a key',()=>{
  const map=buildKeyMap();
  assert.deepEqual(map.KeyJ,[0,'light']);assert.deepEqual(map.ShiftLeft,[0,'block']);assert.deepEqual(map.ShiftRight,[0,'block']);
  assert.deepEqual(map.Numpad1,[1,'light']);assert.deepEqual(map.Space,[1,'block']);assert.deepEqual(map.ArrowUp,[1,'jump']);
  assert.equal(Object.keys(DEFAULT_KEYS.p1).length,12);
  const custom=buildKeyMap({p1:{light:'KeyF'}});assert.deepEqual(custom.KeyF,[0,'light']);assert.equal(custom.KeyJ,undefined);
});
test('AI profiles: easy never cancels, throws or anti-airs; hard reads everything',()=>{
  const {easy,normal,hard}=R.AI_PROFILES;
  assert.deepEqual([easy.think,normal.think,hard.think],[.29,.19,.11]);
  assert.deepEqual([easy.block,normal.block,hard.block],[.23,.48,.8]);
  assert.equal(easy.cancels,false);assert.equal(easy.throws,false);assert.equal(easy.antiAir,0);assert.equal(easy.wakeup,'none');
  assert.equal(normal.turtle,.6);assert.equal(hard.wakeup,'mix');assert.ok(hard.antiAir>0&&hard.punish&&hard.smartPower);
  const a=R.seededRandom(4),b=R.seededRandom(4);assert.equal(a(),b());
});
