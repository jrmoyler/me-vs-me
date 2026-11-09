import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import {
  KONAMI_SEQUENCE, CHEAT_STORAGE_KEY, CHEATS, defaultCheats, loadCheats, saveCheats, unlockCheats,
  keyToToken, padTokens, swipeToToken, createKonamiDetector, installKonami,
} from "../src/konami.js";

const CODE = KONAMI_SEQUENCE;

function feed(detector, tokens, { start = 0, step = 100 } = {}) {
  return tokens.map((token, i) => detector.push(token, start + i * step));
}

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

const throwingStorage = {
  getItem() { throw new Error("SecurityError"); },
  setItem() { throw new Error("QuotaExceededError"); },
};

test("constants match the contract", () => {
  assert.deepEqual(CODE, ["up", "up", "down", "down", "left", "right", "left", "right", "b", "a"]);
  assert.equal(CHEAT_STORAGE_KEY, "mvm-konami");
  assert.deepEqual(CHEATS.map((c) => c.id), ["turbo", "bigHead", "rainbow", "crt", "lives30", "meter"]);
  for (const cheat of CHEATS) {
    assert.equal(typeof cheat.name, "string");
    assert.ok(cheat.blurb.length > 0);
  }
  assert.deepEqual(defaultCheats(), {
    unlocked: false, turbo: false, bigHead: false, rainbow: false, crt: false, lives30: false, meter: false,
  });
  assert.notEqual(defaultCheats(), defaultCheats(), "fresh object each call");
});

test("detector unlocks on the full sequence", () => {
  let unlocks = 0;
  const detector = createKonamiDetector({ onUnlock: () => unlocks++ });
  const results = feed(detector, CODE);
  assert.deepEqual(results, [...Array(9).fill(false), true]);
  assert.equal(unlocks, 1);
  assert.equal(detector.progress, 0, "progress resets after unlocking");
});

test("detector tracks progress step by step", () => {
  const detector = createKonamiDetector();
  CODE.slice(0, 5).forEach((token, i) => {
    detector.push(token, i * 10);
    assert.equal(detector.progress, i + 1);
  });
});

test("overlapping prefix still unlocks (up,up,up,down,...)", () => {
  let unlocks = 0;
  const detector = createKonamiDetector({ onUnlock: () => unlocks++ });
  const results = feed(detector, ["up", ...CODE]);
  assert.equal(results.at(-1), true);
  assert.equal(unlocks, 1);
  detector.reset();
  // Extra ups before the downs keep progress at 2.
  feed(detector, ["up", "up", "up", "up"]);
  assert.equal(detector.progress, 2);
});

test("a wrong token resets, but may itself start a new attempt", () => {
  const detector = createKonamiDetector();
  feed(detector, ["up", "up", "down", "down", "left"]);
  assert.equal(detector.progress, 5);
  detector.push("a", 600);
  assert.equal(detector.progress, 0);
  detector.push("up", 700);
  assert.equal(detector.progress, 1, "wrong token that is a valid first token restarts at 1");
  feed(detector, ["up", "down", "x"], { start: 800 });
  assert.equal(detector.progress, 0);
  feed(detector, ["up", "up", "down", "up"], { start: 2000 });
  assert.equal(detector.progress, 1);
});

test("a gap longer than the timeout resets", () => {
  let unlocks = 0;
  const detector = createKonamiDetector({ onUnlock: () => unlocks++, timeout: 1000 });
  feed(detector, CODE.slice(0, 6), { step: 900 });
  assert.equal(detector.progress, 6, "900ms gaps are within a 1000ms timeout");
  detector.push(CODE[6], 5 * 900 + 1001);
  assert.equal(detector.progress, 0, "stale progress dropped; 'left' is not a first token");
  assert.equal(unlocks, 0);
  // After a timeout the late token can still start a fresh attempt.
  feed(detector, ["up", "up"], { start: 10000 });
  detector.push("up", 20000);
  assert.equal(detector.progress, 1);
  // Default timeout is 2500ms.
  const def = createKonamiDetector();
  def.push("up", 0);
  def.push("up", 2500);
  assert.equal(def.progress, 2);
  def.push("down", 5001);
  assert.equal(def.progress, 0);
});

test("the code can be entered again after unlocking", () => {
  let unlocks = 0;
  const detector = createKonamiDetector({ onUnlock: () => unlocks++ });
  assert.equal(feed(detector, CODE, { start: 0 }).at(-1), true);
  assert.equal(feed(detector, CODE, { start: 1100 }).at(-1), true);
  assert.equal(feed(detector, [...CODE, ...CODE], { start: 3000 }).filter(Boolean).length, 2);
  assert.equal(unlocks, 4);
});

test("reset clears progress and custom sequences work", () => {
  const detector = createKonamiDetector({ sequence: ["a", "a", "b"] });
  feed(detector, ["a", "a"]);
  detector.reset();
  assert.equal(detector.progress, 0);
  assert.deepEqual(feed(detector, ["a", "a", "a", "b"]), [false, false, false, true]);
});

test("keyToToken maps arrows and A/B only", () => {
  const key = (k, extra = {}) => keyToToken({ key: k, ...extra });
  assert.equal(key("ArrowUp"), "up");
  assert.equal(key("ArrowDown"), "down");
  assert.equal(key("ArrowLeft"), "left");
  assert.equal(key("ArrowRight"), "right");
  assert.equal(key("a"), "a");
  assert.equal(key("A"), "a");
  assert.equal(key("b"), "b");
  assert.equal(key("B"), "b");
  // event.code fallback (e.g. non-Latin layouts).
  assert.equal(keyToToken({ key: "ф", code: "KeyA" }), "a");
  assert.equal(keyToToken({ key: "и", code: "KeyB" }), "b");
  assert.equal(keyToToken({ key: "Unidentified", code: "ArrowUp" }), "up");
  // Player-one WASD and other keys are ignored.
  for (const k of ["w", "W", "s", "S", "d", "D", "Enter", " ", "j", "Escape"]) assert.equal(key(k), null, k);
  assert.equal(keyToToken({ key: "w", code: "KeyW" }), null);
  assert.equal(keyToToken({ key: "d", code: "KeyD" }), null);
});

test("keyToToken ignores repeats and modifier chords", () => {
  assert.equal(keyToToken({ key: "ArrowUp", repeat: true }), null);
  assert.equal(keyToToken({ key: "a", ctrlKey: true }), null);
  assert.equal(keyToToken({ key: "a", metaKey: true }), null);
  assert.equal(keyToToken({ key: "b", altKey: true }), null);
  assert.equal(keyToToken({ key: "A", shiftKey: true }), "a", "shift is fine");
  assert.equal(keyToToken(null), null);
});

test("padTokens reports only newly pressed buttons", () => {
  const pressed = (...indexes) => {
    const out = Array(17).fill(false);
    for (const i of indexes) out[i] = true;
    return out;
  };
  assert.deepEqual(padTokens(pressed(), pressed(12)), ["up"]);
  assert.deepEqual(padTokens(pressed(12), pressed(12)), [], "held button is not a new press");
  assert.deepEqual(padTokens(pressed(12), pressed()), [], "release is not a press");
  assert.deepEqual(padTokens(pressed(), pressed(13)), ["down"]);
  assert.deepEqual(padTokens(pressed(), pressed(14)), ["left"]);
  assert.deepEqual(padTokens(pressed(), pressed(15)), ["right"]);
  assert.deepEqual(padTokens(pressed(), pressed(1)), ["b"]);
  assert.deepEqual(padTokens(pressed(), pressed(0)), ["a"]);
  assert.deepEqual(padTokens(pressed(), pressed(2, 3, 4, 9)), [], "other buttons ignored");
  assert.deepEqual(padTokens(pressed(0), pressed(0, 1)), ["b"]);
  assert.deepEqual(padTokens([], pressed(12, 0)).sort(), ["a", "up"]);
  assert.deepEqual(padTokens(undefined, [true]), ["a"]);
});

test("swipeToToken picks the dominant axis", () => {
  assert.equal(swipeToToken(0, -80), "up");
  assert.equal(swipeToToken(0, 80), "down");
  assert.equal(swipeToToken(-80, 10), "left");
  assert.equal(swipeToToken(80, -10), "right");
  assert.equal(swipeToToken(40, -60), "up");
  assert.equal(swipeToToken(-60, 40), "left");
  assert.equal(swipeToToken(10, 12), null, "short movement is a tap");
  assert.equal(swipeToToken(29, 0), null);
  assert.equal(swipeToToken(30, 0), "right");
  assert.equal(swipeToToken(50, 0, 60), null, "custom threshold");
  assert.equal(swipeToToken(0, 0), null);
});

test("loadCheats merges stored booleans over defaults", () => {
  const storage = memoryStorage({
    [CHEAT_STORAGE_KEY]: JSON.stringify({ unlocked: true, turbo: true, crt: "yes", meter: 1, bogus: true }),
  });
  const cheats = loadCheats(storage);
  assert.deepEqual(cheats, { ...defaultCheats(), unlocked: true, turbo: true });
  assert.equal("bogus" in cheats, false);
});

test("loadCheats never throws", () => {
  assert.deepEqual(loadCheats(memoryStorage()), defaultCheats(), "missing key");
  assert.deepEqual(loadCheats(memoryStorage({ [CHEAT_STORAGE_KEY]: "{not json" })), defaultCheats(), "corrupt JSON");
  assert.deepEqual(loadCheats(memoryStorage({ [CHEAT_STORAGE_KEY]: "[true,true]" })), defaultCheats(), "array");
  assert.deepEqual(loadCheats(memoryStorage({ [CHEAT_STORAGE_KEY]: "42" })), defaultCheats(), "number");
  assert.deepEqual(loadCheats(memoryStorage({ [CHEAT_STORAGE_KEY]: "null" })), defaultCheats(), "null");
  assert.deepEqual(loadCheats(throwingStorage), defaultCheats(), "throwing storage");
  assert.deepEqual(loadCheats(null), defaultCheats(), "no storage");
  assert.deepEqual(loadCheats(undefined), defaultCheats(), "default storage (absent in node)");
});

test("saveCheats round-trips and never throws", () => {
  const storage = memoryStorage();
  const cheats = { ...unlockCheats(defaultCheats()), rainbow: true, extra: "nope" };
  saveCheats(cheats, storage);
  const raw = JSON.parse(storage.data.get(CHEAT_STORAGE_KEY));
  assert.equal("extra" in raw, false);
  assert.deepEqual(loadCheats(storage), { ...defaultCheats(), unlocked: true, rainbow: true });
  assert.doesNotThrow(() => saveCheats(cheats, throwingStorage));
  assert.doesNotThrow(() => saveCheats(cheats, null));
  assert.doesNotThrow(() => saveCheats(null, storage));
  assert.doesNotThrow(() => saveCheats(cheats));
});

test("unlockCheats sets unlocked without forcing any cheat on", () => {
  const before = { ...defaultCheats(), crt: true };
  const after = unlockCheats(before);
  assert.notEqual(after, before, "returns a new object");
  assert.equal(before.unlocked, false, "input untouched");
  assert.deepEqual(after, { ...defaultCheats(), unlocked: true, crt: true });
  assert.deepEqual(unlockCheats(defaultCheats()), { ...defaultCheats(), unlocked: true });
});

function setupDom() {
  const window = new Window({ url: "http://localhost", width: 800, height: 600 });
  const frames = new Map();
  let nextFrame = 1;
  window.requestAnimationFrame = (fn) => { const id = nextFrame++; frames.set(id, fn); return id; };
  window.cancelAnimationFrame = (id) => frames.delete(id);
  const tick = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const fn of pending) fn();
  };
  const key = (target, k, init = {}) => {
    const event = new window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  };
  return { window, document: window.document, frames, tick, key };
}

test("installKonami unlocks from keyboard events without blocking the game", () => {
  const { document, key } = setupDom();
  const progress = [];
  let unlocks = 0;
  let gameKeys = 0;
  document.body.addEventListener("keydown", () => gameKeys++);
  const uninstall = installKonami({
    target: document,
    onUnlock: () => unlocks++,
    onProgress: (p, total) => progress.push(`${p}/${total}`),
    getGamepads: () => [],
  });
  const names = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", a: "a", b: "B" };
  const events = CODE.map((token) => key(document.body, names[token]));
  assert.equal(unlocks, 1);
  assert.equal(gameKeys, CODE.length, "every key still reaches game listeners");
  assert.ok(events.every((e) => !e.defaultPrevented), "never preventDefault");
  assert.deepEqual(progress, [...CODE.slice(0, 9).map((_, i) => `${i + 1}/10`), "0/10"]);
  // WASD and repeats are ignored entirely (no progress callback either).
  key(document.body, "w");
  key(document.body, "ArrowUp", { repeat: true });
  assert.equal(progress.length, CODE.length);
  uninstall();
});

test("uninstall removes keyboard, touch and gamepad listeners", () => {
  const { document, frames, tick, key } = setupDom();
  let unlocks = 0, progressCalls = 0, padPolls = 0;
  const uninstall = installKonami({
    target: document,
    onUnlock: () => unlocks++,
    onProgress: () => progressCalls++,
    getGamepads: () => { padPolls++; return []; },
  });
  assert.equal(frames.size, 1, "gamepad polling scheduled");
  tick();
  assert.equal(padPolls, 1);
  uninstall();
  assert.equal(frames.size, 0, "rAF cancelled");
  tick();
  assert.equal(padPolls, 1);
  for (const token of CODE) key(document.body, { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", a: "a", b: "b" }[token]);
  assert.equal(progressCalls, 0);
  assert.equal(unlocks, 0);
  assert.doesNotThrow(() => uninstall(), "idempotent");
});

test("installKonami reads gamepad presses per pad with edge detection", () => {
  const { document, tick } = setupDom();
  let unlocks = 0;
  const progress = [];
  const pads = [null, null];
  const pad = (index, ...down) => ({
    index,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 })),
  });
  const uninstall = installKonami({
    target: document,
    onUnlock: () => unlocks++,
    onProgress: (p) => progress.push(p),
    getGamepads: () => pads,
  });
  const indexFor = { up: 12, down: 13, left: 14, right: 15, b: 1, a: 0 };
  for (const token of CODE) {
    pads[1] = pad(1, indexFor[token]);
    tick();
    pads[1] = pad(1);
    tick();
  }
  assert.equal(unlocks, 1);
  // Holding a button across many frames counts once.
  pads[0] = pad(0, 12);
  tick(); tick(); tick();
  assert.equal(progress.at(-1), 1);
  assert.equal(progress.length, CODE.length + 1);
  // A second pad pressing the same button is tracked separately.
  pads[1] = pad(1, 12);
  tick();
  assert.equal(progress.at(-1), 2);
  uninstall();
});

test("gamepad polling pauses while the document is hidden", () => {
  const { document, frames, tick } = setupDom();
  let state = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  let polls = 0;
  const uninstall = installKonami({ target: document, getGamepads: () => { polls++; return []; } });
  tick();
  assert.equal(polls, 1);
  state = "hidden";
  document.dispatchEvent(new document.defaultView.Event("visibilitychange"));
  assert.equal(frames.size, 0);
  tick();
  assert.equal(polls, 1);
  state = "visible";
  document.dispatchEvent(new document.defaultView.Event("visibilitychange"));
  assert.equal(frames.size, 1);
  tick();
  assert.equal(polls, 2);
  uninstall();
});

test("installKonami turns swipes and taps into tokens", () => {
  const { window, document } = setupDom();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
  const tokens = [];
  let unlocks = 0;
  const uninstall = installKonami({
    target: document,
    onUnlock: () => unlocks++,
    onProgress: (p) => tokens.push(p),
    getGamepads: () => [],
  });
  const touch = (type, x, y) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "changedTouches", { value: [{ clientX: x, clientY: y }] });
    document.body.dispatchEvent(event);
    return event;
  };
  const gesture = (x0, y0, x1, y1) => { touch("touchstart", x0, y0); return touch("touchend", x1, y1); };
  const swipes = {
    up: [400, 400, 400, 300], down: [400, 300, 400, 400],
    left: [400, 300, 300, 300], right: [300, 300, 400, 300],
    b: [100, 300, 105, 302], a: [700, 300, 698, 304],
  };
  const ends = CODE.map((token) => gesture(...swipes[token]));
  assert.equal(unlocks, 1);
  assert.ok(ends.every((e) => !e.defaultPrevented));
  // A left-half tap is "b", which is not a first token; a right-half tap is "a".
  gesture(...swipes.up);
  assert.equal(tokens.at(-1), 1);
  gesture(...swipes.a);
  assert.equal(tokens.at(-1), 0);
  // touchend without a matching touchstart is ignored.
  const before = tokens.length;
  touch("touchend", 10, 10);
  assert.equal(tokens.length, before);
  uninstall();
  gesture(...swipes.up);
  assert.equal(tokens.length, before);
});
