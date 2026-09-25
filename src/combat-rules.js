import { POWERS, kitFor } from "./moves.js";
export const SPECIAL_COST = 35;
// Combo system constants. Hitstun is generous enough for cancels, never for links.
export const JUGGLE_LIMIT = 1;
export const KNOCKDOWN_TIME = 0.75;
export const LAUNCH_POP = 220;
export const COUNTER_DAMAGE = 1.25;
export const COUNTER_HITSTUN = 0.08;
// Defense answers. The last WAKEUP_WINDOW of a knockdown accepts guard, jump or a reversal.
export const WAKEUP_WINDOW = 0.18;
export const WAKEUP_REVERSALS = ["light", "kick", "throw", "special"];
export const AIR_TYPES = ["light", "medium", "kick"];
// Air normals: shorter reach, short hitstun, and a grounded cooldown on landing so a
// jump-in can never link into a ground normal (0.08 + fastest startup > AIR_HITSTUN).
export const AIR_REACH = 0.7;
export const AIR_HITSTUN = 0.2;
export const AIR_BLOCKSTUN = 0.16;
export const AIR_LAND_COOLDOWN = 0.08;
export const ANTI_AIR_HEIGHT = 1.25;
export const PUNISH_WINDOW = 0.6;
export const SPARK_CAP = 12;
export const PROJECTILE_CAP = 6;
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
  // Grabs reuse the jab row. Tier 0, never a cancel source or target, no meter.
  throw: {
    damage: 12,
    reach: 72,
    start: 0.18,
    active: 0.1,
    duration: 0.7,
    tier: 0,
    family: "throw",
    hitstun: 0,
    blockstun: 0,
    knockback: { hit: 34, block: 0 },
    knockdown: true,
  },
});

// Strike heights: standing guard blocks mid and overhead, crouching guard blocks low and mid.
export function moveHeight(type, { crouch = false, air = false } = {}) {
  if (type === "throw") return "throw";
  if (air || type === "heavyKick") return "overhead";
  if (type === "kick" && crouch) return "low";
  return "mid";
}

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
    punish: 0,
    guardTime: 0,
    flash: 0,
  };
}

export const comboScale = (hitsBefore) => Math.max(0.5, 1 - 0.1 * hitsBefore);
export const hitstunDecay = (hitsBefore) => Math.max(0.75, 1 - 0.04 * hitsBefore);

// Every roster fighter has an authored POWER profile; an unlisted id falls back to the sweep.
export function specialVariant(character) {
  return POWERS[character?.id]?.variant ?? 0;
}

function buildMove(fighter, type, { crouch, air } = {}) {
  const base = MOVE_TABLE[type];
  if (!base) return null;
  const variant = specialVariant(fighter.c);
  const mods = kitFor(fighter.c).mods;
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
    // An unlisted id gets a plain sweep so custom fighters still have a POWER.
    Object.assign(move, POWERS[fighter.c.id] ?? { damage: 22, reach: 225, start: 0.23 });
    move.start += mods.powerStart || 0;
    move.damage += mods.powerDamage || 0;
    move.knockback.block += mods.powerBlockPush || 0;
  }
  if (type === "throw") {
    move.reach += mods.throwReach || 0;
    move.damage = mods.throwDamage || move.damage;
  } else {
    // The illustrated impact pose sits at 43% of the move; the throw keeps its fast grab.
    move.start = Math.max(move.start, move.duration * 0.43);
    // Rushdown jab recovers faster; startup is unchanged and the cut is clamped.
    if (type === "light") move.duration += Math.max(-0.02, mods.jabRecovery || 0);
  }
  move.crouch = Boolean(crouch);
  move.air = Boolean(air);
  if (move.air) {
    move.reach =
      Math.round(base.reach * AIR_REACH) +
      (type === "light" ? mods.airLightReach || 0 : 0);
    move.hitstun = AIR_HITSTUN;
    move.blockstun = AIR_BLOCKSTUN;
    delete move.launch;
  }
  move.height = moveHeight(type, move);
  return move;
}

const grounded = (f) => (f.y ?? 450) >= 449;

// opts.crouch marks a crouching strike (crouching LK is a low); airborne strikes are air normals.
export function createAttack(fighter, type, opts = {}) {
  if (
    fighter.attack ||
    fighter.cooldown > 0 ||
    fighter.stun > 0 ||
    fighter.blockstun > 0 ||
    fighter.down > 0 ||
    fighter.launched ||
    (fighter.guard && type !== "throw")
  )
    return null;
  if (type === "special" && fighter.energy < SPECIAL_COST) return null;
  const air = !grounded(fighter);
  if (air && !AIR_TYPES.includes(type)) return null;
  return buildMove(fighter, type, {
    crouch: !air && Boolean(opts.crouch ?? fighter.crouch),
    air,
  });
}

// A landed normal may be cancelled into a stronger normal or, on hit, the power.
export function canCancel(current, nextType) {
  const next = MOVE_TABLE[nextType];
  if (!current || !next || !current.landed) return false;
  if (current.t >= current.duration) return false;
  if (current.family === "throw" || next.family === "throw") return false;
  if (current.air) return false;
  if (nextType === current.type || current.type === "special") return false;
  if (nextType === "special") return current.landed === "hit";
  if (next.family === current.family) return next.tier > current.tier;
  if (current.family === "punch" && next.family === "kick")
    return next.tier >= current.tier;
  return false;
}

export function cancelAttack(fighter, type, opts = {}) {
  if (!canCancel(fighter.attack, type)) return null;
  if (fighter.stun > 0 || fighter.down > 0 || fighter.launched) return null;
  if (type === "special" && fighter.energy < SPECIAL_COST) return null;
  return buildMove(fighter, type, { crouch: opts.crouch });
}

// Throws only take a grounded fighter who is not reeling, blocking a hit or knocked down.
export function canBeThrown(target) {
  return (
    grounded(target) &&
    !(target.down > 0) &&
    !target.launched &&
    !(target.stun > 0) &&
    !(target.blockstun > 0)
  );
}

export const throwRange = (fighter) =>
  MOVE_TABLE.throw.reach + (kitFor(fighter.c).mods.throwReach || 0);

export function wakeupWindow(fighter) {
  return WAKEUP_WINDOW + (kitFor(fighter.c).mods.wakeup || 0);
}

export function canBeHit(target) {
  if (target.down > 0) return false;
  if (target.launched && target.juggles >= JUGGLE_LIMIT) return false;
  return true;
}

export function inMeleeRange(attacker, target, move) {
  if (move.type === "special" && move.variant === 3) return false;
  const dx = target.x - attacker.x;
  if (dx * attacker.face < 0) return false;
  if (move.family === "throw")
    return Math.abs(dx) <= move.reach && grounded(attacker) && canBeThrown(target);
  if (Math.abs(dx) >= move.reach + stat(attacker.c.reach) * 3) return false;
  const dy = target.y - attacker.y;
  if (move.air)
    // Air normals must come down on a grounded target, or meet an airborne one level.
    return grounded(target) ? dy > 10 && dy < 140 : Math.abs(dy) < 70;
  const antiAir =
    !grounded(target) && (move.type === "heavy" || move.type === "heavyKick");
  return (
    Math.abs(dy) < (target.crouch ? 85 : 120) * (antiAir ? ANTI_AIR_HEIGHT : 1)
  );
}

// A guard stops the strike if it faces the attacker at the right height. Inside
// blockstun the guard is already set, so a blocked string stays blocked.
export function guardsAgainst(target, move, face) {
  if (!target.guard || target.face !== -face) return false;
  const height = move.height ?? "mid";
  if (height === "throw") return false;
  if (target.blockstun > 0) return true;
  if (target.crouch) return height !== "overhead";
  return height !== "low";
}

// Seconds of freeze on contact by weight. Blocks freeze for 60%.
export function hitstopFor(move, blocking = false) {
  const base =
    move.family === "throw"
      ? 0.1
      : move.type === "special"
        ? 0.12
        : move.tier >= 3
          ? 0.09
          : move.tier === 2
            ? 0.06
            : 0.04;
  return blocking ? base * 0.6 : base;
}

// Rumble and vibration length in ms (haptics, not audio).
export const impactPulse = (move) =>
  move.type === "special"
    ? 70
    : move.tier >= 3 || move.family === "throw"
      ? 40
      : move.tier === 2
        ? 30
        : 20;

export function hitOutcome(attacker, target, move) {
  const face = move.face ?? attacker.face;
  if (move.family === "throw") {
    // Flat damage, no scaling or combo extension; the target is floored.
    return {
      blocking: false,
      counter: false,
      throw: true,
      scale: 1,
      damage: move.damage,
      health: Math.max(0, target.hp - move.damage),
      energy: Math.min(100, attacker.energy + 8),
      knockback: move.knockback.hit,
      stun: 0,
      blockstun: 0,
      launch: 0,
      juggle: false,
      knockdown: true,
      comboHits: 0,
    };
  }
  const blocking = guardsAgainst(target, move, face);
  const hits = target.comboHits ?? 0;
  // Counter kits turn the first punish after a successful block into a counter hit.
  const punish =
    attacker.punish > 0 && kitFor(attacker.c).mods.punishCounter === true;
  const counter =
    !blocking &&
    (Boolean(target.attack && target.attack.t < target.attack.start) || punish);
  const scale = blocking ? 0.16 : comboScale(hits);
  const damage =
    move.damage *
    (0.88 + stat(attacker.c.power) * 0.025) *
    scale *
    (counter ? COUNTER_DAMAGE : 1);
  const launch =
    !blocking &&
    move.launch &&
    grounded(target) &&
    !target.launched &&
    (hits >= 1 || counter)
      ? move.launch
      : 0;
  return {
    blocking,
    counter,
    throw: false,
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

// --- CPU personality ------------------------------------------------------------
export const AI_PROFILES = Object.freeze({
  easy: {
    think: 0.29,
    block: 0.23,
    cancels: false,
    throws: false,
    turtle: Infinity,
    wakeup: "none",
    wakeBlock: 0,
    antiAir: 0,
    readsHeight: false,
    punish: false,
    smartPower: false,
  },
  normal: {
    think: 0.19,
    block: 0.48,
    cancels: true,
    throws: true,
    turtle: 0.6,
    wakeup: "block",
    wakeBlock: 0.2,
    antiAir: 0,
    readsHeight: false,
    punish: false,
    smartPower: false,
  },
  hard: {
    think: 0.11,
    block: 0.8,
    cancels: true,
    throws: true,
    turtle: 0.35,
    wakeup: "mix",
    wakeBlock: 0,
    antiAir: 0.85,
    readsHeight: true,
    punish: true,
    smartPower: true,
  },
});
export const ANTI_AIR_RANGE = 190;
// The follow-up an AI picks when its strike lands and it may cancel.
export const CANCEL_ROUTE = {
  light: "medium",
  medium: "heavy",
  heavy: "heavyKick",
  kick: "mediumKick",
  mediumKick: "heavyKick",
};

// Deterministic RNG for seeded CPU bouts (mulberry32).
export function seededRandom(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
