// Each move owns a separate row of four newly illustrated poses.
export const MOVES = [
  {
    type: "light",
    label: "Jab",
    button: "LP",
    key: "J",
    row: 0,
    hint: "Fast check. Close range.",
  },
  {
    type: "medium",
    label: "Cross",
    button: "MP",
    key: "K",
    row: 1,
    hint: "A committed straight punch.",
  },
  {
    type: "heavy",
    label: "Uppercut",
    button: "HP",
    key: "L",
    row: 2,
    hint: "Heavy rising punish.",
  },
  {
    type: "kick",
    label: "Low kick",
    button: "LK",
    key: "U",
    row: 3,
    hint: "Quick kick. Short recovery.",
  },
  {
    type: "mediumKick",
    label: "Sidekick",
    button: "MK",
    key: "I",
    row: 4,
    hint: "Control the middle distance.",
  },
  {
    type: "heavyKick",
    label: "Roundhouse",
    button: "HK",
    key: "O",
    row: 5,
    hint: "Long reach. Longer recovery.",
  },
  {
    type: "special",
    label: "Signature power",
    button: "POWER",
    key: "Q",
    row: 6,
    hint: "35 meter. Your signature attack.",
  },
];

export const POWERS = {
  hataalii: {
    variant: 2,
    style: "crown",
    damage: 25,
    reach: 162,
    start: 0.36,
    active: 0.23,
    duration: 0.98,
    travel: 70,
    lift: 190,
  },
  urban: {
    variant: 0,
    style: "silver",
    damage: 23,
    reach: 215,
    start: 0.35,
    active: 0.21,
    duration: 0.88,
    travel: 40,
  },
  gauntlet: {
    variant: 3,
    style: "ion",
    damage: 21,
    reach: 280,
    start: 0.43,
    active: 0.23,
    duration: 0.94,
    projectileSpeed: 610,
  },
  tote: {
    variant: 1,
    style: "counter",
    damage: 27,
    reach: 144,
    start: 0.38,
    active: 0.18,
    duration: 0.94,
    travel: 115,
  },
  vector: {
    variant: 0,
    style: "vector",
    damage: 22,
    reach: 235,
    start: 0.33,
    active: 0.22,
    duration: 0.88,
    travel: 62,
  },
  kinetic: {
    variant: 1,
    style: "shock",
    damage: 26,
    reach: 143,
    start: 0.36,
    active: 0.23,
    duration: 0.97,
    travel: 160,
  },
  corvette: {
    variant: 2,
    style: "flame",
    damage: 23,
    reach: 198,
    start: 0.36,
    active: 0.25,
    duration: 0.96,
    travel: 110,
    lift: 210,
  },
  curly: {
    variant: 0,
    style: "sweep",
    damage: 22,
    reach: 218,
    start: 0.32,
    active: 0.23,
    duration: 0.88,
    travel: 45,
  },
  pixel: {
    variant: 3,
    style: "shatter",
    damage: 24,
    reach: 280,
    start: 0.43,
    active: 0.23,
    duration: 1.03,
    projectileSpeed: 480,
  },
  tweed: {
    variant: 2,
    style: "heritage",
    damage: 28,
    reach: 147,
    start: 0.35,
    active: 0.25,
    duration: 1.02,
    travel: 75,
    lift: 240,
  },
  varsity: {
    variant: 1,
    style: "star",
    damage: 25,
    reach: 160,
    start: 0.33,
    active: 0.23,
    duration: 0.93,
    travel: 135,
  },
  hybrid: {
    variant: 0,
    style: "fusion",
    damage: 24,
    reach: 211,
    start: 0.39,
    active: 0.23,
    duration: 0.99,
    travel: 52,
  },
  civic: {
    variant: 1,
    style: "accord",
    damage: 27,
    reach: 151,
    start: 0.41,
    active: 0.19,
    duration: 1.02,
    travel: 92,
  },
  nexus: {
    variant: 3,
    style: "relay",
    damage: 21,
    reach: 280,
    start: 0.4,
    active: 0.21,
    duration: 0.93,
    projectileSpeed: 650,
  },
  glyph: {
    variant: 2,
    style: "forge",
    damage: 27,
    reach: 153,
    start: 0.44,
    active: 0.22,
    duration: 1.04,
    travel: 64,
    lift: 245,
  },
  quilt: {
    variant: 1,
    style: "cloudburst",
    damage: 26,
    reach: 157,
    start: 0.4,
    active: 0.22,
    duration: 0.98,
    travel: 102,
  },
  binary: {
    "variant": 0,
    "style": "null",
    "damage": 23,
    "reach": 208,
    "start": 0.37,
    "active": 0.24,
    "duration": 0.91,
    "travel": 65
  },
  aether: {
    variant: 0,
    style: "solar",
    damage: 22,
    reach: 238,
    start: 0.38,
    active: 0.24,
    duration: 0.93,
    travel: 75,
  },
  gaia: {
    variant: 0,
    style: "root",
    damage: 26,
    reach: 225,
    start: 0.48,
    active: 0.22,
    duration: 1.1,
    travel: 30,
  },
  zenith: {
    variant: 3,
    style: "apex",
    damage: 24,
    reach: 280,
    start: 0.46,
    active: 0.2,
    duration: 1.03,
    projectileSpeed: 505,
  },
};

export function moveFrame(move) {
  const row = MOVES.find((m) => m.type === move.type)?.row ?? 0;
  // The illustrated impact pose and damage window share the same clock.
  const pose =
    move.t < move.start * 0.55
      ? 0
      : move.t < move.start
        ? 1
        : move.t < move.start + move.active
          ? 2
          : 3;
  return row * 4 + pose;
}

export function movePhase(move) {
  return !move
    ? "READY"
    : move.t < move.start
      ? "STARTUP"
      : move.t < move.start + move.active
        ? "ACTIVE"
        : "RECOVERY";
}

export function moveName(character, type) {
  return type === "special"
    ? character.move
    : MOVES.find((m) => m.type === type)?.label || "Ready";
}

// --- Defensive system moves -------------------------------------------------
// Not atlas rows: the throw reuses the jab row, the rest are properties of the six normals.
export const SYSTEM_MOVES = [
  {
    type: "throw",
    label: "Throw",
    button: "GUARD+LP",
    key: "SHIFT+J",
    tag: "THROW",
    hint: "Close range. Beats standing and crouching guard. Whiffs are punishable.",
  },
  {
    type: "kick",
    label: "Crouching low kick",
    button: "↓+LK",
    key: "S+U",
    tag: "LOW",
    hint: "Must be blocked crouching. Standing guard fails.",
  },
  {
    type: "heavyKick",
    label: "Roundhouse",
    button: "HK",
    key: "O",
    tag: "OVERHEAD",
    hint: "Must be blocked standing, as must every jumping attack.",
  },
  {
    type: "air",
    label: "Jumping LP / MP / LK",
    button: "↑ then LP·MP·LK",
    key: "W then J·K·U",
    tag: "AIR",
    hint: "Landing ends the attack. Jump-ins do not combo.",
  },
  {
    type: "wakeup",
    label: "Wakeup",
    button: "GUARD · ↑ · LP · LK · THROW · POWER",
    key: "late in knockdown",
    tag: "WAKEUP",
    hint: "In the last moment of a knockdown, block, jump or reverse.",
  },
];

// --- Per-fighter kits derived from each POWER profile -------------------------
export const ROLES = {
  zoner: { label: "ZONER", job: "projectile zoning" },
  rushdown: { label: "RUSHDOWN", job: "command dash pressure" },
  counter: { label: "COUNTER", job: "counter hit specialist" },
  "grappler-lite": { label: "GRAPPLER", job: "close-range throws" },
  balanced: { label: "BALANCED", job: "long-range footsies" },
};
export const KITS = {
  gauntlet: "zoner",
  pixel: "zoner",
  nexus: "zoner",
  zenith: "zoner",
  kinetic: "rushdown",
  hataalii: "rushdown",
  corvette: "rushdown",
  tweed: "rushdown",
  glyph: "rushdown",
  tote: "counter",
  civic: "counter",
  quilt: "counter",
  varsity: "grappler-lite",
  curly: "balanced",
  binary: "balanced",
  urban: "balanced",
  vector: "balanced",
  aether: "balanced",
  hybrid: "balanced",
  gaia: "balanced",
};
// Data-only modifiers; combat-rules clamps them so the cancel tree still holds.
export const KIT_MODS = {
  zoner: { powerBlockPush: 18, airLightReach: 8 },
  rushdown: { throwReach: 12, jabRecovery: -0.02 },
  counter: { punishCounter: true, powerStart: 0.04, powerDamage: 2 },
  "grappler-lite": { throwDamage: 16, throwReach: 18, wakeup: 0.04 },
  balanced: {},
};
const POWER_CLASS = ["SWEEP", "COMMAND DASH", "RISING LAUNCHER", "PROJECTILE"];
export function kitFor(character) {
  const id = character?.id;
  const role = KITS[id] || "balanced";
  const power = POWERS[id];
  const powerClass = power ? POWER_CLASS[power.variant] : "SIGNATURE";
  // The job line comes from the POWER profile: projectile, dash, launcher or sweep.
  const job =
    role === "counter" || role === "grappler-lite" || role === "zoner"
      ? ROLES[role].job
      : power?.variant === 1
        ? "command dash"
        : power?.variant === 2
          ? "rising launcher pressure"
          : ROLES[role].job;
  return {
    role,
    label: ROLES[role].label,
    job,
    powerClass,
    style: power?.style?.toUpperCase() ?? "",
    mods: KIT_MODS[role],
  };
}

// --- Training trial -----------------------------------------------------------
export const TRIAL_SEQUENCE = ["light", "medium", "heavy", "special"];
export const TRIAL_DROPS = 3;
export const freshTrial = () => ({ step: 0, drops: 0, status: "active" });
// Each landed player hit advances or drops the trial; comboHits is the live count.
export function trialHit(trial, type, comboHits, blocked = false) {
  if (!trial || trial.status !== "active") return trial;
  if (!blocked && type === TRIAL_SEQUENCE[trial.step] && comboHits === trial.step + 1) {
    trial.step++;
    if (trial.step === TRIAL_SEQUENCE.length) trial.status = "pass";
    return trial;
  }
  if (trial.step > 0) trialDrop(trial);
  if (trial.status === "active" && !blocked && type === TRIAL_SEQUENCE[0] && comboHits === 1)
    trial.step = 1;
  return trial;
}
// The combo ended (the dummy recovered or was knocked down) before the POWER landed.
export function trialDrop(trial) {
  if (!trial || trial.status !== "active" || trial.step === 0) return trial;
  trial.step = 0;
  trial.drops++;
  if (trial.drops >= TRIAL_DROPS) trial.status = "fail";
  return trial;
}

// --- Keyboard bindings ----------------------------------------------------------
export const BINDABLE = [
  ["left", "Left"],
  ["right", "Right"],
  ["jump", "Jump"],
  ["crouch", "Crouch"],
  ["light", "LP"],
  ["medium", "MP"],
  ["heavy", "HP"],
  ["kick", "LK"],
  ["mediumKick", "MK"],
  ["heavyKick", "HK"],
  ["special", "POWER"],
  ["block", "GUARD"],
];
export const DEFAULT_KEYS = Object.freeze({
  p1: {
    left: "KeyA",
    right: "KeyD",
    jump: "KeyW",
    crouch: "KeyS",
    light: "KeyJ",
    medium: "KeyK",
    heavy: "KeyL",
    kick: "KeyU",
    mediumKick: "KeyI",
    heavyKick: "KeyO",
    special: "KeyQ",
    block: "ShiftLeft",
  },
  p2: {
    left: "ArrowLeft",
    right: "ArrowRight",
    jump: "ArrowUp",
    crouch: "ArrowDown",
    light: "Numpad1",
    medium: "Numpad2",
    heavy: "Numpad3",
    kick: "Numpad4",
    mediumKick: "Numpad5",
    heavyKick: "Numpad6",
    special: "Numpad0",
    block: "Space",
  },
});
export function bindingsFor(custom = {}) {
  return {
    p1: { ...DEFAULT_KEYS.p1, ...(custom?.p1 || {}) },
    p2: { ...DEFAULT_KEYS.p2, ...(custom?.p2 || {}) },
  };
}
// code -> [player index, control]; ShiftRight stays a second P1 guard unless rebound.
export function buildKeyMap(custom) {
  const b = bindingsFor(custom);
  const map = {};
  if (!Object.values(b.p1).includes("ShiftRight") && !Object.values(b.p2).includes("ShiftRight"))
    map.ShiftRight = [0, "block"];
  for (const [i, side] of [b.p1, b.p2].entries())
    for (const [control, code] of Object.entries(side)) if (code) map[code] = [i, control];
  return map;
}
export const keyLabel = (code = "") =>
  code
    .replace(/^Key/, "")
    .replace(/^Digit/, "")
    .replace(/^Numpad/, "NUM ")
    .replace(/^Arrow(.*)$/, (_, d) => ({ Left: "←", Right: "→", Up: "↑", Down: "↓" })[d])
    .replace(/^(Shift|Control|Alt)(Left|Right)$/, "$1")
    .replace(/^Space$/, "SPACE")
    .toUpperCase();
