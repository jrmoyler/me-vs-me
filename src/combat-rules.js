import { POWERS } from "./moves.js";
export const SPECIAL_COST = 35;
// Combo system constants. Hitstun is generous enough for cancels, never for links.
export const JUGGLE_LIMIT = 1;
export const KNOCKDOWN_TIME = 0.75;
export const LAUNCH_POP = 220;
export const COUNTER_DAMAGE = 1.25;
export const COUNTER_HITSTUN = 0.08;
const stat = (value) => Math.max(1, Math.min(10, Number(value) || 5));

// Frame data shared by every fighter. Startup is raised to 43% of duration at build time.
export const MOVE_TABLE = Object.freeze({
  light: {
    damage: 7,
    reach: 110,
    start: 0.09,
    active: 0.14,
    duration: 0.34,
    tier: 1,
    family: "punch",
    hitstun: 0.36,
    blockstun: 0.24,
    knockback: { hit: 18, block: 14 },
  },
  medium: {
    damage: 10,
    reach: 121,
    start: 0.16,
    active: 0.14,
    duration: 0.46,
    tier: 2,
    family: "punch",
    hitstun: 0.4,
    blockstun: 0.28,
    knockback: { hit: 20, block: 16 },
  },
  heavy: {
    damage: 13,
    reach: 135,
    start: 0.2,
    active: 0.15,
    duration: 0.59,
    tier: 3,
    family: "punch",
    hitstun: 0.46,
    blockstun: 0.32,
    knockback: { hit: 24, block: 19 },
    launch: 420,
  },
  kick: {
    damage: 8,
    reach: 129,
    start: 0.12,
    active: 0.14,
    duration: 0.39,
    tier: 1,
    family: "kick",
    hitstun: 0.38,
    blockstun: 0.24,
    knockback: { hit: 18, block: 14 },
  },
  mediumKick: {
    damage: 11,
    reach: 143,
    start: 0.18,
    active: 0.15,
    duration: 0.51,
    tier: 2,
    family: "kick",
    hitstun: 0.42,
    blockstun: 0.3,
    knockback: { hit: 22, block: 18 },
  },
  heavyKick: {
    damage: 15,
    reach: 158,
    start: 0.24,
    active: 0.16,
    duration: 0.67,
    tier: 3,
    family: "kick",
    hitstun: 0.48,
    blockstun: 0.34,
    knockback: { hit: 26, block: 21 },
    launch: 420,
  },
  special: {
    damage: 22,
    reach: 220,
    start: 0.23,
    active: 0.23,
    duration: 0.86,
    tier: 4,
    family: "special",
    hitstun: 0.55,
    blockstun: 0.4,
    knockback: { hit: 35, block: 28 },
    knockdown: true,
  },
});

export function freshFighterState() {
  return {
    attack: null,
    cooldown: 0,
    stun: 0,
    blockstun: 0,
    launched: false,
    juggles: 0,
    down: 0,
    comboHits: 0,
    combo: 0,
    comboDisplay: 0,
    comboFlash: 0,
  };
}

export const comboScale = (hitsBefore) => Math.max(0.5, 1 - 0.1 * hitsBefore);
export const hitstunDecay = (hitsBefore) => Math.max(0.75, 1 - 0.04 * hitsBefore);

export function specialVariant(character) {
  if (POWERS[character.id]) return POWERS[character.id].variant;
  const identity = `${character.id} ${character.name} ${character.move}`;
  if (/gauntlet|blast|hataalii/i.test(identity)) return 3;
  if (/kick|sweep/i.test(identity)) return 2;
  if (/shoulder|elbow/i.test(identity)) return 1;
  return (
    [...String(character.id || character.name)].reduce(
      (n, c) => n + c.charCodeAt(0),
      0,
    ) % 4
  );
}

function buildMove(fighter, type) {
  const base = MOVE_TABLE[type];
  if (!base) return null;
  const variant = specialVariant(fighter.c);
  const move = {
    ...base,
    knockback: { ...base.knockback },
    type,
    t: 0,
    hit: false,
    landed: null,
    variant,
  };
  if (type === "special") {
    Object.assign(
      move,
      [
        { damage: 22, reach: 225, start: 0.23 },
        { damage: 24, reach: 125, start: 0.18 },
        { damage: 20, reach: 155, start: 0.15 },
        { damage: 19, reach: 280, start: 0.32 },
      ][variant],
    );
    if (POWERS[fighter.c.id]) Object.assign(move, POWERS[fighter.c.id]);
  }
  move.start = Math.max(move.start, move.duration * 0.43);
  return move;
}

export function createAttack(fighter, type) {
  if (
    fighter.attack ||
    fighter.cooldown > 0 ||
    fighter.stun > 0 ||
    fighter.blockstun > 0 ||
    fighter.down > 0 ||
    fighter.launched ||
    fighter.guard
  )
    return null;
  if (type === "special" && fighter.energy < SPECIAL_COST) return null;
  return buildMove(fighter, type);
}

// A landed normal may be cancelled into a stronger normal or, on hit, the power.
export function canCancel(current, nextType) {
  const next = MOVE_TABLE[nextType];
  if (!current || !next || !current.landed) return false;
  if (current.t >= current.duration) return false;
  if (nextType === current.type || current.type === "special") return false;
  if (nextType === "special") return current.landed === "hit";
  if (next.family === current.family) return next.tier > current.tier;
  if (current.family === "punch" && next.family === "kick")
    return next.tier >= current.tier;
  return false;
}

export function cancelAttack(fighter, type) {
  if (!canCancel(fighter.attack, type)) return null;
  if (fighter.stun > 0 || fighter.down > 0 || fighter.launched) return null;
  if (type === "special" && fighter.energy < SPECIAL_COST) return null;
  return buildMove(fighter, type);
}

export function canBeHit(target) {
  if (target.down > 0) return false;
  if (target.launched && target.juggles >= JUGGLE_LIMIT) return false;
  return true;
}

export function inMeleeRange(attacker, target, move) {
  if (move.type === "special" && move.variant === 3) return false;
  const dx = target.x - attacker.x;
  return (
    dx * attacker.face >= 0 &&
    Math.abs(dx) < move.reach + stat(attacker.c.reach) * 3 &&
    Math.abs(target.y - attacker.y) < (target.crouch ? 85 : 120)
  );
}

export function hitOutcome(attacker, target, move) {
  const blocking = Boolean(
    target.guard && target.face === -(move.face ?? attacker.face),
  );
  const hits = target.comboHits ?? 0;
  const counter =
    !blocking && Boolean(target.attack && target.attack.t < target.attack.start);
  const scale = blocking ? 0.16 : comboScale(hits);
  const damage =
    move.damage *
    (0.88 + stat(attacker.c.power) * 0.025) *
    scale *
    (counter ? COUNTER_DAMAGE : 1);
  const grounded = (target.y ?? 450) >= 449;
  const launch =
    !blocking &&
    move.launch &&
    grounded &&
    !target.launched &&
    (hits >= 1 || counter)
      ? move.launch
      : 0;
  return {
    blocking,
    counter,
    scale,
    damage,
    health: Math.max(0, target.hp - damage),
    energy: Math.min(100, attacker.energy + (blocking ? 3 : 8)),
    knockback: blocking ? move.knockback.block : move.knockback.hit,
    stun: blocking
      ? 0
      : move.hitstun * hitstunDecay(hits) + (counter ? COUNTER_HITSTUN : 0),
    blockstun: blocking ? move.blockstun : 0,
    launch,
    juggle: !blocking && Boolean(target.launched),
    knockdown: !blocking && Boolean(move.knockdown),
    comboHits: blocking ? 0 : hits + 1,
  };
}

export function roundOutcome(player, opponent) {
  const winner =
    player.hp === opponent.hp
      ? null
      : player.hp > opponent.hp
        ? "player"
        : "opponent";
  const playerRounds = player.rounds + (winner === "player" ? 1 : 0);
  const opponentRounds = opponent.rounds + (winner === "opponent" ? 1 : 0);
  return {
    winner,
    playerRounds,
    opponentRounds,
    complete: playerRounds >= 2 || opponentRounds >= 2,
  };
}
