// Result-screen summary: stat tiles and a letter grade computed from combat's match stats.
// Pure data in, pure data out, so node tests can pin the grading without a DOM.

export const GRADES = [
  [90, "S"],
  [75, "A"],
  [55, "B"],
  [35, "C"],
  [0, "D"],
];

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// 0–100 performance score. Winning dominates; clean rounds, combos, damage per round and
// guarding add to it; damage taken per round takes away. Deterministic for the same stats.
export function matchScore({ won = false, stats = {}, playerRounds = 0, opponentRounds = 0 } = {}) {
  const rounds = Math.max(1, num(playerRounds) + num(opponentRounds));
  const dealt = num(stats.damageDealt) / rounds,
    taken = num(stats.damageTaken) / rounds;
  let score = won ? 45 : 20;
  if (won && num(opponentRounds) === 0) score += 10; // straight rounds
  score += Math.min(2, num(playerRounds)) * 2;
  score += Math.min(15, Math.max(0, num(stats.maxCombo) - 1) * 3);
  score += Math.min(20, dealt / 5);
  score -= Math.min(20, taken / 5);
  score += Math.min(6, num(stats.blocked));
  score += Math.min(6, (num(stats.specials) + num(stats.throws)) * 2);
  if (won && num(stats.damageTaken) === 0 && num(stats.damageDealt) > 0) score += 10; // untouched
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function gradeFor(score) {
  return GRADES.find(([floor]) => num(score) >= floor)[1];
}

export function matchGrade(result = {}) {
  const score = matchScore(result);
  return { score, grade: gradeFor(score) };
}

// The six tiles the result screen prints, in order.
export function statTiles(stats = {}) {
  return [
    ["hits", "STRIKES LANDED", num(stats.hits)],
    ["maxCombo", "BEST COMBO", num(stats.maxCombo)],
    ["damageDealt", "DAMAGE DEALT", Math.round(num(stats.damageDealt))],
    ["damageTaken", "DAMAGE TAKEN", Math.round(num(stats.damageTaken))],
    ["specials", "POWERS USED", num(stats.specials)],
    ["blocked", "HITS BLOCKED", num(stats.blocked)],
  ];
}

