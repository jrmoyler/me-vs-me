// In-match cheat effects (the Konami-code unlocks). Pure helpers only: src/combat.js reads
// settings.cheats through these, so a fight without cheats never touches any of them.
// A cheat is on only when the set is unlocked AND its own switch is on.

/** Every cheat id, in display order. lives30 is applied by the menus (continues), not in a fight. */
export const CHEAT_IDS = ["turbo", "bigHead", "rainbow", "crt", "meter", "lives30"];
/** The cheats that change the fight itself; any of these marks the HUD "CHEATS ON". */
export const IN_MATCH_CHEATS = ["turbo", "bigHead", "rainbow", "crt", "meter"];
/** TURBO: the whole simulation (timers, hitstop, frame data, the clock) runs this much faster. */
export const TURBO_SCALE = 1.35;
/** BIG HEAD: the top of the body (head and hair) is redrawn this much larger, pinned at the neck. */
export const BIG_HEAD_SCALE = 1.6;
/** The share of the fighter's body height that counts as the head. */
export const BIG_HEAD_SHARE = 0.28;
/** RAINBOW: full hue turns per second. */
export const RAINBOW_SPEED = 0.6;
export const CHEAT_LABELS = {
  turbo: "TURBO",
  bigHead: "BIG HEAD",
  rainbow: "RAINBOW",
  crt: "CRT",
  meter: "INFINITE METER",
  lives30: "30 CONTINUES",
};

/** The active cheat ids for a settings object ([] when settings.cheats is missing or locked). */
export function activeCheats(settings) {
  const cheats = settings?.cheats;
  if (!cheats || typeof cheats !== "object" || !cheats.unlocked) return [];
  return CHEAT_IDS.filter((id) => cheats[id] === true);
}

/** True when the given cheat is active for these settings. */
export const cheatOn = (settings, id) => activeCheats(settings).includes(id);

/** The active cheats that change the fight itself. */
export const inMatchCheats = (settings) => activeCheats(settings).filter((id) => IN_MATCH_CHEATS.includes(id));

/** The simulation speed multiplier for these settings (1 without TURBO). */
export const timeScale = (settings) => (cheatOn(settings, "turbo") ? TURBO_SCALE : 1);

const toNumber = (base) => {
  if (typeof base === "number" && Number.isFinite(base)) return base & 0xffffff;
  const v = parseInt(String(base ?? "").replace("#", "").padEnd(6, "f").slice(0, 6), 16);
  return Number.isNaN(v) ? 0xffffff : v;
};

/** 0xRRGGBB → [h, s, v], each 0..1. */
export function rgbToHsv(rgb) {
  const r = ((rgb >> 16) & 255) / 255,
    g = ((rgb >> 8) & 255) / 255,
    b = (rgb & 255) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, max ? d / max : 0, max];
}

/** [h, s, v] (0..1) → 0xRRGGBB. */
export function hsvToRgb(h, s, v) {
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6),
    f = h * 6 - i;
  const p = v * (1 - s),
    q = v * (1 - f * s),
    t = v * (1 - (1 - f) * s);
  const [r, g, b] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][i % 6];
  const ch = (x) => Math.round(Math.max(0, Math.min(1, x)) * 255);
  return (ch(r) << 16) | (ch(g) << 8) | ch(b);
}

/**
 * RAINBOW: the base colour (0xRRGGBB or "#rrggbb") with its hue turned by time t (seconds).
 * Pale and grey colours are given enough saturation to show the cycle, and stay bright.
 * Returns 0xRRGGBB.
 */
export function cheatColor(base, t = 0) {
  const [h, s, v] = rgbToHsv(toNumber(base));
  return hsvToRgb(h + (Number(t) || 0) * RAINBOW_SPEED, Math.max(s, 0.55), Math.max(v, 0.85));
}

/** 0xRRGGBB → "#rrggbb". */
export const hexString = (rgb) => `#${(toNumber(rgb) >>> 0).toString(16).padStart(6, "0")}`;

/**
 * BIG HEAD: where to crop the head out of a fighter frame, in frame pixels.
 * anchorY is the feet line in the frame, bodyHeight the body's height in frame pixels.
 * Returns the crop rectangle and the neck line (the pivot the enlarged head grows from).
 */
export function headCrop({ frameWidth = 320, frameHeight = 320, anchorY = 296, bodyHeight = 176, top } = {}) {
  const body = Math.max(1, Math.min(anchorY, bodyHeight));
  // top: the highest opaque row of this frame when it is known (a crouch or a lunge carries the
  // head lower); otherwise the standing body's top.
  const crown = Number.isFinite(top) ? Math.max(0, Math.min(anchorY, top)) : anchorY - body;
  const neck = Math.round(Math.min(frameHeight, crown + body * BIG_HEAD_SHARE));
  // A little headroom over the crown keeps hair and hats inside the crop.
  const y = Math.max(0, Math.round(crown - body * 0.08));
  // A fighter lying on the floor has no head on top; the enlarged copy is hidden then.
  const visible = anchorY - crown >= body * 0.55;
  return { x: 0, y, width: frameWidth, height: Math.max(1, neck - y), neck, visible };
}

/** CRT: the inline style for the scanline + vignette overlay (no flicker under reduced motion). */
export function crtStyle({ reducedMotion = false } = {}) {
  return [
    "position:absolute",
    "inset:0",
    "pointer-events:none",
    "z-index:5",
    "background:repeating-linear-gradient(to bottom,rgba(0,0,0,0) 0,rgba(0,0,0,0) 2px,rgba(0,0,0,.32) 3px,rgba(0,0,0,0) 4px),radial-gradient(ellipse at center,rgba(0,0,0,0) 58%,rgba(0,0,0,.55) 100%)",
    "box-shadow:inset 0 0 80px rgba(120,200,255,.18),inset 0 0 18px rgba(0,0,0,.6)",
    reducedMotion ? "animation:none" : "animation:cheat-crt-flicker 3.2s steps(40) infinite",
  ].join(";");
}
