import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Window } from 'happy-dom';
import { characters } from '../src/characters.js';
import { arenas } from '../src/arenas.js';
import * as moves from '../src/moves.js';
const { MOVES } = moves;

const source=(await readFile(new URL('../src/main.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
function setup(saved={}) {
  const window=new Window({url:'http://localhost:5173'});
  window.document.body.innerHTML='<div id="app"></div>';
  for(const [key,value] of Object.entries(saved))window.localStorage.setItem(key,JSON.stringify(value));
  let pending, latest, bonusLatest, bonuses=0, destroys=0;
  const context=vm.createContext({window,document:window.document,localStorage:window.localStorage,
    matchMedia:()=>({matches:false}),characters,arenas,...moves,console,
    setTimeout:fn=>(pending=fn,1),clearTimeout:()=>{pending=null;},
    startBonus:options=>{bonuses++;bonusLatest=options;return {destroy(){}};},
    startCombat:async options=>{latest=options;return {destroy(){destroys++;}};}});
  vm.runInContext(source,context);
  const click=selector=>{const el=window.document.querySelector(selector);assert.ok(el,`Missing ${selector}`);el.click();};
  const key=key=>window.document.dispatchEvent(new window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
  return {window,document:window.document,click,key,get latest(){return latest;},get destroys(){return destroys;},get bonuses(){return bonuses;},
    async launch(){assert.ok(pending,'Expected pending versus transition');await pending();},
    end(winner='player'){latest.onEnd({winner,playerRounds:winner==='player'?2:0,opponentRounds:winner==='player'?0:2});},
    get bonusArena(){return bonusLatest.arena;},finishBonus(){assert.ok(bonusLatest);bonusLatest.onEnd({score:1000,destroyed:1,skipped:false});},
    screen:()=>window.document.body.dataset.screen};
}
test('first visit onboarding, all keyboard-selectable fighters, 5 arenas, duel and rematch',async()=>{
  const h=setup();h.click('[data-mode="duel"]');assert.ok(h.document.querySelector('[role="dialog"]'));
  h.click('.modal-done');assert.equal(h.screen(),'selection');assert.equal(h.document.querySelectorAll('.roster-fighter').length,characters.length);
  assert.equal(h.window.localStorage.getItem('mvm-onboarded'),'true');
  h.key('ArrowRight');assert.equal(h.document.querySelector('.roster-fighter.selected').dataset.index,'1');h.key('Enter');
  h.click('[data-action="mirror"]');h.key('Enter');assert.equal(h.screen(),'arena');assert.equal(h.document.querySelectorAll('.arena-option').length,arenas.length);
  assert.match(h.document.querySelector('.arena-coordinate').textContent,new RegExp(`STAGE 01 / ${arenas.length}`));
  h.click(`[data-action="arena"][data-index="${arenas.length-1}"]`);h.key('Enter');assert.equal(h.screen(),'versus');await h.launch();
  assert.equal(h.latest.player.id,characters[1].id);assert.equal(h.latest.opponent.id,characters[1].id);assert.equal(h.latest.arena.id,arenas.at(-1).id);
  h.end();assert.equal(h.screen(),'result');assert.equal(h.destroys,1);
  assert.equal(JSON.parse(h.window.localStorage.getItem('mvm-record')).wins,1);
  h.click('[data-action="rematch"]');await h.launch();assert.equal(h.latest.player.id,characters[1].id);
});
test('settings persist into the next combat and reduce motion',async()=>{
  const h=setup({'mvm-onboarded':true});h.click('[data-action="settings"]');h.click('[data-setting="sound"]');h.click('[data-setting="reducedMotion"]');h.click('[data-difficulty="hard"]');h.click('.modal-done');
  assert.ok(h.document.body.classList.contains('reduced-motion'));
  assert.deepEqual(JSON.parse(h.window.localStorage.getItem('mvm-settings')),{sound:false,reducedMotion:true,difficulty:'hard'});
  h.click('[data-mode="training"]');h.key('Enter');h.key('Enter');h.key('Enter');await h.launch();assert.equal(h.latest.mode,'training');assert.equal(h.latest.difficulty,'hard');assert.equal(h.latest.settings.sound,false);
  h.end();assert.equal(h.window.localStorage.getItem('mvm-record'),null);
});
async function runArcade(h){
  const faced=[],versus=[];
  for(let n=0;n<40;n++){
    faced.push(h.latest.opponent.id);versus.push(h.latest.opponent.name);h.end();
    if(/ARCADE COMPLETE/.test(h.document.body.textContent))break;
    h.click('[data-action="next-stage"]');if(h.screen()==='bonus')h.finishBonus();
    assert.equal(h.screen(),'route');h.click('[data-action="fight"]');await h.launch();
  }
  return {faced,versus};
}
test('arcade: eight mixed-role reflections, bonuses after wins three and six, then your shadow',async()=>{
  const h=setup({'mvm-onboarded':true});h.click('[data-mode="arcade"]');h.key('Enter');
  assert.match(h.document.querySelector('.mode-info').textContent,/STAGE 1 OF 9/);
  assert.ok(h.document.querySelector('[data-action="full-circle"]'),'FULL CIRCLE toggle before the first fight');
  h.key('Enter');await h.launch();
  const {faced,versus}=await runArcade(h);
  assert.equal(faced.length,9);assert.equal(new Set(faced.slice(0,8)).size,8);
  assert.ok(!faced.slice(0,8).includes(characters[0].id),'no duplicate of the player before the final');
  assert.equal(faced.at(-1),characters[0].id,'the final is a mirror match');
  assert.equal(versus.at(-1),`SHADOW ${characters[0].name}`);
  assert.ok(new Set(faced.slice(0,8).map(id=>moves.kitFor({id}).role)).size>=4,'ladder mixes roles');
  assert.equal(h.bonuses,2,'bonus after wins 3 and 6');
  assert.match(h.document.body.textContent,/ARCADE COMPLETE · 8 REFLECTIONS/);
  assert.match(h.document.querySelector('.champion-seal').textContent,/8 \/ 8 REFLECTIONS/);
  assert.equal(JSON.parse(h.window.localStorage.getItem('mvm-record')).wins,9);
});
test('arcade final is titled YOUR SHADOW on the route and versus screens',async()=>{
  const h=setup({'mvm-onboarded':true});h.click('[data-mode="arcade"]');h.key('Enter');h.key('Enter');await h.launch();
  for(let n=0;n<8;n++){h.end();h.click('[data-action="next-stage"]');if(h.screen()==='bonus')h.finishBonus();if(n<7){h.click('[data-action="fight"]');await h.launch();}}
  assert.equal(h.screen(),'route');assert.match(h.document.querySelector('.route-screen h1').textContent,/YOUR\s*SHADOW/);
  h.click('[data-action="fight"]');assert.equal(h.screen(),'versus');
  assert.match(h.document.querySelector('.versus-top').textContent,/YOUR SHADOW/);
  await h.launch();assert.equal(h.latest.opponent.shadow,true);assert.equal(h.latest.opponent.id,characters[0].id);
});
test('FULL CIRCLE persists and yields all nineteen reflections plus the shadow',async()=>{
  const h=setup({'mvm-onboarded':true});h.click('[data-mode="arcade"]');h.key('Enter');
  h.click('[data-action="full-circle"]');
  assert.equal(JSON.parse(h.window.localStorage.getItem('mvm-settings')).fullCircle,true);
  assert.match(h.document.querySelector('.mode-info').textContent,new RegExp(`STAGE 1 OF ${characters.length}`));
  h.key('Enter');await h.launch();
  const {faced}=await runArcade(h);
  assert.equal(faced.length,characters.length);assert.equal(new Set(faced.slice(0,-1)).size,characters.length-1);
  assert.equal(faced.at(-1),characters[0].id);
  assert.equal(h.bonuses,6);
  assert.match(h.document.body.textContent,new RegExp(`ARCADE COMPLETE · ${characters.length-1} REFLECTIONS`));
  const again=setup({'mvm-onboarded':true,'mvm-settings':{fullCircle:true}});again.click('[data-mode="arcade"]');again.key('Enter');
  assert.match(again.document.querySelector('.mode-info').textContent,new RegExp(`OF ${characters.length}`));
});
test('victory and defeat quotes come from the winner',async()=>{
  const h=setup({'mvm-onboarded':true});h.click('[data-mode="duel"]');h.key('Enter');h.key('Enter');h.key('Enter');await h.launch();
  const player=h.latest.player,opponent=h.latest.opponent;
  h.end('player');const win=h.document.querySelector('.victory-quote').textContent;assert.match(win,new RegExp(player.name));
  h.click('[data-action="rematch"]');await h.launch();h.end('opponent');
  assert.match(h.document.querySelector('.victory-quote').textContent,new RegExp(opponent.name));
  assert.notEqual(h.document.querySelector('.victory-quote').textContent,win);
});
test('onboarding escape proceeds consistently and dialogs trap focus and restore their trigger',()=>{
  const h=setup();h.click('[data-mode="duel"]');h.key('Escape');assert.equal(h.screen(),'selection');
  assert.equal(h.window.localStorage.getItem('mvm-onboarded'),'true');
  const trigger=h.document.querySelector('[data-action="settings"]');trigger.focus();trigger.click();
  const dialog=h.document.querySelector('[role="dialog"]');assert.equal(dialog.getAttribute('aria-labelledby'),'dialog-heading');
  const last=dialog.querySelector('.modal-done');last.focus();
  last.dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
  assert.equal(h.document.activeElement,dialog.querySelector('.modal-close'));
  h.key('Escape');assert.equal(h.document.querySelector('.modal-layer'),null);assert.equal(h.document.body.classList.contains('dialog-open'),false);
});
test('settings changes preserve keyboard focus and result sound state updates after escape',async()=>{
  const h=setup({'mvm-onboarded':true});h.click('[data-mode="duel"]');h.key('Enter');h.key('Enter');h.key('Enter');await h.launch();h.end();
  h.click('[data-action="settings"]');const sound=h.document.querySelector('[data-setting="sound"]');sound.focus();sound.click();
  assert.equal(h.document.activeElement,sound);assert.equal(sound.getAttribute('aria-pressed'),'false');
  h.key('Escape');assert.equal(h.screen(),'result');assert.equal(h.document.querySelector('[data-action="sound"]').getAttribute('aria-label'),'Enable sound');
});

test('arcade continue expires without erasing match records',async()=>{
 const h=setup({'mvm-onboarded':true});h.click('[data-mode="arcade"]');h.key('Enter');h.key('Enter');await h.launch();h.end('opponent');
 assert.match(h.document.body.textContent,/CONTINUE/);for(let i=0;i<10;i++)await h.launch();
 assert.equal(h.screen(),'title');assert.equal(JSON.parse(h.window.localStorage.getItem('mvm-record')).matches,1);
});

test('all fighters expose seven animated moves including their named power',()=>{
 const h=setup({'mvm-onboarded':true});h.click('[data-mode="training"]');
 for(let i=0;i<characters.length;i++){
  h.click(`[data-action="fighter"][data-index="${i}"]`);h.click('[data-action="moves"]');
  assert.equal(h.document.querySelectorAll('.move-card').length,7);
  assert.match(h.document.querySelector('.move-card:last-child').textContent,new RegExp(characters[i].move));
  assert.ok(h.document.querySelector('.move-card').getAttribute('style').includes(characters[i].combatSheet));
  h.click('.modal-done');assert.equal(h.document.querySelector('.modal-layer'),null);
 }
});

for (const mode of ['duel', 'training']) {
 test(`${mode} move list follows opponent selection without changing the player`, async()=>{
  const h=setup({'mvm-onboarded':true});h.click(`[data-mode="${mode}"]`);
  h.click('[data-action="fighter"][data-index="2"]');h.key('Enter');
  h.click('[data-action="fighter"][data-index="7"]');h.click('[data-action="moves"]');
  assert.ok(h.document.querySelector('.move-card').getAttribute('style').includes(characters[7].combatSheet));
  assert.ok(h.document.querySelector('.move-card:last-child').textContent.includes(characters[7].move));
  h.click('.modal-done');h.key('Enter');h.key('Enter');await h.launch();
  assert.equal(h.latest.player.id,characters[2].id);
  assert.equal(h.latest.opponent.id,characters[7].id);
 });
}

test('primary title action chooses both fighters through pointer clicks', async()=>{
 const h=setup({'mvm-onboarded':true});
 h.click('.start-button');
 h.click('[data-action="fighter"][data-index="3"]');
 h.click('[data-action="confirm-fighter"]');
 assert.match(h.document.querySelector('.roster-caption').textContent,/SELECT YOUR OPPONENT/);
 h.click('[data-action="fighter"][data-index="9"]');
 h.click('[data-action="confirm-fighter"]');
 h.click('[data-action="fight"]');await h.launch();
 assert.equal(h.latest.mode,'duel');assert.equal(h.latest.player.id,characters[3].id);assert.equal(h.latest.opponent.id,characters[9].id);
});
test('roster taps preserve scroll and the explicit opponent tab edits only the rival',()=>{
 const h=setup({'mvm-onboarded':true});h.click('.start-button');
 let jumps=0;h.window.scrollTo=()=>jumps++;
 h.click('[data-action="fighter"][data-index="4"]');
 h.click('[data-action="select-opponent"]');
 h.click('[data-action="fighter"][data-index="8"]');
 assert.equal(jumps,0);
 assert.equal(h.document.querySelector('[data-action="select-opponent"]').getAttribute('aria-pressed'),'true');
 h.click('[data-action="select-player"]');
 assert.equal(h.document.querySelector('.roster-fighter.selected').dataset.index,'4');
 h.click('[data-action="select-opponent"]');
 assert.equal(h.document.querySelector('.roster-fighter.selected').dataset.index,'8');
});
test('Enter from title uses the same choose-both-fighters flow',()=>{
 const h=setup({'mvm-onboarded':true});h.key('Enter');h.key('Enter');
 assert.match(h.document.querySelector('.roster-caption').textContent,/SELECT YOUR OPPONENT/);
});

test('title offers Versus; versus picks player one, then player two, a stage, and launches local',async()=>{
  const h=setup({'mvm-onboarded':true});
  const labels=[...h.document.querySelectorAll('.title-actions button')].map(b=>b.textContent);
  assert.deepEqual(labels.map(l=>l.replace(/\s*↗$/,'')),['CHOOSE YOUR MATCH','VERSUS / TWO PLAYERS','ARCADE LADDER','TRAINING']);
  assert.match(h.document.querySelector('.title-ticker').textContent,/ONE PLAYER OR TWO \/ SAME CABINET/);
  assert.doesNotMatch(h.document.body.textContent,/NO SECOND PLAYER REQUIRED/);
  h.click('[data-mode="local"]');
  assert.match(h.document.querySelector('.roster-caption').textContent,/PLAYER ONE/);
  h.click('[data-action="fighter"][data-index="4"]');h.click('[data-action="confirm-fighter"]');
  assert.match(h.document.querySelector('.roster-caption').textContent,/P2 PLAYER TWO SELECT YOUR FIGHTER/);
  assert.match(h.document.querySelector('.selection-fighter.right .fighter-index').textContent,/PLAYER TWO/);
  assert.doesNotMatch(h.document.querySelector('.selection-screen').textContent,/YOUR OTHER SIDE/);
  h.click('[data-action="fighter"][data-index="12"]');h.click('[data-action="confirm-fighter"]');
  assert.equal(h.screen(),'arena');assert.doesNotMatch(h.document.querySelector('.mode-info').textContent,/CPU/);
  h.click('[data-action="fight"]');assert.equal(h.screen(),'versus');
  const splash=h.document.querySelector('.versus-screen').textContent;
  assert.match(splash,/PLAYER ONE/);assert.match(splash,/PLAYER TWO/);assert.doesNotMatch(splash,/NORMAL|HARD|EASY|YOUR OTHER SIDE/);
  await h.launch();assert.equal(h.latest.mode,'local');assert.equal(h.latest.player.id,characters[4].id);assert.equal(h.latest.opponent.id,characters[12].id);
  h.end('opponent');assert.match(h.document.querySelector('.result-copy .eyebrow').textContent,/PLAYER TWO WINS/);
  assert.equal(h.window.localStorage.getItem('mvm-record'),null,'versus does not touch the CPU record');
});
test('select cards and the move manual print each role, its job, the POWER class and the defensive system',()=>{
  const h=setup({'mvm-onboarded':true});h.click('[data-mode="training"]');
  assert.equal(h.document.querySelectorAll('.roster-fighter .role-tag').length,characters.length);
  assert.equal(h.document.querySelector('.roster-fighter[data-index="2"] .role-tag').textContent,'ZONER');
  assert.match(h.document.querySelector('.selection-fighter.left .kit-line').textContent,/RUSHDOWN/);
  h.click('[data-action="fighter"][data-index="2"]');h.click('[data-action="moves"]');
  const manual=h.document.querySelector('.moves-modal').textContent;
  assert.match(manual,/ZONER/);assert.match(manual,/projectile zoning/);assert.match(manual,/POWER CLASS · PROJECTILE/);
  for(const tag of ['THROW','LOW','OVERHEAD','AIR','WAKEUP'])assert.match(manual,new RegExp(tag));
  assert.equal(h.document.querySelectorAll('.move-card').length,7,'atlas rows unchanged');
});
test('help documents throw, lows, air normals, wakeup and versus keys',()=>{
  const h=setup({'mvm-onboarded':true});h.click('[data-action="help"]');
  const text=h.document.querySelector('.help-modal').textContent;
  assert.match(text,/SHIFT\+J/);assert.match(text,/GUARD\+LP/);assert.match(text,/THROW/);
  assert.match(text,/low/i);assert.match(text,/overhead/i);assert.match(text,/air attack/i);assert.match(text,/GUARD, a jump, or a reversal/);
  assert.match(text,/numpad/);
});
test('settings input panel shows both keyboard maps, pad status, and remaps by click-and-press',()=>{
  const h=setup({'mvm-onboarded':true});h.click('[data-action="settings"]');
  const cell=(b)=>h.document.querySelector(`[data-bind="${b}"]`);
  assert.equal(cell('p1:light').textContent,'J');assert.equal(cell('p1:block').textContent,'SHIFT');
  assert.equal(cell('p2:light').textContent,'NUM 1');assert.equal(cell('p2:left').textContent,'←');assert.equal(cell('p2:block').textContent,'SPACE');
  assert.match(h.document.querySelector('.pad-status').textContent,/PAD 1 (READY|—) · PAD 2 (READY|—)/);
  cell('p1:light').click();assert.equal(cell('p1:light').textContent,'PRESS A KEY');
  cell('p1:light').dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'f',code:'KeyF',bubbles:true,cancelable:true}));
  assert.equal(cell('p1:light').textContent,'F');
  assert.equal(JSON.parse(h.window.localStorage.getItem('mvm-settings')).keys.p1.light,'KeyF');
  cell('p1:heavy').click();
  cell('p1:heavy').dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'f',code:'KeyF',bubbles:true,cancelable:true}));
  assert.equal(cell('p1:heavy').textContent,'F');assert.equal(cell('p1:light').textContent,'L','the displaced action takes the old key');
  cell('p2:jump').click();cell('p2:jump').dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}));
  assert.equal(cell('p2:jump').textContent,'↑');assert.ok(h.document.querySelector('.modal-layer'),'Escape while listening only cancels');
  h.document.querySelector('[data-reset-keys]').click();assert.equal(cell('p1:light').textContent,'J');
  assert.equal(JSON.parse(h.window.localStorage.getItem('mvm-settings')).keys,undefined);
});
test('custom keys reach combat',async()=>{
  const h=setup({'mvm-onboarded':true,'mvm-settings':{keys:{p1:{light:'KeyF'}}}});
  h.click('[data-mode="duel"]');h.key('Enter');h.key('Enter');h.key('Enter');await h.launch();
  assert.equal(h.latest.settings.keys.p1.light,'KeyF');
});
test('the bonus stage borrows the upcoming arena',async()=>{
  const h=setup({'mvm-onboarded':true});h.click('[data-mode="arcade"]');h.key('Enter');h.key('Enter');await h.launch();
  for(let n=0;n<3;n++){h.end();h.click('[data-action="next-stage"]');if(n<2){h.click('[data-action="fight"]');await h.launch();}}
  assert.equal(h.screen(),'bonus');const bonusArena=h.bonusArena.id;h.finishBonus();h.click('[data-action="fight"]');await h.launch();
  assert.equal(h.latest.arena.id,bonusArena);
});
