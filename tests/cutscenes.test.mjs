import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Window } from 'happy-dom';
import { characters, bodyScale } from '../src/characters.js';
import { arenas } from '../src/arenas.js';
import * as moves from '../src/moves.js';
import * as tournament from '../src/tournament.js';
const { MOVES } = moves;
import { playCutscene, CUTSCENE_KINDS, isCutscenePlaying, fighterQuote } from '../src/cutscenes.js';

function clock() {
  let id = 0, t = 0;
  const q = new Map();
  const timers = {
    setTimeout: (f, ms) => (q.set(++id, { f, at: t + (ms || 0) }), id),
    clearTimeout: (i) => q.delete(i),
    setInterval: (f, ms) => (q.set(++id, { f, at: t + ms, every: ms }), id),
    clearInterval: (i) => q.delete(i),
  };
  return {
    timers, now: () => t, get pending() { return q.size; },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        for (const [k, v] of q) if (v.at <= end && (!next || v.at < next[1].at)) next = [k, v];
        if (!next) break;
        const [k, v] = next;
        t = v.at;
        if (v.every) v.at += v.every; else q.delete(k);
        v.f();
      }
      t = end;
    },
  };
}
function dom() {
  const window = new Window({ url: 'http://localhost:5173' });
  window.document.body.innerHTML = '<div id="app"><button id="under">under</button></div>';
  return { window, document: window.document, body: window.document.body };
}
const styles = (root) => [...root.querySelectorAll('[style]')].map((n) => n.getAttribute('style')).join('\n');
const contexts = {
  intro: { player: 0 },
  ladder: { player: 3, opponent: 1, fighters: characters.map((_, i) => i).filter((i) => i !== 3), arena: 1, mode: 'arcade' },
  tournament: { fighters: ['hataalii', 'urban', 'gauntlet', 'tote', 'vector', 'kinetic', 'glyph', 'zenith'], arena: 'the-foundry', mode: 'tournament' },
  victory: { player: 5, opponent: 19, fighters: [1, 2, 3], arena: 4, mode: 'arcade' },
  defeat: { player: 0, opponent: 7, arena: 'neon-avenue', mode: 'arcade' },
  shadow: { player: 6, opponent: 6, fighters: [1, 2, 3, 6], arena: 'null-vault', mode: 'arcade' },
  bonus: { player: 2, arena: 5, mode: 'arcade' },
  final: { player: 9, opponent: 14, fighters: [9, 14, 1, 2, 3, 4, 5, 6], arena: 'glasshouse', mode: 'tournament' },
  challenger: { player: 3, opponent: 8, fighters: [1, 8, 12, 3], stage: 1, arena: 2, mode: 'arcade' },
  round: { player: 4, opponent: 11, fighters: [4, 2, 11, 7, 1, 13, 5, 9], eliminated: [2, 7, 13, 9], round: 1, roundName: 'SEMIFINALS', arena: 'the-foundry', mode: 'tournament' },
  duel: { player: 1, opponent: 10, arena: 3, mode: 'duel' },
  versus: { player: 6, opponent: 15, arena: 1, mode: 'local' },
  training: { player: 12, opponent: 12, arena: 0, mode: 'training' },
  finish: { player: 2, opponent: 16, arena: 4, mode: 'duel', winner: 'player', playerRounds: 2, opponentRounds: 1 },
};
// The art each kind must visibly use: fighter sheets and the arena background.
const expectedArt = {
  intro: [characters[0].portrait, characters[0].sheet, arenas.find((a) => a.id === 'mirror-garden').background],
  ladder: [characters[3].motionSheet, arenas[1].background, characters[1].portrait],
  tournament: ['hataalii', 'urban', 'gauntlet', 'tote', 'vector', 'kinetic', 'glyph', 'zenith'].map((id) => characters.find((c) => c.id === id).portrait).concat(arenas[3].background),
  victory: [characters[5].motionSheet, arenas[4].background, characters[19].motionSheet],
  defeat: [characters[0].motionSheet, characters[7].combatSheet, arenas[0].background],
  shadow: [characters[6].sheet, arenas.find((a) => a.id === 'null-vault').background],
  bonus: [characters[2].motionSheet, arenas[5].background],
  final: [characters[9].sheet, characters[14].sheet, arenas.find((a) => a.id === 'glasshouse').background],
  challenger: [characters[8].motionSheet, characters[3].portrait, characters[12].portrait, arenas[2].background],
  round: [4, 2, 11, 7, 1, 13, 5, 9].map((i) => characters[i].portrait).concat(characters[4].sheet, characters[11].sheet, arenas[3].background),
  duel: [characters[1].portrait, characters[10].portrait, characters[1].motionSheet, characters[10].motionSheet, arenas[3].background],
  versus: [characters[6].motionSheet, characters[15].motionSheet, arenas[1].background],
  training: [characters[12].sheet, arenas[0].background],
  finish: [characters[2].combatSheet, characters[16].motionSheet, arenas[4].background],
};
// The intro is the studio-style cold open: long enough for every act to land.
const maxLength = (kind) => (kind === 'intro' ? 40000 : 15000);

test('the intro is paced as a cold open, not a flash of cuts', async () => {
  const { body } = dom();
  const c = clock();
  const done = playCutscene('intro', contexts.intro, { container: body, timers: c.timers, now: c.now, sound: false });
  const root = body.querySelector('.cutscene');
  assert.ok(parseFloat(root.style.getPropertyValue('--cs-duration')) >= 30000, 'intro runs at least 30 s');
  // Sample which shot is on screen every 100 ms; no shot may flash by in under a second.
  const spans = [];
  let current = null, since = 0;
  for (let t = 0; t <= 38000; t += 100) {
    c.advance(100);
    const on = [...root.querySelectorAll('.cs-shot.on')].at(-1);
    if (on !== current) {
      if (current) spans.push(t - since);
      current = on;
      since = t;
    }
  }
  assert.ok(spans.length >= 8, `intro has many shots (${spans.length})`);
  assert.ok(Math.min(...spans) >= 1000, `every intro shot holds for at least 1 s (shortest ${Math.min(...spans)} ms)`);
  c.advance(2000);
  await done;
});

for (const kind of CUTSCENE_KINDS) {
  test(`${kind} cutscene renders real art, skips on Escape and cleans up`, async () => {
    const { window, document, body } = dom();
    const c = clock();
    const outsideKeys = [];
    document.addEventListener('keydown', (e) => outsideKeys.push(e.key));
    const done = playCutscene(kind, contexts[kind], { container: body, timers: c.timers, now: c.now, sound: false, reducedMotion: false });
    const root = body.querySelector('.cutscene');
    assert.ok(root, 'cutscene root is mounted');
    assert.equal(root.dataset.kind, kind);
    assert.equal(root.getAttribute('role'), 'dialog');
    assert.ok(isCutscenePlaying());
    assert.equal(document.querySelector('#app').inert, true, 'page underneath is inert');
    c.advance(1500);
    const css = styles(root);
    for (const url of expectedArt[kind]) assert.ok(css.includes(url), `${kind} uses ${url}`);
    assert.ok(root.querySelector('.cs-sprite, .cs-seat-art'), 'animated fighter art present');
    const duration = parseFloat(root.style.getPropertyValue('--cs-duration'));
    assert.ok(duration >= 5000 && duration <= maxLength(kind), `${kind} runs 5-${maxLength(kind) / 1000} s (got ${duration})`);
    // Keys never leak to the game underneath while the scene plays.
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.deepEqual(outsideKeys, []);
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.deepEqual(await done, { kind, skipped: true });
    assert.equal(body.querySelector('.cutscene'), null, 'DOM removed');
    assert.equal(c.pending, 0, 'all timers cleared');
    assert.equal(body.classList.contains('cutscene-open'), false);
    assert.equal(document.querySelector('#app').inert, false, 'inert restored');
    assert.equal(isCutscenePlaying(), false);
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.deepEqual(outsideKeys, ['Enter'], 'key listener removed after cleanup');
  });

  test(`${kind} cutscene plays to completion, shorter with reduced motion`, async () => {
    const lengths = {};
    for (const reducedMotion of [false, true]) {
      const { body } = dom();
      const c = clock();
      const done = playCutscene(kind, contexts[kind], { container: body, timers: c.timers, now: c.now, sound: false, reducedMotion });
      const root = body.querySelector('.cutscene');
      assert.equal(root.classList.contains('cs-reduced'), reducedMotion);
      lengths[reducedMotion] = parseFloat(root.style.getPropertyValue('--cs-duration'));
      let flashed = false, shook = false, impacted = false;
      for (let t = 0; t < lengths[reducedMotion] + 1000; t += 50) {
        c.advance(50);
        flashed ||= Boolean(root.querySelector('.cs-flash.go'));
        shook ||= root.classList.contains('cs-shake') || root.classList.contains('cs-shake-hard');
        impacted ||= root.classList.contains('cs-impact') || root.classList.contains('cs-impact-red');
      }
      assert.deepEqual(await done, { kind, skipped: false });
      assert.equal(body.querySelector('.cutscene'), null);
      assert.equal(c.pending, 0);
      if (reducedMotion) {
        assert.equal(flashed, false, 'no flashes with reduced motion');
        assert.equal(shook, false, 'no shake with reduced motion');
        assert.equal(root.querySelectorAll('.cs-confetti').length, 0, 'no particles with reduced motion');
        assert.equal(root.querySelectorAll('.cs-particles, .cs-shock, .cs-flare').length, 0, 'no weather, shockwaves or flares with reduced motion');
        assert.equal(impacted, false, 'no impact frames with reduced motion');
      } else {
        assert.ok(flashed || shook || impacted, `${kind} has at least one hit beat`);
      }
    }
    assert.ok(lengths.true < lengths.false, 'reduced motion shortens the scene');
    assert.ok(lengths.true >= 3000, 'reduced scene is still readable');
  });
}

test('click / tap, Space, and a fresh gamepad press all skip', async () => {
  {
    const { body } = dom();
    const c = clock();
    const done = playCutscene('victory', contexts.victory, { container: body, timers: c.timers, now: c.now, sound: false });
    body.querySelector('.cs-skip').click();
    assert.equal((await done).skipped, true);
  }
  {
    const { window, document, body } = dom();
    const c = clock();
    const done = playCutscene('defeat', contexts.defeat, { container: body, timers: c.timers, now: c.now, sound: false });
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
    assert.equal((await done).skipped, true);
  }
  {
    const { window, body } = dom();
    const pad = { index: 0, buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
    pad.buttons[0].pressed = true; // held when the scene starts: ignored until released
    Object.defineProperty(window.navigator, 'getGamepads', { value: () => [pad], configurable: true });
    const c = clock();
    let settled = false;
    const done = playCutscene('ladder', contexts.ladder, { container: body, timers: c.timers, now: c.now, sound: false }).then((r) => ((settled = true), r));
    c.advance(200);
    await Promise.resolve();
    assert.equal(settled, false, 'held button does not skip');
    pad.buttons[0].pressed = false;
    c.advance(100);
    pad.buttons[9].pressed = true; // Start
    c.advance(100);
    assert.equal((await done).skipped, true);
    assert.equal(c.pending, 0);
  }
});

test('missing art never blocks a cutscene', async () => {
  const { body } = dom();
  const c = clock();
  const ghost = { ...characters[0], id: 'ghost', sheet: '/missing.png', motionSheet: '/missing.png', combatSheet: '/missing.png', portrait: '/missing.png' };
  const done = playCutscene('victory', { player: ghost, opponent: ghost, arena: { id: 'void', name: 'Void', background: '/missing.webp' } }, { container: body, timers: c.timers, now: c.now, sound: false });
  const arena = body.querySelector('.cs-arena');
  assert.match(arena.getAttribute('style'), /linear-gradient/, 'gradient fallback behind the background');
  c.advance(10000);
  assert.equal((await done).skipped, false);
  assert.deepEqual(await playCutscene('nope', {}, { container: body }), { kind: 'nope', skipped: true });
});

test('tournament accepts 8 fighters (ids or indices), pads short lists, and shows the first match', async () => {
  const { body } = dom();
  const c = clock();
  const done = playCutscene('tournament', { fighters: [4, 'zenith', characters[9]], mode: 'tournament' }, { container: body, timers: c.timers, now: c.now, sound: false });
  const seats = [...body.querySelectorAll('.cs-seat')];
  assert.equal(seats.length, 8);
  assert.deepEqual(seats.slice(0, 3).map((s) => s.dataset.fighter), [characters[4].id, 'zenith', characters[9].id]);
  assert.equal(new Set(seats.map((s) => s.dataset.fighter)).size, 8);
  c.advance(6000);
  assert.equal(body.querySelectorAll('.cs-seat.on').length, 8);
  assert.match(body.querySelector('.cs-caption').textContent, new RegExp(`${characters[4].name} VS ZENITH`));
  c.advance(4000);
  await done;
});

test('victory and defeat use the fighter quote and mode wording', async () => {
  for (const [kind, mode, re, speaker] of [
    ['victory', 'tournament', /TOURNAMENT/, 5],
    ['victory', 'arcade', /SELF/, 5],
    ['defeat', 'tournament', /ELIMINATED/, 7],
    ['defeat', 'arcade', /GAME/, 7],
  ]) {
    const { body } = dom();
    const c = clock();
    const done = playCutscene(kind, { ...contexts[kind], mode }, { container: body, timers: c.timers, now: c.now, sound: false });
    c.advance(4000);
    const copy = body.querySelector('.cs-copy');
    assert.match(copy.querySelector('h2').textContent, re);
    assert.ok(copy.textContent.includes(fighterQuote(characters[speaker])));
    c.advance(6000);
    await done;
  }
});

// main.js wiring: evaluate it like tests/ui.test.mjs, but with a recording playCutscene.
const mainSource = (await readFile(new URL('../src/main.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
function app(saved = {}) {
  const window = new Window({ url: 'http://localhost:5173' });
  window.document.body.innerHTML = '<div id="app"></div>';
  for (const [k, v] of Object.entries(saved)) window.localStorage.setItem(k, JSON.stringify(v));
  const calls = [];
  let pending, latest, bonus;
  const context = vm.createContext({
    window, document: window.document, localStorage: window.localStorage, matchMedia: () => ({ matches: false }),
    characters, bodyScale, arenas, ...moves, ...tournament, console,
    setTimeout: (fn) => ((pending = fn), 1), clearTimeout: () => { pending = null; },
    startBonus: (o) => { bonus = o; return { destroy() {} }; },
    startCombat: async (o) => { latest = o; return { destroy() {} }; },
    playCutscene: (kind, ctx) => { calls.push({ kind, ctx }); return Promise.resolve({ kind, skipped: false }); },
  });
  vm.runInContext(mainSource, context);
  const flush = () => new Promise((r) => setImmediate(r));
  return {
    window, document: window.document, calls, flush,
    click: (s) => window.document.querySelector(s).click(),
    key: (key) => window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })),
    launch: async () => { await pending(); },
    tick: () => pending?.(),
    end: (winner) => latest.onEnd({ winner, playerRounds: winner === 'player' ? 2 : 0, opponentRounds: winner === 'player' ? 0 : 2 }),
    finishBonus: () => bonus.onEnd({ score: 1000, destroyed: 1, skipped: false }),
    screen: () => window.document.body.dataset.screen,
  };
}

test('main.js plays INTRO before the title, LADDER before the first arcade fight, CHALLENGER before each later stage, BONUS before each bonus, SHADOW before the final, VICTORY at the end', async () => {
  const h = app({ 'mvm-onboarded': true });
  assert.equal(h.calls[0].kind, 'intro');
  await h.flush();
  assert.equal(h.screen(), 'title');
  h.click('[data-mode="arcade"]'); h.key('Enter'); h.key('Enter');
  assert.equal(h.calls[1].kind, 'ladder');
  const ladder = h.calls[1].ctx.fighters.length;
  assert.ok(ladder >= 2);
  await h.flush();
  assert.equal(h.screen(), 'versus');
  await h.launch();
  for (let n = 0; n < ladder; n++) {
    h.end('player');
    await h.flush();
    if (/ARCADE COMPLETE/.test(h.document.body.textContent)) break;
    h.click('[data-action="next-stage"]');
    await h.flush();
    if (h.screen() === 'bonus') h.finishBonus();
    await h.flush();
    h.click('[data-action="fight"]');
    await h.flush();
    await h.launch();
  }
  const expected = ['intro', 'ladder'];
  for (let stage = 1; stage < ladder; stage++) {
    if (stage % 3 === 0) expected.push('bonus');
    expected.push(stage === ladder - 1 ? 'shadow' : 'challenger');
  }
  expected.push('victory');
  assert.deepEqual(h.calls.map((c) => c.kind), expected);
  const challengers = h.calls.filter((c) => c.kind === 'challenger');
  assert.deepEqual(challengers.map((c) => c.ctx.stage), Array.from({ length: ladder - 2 }, (_, i) => i + 1), 'one CHALLENGER per middle stage');
  assert.ok(challengers.every((c) => c.ctx.opponent === c.ctx.fighters[c.ctx.stage]), 'CHALLENGER shows the stage opponent');
  assert.equal(h.calls.at(-1).ctx.mode, 'arcade');
  const shadow = h.calls.at(-2).ctx;
  assert.equal(shadow.player, shadow.opponent, 'the shadow is your own fighter');
  assert.ok(h.calls.filter((c) => c.kind === 'bonus').every((c) => c.ctx.player === shadow.player));
  assert.match(h.document.body.textContent, /ARCADE COMPLETE/);
  assert.equal(JSON.parse(h.window.localStorage.getItem('mvm-record')).wins, ladder, 'records counted once');
});

test('main.js plays DEFEAT when the arcade continue runs out, and honours skipCutscenes', async () => {
  const h = app({ 'mvm-onboarded': true });
  await h.flush();
  h.click('[data-mode="arcade"]'); h.key('Enter'); h.key('Enter');
  await h.flush();
  await h.launch();
  h.end('opponent');
  assert.match(h.document.body.textContent, /CONTINUE/);
  for (let i = 0; i < 10; i++) h.tick();
  assert.equal(h.calls.at(-1).kind, 'defeat');
  await h.flush();
  assert.equal(h.screen(), 'title');

  const quiet = app({ 'mvm-onboarded': true, 'mvm-settings': { skipCutscenes: true } });
  assert.equal(quiet.calls.length, 0);
  assert.equal(quiet.screen(), 'title');
});

async function enterTournament(h) {
  await h.flush();
  h.click('[data-mode="tournament"]'); h.key('Enter');
  await h.flush();
  assert.equal(h.screen(), 'bracket');
}

test('main.js plays TOURNAMENT with the eight drawn entrants, ROUND before the semifinal, FINAL before the last match, then VICTORY for the champion', async () => {
  const h = app({ 'mvm-onboarded': true });
  await enterTournament(h);
  const intro = h.calls.at(-1);
  assert.equal(intro.kind, 'tournament');
  assert.equal(intro.ctx.mode, 'tournament');
  assert.equal(new Set(intro.ctx.fighters).size, 8);
  assert.ok(intro.ctx.fighters.includes(intro.ctx.player));
  for (let round = 0; round < 3; round++) {
    h.click('[data-action="fight"]');
    await h.flush();
    await h.launch();
    h.end('player');
    await h.flush();
    if (round < 2) { h.click('[data-action="tournament-bracket"]'); await h.flush(); }
  }
  assert.deepEqual(h.calls.map((c) => c.kind), ['intro', 'tournament', 'round', 'final', 'victory']);
  const round = h.calls[2].ctx;
  assert.equal(round.roundName, 'SEMIFINALS');
  assert.equal(round.eliminated.length, 4, 'four entrants fell in the quarterfinals');
  assert.ok(!round.eliminated.includes(round.player) && !round.eliminated.includes(round.opponent));
  assert.equal(h.calls[3].ctx.mode, 'tournament');
  assert.equal(h.calls[3].ctx.player, intro.ctx.player);
  assert.equal(h.calls[4].ctx.mode, 'tournament');
});

test('main.js plays DEFEAT with tournament wording when the player is eliminated', async () => {
  const h = app({ 'mvm-onboarded': true });
  await enterTournament(h);
  h.click('[data-action="fight"]');
  await h.launch();
  h.end('opponent');
  await h.flush();
  assert.equal(h.calls.at(-1).kind, 'defeat');
  assert.equal(h.calls.at(-1).ctx.mode, 'tournament');
});

test('main.js opens QUICK DUEL with DUEL and closes it with FINISH; a rematch skips the opener', async () => {
  const h = app({ 'mvm-onboarded': true });
  await h.flush();
  h.click('[data-mode="duel"]'); h.key('Enter'); h.key('Enter'); h.key('Enter');
  await h.flush();
  assert.equal(h.calls.at(-1).kind, 'duel');
  assert.equal(h.calls.at(-1).ctx.mode, 'duel');
  assert.equal(h.screen(), 'versus');
  await h.launch();
  h.end('opponent');
  await h.flush();
  const finish = h.calls.at(-1);
  assert.equal(finish.kind, 'finish');
  assert.equal(finish.ctx.winner, 'opponent');
  assert.equal(finish.ctx.opponentRounds, 2);
  assert.equal(h.screen(), 'result');
  assert.equal(JSON.parse(h.window.localStorage.getItem('mvm-record')).matches, 1, 'record counted once, after FINISH');
  h.click('[data-action="rematch"]');
  await h.flush();
  assert.equal(h.calls.at(-1).kind, 'finish', 'rematch goes straight to the fight');
  assert.equal(h.screen(), 'versus');
});

test('main.js opens VERSUS (two players) and TRAINING with their own scenes', async () => {
  const h = app({ 'mvm-onboarded': true });
  await h.flush();
  h.click('[data-mode="local"]'); h.key('Enter'); h.key('Enter'); h.key('Enter');
  await h.flush();
  assert.equal(h.calls.at(-1).kind, 'versus');
  assert.equal(h.calls.at(-1).ctx.mode, 'local');
  await h.launch();
  h.end('opponent');
  await h.flush();
  assert.equal(h.calls.at(-1).kind, 'finish');
  assert.equal(h.calls.at(-1).ctx.mode, 'local');
  assert.match(h.document.body.textContent, /PLAYER TWO WINS/);

  const t = app({ 'mvm-onboarded': true });
  await t.flush();
  t.click('[data-mode="training"]'); t.key('Enter'); t.key('Enter'); t.key('Enter');
  await t.flush();
  assert.equal(t.calls.at(-1).kind, 'training');
  await t.launch();
  t.end('player');
  await t.flush();
  assert.equal(t.calls.at(-1).kind, 'training', 'training results go straight to the result screen');
});

test('challenger shows the dossier and ladder progress; round drops the eliminated tiles', async () => {
  {
    const { body } = dom();
    const c = clock();
    const done = playCutscene('challenger', contexts.challenger, { container: body, timers: c.timers, now: c.now, sound: false });
    c.advance(5000);
    assert.match(body.querySelector('.cs-dossier h2').textContent, new RegExp(characters[8].name));
    const pips = [...body.querySelectorAll('.cs-pips li')];
    assert.equal(pips.length, 4);
    assert.deepEqual(pips.map((p) => p.className), ['cleared', 'current', '', 'shadow']);
    c.advance(8000);
    await done;
  }
  {
    const { body } = dom();
    const c = clock();
    const done = playCutscene('round', contexts.round, { container: body, timers: c.timers, now: c.now, sound: false });
    c.advance(4000);
    const out = [...body.querySelectorAll('.cs-tile.out')].map((t) => t.dataset.fighter);
    assert.deepEqual(out.sort(), [2, 7, 13, 9].map((i) => characters[i].id).sort());
    c.advance(9000);
    await done;
  }
});

test('finish names the winner, the score and the winner quote for both modes', async () => {
  for (const [ctx, label, speaker] of [
    [contexts.finish, /YOU WIN ·/, 2],
    [{ ...contexts.finish, mode: 'local', winner: 'opponent', playerRounds: 1, opponentRounds: 2 }, /PLAYER TWO WINS/, 16],
  ]) {
    const { body } = dom();
    const c = clock();
    const done = playCutscene('finish', ctx, { container: body, timers: c.timers, now: c.now, sound: false });
    c.advance(6000);
    const copy = body.querySelector('.cs-copy');
    assert.match(copy.querySelector('.cs-eyebrow').textContent, label);
    assert.equal(copy.querySelector('.cs-score').textContent, '21');
    assert.match(copy.querySelector('h2').textContent, new RegExp(characters[speaker].name));
    assert.ok(copy.textContent.includes(fighterQuote(characters[speaker])));
    c.advance(6000);
    await done;
  }
});
