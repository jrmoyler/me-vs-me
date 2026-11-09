// The Konami code wired into the menus (src/main.js + src/konami.js), run in happy-dom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Window } from 'happy-dom';
import { characters, bodyScale } from '../src/characters.js';
import { arenas } from '../src/arenas.js';
import * as moves from '../src/moves.js';
import * as tournament from '../src/tournament.js';
import * as matchStats from '../src/match-stats.js';
import * as konami from '../src/konami.js';

const source = (await readFile(new URL('../src/main.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
const CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setup(saved = {}) {
  const window = new Window({ url: 'http://localhost:5173' });
  window.requestAnimationFrame = () => 0; // no pad polling loop in tests
  window.document.body.innerHTML = '<div id="app"></div>';
  for (const [key, value] of Object.entries(saved)) window.localStorage.setItem(key, JSON.stringify(value));
  let pending = null, latest;
  const context = vm.createContext({
    window, document: window.document, localStorage: window.localStorage, KeyboardEvent: window.KeyboardEvent,
    matchMedia: () => ({ matches: false }), characters, bodyScale, arenas, ...moves, ...tournament, ...matchStats, ...konami, console,
    setTimeout: (fn) => ((pending = fn), 1), clearTimeout: () => { pending = null; },
    startBonus: () => ({ destroy() {} }),
    startCombat: async (options) => { latest = options; return { destroy() {} }; },
    registerPWA() {}, installState: () => 'none', onInstallChange() {}, promptInstall: async () => 'dismissed',
  });
  vm.runInContext(source, context);
  const document = window.document;
  const $ = (s) => document.querySelector(s);
  const click = (s) => { const el = $(s); assert.ok(el, `Missing ${s}`); el.click(); };
  const key = (k) => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  return {
    window, document, $, click, key,
    code: () => CODE.forEach(key),
    stored: (k) => JSON.parse(window.localStorage.getItem(k)),
    get pending() { return pending; },
    get latest() { return latest; },
    async launch() { assert.ok(pending, 'Expected pending versus transition'); await pending(); },
    end(winner = 'player', extra = {}) {
      latest.onEnd({ winner, playerRounds: winner === 'player' ? 2 : 0, opponentRounds: winner === 'player' ? 0 : 2, ...extra });
    },
    screen: () => document.body.dataset.screen,
  };
}

test('the code on the title screen unlocks the cheats, lights the pips and celebrates', async () => {
  const h = setup({ 'mvm-onboarded': true });
  assert.equal(h.screen(), 'title');
  assert.equal(h.$('.cheat-badge'), null, 'no badge while locked');
  assert.equal(h.$('.konami-pips.on'), null, 'pips hidden at zero');
  CODE.slice(0, 3).forEach(h.key);
  assert.ok(h.$('.konami-pips.on'));
  assert.equal(h.document.querySelectorAll('.konami-pips i.lit').length, 3);
  CODE.slice(3).forEach(h.key);
  assert.equal(h.stored('mvm-konami').unlocked, true);
  const overlay = h.$('.konami-overlay');
  assert.ok(overlay && !overlay.classList.contains('toast'));
  assert.match(overlay.textContent, /KONAMI CODE/);
  assert.match(overlay.textContent, /CHEATS UNLOCKED/);
  for (const { name } of konami.CHEATS) assert.match(overlay.textContent, new RegExp(name));
  assert.equal(h.screen(), 'title', 'the final A never starts a match');
  assert.ok(h.$('.cheat-badge'), 'title badge once unlocked');
  assert.match(h.$('.cheat-badge').textContent, /0\s*CHEATS ON/);
  // presses in the first moment are swallowed without closing; later any key closes it
  h.key('Enter');
  assert.ok(h.$('.konami-overlay'));
  assert.equal(h.screen(), 'title');
  await sleep(380);
  h.key('Enter');
  assert.equal(h.$('.konami-overlay'), null);
  assert.equal(h.screen(), 'title', 'the dismissing key does not reach the menu');
  // again: a short toast instead of the celebration
  h.code();
  assert.ok(h.$('.konami-overlay.toast'));
  assert.match(h.$('.konami-overlay.toast').textContent, /ALREADY UNLOCKED/);
  assert.match(h.$('.konami-overlay.toast').textContent, /SETTINGS → CHEATS/);
  h.pending();
  assert.equal(h.$('.konami-overlay'), null, 'toast auto-dismisses');
});

test('the celebration auto-dismisses and works on other menus', () => {
  const h = setup({ 'mvm-onboarded': true });
  h.click('[data-mode="duel"]');
  assert.equal(h.screen(), 'selection');
  h.code();
  assert.equal(h.stored('mvm-konami').unlocked, true);
  assert.ok(h.$('.konami-overlay'));
  h.pending();
  assert.equal(h.$('.konami-overlay'), null);
});

test('the code is ignored during a fight', async () => {
  const h = setup({ 'mvm-onboarded': true });
  h.click('[data-mode="duel"]'); h.key('Enter'); h.key('Enter');
  h.key('Enter'); // arena → versus
  assert.equal(h.screen(), 'versus');
  h.code();
  await h.launch();
  assert.equal(h.screen(), 'combat');
  h.code();
  assert.equal(h.window.localStorage.getItem('mvm-konami'), null);
  assert.equal(h.$('.konami-overlay'), null);
});

test('settings show a CHEATS section only when unlocked, and its toggles persist', () => {
  const locked = setup({ 'mvm-onboarded': true });
  locked.click('[data-action="settings"]');
  assert.equal(locked.$('.cheats-panel'), null);
  assert.doesNotMatch(locked.$('.arcade-modal').textContent, /CHEAT|KONAMI|↑↑/);

  const h = setup({ 'mvm-onboarded': true, 'mvm-konami': { unlocked: true } });
  h.click('[data-action="settings"]');
  const toggles = h.document.querySelectorAll('.cheats-panel .setting-row .toggle[data-cheat]');
  assert.equal(toggles.length, konami.CHEATS.length);
  for (const { name, blurb } of konami.CHEATS) {
    assert.match(h.$('.cheats-panel').textContent, new RegExp(name));
    assert.ok(h.$('.cheats-panel').textContent.includes(blurb));
  }
  h.click('[data-cheat="turbo"]');
  assert.equal(h.$('[data-cheat="turbo"]').getAttribute('aria-pressed'), 'true');
  assert.equal(h.$('[data-cheat="turbo"]').textContent, 'ON');
  assert.equal(h.stored('mvm-konami').turbo, true);
  h.click('[data-cheat="bigHead"]');
  h.click('.modal-done');
  assert.match(h.$('.cheat-badge').textContent, /2\s*CHEATS ON/);
  assert.equal(h.stored('mvm-settings').cheats, undefined, 'cheats never land in mvm-settings');
  // LOCK CHEATS resets everything and hides the section again
  h.click('[data-action="settings"]');
  h.click('[data-lock-cheats]');
  assert.equal(h.$('.cheats-panel'), null);
  assert.deepEqual(h.stored('mvm-konami'), konami.defaultCheats());
  h.click('.modal-done');
  assert.equal(h.$('.cheat-badge'), null);
});

test('unlocking with settings open adds the CHEATS section in place', () => {
  const h = setup({ 'mvm-onboarded': true });
  h.click('[data-action="settings"]');
  h.code();
  assert.ok(h.$('.modal-layer .cheats-panel'));
});

test('startCombat receives settings.cheats', async () => {
  const h = setup({ 'mvm-onboarded': true, 'mvm-konami': { unlocked: true, turbo: true, crt: true } });
  h.click('[data-mode="training"]'); h.key('Enter'); h.key('Enter'); h.key('Enter');
  await h.launch();
  const { cheats } = h.latest.settings;
  assert.equal(cheats.unlocked, true);
  assert.equal(cheats.turbo, true);
  assert.equal(cheats.crt, true);
  assert.equal(cheats.meter, false);
  assert.equal(h.latest.settings.difficulty, 'normal', 'the regular settings still pass through');
});

test('30 CONTINUES: the arcade continue timer never runs out', async () => {
  const plain = setup({ 'mvm-onboarded': true });
  plain.click('[data-mode="arcade"]'); plain.key('Enter'); plain.key('Enter'); await plain.launch();
  plain.end('opponent');
  assert.equal(plain.$('.continue-seconds').textContent, '10');
  assert.ok(plain.pending, 'a normal continue counts down');
  plain.pending();
  assert.equal(plain.$('.continue-seconds').textContent, '9');

  const h = setup({ 'mvm-onboarded': true, 'mvm-konami': { unlocked: true, lives30: true } });
  h.click('[data-mode="arcade"]'); h.key('Enter'); h.key('Enter'); await h.launch();
  h.end('opponent', { cheats: ['lives30'] });
  assert.equal(h.screen(), 'result');
  assert.equal(h.$('.continue-seconds').textContent, '∞');
  assert.match(h.$('.continue-prompt').textContent, /30 CONTINUES/);
  assert.equal(h.pending, null, 'no countdown is scheduled');
  h.click('[data-action="rematch"]');
  await h.launch();
  assert.equal(h.screen(), 'combat', 'continuing still works');
});

test('a cheated result is marked and never changes the record', async () => {
  const h = setup({ 'mvm-onboarded': true, 'mvm-record': { wins: 4, matches: 6, streak: 2, best: 3 } });
  h.click('[data-mode="duel"]'); h.key('Enter'); h.key('Enter'); h.key('Enter'); await h.launch();
  h.end('player', { cheats: ['turbo', 'bigHead'] });
  assert.equal(h.screen(), 'result');
  const line = h.$('.cheat-line');
  assert.ok(line);
  assert.match(line.textContent, /CHEATS: TURBO · BIG HEAD/);
  assert.match(line.textContent, /RECORD NOT SAVED/);
  assert.deepEqual(h.stored('mvm-record'), { wins: 4, matches: 6, streak: 2, best: 3 });
  // the same fight without cheats counts as usual
  h.click('[data-action="rematch"]'); await h.launch();
  h.end('player');
  assert.equal(h.$('.cheat-line'), null);
  assert.equal(h.stored('mvm-record').wins, 5);
});

test('pad-driven menu keys never count toward the code twice', () => {
  const h = setup({ 'mvm-onboarded': true });
  // the menu pad poller dispatches repeat-flagged keydowns; only the pad reader itself feeds the code
  for (const k of CODE) h.document.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: k, repeat: true, bubbles: true, cancelable: true }));
  assert.equal(h.window.localStorage.getItem('mvm-konami'), null);
  assert.match(source, /repeat: true/);
});
