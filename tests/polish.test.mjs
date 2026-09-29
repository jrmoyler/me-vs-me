// Polish layer: result grading, the combat HUD (damage trail, tones, meter, banners),
// camera punch / slow-motion finish, landing dust, and menu focus navigation.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { characters, bodyScale } from "../src/characters.js";
import { arenas } from "../src/arenas.js";
import * as rules from "../src/combat-rules.js";
import * as moves from "../src/moves.js";
import * as tournament from "../src/tournament.js";
import * as matchStats from "../src/match-stats.js";
import { motionFrame } from "../src/motion.js";
import * as effects from "../src/stage-effects.js";
import * as controller from "../src/controller.js";

const { matchGrade, matchScore, gradeFor, statTiles, GRADES } = matchStats;

test("match grade: wins outrank losses, clean and untouched wins reach S, output is bounded", () => {
  const loss = matchGrade({ won: false, playerRounds: 1, opponentRounds: 2, stats: { damageDealt: 177, damageTaken: 318, maxCombo: 2, specials: 10 } });
  const win = matchGrade({ won: true, playerRounds: 2, opponentRounds: 1, stats: { damageDealt: 230, damageTaken: 150, maxCombo: 2 } });
  const flawless = matchGrade({ won: true, playerRounds: 2, opponentRounds: 0, stats: { damageDealt: 200, damageTaken: 0, maxCombo: 4, blocked: 3, specials: 2 } });
  assert.ok(win.score > loss.score);
  assert.equal(flawless.grade, "S");
  assert.equal(loss.grade, "D");
  for (const r of [loss, win, flawless, matchGrade(), matchGrade({ won: true, stats: { damageDealt: 1e9, maxCombo: 999 } })]) {
    assert.ok(r.score >= 0 && r.score <= 100, `score ${r.score}`);
    assert.ok(GRADES.some(([, g]) => g === r.grade));
  }
  // Same stats, same grade; garbage input never throws.
  assert.deepEqual(matchGrade({ won: true, stats: { hits: 3 } }), matchGrade({ won: true, stats: { hits: 3 } }));
  assert.equal(matchScore({ won: true, stats: { damageDealt: "x", maxCombo: null } }), 55);
});

test("grade thresholds and stat tiles", () => {
  assert.deepEqual([100, 90, 89, 75, 74, 55, 54, 35, 34, 0].map(gradeFor), ["S", "S", "A", "A", "B", "B", "C", "C", "D", "D"]);
  const tiles = statTiles({ hits: 4, maxCombo: 3, damageDealt: 50.6, damageTaken: 12.2, specials: 1, blocked: 2 });
  assert.deepEqual(tiles.map((t) => t[0]), ["hits", "maxCombo", "damageDealt", "damageTaken", "specials", "blocked"]);
  assert.deepEqual(tiles.map((t) => t[2]), [4, 3, 51, 12, 1, 2]);
  assert.ok(statTiles().every((t) => t[2] === 0));
});

// ─── combat HUD and juice (same Phaser stub as tests/combat-runtime.test.mjs) ───
const combatSource =
  readFileSync(new URL("../src/combat.js", import.meta.url), "utf8")
    .replace(/^import[\s\S]*?;\n/gm, "")
    .replace("export async function startCombat", "async function startCombat") + "\nthis.startCombat=startCombat;";
function art() {
  const obj = { x: 0, y: 0 };
  const proxy = new Proxy(obj, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        if (key === "setPosition") [target.x, target.y] = args;
        return proxy;
      };
    },
  });
  return proxy;
}
async function combat({ reducedMotion = false, mode = "duel" } = {}) {
  const window = new Window({ url: "http://localhost" });
  window.document.body.innerHTML = '<div id="host"></div>';
  let scene;
  const camera = { zooms: [], flashes: 0, shake() {}, setBounds() {}, setZoom(z) { this.zooms.push(z); this.zoom = z; }, centerOn() {}, flash() { this.flashes++; } };
  const Phaser = {
    Scene: class {},
    Math: { Clamp: (x, min, max) => Math.max(min, Math.min(max, x)) },
    Scale: { FIT: 1, CENTER_BOTH: 1 },
    AUTO: 1,
    Game: class {
      constructor(config) {
        scene = new config.scene();
        scene.add = { image: art, rectangle: art, sprite: art, ellipse: art, graphics: art };
        scene.cameras = { main: camera };
        scene.time = { delayedCall() {} };
        scene.create();
      }
      destroy() {}
    },
  };
  const context = vm.createContext({
    window, document: window.document, navigator: window.navigator, innerWidth: 1100,
    matchMedia: () => ({ matches: false }), Phaser, motionFrame,
    ...rules, ...moves, ...effects, ...controller, queueMicrotask, console,
  });
  vm.runInContext(combatSource, context);
  let ended = null;
  const control = await context.startCombat({
    container: window.document.querySelector("#host"),
    player: characters[0],
    opponent: characters[1],
    arena: arenas[0],
    mode,
    settings: { sound: false, reducedMotion },
    onEnd: (r) => (ended = r),
  });
  scene.ai = () => ({});
  const doc = window.document;
  return { scene, control, doc, camera, step: (n = 1) => { for (let i = 0; i < n; i++) scene.update(0, 16); }, get ended() { return ended; } };
}

test("HUD: faces, a damage trail under each bar, health tones and the meter-ready flag", async () => {
  const h = await combat();
  const faces = h.doc.querySelectorAll(".mvm-hud-face");
  assert.equal(faces.length, 2);
  assert.equal(faces[0].getAttribute("src"), characters[0].bust || characters[0].portrait);
  h.scene.phase = "fight";
  const [p, o] = h.scene.fighters;
  o.hp = 40;
  p.energy = 10;
  h.scene.sync();
  assert.equal(h.doc.querySelector('[data-health="1"]').style.width, "40%");
  assert.equal(h.doc.querySelector('[data-chip="1"]').style.width, "40%", "the chip layer follows (CSS delays its drain)");
  assert.equal(h.doc.querySelector('[data-health="1"]').parentElement.dataset.tone, "warn");
  o.hp = 20;
  h.scene.sync();
  assert.equal(h.doc.querySelector('[data-health="1"]').parentElement.dataset.tone, "low");
  assert.equal(h.doc.querySelector('[data-health="0"]').parentElement.dataset.tone, "ok");
  assert.equal(h.doc.querySelectorAll(".mvm-energy")[0].dataset.ready, "false");
  p.energy = 60;
  h.scene.sync();
  assert.equal(h.doc.querySelectorAll(".mvm-energy")[0].dataset.ready, "true");
  h.scene.timer = 9;
  h.scene.sync();
  assert.equal(h.doc.querySelector(".mvm-clock").dataset.low, "true");
  h.control.destroy();
});

test("banners: ROUND, FIGHT!, K.O. with the winner, PERFECT, FINAL ROUND", async () => {
  const h = await combat();
  const message = h.doc.querySelector(".mvm-message");
  const until = (pred, max = 400) => {
    for (let i = 0; i < max && !pred(); i++) h.step();
    return pred();
  };
  assert.equal(message.dataset.kind, "round");
  assert.match(message.textContent, /ROUND 1/);
  assert.ok(until(() => message.dataset.kind === "fight"));
  assert.equal(message.textContent, "FIGHT!");
  assert.ok(until(() => h.scene.phase === "fight"));
  assert.equal(message.textContent, "");
  const [p, o] = h.scene.fighters;
  o.hp = 0;
  h.step();
  assert.equal(message.dataset.kind, "perfect", "the winner never lost health");
  assert.match(message.textContent, /PERFECT.*K\.O\. · YOU WIN/);
  assert.ok(until(() => /ROUND 2/.test(message.textContent)));
  assert.ok(until(() => h.scene.phase === "fight"));
  o.hp = 60;
  p.hp = 0;
  h.step();
  assert.equal(message.dataset.kind, "ko");
  assert.match(message.textContent, /K\.O\.RIVAL WINS/);
  assert.ok(until(() => /FINAL ROUND/.test(message.textContent)));
  h.control.destroy();
});

test("the match-winning K.O. zooms, flashes and plays in slow motion; reduced motion skips all three", async () => {
  for (const reducedMotion of [false, true]) {
    const h = await combat({ reducedMotion });
    h.step(140);
    const [p, o] = h.scene.fighters;
    p.rounds = 1;
    o.hp = 0;
    h.step();
    assert.equal(o.rounds, 0);
    assert.equal(p.rounds, 2);
    if (reducedMotion) {
      assert.equal(h.scene.slowMo, 0);
      assert.equal(h.camera.flashes, 0);
      assert.equal(h.scene.punch, null);
    } else {
      assert.ok(h.scene.slowMo > 0, "slow motion armed");
      assert.equal(h.camera.flashes, 1);
      h.step(6);
      assert.ok(Math.max(...h.camera.zooms) > 1.05, "camera zoomed toward the loser");
    }
    // Slow motion stretches the result phase but the match still ends.
    for (let i = 0; i < 600 && !h.ended; i++) h.step();
    await new Promise((r) => setImmediate(r));
    assert.equal(h.ended?.winner, "player");
    assert.equal(h.camera.zoom ?? 1, 1, "the camera settles back to 1×");
    h.control.destroy();
  }
});

test("landing and knockdown raise bounded dust; reduced motion raises none", async () => {
  for (const reducedMotion of [false, true]) {
    const h = await combat({ reducedMotion, mode: "training" });
    h.scene.phase = "fight";
    const p = h.scene.fighters[0];
    let most = 0;
    for (let n = 0; n < 12; n++) {
      Object.assign(p, { y: 300, vy: 0, wasAir: true });
      h.step(40);
      most = Math.max(most, h.scene.dust.length);
    }
    if (reducedMotion) assert.equal(most, 0);
    else assert.ok(most > 0 && most <= 16, `dust ${most}`);
    h.control.destroy();
  }
});

test("pause names the arena and score and keeps RESUME / MOVE LIST / LEAVE in order", async () => {
  const h = await combat();
  h.control.pause();
  const overlay = h.doc.querySelector(".mvm-overlay");
  assert.match(overlay.querySelector(".mvm-overlay-eyebrow").textContent, new RegExp(arenas[0].name.toUpperCase().replace(/[^A-Z ]/g, "."), "i"));
  assert.deepEqual([...overlay.querySelectorAll("button")].map((b) => b.className), ["mvm-resume", "mvm-leave"]);
  assert.equal(h.doc.activeElement, overlay.querySelector(".mvm-resume"));
  overlay.querySelector(".mvm-resume").click();
  assert.equal(h.doc.querySelector(".mvm-overlay"), null);
  h.control.destroy();
});

// ─── main.js: result summary, bracket faces, focus navigation ───
const mainSource = readFileSync(new URL("../src/main.js", import.meta.url), "utf8").replace(/^import .*;\n/gm, "");
function menus(saved = { "mvm-onboarded": true }) {
  const window = new Window({ url: "http://localhost:5173" });
  window.document.body.innerHTML = '<div id="app"></div>';
  for (const [k, v] of Object.entries(saved)) window.localStorage.setItem(k, JSON.stringify(v));
  let pending, latest;
  const context = vm.createContext({
    window, document: window.document, localStorage: window.localStorage, matchMedia: () => ({ matches: false }),
    characters, bodyScale, arenas, ...moves, ...tournament, ...matchStats, console,
    setTimeout: (fn) => ((pending = fn), 1), clearTimeout: () => { pending = null; },
    startBonus: () => ({ destroy() {} }),
    startCombat: async (o) => { latest = o; return { destroy() {} }; },
    registerPWA() {}, installState: () => "none", onInstallChange() {}, promptInstall: async () => "unavailable",
  });
  vm.runInContext(mainSource, context);
  const doc = window.document;
  return {
    doc,
    click: (s) => doc.querySelector(s).click(),
    key: (key) => doc.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })),
    launch: async () => pending(),
    end: (data) => latest.onEnd(data),
  };
}

test("results show six stat tiles and a grade; training shows tiles without a grade", async () => {
  const h = menus();
  h.click('[data-mode="duel"]');
  h.key("Enter");
  h.key("Enter");
  h.key("Enter");
  await h.launch();
  h.end({ winner: "player", playerRounds: 2, opponentRounds: 0, stats: { hits: 12, maxCombo: 4, damageDealt: 200, damageTaken: 0, specials: 2, blocked: 3 } });
  assert.equal(h.doc.querySelectorAll(".match-breakdown [data-stat]").length, 6);
  assert.equal(h.doc.querySelector('[data-stat="maxCombo"] b').textContent, "4");
  assert.equal(h.doc.querySelector(".match-grade").dataset.grade, "S");
  assert.ok(h.doc.querySelector(".result-art-backdrop"), "the winner stands in front of the arena");
  assert.ok(h.doc.querySelector("main.screen-enter"), "a new screen plays its entrance");

  const t = menus();
  t.click('[data-mode="training"]');
  t.key("Enter");
  t.key("Enter");
  t.key("Enter");
  await t.launch();
  t.end({ winner: "player", playerRounds: 2, opponentRounds: 0 });
  assert.equal(t.doc.querySelector(".match-grade"), null);
  assert.ok(t.doc.querySelector(".match-summary.ungraded"));
});

test("re-rendering the same screen does not replay its entrance", () => {
  const h = menus();
  h.click('[data-mode="duel"]');
  assert.ok(h.doc.querySelector("main.screen-enter"));
  h.key("ArrowRight");
  assert.equal(h.doc.querySelector("main.screen-enter"), null);
});

test("bracket slots use the head-and-shoulders art", () => {
  const h = menus();
  h.click('[data-mode="tournament"]');
  h.key("Enter");
  const faces = [...h.doc.querySelectorAll(".bracket-slot .bracket-face")];
  assert.equal(faces.length, 8);
  for (const img of faces) assert.match(img.getAttribute("src"), /-(bust|portrait)\.png$/);
});

test("arrow keys wrap through a whole roster row set without leaving the grid", () => {
  const h = menus();
  h.click('[data-mode="duel"]');
  // Without layout the grid reads as one column: up and down step one fighter.
  h.key("ArrowDown");
  h.key("ArrowDown");
  h.key("ArrowUp");
  assert.equal(h.doc.querySelector(".roster-fighter.selected").dataset.index, "1");
  h.key("ArrowUp");
  h.key("ArrowUp");
  assert.equal(h.doc.querySelector(".roster-fighter.selected").dataset.index, String(characters.length - 1));
});
