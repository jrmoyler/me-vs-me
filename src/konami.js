// Konami code easter egg: up up down down left right left right B A.
// Listens to the keyboard (arrows + A/B only), standard gamepads and touch
// swipes/taps without ever swallowing input, and persists the unlocked cheats.
export const KONAMI_SEQUENCE = ["up", "up", "down", "down", "left", "right", "left", "right", "b", "a"];
export const CHEAT_STORAGE_KEY = "mvm-konami";
export const CHEATS = [
  { id: "turbo", name: "TURBO", blurb: "Matches run 1.35x faster." },
  { id: "bigHead", name: "BIG HEAD", blurb: "Fighters' heads (top of sprite) scaled up." },
  { id: "rainbow", name: "RAINBOW", blurb: "Hit sparks and POWERs cycle through the spectrum." },
  { id: "crt", name: "CRT", blurb: "Scanlines and a curved-glass glow over the cabinet." },
  { id: "lives30", name: "30 CONTINUES", blurb: "Arcade continue timer never runs out." },
  { id: "meter", name: "INFINITE METER", blurb: "POWER is always ready (CPU too)." },
];

export function defaultCheats() {
  const cheats = { unlocked: false };
  for (const { id } of CHEATS) cheats[id] = false;
  return cheats;
}

export function loadCheats(storage = globalThis.localStorage) {
  const cheats = defaultCheats();
  try {
    const stored = JSON.parse(storage?.getItem(CHEAT_STORAGE_KEY) ?? "null");
    if (stored && typeof stored === "object" && !Array.isArray(stored)) {
      for (const key of Object.keys(cheats)) {
        if (typeof stored[key] === "boolean") cheats[key] = stored[key];
      }
    }
  } catch {
    // Corrupt JSON or blocked storage: fall back to defaults.
  }
  return cheats;
}

export function saveCheats(cheats, storage = globalThis.localStorage) {
  try {
    const clean = defaultCheats();
    for (const key of Object.keys(clean)) clean[key] = cheats?.[key] === true;
    storage?.setItem(CHEAT_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Private mode / quota: cheats just won't persist.
  }
}

export function unlockCheats(cheats) {
  return { ...defaultCheats(), ...cheats, unlocked: true };
}

const KEY_TOKENS = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  Up: "up", Down: "down", Left: "left", Right: "right",
  a: "a", A: "a", b: "b", B: "b",
};
const CODE_TOKENS = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  KeyA: "a", KeyB: "b",
};

// Only arrows + A/B count, so player-one WASD movement never feeds the code.
export function keyToToken(event) {
  if (!event || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return null;
  return KEY_TOKENS[event.key] ?? CODE_TOKENS[event.code] ?? null;
}

const PAD_TOKENS = [[12, "up"], [13, "down"], [14, "left"], [15, "right"], [1, "b"], [0, "a"]];

// Tokens for buttons that went from released to pressed between two polls.
export function padTokens(prevPressed = [], pressed = []) {
  return PAD_TOKENS.filter(([index]) => pressed[index] && !prevPressed[index]).map(([, token]) => token);
}

// Screen y grows downward, so a negative dy is an upward swipe.
export function swipeToToken(dx, dy, min = 30) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < min) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

export function createKonamiDetector({ onUnlock, timeout = 2500, sequence = KONAMI_SEQUENCE } = {}) {
  // KMP failure table: fail[i] = length of the longest proper prefix of
  // sequence[0..i] that is also a suffix of it.
  const fail = new Array(sequence.length).fill(0);
  for (let i = 1, k = 0; i < sequence.length; i++) {
    while (k > 0 && sequence[i] !== sequence[k]) k = fail[k - 1];
    if (sequence[i] === sequence[k]) k++;
    fail[i] = k;
  }
  let progress = 0;
  let last = -Infinity;
  return {
    push(token, now = globalThis.performance?.now?.() ?? Date.now()) {
      if (now - last > timeout) progress = 0;
      last = now;
      while (progress > 0 && sequence[progress] !== token) progress = fail[progress - 1];
      if (sequence[progress] === token) progress++;
      if (progress < sequence.length) return false;
      progress = 0;
      last = -Infinity;
      onUnlock?.();
      return true;
    },
    reset() {
      progress = 0;
      last = -Infinity;
    },
    get progress() {
      return progress;
    },
  };
}

export function installKonami({
  target = document,
  onUnlock,
  onProgress,
  getGamepads = () => navigator.getGamepads?.() ?? [],
  timeout,
} = {}) {
  const doc = target.ownerDocument || target;
  const win = doc.defaultView || globalThis;
  const detector = createKonamiDetector({ onUnlock, timeout });
  const push = (token) => {
    if (!token) return;
    detector.push(token);
    onProgress?.(detector.progress, KONAMI_SEQUENCE.length);
  };
  const options = { capture: true, passive: true };

  // Never preventDefault/stopPropagation: the game still gets every key.
  const onKeyDown = (event) => push(keyToToken(event));

  let touchStart = null;
  const onTouchStart = (event) => {
    const touch = event.changedTouches?.[0] ?? event.touches?.[0];
    touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const onTouchEnd = (event) => {
    const touch = event.changedTouches?.[0];
    if (!touchStart || !touch) return;
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    const start = touchStart;
    touchStart = null;
    push(swipeToToken(dx, dy) ?? (start.x < (win.innerWidth || 0) / 2 ? "b" : "a"));
  };

  const prevByPad = new Map();
  let frame = 0;
  const poll = () => {
    frame = 0;
    if (doc.visibilityState === "hidden") return;
    let pads = [];
    try {
      pads = getGamepads() ?? [];
    } catch {
      pads = [];
    }
    for (const pad of pads) {
      if (!pad) continue;
      const pressed = Array.from(pad.buttons ?? [], (button) => Boolean(button?.pressed));
      for (const token of padTokens(prevByPad.get(pad.index) ?? [], pressed)) push(token);
      prevByPad.set(pad.index, pressed);
    }
    frame = win.requestAnimationFrame?.(poll) ?? 0;
  };
  const startPolling = () => {
    if (!frame && doc.visibilityState !== "hidden") frame = win.requestAnimationFrame?.(poll) ?? 0;
  };
  const stopPolling = () => {
    if (frame) win.cancelAnimationFrame?.(frame);
    frame = 0;
  };
  const onVisibility = () => (doc.visibilityState === "hidden" ? stopPolling() : startPolling());

  target.addEventListener("keydown", onKeyDown, options);
  target.addEventListener("touchstart", onTouchStart, options);
  target.addEventListener("touchend", onTouchEnd, options);
  doc.addEventListener("visibilitychange", onVisibility);
  startPolling();

  return function uninstall() {
    target.removeEventListener("keydown", onKeyDown, options);
    target.removeEventListener("touchstart", onTouchStart, options);
    target.removeEventListener("touchend", onTouchEnd, options);
    doc.removeEventListener("visibilitychange", onVisibility);
    stopPolling();
    prevByPad.clear();
  };
}
