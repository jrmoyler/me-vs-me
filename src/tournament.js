// Tournament mode: pure, DOM-free bracket logic for an 8-entrant single-elimination event.
//
// Entrants and results are character *indices* into the roster array (src/characters.js).
// Every function that needs randomness takes an injectable `rng` (a () => [0, 1) function,
// Math.random by default) so tests can drive the bracket deterministically.
//
// Shape of a tournament object:
//   {
//     player: 3,                       // the human's roster index
//     entrants: [3, 17, 8, ...],       // 8 roster indices in bracket (seed) order
//     rounds: [                        // rounds[0] = quarterfinals (4), [1] = semis (2), [2] = final (1)
//       [{ a: 3, b: 17, winner: null, score: null }, ...],
//     ],
//     round: 0,                        // index of the round being played (last round once decided)
//     status: "active" | "champion" | "eliminated",
//     champion: null | index,          // set once the final is decided
//   }

export const TOURNAMENT_SIZE = 8;
export const ROUND_NAMES = ["QUARTERFINALS", "SEMIFINALS", "FINAL"];
export const ROUND_SHORT = ["QF", "SF", "F"];

/** Small seedable PRNG (mulberry32) for deterministic tests and replays. */
export function seededRng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Draw the other seven entrants: unique, never the player, freshly random on every call.
 * `rosterSize` is the number of fighters (characters.length).
 */
export function drawEntrants(player, rosterSize, rng = Math.random, count = TOURNAMENT_SIZE - 1) {
  const pool = [];
  for (let i = 0; i < rosterSize; i++) if (i !== player) pool.push(i);
  if (pool.length < count)
    throw new Error(`Tournament needs ${count} opponents; roster only has ${pool.length}.`);
  return shuffle(pool, rng).slice(0, count);
}

/** Seed the eight entrants into a random bracket order and build the quarterfinal pairings. */
export function seedBracket(entrants, rng = Math.random) {
  if (entrants.length !== TOURNAMENT_SIZE)
    throw new Error(`A bracket needs exactly ${TOURNAMENT_SIZE} entrants.`);
  const order = shuffle(entrants, rng);
  return { entrants: order, quarterfinals: pairUp(order) };
}

function pairUp(list) {
  const matches = [];
  for (let i = 0; i < list.length; i += 2)
    matches.push({ a: list[i], b: list[i + 1], winner: null, score: null });
  return matches;
}

/** Fresh tournament for `player`, drawing seven random opponents from the roster. */
export function createTournament({ player, rosterSize, rng = Math.random }) {
  const opponents = drawEntrants(player, rosterSize, rng);
  const { entrants, quarterfinals } = seedBracket([player, ...opponents], rng);
  return { player, entrants, rounds: [quarterfinals], round: 0, status: "active", champion: null };
}

/** Rating from the roster's 1–10 stats; power counts slightly more than reach. */
export function fighterRating(c = {}) {
  const stat = (v) => (Number.isFinite(Number(v)) ? Number(v) : 6);
  return stat(c.speed) * 1.0 + stat(c.power) * 1.1 + stat(c.reach) * 0.9;
}

/**
 * Resolve a CPU-vs-CPU match. Stats weight the odds through a logistic curve,
 * clamped so any entrant can pull an upset. Returns { winner, loser, score:[a,b] }.
 */
export function simulateCpuMatch(a, b, roster, rng = Math.random) {
  const diff = fighterRating(roster[a]) - fighterRating(roster[b]);
  const pA = Math.min(0.85, Math.max(0.15, 1 / (1 + Math.exp(-diff / 3))));
  const aWins = rng() < pA;
  // Two rounds win; the loser takes a round about a third of the time.
  const loserRounds = rng() < 0.35 ? 1 : 0;
  return {
    winner: aWins ? a : b,
    loser: aWins ? b : a,
    score: aWins ? [2, loserRounds] : [loserRounds, 2],
  };
}

const clone = (t) => ({
  ...t,
  entrants: [...t.entrants],
  rounds: t.rounds.map((r) => r.map((m) => ({ ...m, score: m.score ? [...m.score] : null }))),
});

const hasPlayer = (m, player) => m.a === player || m.b === player;

/** The player's match in the current round, or null once the tournament is decided. */
export function currentMatch(t) {
  if (t.status !== "active") return null;
  return t.rounds[t.round]?.find((m) => hasPlayer(m, t.player)) ?? null;
}

/** Roster index of the player's next opponent, or null. */
export function currentOpponent(t) {
  const m = currentMatch(t);
  if (!m) return null;
  return m.a === t.player ? m.b : m.a;
}

export const isChampion = (t) => t.status === "champion";
export const isEliminated = (t) => t.status === "eliminated";
export const isFinalRound = (t) => t.round === ROUND_NAMES.length - 1;
export const roundName = (r) => ROUND_NAMES[r] ?? `ROUND ${r + 1}`;

function simulateOpenMatches(round, roster, rng, player) {
  for (const m of round) {
    if (m.winner != null || hasPlayer(m, player)) continue;
    const r = simulateCpuMatch(m.a, m.b, roster, rng);
    m.winner = r.winner;
    m.score = r.score;
  }
}

/** Build the next round from the winners of the current one (current round must be decided). */
export function advanceRound(t) {
  const next = clone(t);
  const current = next.rounds[next.round];
  if (current.some((m) => m.winner == null)) throw new Error("Current round is not finished.");
  if (current.length === 1) {
    next.champion = current[0].winner;
    next.status = next.champion === next.player ? "champion" : "eliminated";
    return next;
  }
  next.rounds.push(pairUp(current.map((m) => m.winner)));
  next.round++;
  return next;
}

/**
 * Record the player's result in the current round, simulate the round's CPU matches,
 * then advance. On a loss the rest of the bracket is simulated so a champion is crowned.
 * Returns a new tournament object; the input is not mutated.
 */
export function recordPlayerResult(t, { won, playerRounds, opponentRounds } = {}, roster, rng = Math.random) {
  if (t.status !== "active") return t;
  let next = clone(t);
  const match = currentMatch(next);
  const opponent = match.a === next.player ? match.b : match.a;
  match.winner = won ? next.player : opponent;
  const pr = playerRounds ?? (won ? 2 : 0),
    or = opponentRounds ?? (won ? 0 : 2);
  match.score = match.a === next.player ? [pr, or] : [or, pr];
  simulateOpenMatches(next.rounds[next.round], roster, rng, next.player);
  next = advanceRound(next);
  if (!won) {
    next.status = "eliminated";
    // Play out the remainder so the bracket shows who took the title.
    while (next.champion == null) {
      simulateOpenMatches(next.rounds[next.round], roster, rng, -1);
      next = advanceRound(next);
    }
    next.status = "eliminated";
  }
  return next;
}

/** How far the player got: the index of the round they were knocked out in (or 3 = champion). */
export function playerFinish(t) {
  if (isChampion(t)) return ROUND_NAMES.length;
  const lost = t.rounds.findIndex((r) => r.some((m) => hasPlayer(m, t.player) && m.winner != null && m.winner !== t.player));
  return lost === -1 ? t.round : lost;
}
