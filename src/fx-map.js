// Where every pixelfx effect plays in ME VS ME. Pure data: src/combat.js, src/main.js and
// src/bonus.js read it, and tests/pixelfx.test.mjs checks that all 244 effects in
// src/vendor/pixelfx are used somewhere in the game (the FX LAB on the title screen plays any one).

// ---- each fighter's POWER, start to finish ---------------------------------------------------
// charge: during startup, at the fighter · release: the moment it goes active, in front of them
// projectile: the visual riding a variant-3 shot · impact: where it lands · status: left on the target
// ko: the loser's exit when this POWER wins the match · finisher: the winner's flourish on the deciding K.O.
// entrance: how the fighter arrives in round one · tint: palette from the fighter's own colour.
export const POWER_FX = {
  hataalii: { charge: "fire/spirit-flame", release: "fire/flame-pillar", impact: "explosions/big-explosion", status: "status/burning", ko: "spawn/dissolve-burn", finisher: "moves/dash-strike", entrance: "spawn/poof" },
  urban: { charge: "ice/frost-breath", release: "ice/ice-spikes", impact: "ice/icicle-fall", status: "status/frozen", ko: "spawn/shatter-death", finisher: "moves/sword-combo", entrance: "arcane/blink-in" },
  gauntlet: { charge: "lightning/charge-up", release: "lightning/spark-arc", projectile: "lightning/ball-lightning", impact: "lightning/lightning-strike", status: "lightning/electrified", ko: "spawn/disintegrate", finisher: "moves/lightning-call", entrance: "scifi/warp-in" },
  tote: { charge: "holy/divine-shield", release: "impacts/parry", impact: "explosions/cartoon-pow", status: "status/stunned", finisher: "moves/dash-strike", entrance: "spawn/poof" },
  vector: { charge: "scifi/scanner", release: "melee/spear-sweep", impact: "impacts/crit-hit", status: "status/stunned", finisher: "moves/dash-strike", entrance: "scifi/teleporter-pad" },
  kinetic: { charge: "lightning/charge-up", release: "lightning/thunderclap", impact: "lightning/zap-hit", status: "lightning/electrified", finisher: "moves/lightning-call", entrance: "scifi/warp-in" },
  corvette: { charge: "status/haste", self: true, release: "fire/fire-ring", impact: "explosions/small-explosion", status: "status/burning", ko: "spawn/dissolve-burn", finisher: "moves/fireball-throw", entrance: "spawn/poof" },
  curly: { charge: "nature/quake", release: "impacts/ground-slam", impact: "explosions/dirt-explosion", status: "status/stunned", finisher: "moves/ground-pound", entrance: "spawn/poof" },
  pixel: { charge: "ice/ice-crystal", projectile: "ice/ice-lance", impact: "ice/ice-shatter", status: "status/frozen", ko: "spawn/shatter-death", finisher: "moves/ice-lance-throw", entrance: "scifi/glitch", tint: true },
  tweed: { charge: "holy/halo", release: "melee/uppercut", impact: "nature/boulder", status: "status/stunned", finisher: "moves/earth-stomp", entrance: "spawn/poof" },
  varsity: { charge: "pickups/power-star", release: "explosions/firework-burst", impact: "explosions/cartoon-pow", status: "status/stunned", finisher: "moves/ground-pound", entrance: "spawn/poof", tint: true },
  hybrid: { charge: "arcane/spell-charge", release: "arcane/mana-burst", impact: "explosions/plasma-explosion", finisher: "moves/fireball-throw", entrance: "arcane/blink-in", tint: true },
  civic: { charge: "holy/blessing", release: "holy/heal-aoe", impact: "holy/feather-burst", status: "status/stunned", finisher: "moves/holy-smite", entrance: "spawn/respawn-beam", tint: true },
  nexus: { charge: "scifi/energy-core", release: "projectiles/rocket", projectile: "projectiles/energy-disc", impact: "scifi/emp-blast", status: "status/stunned", finisher: "moves/rocket-launcher", entrance: "scifi/warp-in" },
  glyph: { charge: "arcane/rune-circle", release: "fire/flamethrower", impact: "explosions/barrel-explosion", status: "status/burning", ko: "spawn/dissolve-burn", finisher: "moves/fireball-throw", entrance: "arcane/blink-in", tint: true },
  quilt: { charge: "lightning/storm-cloud", release: "water/water-jet", impact: "water/rain-splash", status: "status/slowed", finisher: "moves/lightning-call", entrance: "spawn/poof" },
  binary: { charge: "scifi/hologram", release: "scifi/glitch", impact: "explosions/implosion", status: "status/confused", ko: "spawn/disintegrate", finisher: "moves/rocket-launcher", entrance: "scifi/warp-in" },
  aether: { charge: "holy/sunburst", release: "fire/fire-tornado", impact: "explosions/big-explosion", status: "status/burning", ko: "spawn/dissolve-burn", finisher: "moves/meteor-call", entrance: "spawn/respawn-beam" },
  gaia: { charge: "nature/poison-cloud", release: "nature/earth-spike", impact: "nature/acid-splash", status: "status/poisoned", ko: "nature/toxic-puddle", finisher: "moves/earth-stomp", entrance: "spawn/summon-rise" },
  zenith: { charge: "arcane/arcane-beam", release: "projectiles/homing-missile", projectile: "projectiles/plasma-shot", impact: "explosions/plasma-explosion", status: "status/stunned", finisher: "moves/rocket-launcher", entrance: "arcane/blink-in", tint: true },
  archer: { charge: "nature/leaf-storm", projectile: "projectiles/arrow", impact: "nature/thorns", status: "status/bleeding", finisher: "moves/arrow-shot", entrance: "spawn/summon-rise" },
  cyborg: { charge: "lightning/plasma-ball", release: "scifi/jetpack", self: true, impact: "explosions/plasma-explosion", status: "status/burning", ko: "spawn/disintegrate", finisher: "moves/rocket-launcher", entrance: "scifi/warp-in" },
  eon: { charge: "arcane/portal", release: "arcane/blink-out", self: true, impact: "arcane/time-stop", status: "status/slowed", ko: "arcane/blink-out", finisher: "moves/meteor-call", entrance: "arcane/blink-in" },
  juris: { charge: "holy/halo", release: "holy/holy-pillar", impact: "holy/smite", status: "status/stunned", finisher: "moves/holy-smite", entrance: "spawn/respawn-beam" },
  nomad: { charge: "projectiles/flare", projectile: "fire/fireball", impact: "explosions/small-explosion", status: "status/burning", ko: "spawn/dissolve-burn", finisher: "moves/fireball-throw", entrance: "spawn/poof" },
  sketch: { charge: "scifi/scanner", release: "melee/heavy-cleave", impact: "spawn/poof", status: "status/petrified", ko: "spawn/disintegrate", finisher: "moves/sword-combo", entrance: "spawn/poof", tint: true },
  student: { charge: "arcane/rune-circle", release: "projectiles/magic-missile", projectile: "nature/leaf-storm", impact: "explosions/cartoon-pow", status: "status/confused", finisher: "moves/arrow-shot", entrance: "spawn/poof", tint: true },
  patchrunner: { charge: "scifi/energy-core", release: "lightning/chain-lightning", impact: "lightning/zap-hit", status: "lightning/electrified", finisher: "moves/lightning-call", entrance: "scifi/teleporter-pad" },
  starscribe: { charge: "arcane/magic-circle-cast", projectile: "arcane/arcane-orb", impact: "arcane/star-fall", status: "status/slowed", finisher: "moves/meteor-call", entrance: "arcane/blink-in" },
  sovereign: { charge: "holy/blessing", release: "melee/sword-slash", impact: "impacts/crit-hit", status: "status/charmed", finisher: "moves/sword-combo", entrance: "spawn/respawn-beam" },
  circuitbreaker: { charge: "scifi/scanner", projectile: "projectiles/laser-bolt", impact: "scifi/emp-blast", status: "status/confused", ko: "spawn/disintegrate", finisher: "moves/rocket-launcher", entrance: "scifi/teleporter-pad" },
  ironchef: { charge: "fire/campfire", release: "fire/fire-breath", impact: "explosions/small-explosion", status: "status/burning", ko: "spawn/dissolve-burn", finisher: "moves/fireball-throw", entrance: "spawn/poof" },
  eventhorizon: { charge: "scifi/jetpack", self: true, release: "scifi/tractor-beam", projectile: "shadow/void-orb", impact: "shadow/black-hole", status: "status/slowed", ko: "scifi/warp-out", finisher: "moves/meteor-call", entrance: "scifi/warp-in" },
  crimsonoracle: { charge: "arcane/magic-circle-cast", release: "shadow/hex-sigil", impact: "shadow/grasping-hands", status: "status/cursed", ko: "shadow/life-steal", finisher: "moves/holy-smite", entrance: "spawn/spawn-portal" },
  dunevoyager: { charge: "status/haste", self: true, release: "nature/tornado", impact: "explosions/dirt-explosion", status: "status/stunned", finisher: "moves/earth-stomp", entrance: "spawn/poof" },
  pharaoh: { charge: "holy/sunburst", projectile: "projectiles/plasma-shot", impact: "holy/smite", status: "status/burning", ko: "fire/meteor", finisher: "moves/meteor-call", entrance: "spawn/respawn-beam", tint: true },
  roman: { charge: "status/rage", self: true, release: "melee/thrust", impact: "impacts/crit-hit", status: "status/bleeding", finisher: "moves/sword-combo", entrance: "spawn/poof" },
  viking: { charge: "ice/blizzard-vortex", release: "ice/frost-nova", impact: "ice/freeze", status: "status/frozen", ko: "spawn/shatter-death", finisher: "moves/ice-lance-throw", entrance: "spawn/poof" },
  medieval: { charge: "holy/divine-shield", release: "melee/hammer-smash", impact: "impacts/ground-slam", status: "status/stunned", finisher: "moves/sword-combo", entrance: "spawn/poof" },
  renaissance: { charge: "holy/halo", release: "melee/spin-slash", impact: "pickups/collect-burst", status: "status/charmed", finisher: "moves/sword-combo", entrance: "spawn/poof" },
  colonial: { charge: "projectiles/muzzle-pistol", release: "projectiles/cannonball", projectile: "projectiles/bullet-tracer", impact: "impacts/bullet-impact", status: "status/stunned", finisher: "moves/pistol-shots", entrance: "explosions/smoke-bomb" },
  victorian: { charge: "arcane/rune-circle", release: "arcane/time-stop", impact: "impacts/parry", status: "status/slowed", finisher: "moves/ground-pound", entrance: "spawn/poof", tint: true },
  jazz: { charge: "fire/spirit-flame", release: "melee/dagger-flurry", impact: "impacts/blunt-hit", status: "status/confused", finisher: "moves/dash-strike", entrance: "spawn/poof", tint: true },
  raven: { charge: "shadow/necro-skulls", release: "arcane/arcane-missiles", projectile: "critters/bird", impact: "shadow/curse", status: "status/cursed", ko: "spawn/soul-rise", finisher: "moves/arrow-shot", entrance: "spawn/spawn-portal", tint: true },
  blood: { charge: "shadow/soul-drain", release: "shadow/eclipse", impact: "shadow/dark-explosion", status: "status/bleeding", ko: "shadow/shadow-flames", finisher: "moves/holy-smite", entrance: "spawn/spawn-portal", tint: true },
  merman: { charge: "water/water-orb", release: "water/whirlpool", impact: "water/splash", status: "status/slowed", finisher: "moves/ice-lance-throw", entrance: "water/geyser" },
  operative: { charge: "projectiles/muzzle-smg", release: "projectiles/muzzle-shotgun", impact: "explosions/grenade", status: "status/stunned", finisher: "moves/pistol-shots", entrance: "explosions/smoke-bomb" },
  coast: { charge: "holy/sunburst", release: "water/wave-crash", impact: "water/geyser", status: "status/slowed", finisher: "moves/dash-strike", entrance: "spawn/poof" },
  jungle: { charge: "nature/spore-burst", release: "nature/vine-whip", impact: "nature/quake", status: "nature/root-snare", ko: "nature/healing-bloom", finisher: "moves/earth-stomp", entrance: "spawn/egg-hatch" },
};
export const DEFAULT_POWER_FX = { charge: "arcane/spell-charge", release: "arcane/mana-burst", impact: "impacts/crit-hit", finisher: "moves/dash-strike", entrance: "spawn/poof" };
export const powerFxFor = (c) => ({ ...DEFAULT_POWER_FX, ...(POWER_FX[c?.id] ?? {}) });

// ---- every strike --------------------------------------------------------------------------
// Each normal leaves a smear the moment it goes active, then a spark when it connects.
export const SMEAR_FX = {
  light: "melee/thrust",
  medium: "melee/double-slash",
  heavy: "melee/uppercut",
  kick: "melee/claw-swipe",
  lowKick: "melee/spear-sweep",
  mediumKick: "melee/whip-crack",
  heavyKick: "melee/spin-slash",
  air: "melee/sword-slash",
  wakeup: "melee/scythe-reap",
  throw: "melee/heavy-cleave",
  overhead: "melee/hammer-smash",
  flurry: "melee/dagger-flurry",
};
export const HIT_FX = {
  light: "impacts/hit-spark",
  medium: "impacts/blunt-hit",
  heavy: "impacts/blunt-hit",
  counter: "impacts/crit-hit",
  throw: "explosions/cartoon-pow",
  block: "impacts/shield-block",
  guardPower: "impacts/parry",
  blockShot: "impacts/ricochet",
  shot: "impacts/bullet-impact",
  flash: "impacts/hit-flash",
  knockdown: "impacts/heavy-landing",
  launchLanding: "impacts/ground-slam",
  koFrame: "impacts/impact-frame",
};
// The guard aura while guard is held, by fighter (tech shields and holy wards).
export const GUARD_FX = {
  tech: "scifi/force-field",
  holy: "holy/divine-shield",
};
const TECH = new Set(["gauntlet", "nexus", "binary", "cyborg", "zenith", "patchrunner", "circuitbreaker", "eventhorizon", "operative", "vector", "kinetic"]);
const HOLY = new Set(["civic", "juris", "sovereign", "pharaoh", "aether", "tote", "medieval"]);
export const guardFxFor = (c) => (TECH.has(c?.id) ? GUARD_FX.tech : HOLY.has(c?.id) ? GUARD_FX.holy : null);

// ---- the flow of a match -------------------------------------------------------------------
export const MATCH_FX = {
  damage: "ui/damage-number",
  crit: "ui/crit-number",
  surprise: "ui/exclamation",
  combo: "ui/combo-counter",
  danger: "ui/health-bar-hit",
  rage: "status/rage",
  dizzy: "status/stunned",
  roundLost: "ui/heart-lost",
  roundWon: "pickups/heart-pickup",
  matchWon: "holy/halo",
  powerReady: "pickups/power-star",
  meter: "pickups/xp-orb",
  blessing: "holy/blessing",
  comeback: "holy/resurrection",
  knockedOut: "spawn/soul-rise",
  powerKo: "shadow/dark-explosion",
  shadowEntrance: "shadow/shadow-tendrils",
  perfect: "explosions/nuke",
  draw: "explosions/implosion",
  timeUp: "status/sleep",
  trainingReset: "holy/heal",
  dummyReset: "pickups/potion",
  trialPass: "ui/quest-complete",
};

// ---- the arenas: weather (round one, then the final round), critters and props ---------------
// Props sit at the stage's edges in pixel space (320×180, floor at y 150).
export const ARENA_FX = {
  "neon-avenue": {
    weather: ["weather/rain", "weather/storm"],
    critters: [{ id: "critters/jellyfish", x: 250, y: 46 }],
    props: [
      { id: "scifi/hologram", x: 38, y: 92 },
      { id: "water/ripples", x: 160, y: 152 },
    ],
    landing: "water/rain-splash",
  },
  "sunset-court": {
    weather: ["weather/clouds", "weather/god-rays"],
    critters: [{ id: "critters/bird", x: 70, y: 40 }],
    props: [{ id: "holy/sunburst", x: 262, y: 44 }],
  },
  "mirror-garden": {
    weather: ["weather/cherry-blossoms", "weather/falling-leaves"],
    critters: [
      { id: "critters/butterfly", x: 240, y: 70 },
      { id: "critters/fish-school", x: 196, y: 128 },
    ],
    props: [{ id: "water/fountain", x: 290, y: 152 }],
  },
  "the-foundry": {
    weather: ["weather/fog", "weather/fog"],
    critters: [{ id: "critters/slime", x: 30, y: 152 }],
    props: [
      { id: "fire/brazier", x: 292, y: 152 },
      { id: "lightning/tesla-coil", x: 40, y: 90 },
    ],
  },
  "midnight-terrace": {
    weather: ["weather/shooting-stars", "weather/aurora"],
    critters: [{ id: "critters/bat", x: 230, y: 34 }],
    props: [{ id: "fire/candle", x: 296, y: 152 }],
  },
  "terminal-nine": {
    weather: ["weather/fog", "weather/rain"],
    critters: [{ id: "critters/ghost", x: 270, y: 96 }],
    props: [
      { id: "water/drip", x: 60, y: 30 },
      { id: "fire/torch", x: 22, y: 150 },
    ],
  },
  glasshouse: {
    weather: ["weather/god-rays", "weather/fireflies"],
    critters: [
      { id: "critters/frog", x: 286, y: 152 },
      { id: "critters/wisp", x: 60, y: 60 },
    ],
    props: [
      { id: "water/waterfall", x: 26, y: 152 },
      { id: "water/bubbles", x: 300, y: 120 },
    ],
  },
  "overtime-field": {
    weather: ["weather/clouds", "weather/snow"],
    critters: [{ id: "critters/bird", x: 250, y: 30 }],
    props: [],
  },
  "redline-overpass": {
    weather: ["weather/clouds", "weather/storm"],
    critters: [
      { id: "critters/snake", x: 270, y: 154 },
      { id: "critters/flying-skull", x: 50, y: 50 },
    ],
    props: [{ id: "fire/campfire", x: 24, y: 152 }],
  },
  "null-vault": {
    weather: [null, "weather/blizzard"],
    weatherPalette: ["#03140c", "#062a18", "#0b4a28", "#16743c", "#2aa858", "#5ade86", "#a8ffc4", "#effff4"],
    critters: [{ id: "critters/eyeball", x: 264, y: 50 }],
    props: [
      { id: "scifi/laser-grid", x: 50, y: 150 },
      { id: "scifi/energy-core", x: 290, y: 140 },
    ],
  },
};

// ---- menus, the bonus stage and screen changes (drawn over the page) -------------------------
export const SCREEN_FX = {
  // each screen opens on its own transition, started where it covers the screen
  transitions: {
    title: "transitions/star-iris",
    selection: "transitions/blinds",
    arena: "transitions/diamond-wipe",
    versus: "transitions/slash-wipe",
    result: "transitions/shatter-wipe",
    defeat: "transitions/burn-away",
    bracket: "transitions/iris",
    bonus: "transitions/glitch-wipe",
    route: "transitions/pixel-dissolve",
    gameover: "transitions/crt-off",
  },
  victory: ["ui/confetti", "explosions/firework-burst"],
  grade: "ui/achievement",
  topGrade: "pickups/loot-beam",
  nextStage: "ui/level-up",
  champion: ["explosions/firework-rocket", "pickups/key-glint", "pickups/gem-spin"],
};
export const BONUS_FX = {
  start: "ui/countdown",
  strike: "pickups/collect-burst",
  coins: "spawn/coin-drop",
  shard: "pickups/crystal-shard",
  crack: "ice/snowflake-burst",
  broken: "explosions/barrel-explosion",
  score: "ui/coin-collect",
  reward: "pickups/chest-open",
  hud: "pickups/coin-spin",
};

/** Every effect id the game uses, deduplicated and sorted. */
export function usedFxIds() {
  const ids = new Set();
  const add = (v) => {
    if (!v) return;
    if (typeof v === "string") {
      if (v.includes("/")) ids.add(v);
    } else if (Array.isArray(v)) v.forEach(add);
    else if (typeof v === "object") Object.values(v).forEach(add);
  };
  [POWER_FX, DEFAULT_POWER_FX, SMEAR_FX, HIT_FX, GUARD_FX, MATCH_FX, ARENA_FX, SCREEN_FX, BONUS_FX].forEach(add);
  return [...ids].sort();
}
