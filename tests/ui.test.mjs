import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Window } from 'happy-dom';
import { characters } from '../src/characters.js';
import { arenas } from '../src/arenas.js';

const source=(await readFile(new URL('../src/main.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
function setup(saved={}) {
  const window=new Window({url:'http://localhost:5173'});
  window.document.body.innerHTML='<div id="app"></div>';
  for(const [key,value] of Object.entries(saved))window.localStorage.setItem(key,JSON.stringify(value));
  let pending, latest, destroys=0;
  const context=vm.createContext({window,document:window.document,localStorage:window.localStorage,
    matchMedia:()=>({matches:false}),characters,arenas,console,
    setTimeout:fn=>(pending=fn,1),clearTimeout:()=>{pending=null;},
    startCombat:async options=>{latest=options;return {destroy(){destroys++;}};}});
  vm.runInContext(source,context);
  const click=selector=>{const el=window.document.querySelector(selector);assert.ok(el,`Missing ${selector}`);el.click();};
  const key=key=>window.document.dispatchEvent(new window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
  return {window,document:window.document,click,key,get latest(){return latest;},get destroys(){return destroys;},
    async launch(){assert.ok(pending,'Expected pending versus transition');await pending();},
    end(winner='player'){latest.onEnd({winner,playerRounds:winner==='player'?2:0,opponentRounds:winner==='player'?0:2});},
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
  for(let n=0;n<10;n++){faced.push(h.latest.opponent.id);h.end();if(n<9){h.click('[data-action="next-stage"]');await h.launch();}}
  assert.equal(new Set(faced).size,10);assert.ok(!faced.includes(characters[0].id));assert.match(h.document.body.textContent,/ARCADE COMPLETE/);assert.equal(JSON.parse(h.window.localStorage.getItem('mvm-record')).wins,10);
});
test('changing fighters after progressing arcade resets the ladder stage',async()=>{
  const h=setup({'mvm-onboarded':true});h.click('[data-mode="arcade"]');h.key('Enter');h.key('Enter');await h.launch();h.end();h.click('[data-action="next-stage"]');await h.launch();h.end();
  h.click('[data-action="change-fighters"]');h.key('ArrowRight');h.key('Enter');assert.match(h.document.querySelector('.mode-info').textContent,/STAGE 1 OF 10/);
});
