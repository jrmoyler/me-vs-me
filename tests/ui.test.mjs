import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Window } from 'happy-dom';
import { characters } from '../src/characters.js';
import { arenas } from '../src/arenas.js';
import { MOVES } from '../src/moves.js';

const source=(await readFile(new URL('../src/main.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
function setup(saved={}) {
  const window=new Window({url:'http://localhost:5173'});
  window.document.body.innerHTML='<div id="app"></div>';
  for(const [key,value] of Object.entries(saved))window.localStorage.setItem(key,JSON.stringify(value));
  let pending, latest, bonusLatest, bonuses=0, destroys=0;
  const context=vm.createContext({window,document:window.document,localStorage:window.localStorage,
    matchMedia:()=>({matches:false}),characters,arenas,MOVES,console,
    setTimeout:fn=>(pending=fn,1),clearTimeout:()=>{pending=null;},
    startBonus:options=>{bonuses++;bonusLatest=options;return {destroy(){}};},
    startCombat:async options=>{latest=options;return {destroy(){destroys++;}};}});
  vm.runInContext(source,context);
  const click=selector=>{const el=window.document.querySelector(selector);assert.ok(el,`Missing ${selector}`);el.click();};
  const key=key=>window.document.dispatchEvent(new window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
  return {window,document:window.document,click,key,get latest(){return latest;},get destroys(){return destroys;},get bonuses(){return bonuses;},
    async launch(){assert.ok(pending,'Expected pending versus transition');await pending();},
    end(winner='player'){latest.onEnd({winner,playerRounds:winner==='player'?2:0,opponentRounds:winner==='player'?0:2});},
    finishBonus(){assert.ok(bonusLatest);bonusLatest.onEnd({score:1000,destroyed:1,skipped:false});},
    screen:()=>window.document.body.dataset.screen};
}
test('first visit onboarding, 11 keyboard-selectable fighters, 5 arenas, duel and rematch',async()=>{
  const h=setup();h.click('[data-mode="duel"]');assert.ok(h.document.querySelector('[role="dialog"]'));
  h.click('.modal-done');assert.equal(h.screen(),'selection');assert.equal(h.document.querySelectorAll('.roster-fighter').length,11);
  assert.equal(h.window.localStorage.getItem('mvm-onboarded'),'true');
  h.key('ArrowRight');assert.equal(h.document.querySelector('.roster-fighter.selected').dataset.index,'1');h.key('Enter');
  h.click('[data-action="mirror"]');h.key('Enter');assert.equal(h.screen(),'arena');assert.equal(h.document.querySelectorAll('.arena-option').length,5);
  h.click('[data-action="arena"][data-index="4"]');h.key('Enter');assert.equal(h.screen(),'versus');await h.launch();
  assert.equal(h.latest.player.id,characters[1].id);assert.equal(h.latest.opponent.id,characters[1].id);assert.equal(h.latest.arena.id,arenas[4].id);
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
test('arcade faces each of the ten other selves then completes',async()=>{
  const h=setup({'mvm-onboarded':true});h.click('[data-mode="arcade"]');h.key('Enter');h.key('Enter');await h.launch();
  const faced=[];
  for(let n=0;n<10;n++){faced.push(h.latest.opponent.id);h.end();if(n<9){h.click('[data-action="next-stage"]');if(h.screen()==='bonus')h.finishBonus();assert.equal(h.screen(),'route');h.click('[data-action="fight"]');await h.launch();}}
  assert.equal(h.bonuses,3);assert.equal(new Set(faced).size,10);assert.ok(!faced.includes(characters[0].id));assert.match(h.document.body.textContent,/ARCADE COMPLETE/);assert.equal(JSON.parse(h.window.localStorage.getItem('mvm-record')).wins,10);
});
test('changing fighters after progressing arcade resets the ladder stage',async()=>{
  const h=setup({'mvm-onboarded':true});h.click('[data-mode="arcade"]');h.key('Enter');h.key('Enter');await h.launch();h.end();h.click('[data-action="next-stage"]');if(h.screen()==='bonus')h.finishBonus();assert.equal(h.screen(),'route');h.click('[data-action="fight"]');await h.launch();h.end();
  h.click('[data-action="change-fighters"]');h.key('ArrowRight');h.key('Enter');assert.match(h.document.querySelector('.mode-info').textContent,/STAGE 1 OF 10/);
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

test('all eleven fighters expose seven animated moves including their named power',()=>{
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
