import { test } from 'node:test';
import assert from 'node:assert/strict';
import { characters } from '../src/characters.js';
import {
  TOURNAMENT_SIZE, ROUND_NAMES, seededRng, drawEntrants, seedBracket, createTournament,
  simulateCpuMatch, fighterRating, currentMatch, currentOpponent, advanceRound,
  recordPlayerResult, isChampion, isEliminated, isFinalRound, playerFinish,
} from '../src/tournament.js';

const N = characters.length;

test('roster supports a full bracket: player plus seven others', () => {
  assert.ok(N >= TOURNAMENT_SIZE);
});

test('drawEntrants returns 7 unique opponents that never include the player', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const player = seed % N;
    const drawn = drawEntrants(player, N, seededRng(seed));
    assert.equal(drawn.length, 7);
    assert.equal(new Set(drawn).size, 7, 'no repeats');
    assert.ok(!drawn.includes(player), 'never the player');
    for (const i of drawn) assert.ok(Number.isInteger(i) && i >= 0 && i < N);
  }
});

test('draws differ across RNG seeds and cover the whole remaining roster', () => {
  const keys = new Set(), seen = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const drawn = drawEntrants(0, N, seededRng(seed));
    keys.add([...drawn].sort((a, b) => a - b).join(','));
    drawn.forEach((i) => seen.add(i));
  }
  assert.ok(keys.size > 50, `expected varied draws, got ${keys.size} distinct`);
  assert.equal(seen.size, N - 1, 'every other fighter can be drawn');
  assert.ok(!seen.has(0));
  // The same seed reproduces the same draw.
  assert.deepEqual(drawEntrants(4, N, seededRng(99)), drawEntrants(4, N, seededRng(99)));
});

test('drawEntrants refuses a roster too small for a bracket', () => {
  assert.throws(() => drawEntrants(0, 5, seededRng(1)));
});

test('createTournament seeds 8 entrants into 4 quarterfinals containing the player once', () => {
  const t = createTournament({ player: 2, rosterSize: N, rng: seededRng(7) });
  assert.equal(t.entrants.length, 8);
  assert.equal(new Set(t.entrants).size, 8);
  assert.ok(t.entrants.includes(2));
  assert.equal(t.rounds.length, 1);
  assert.equal(t.rounds[0].length, 4);
  const flat = t.rounds[0].flatMap((m) => [m.a, m.b]);
  assert.deepEqual([...flat].sort((a, b) => a - b), [...t.entrants].sort((a, b) => a - b));
  assert.equal(flat.filter((i) => i === 2).length, 1);
  assert.equal(t.status, 'active');
  assert.equal(t.round, 0);
  const m = currentMatch(t);
  assert.ok(m.a === 2 || m.b === 2);
  assert.equal(currentOpponent(t), m.a === 2 ? m.b : m.a);
  assert.throws(() => seedBracket([1, 2, 3]));
});

test('simulateCpuMatch returns a valid winner and a two-round score, weighted by stats', () => {
  const roster = [{ speed: 10, power: 10, reach: 10 }, { speed: 3, power: 3, reach: 3 }];
  const rng = seededRng(3);
  let strongWins = 0;
  for (let i = 0; i < 500; i++) {
    const r = simulateCpuMatch(0, 1, roster, rng);
    assert.ok([0, 1].includes(r.winner));
    assert.notEqual(r.winner, r.loser);
    assert.equal(Math.max(...r.score), 2);
    assert.ok(Math.min(...r.score) <= 1);
    assert.equal(r.score[r.winner === 0 ? 0 : 1], 2);
    if (r.winner === 0) strongWins++;
  }
  assert.ok(strongWins > 350, 'stronger stats win most of the time');
  assert.ok(strongWins < 500, 'but upsets are possible');
  assert.ok(fighterRating(roster[0]) > fighterRating(roster[1]));
});

test('bracket structure runs 4 -> 2 -> 1 and a player who wins every match is champion', () => {
  const rng = seededRng(11);
  let t = createTournament({ player: 0, rosterSize: N, rng });
  const opponents = [];
  const sizes = [t.rounds[0].length];
  for (let round = 0; round < 3; round++) {
    assert.equal(t.round, round);
    assert.equal(isFinalRound(t), round === 2);
    opponents.push(currentOpponent(t));
    const before = JSON.stringify(t);
    const next = recordPlayerResult(t, { won: true, playerRounds: 2, opponentRounds: 1 }, characters, rng);
    assert.equal(JSON.stringify(t), before, 'input tournament is not mutated');
    t = next;
    assert.ok(t.rounds[round].every((m) => m.winner != null), 'whole round decided');
    if (round < 2) sizes.push(t.rounds[round + 1].length);
  }
  assert.deepEqual(sizes, [4, 2, 1]);
  assert.equal(t.rounds.length, ROUND_NAMES.length);
  assert.ok(isChampion(t));
  assert.ok(!isEliminated(t));
  assert.equal(t.champion, 0);
  assert.equal(currentMatch(t), null);
  assert.equal(new Set(opponents).size, 3, 'three different opponents');
  assert.equal(playerFinish(t), 3);
  // Winners of each round are exactly the entrants of the next.
  for (let r = 0; r < 2; r++)
    assert.deepEqual(t.rounds[r].map((m) => m.winner), t.rounds[r + 1].flatMap((m) => [m.a, m.b]));
  // The player's own score is recorded from their side.
  const qf = t.rounds[0].find((m) => m.a === 0 || m.b === 0);
  assert.deepEqual(qf.a === 0 ? qf.score : [...qf.score].reverse(), [2, 1]);
});

test('advancement: after a quarterfinal win the player meets a quarterfinal winner in the semis', () => {
  const rng = seededRng(21);
  let t = createTournament({ player: 5, rosterSize: N, rng });
  t = recordPlayerResult(t, { won: true }, characters, rng);
  assert.equal(t.round, 1);
  assert.equal(t.status, 'active');
  const semiOpp = currentOpponent(t);
  assert.ok(t.rounds[0].some((m) => m.winner === semiOpp));
  assert.notEqual(semiOpp, 5);
  assert.throws(() => advanceRound(t), /not finished/);
});

test('elimination: losing ends the run and the rest of the bracket is played out', () => {
  for (const loseAt of [0, 1, 2]) {
    const rng = seededRng(100 + loseAt);
    let t = createTournament({ player: 1, rosterSize: N, rng });
    for (let r = 0; r < loseAt; r++) t = recordPlayerResult(t, { won: true }, characters, rng);
    const opponent = currentOpponent(t);
    t = recordPlayerResult(t, { won: false }, characters, rng);
    assert.ok(isEliminated(t));
    assert.ok(!isChampion(t));
    assert.equal(currentMatch(t), null);
    assert.equal(currentOpponent(t), null);
    assert.equal(playerFinish(t), loseAt);
    assert.equal(t.rounds.length, 3);
    assert.ok(t.rounds.every((round) => round.every((m) => m.winner != null)));
    assert.notEqual(t.champion, 1);
    assert.ok(t.entrants.includes(t.champion));
    const lostMatch = t.rounds[loseAt].find((m) => m.a === 1 || m.b === 1);
    assert.equal(lostMatch.winner, opponent);
    // Further results are ignored once the run is decided.
    assert.equal(recordPlayerResult(t, { won: true }, characters, rng), t);
  }
});
