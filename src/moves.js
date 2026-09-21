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
