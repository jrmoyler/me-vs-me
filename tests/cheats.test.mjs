import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { characters } from "../src/characters.js";
import { arenas } from "../src/arenas.js";
import * as rules from "../src/combat-rules.js";
import * as moves from "../src/moves.js";
import { motionFrame } from "../src/motion.js";
import * as effects from "../src/stage-effects.js";
import * as controller from "../src/controller.js";
import * as cheatFx from "../src/cheat-effects.js";
import {
  activeCheats,
  inMatchCheats,
  cheatColor,
  hexString,
  rgbToHsv,
  hsvToRgb,
  headCrop,
  crtStyle,
  timeScale,
  TURBO_SCALE,
  CHEAT_IDS,
} from "../src/cheat-effects.js";

const ALL = { unlocked: true, turbo: true, bigHead: true, rainbow: true, crt: true, lives30: true, meter: true };

// ─── pure helpers ───
test("activeCheats: nothing without an unlocked cheats object", () => {
  assert.deepEqual(activeCheats(), []);
  assert.deepEqual(activeCheats({}), []);
  assert.deepEqual(activeCheats({ cheats: null }), []);
  assert.deepEqual(activeCheats({ cheats: { ...ALL, unlocked: false } }), []);
  assert.deepEqual(activeCheats({ cheats: { turbo: true } }), []);
});

test("activeCheats lists only switched-on ids, in display order", () => {
  assert.deepEqual(activeCheats({ cheats: ALL }), CHEAT_IDS);
  assert.deepEqual(activeCheats({ cheats: { unlocked: true, meter: true, turbo: true, bogus: true } }), ["turbo", "meter"]);
  assert.deepEqual(activeCheats({ cheats: { unlocked: true, turbo: "yes" } }), []);
  assert.deepEqual(inMatchCheats({ cheats: { unlocked: true, lives30: true } }), []);
  assert.deepEqual(inMatchCheats({ cheats: ALL }), ["turbo", "bigHead", "rainbow", "crt", "meter"]);
});

test("timeScale is 1 normally and TURBO_SCALE with turbo", () => {
  assert.equal(TURBO_SCALE, 1.35);
  assert.equal(timeScale({}), 1);
  assert.equal(timeScale({ cheats: { turbo: true } }), 1);
  assert.equal(timeScale({ cheats: { unlocked: true, turbo: true } }), 1.35);
});

test("hsv round trip", () => {
  for (const c of [0xff0000, 0x00ff00, 0x0000ff, 0x123456, 0xffe49e, 0x808080, 0x000000, 0xffffff]) {
    assert.equal(hsvToRgb(...rgbToHsv(c)), c, hexString(c));
  }
});

test("cheatColor cycles hue over time and stays a bright, saturated colour", () => {
  const seen = new Set();
  for (let t = 0; t < 2; t += 0.1) {
    const c = cheatColor(0xffe49e, t);
    assert.ok(Number.isInteger(c) && c >= 0 && c <= 0xffffff);
    const [, s, v] = rgbToHsv(c);
    assert.ok(s >= 0.54 && v >= 0.84, hexString(c));
    seen.add(Math.round(rgbToHsv(c)[0] * 6) % 6);
  }
  assert.ok(seen.size >= 5, "the hue sweeps the wheel");
  // white has no hue of its own but still gets a colour
  assert.notEqual(cheatColor(0xffffff, 0.3), 0xffffff);
  // strings work, and the cycle repeats every 1 / RAINBOW_SPEED seconds
  assert.equal(cheatColor("#ffa933", 0), cheatColor(0xffa933, 0));
  assert.equal(cheatColor(0x3366ff, 0), cheatColor(0x3366ff, 1 / cheatFx.RAINBOW_SPEED));
  assert.notEqual(cheatColor(0x3366ff, 0), cheatColor(0x3366ff, 0.5));
  assert.equal(hexString(0xab), "#0000ab");
});

test("headCrop takes the top of the body and pivots at the neck", () => {
  const crop = headCrop({ frameWidth: 320, frameHeight: 320, anchorY: 296, bodyHeight: 176 });
  assert.equal(crop.x, 0);
  assert.equal(crop.width, 320);
  assert.equal(crop.y + crop.height, crop.neck);
  assert.ok(crop.y < 296 - 176, "headroom above the body");
  assert.ok(Math.abs(296 - crop.neck - 176 * 0.72) <= 1);
  assert.equal(crop.visible, true);
  const tall = headCrop({ anchorY: 296, bodyHeight: 900 });
  assert.equal(tall.y, 0);
  assert.ok(tall.height > 0);
  // a measured crown (a crouch) moves the crop and the neck down with the head
  const crouch = headCrop({ anchorY: 296, bodyHeight: 176, top: 180 });
  assert.ok(crouch.y > crop.y && crouch.neck > crop.neck);
  assert.equal(crouch.visible, true);
  // lying on the floor: no head on top, the overlay hides
  assert.equal(headCrop({ anchorY: 296, bodyHeight: 176, top: 250 }).visible, false);
});

test("crtStyle never captures input and drops the flicker under reduced motion", () => {
  assert.match(crtStyle(), /pointer-events:none/);
  assert.match(crtStyle(), /repeating-linear-gradient/);
  assert.match(crtStyle(), /radial-gradient/);
  assert.match(crtStyle(), /cheat-crt-flicker/);
  assert.match(crtStyle({ reducedMotion: true }), /animation:none/);
  assert.doesNotMatch(crtStyle({ reducedMotion: true }), /flicker/);
});

// ─── runtime (same Phaser stub as tests/combat-runtime.test.mjs) ───
const source =
  readFileSync(new URL("../src/combat.js", import.meta.url), "utf8")
    .replace(/^import[\s\S]*?;\n/gm, "")
    .replace("export async function startCombat", "async function startCombat") + "\nthis.startCombat=startCombat;";
function art(x = 0, y = 0) {
  const obj = { x, y, frame: 0, calls: [] };
  const proxy = new Proxy(obj, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        target.calls.push([key, ...args]);
        if (key === "setFrame") target.frame = args[0];
        if (key === "setScale") target.scale = args[0];
        if (key === "setPosition") [target.x, target.y] = args;
        return proxy;
      };
    },
  });
  return proxy;
}
async function setup({ cheats, mode = "duel", reducedMotion = true, withHelpers = true } = {}) {
  const window = new Window({ url: "http://localhost" });
  window.document.body.innerHTML = '<div id="host"></div>';
  let scene;
  const sprites = [];
  const Phaser = {
    Scene: class {},
    Math: { Clamp: (x, min, max) => Math.max(min, Math.min(max, x)) },
    Scale: { FIT: 1, CENTER_BOTH: 1 },
    AUTO: 1,
    Game: class {
      constructor(config) {
        scene = new config.scene();
        scene.add = {
          image: art,
          rectangle: art,
          sprite: (...a) => {
            const s = art(...a);
            sprites.push(s);
            return s;
          },
          ellipse: art,
          graphics: art,
        };
        scene.cameras = { main: { shake() {} } };
        scene.time = { delayedCall() {} };
        scene.create();
        config.callbacks?.postBoot();
      }
      destroy() {}
    },
  };
  const context = vm.createContext({
    window,
    document: window.document,
    navigator: window.navigator,
    innerWidth: 1100,
    matchMedia: () => ({ matches: false }),
    Phaser,
    motionFrame,
    ...rules,
    ...moves,
    ...effects,
    ...controller,
    ...(withHelpers ? cheatFx : {}),
    queueMicrotask,
    console,
  });
  vm.runInContext(source, context);
  let ended = null;
  const control = await context.startCombat({
    container: window.document.querySelector("#host"),
    player: characters[0],
    opponent: characters[1],
    arena: arenas[0],
    mode,
    onEnd: (r) => (ended = r),
    settings: { sound: false, reducedMotion, ...(cheats ? { cheats } : {}) },
  });
  scene.phase = "fight";
  scene.ai = () => ({});
  return {
    scene,
    control,
    window,
    sprites,
    get ended() {
      return ended;
    },
    step(n = 1) {
      for (let i = 0; i < n; i++) scene.update(0, 16);
    },
  };
}

test("no settings.cheats: no tag, no overlay, no head sprites, normal clock", async () => {
  const h = await setup();
  assert.equal(h.window.document.querySelector(".mvm-cheats-tag"), null);
  assert.equal(h.window.document.querySelector(".cheat-crt"), null);
  assert.equal(h.sprites.length, 2);
  assert.ok(h.scene.fighters.every((f) => f.head === null));
  h.step(60);
  assert.ok(Math.abs(60 - h.scene.timer - 60 * 0.016) < 1e-9);
  h.control.destroy();
});

test("locked cheats change nothing", async () => {
  const h = await setup({ cheats: { ...ALL, unlocked: false } });
  assert.equal(h.window.document.querySelector(".mvm-cheats-tag"), null);
  assert.equal(h.sprites.length, 2);
  h.step(60);
  assert.ok(Math.abs(60 - h.scene.timer - 60 * 0.016) < 1e-9);
  h.control.destroy();
});

test("meter + turbo: POWER stays full and the clock runs 1.35x faster", async () => {
  const plain = await setup();
  const turbo = await setup({ cheats: { unlocked: true, meter: true, turbo: true } });
  assert.ok(turbo.window.document.querySelector(".mvm-cheats-tag"));
  assert.match(turbo.window.document.querySelector(".mvm-cheats-tag").textContent, /CHEATS ON/);
  const [p, o] = turbo.scene.fighters;
  p.energy = 10;
  o.energy = 0;
  turbo.step();
  assert.equal(p.energy, 100);
  assert.equal(o.energy, 100);
  // A POWER spends the meter, and the next tick fills it again.
  Object.assign(p, { x: 350, face: 1 });
  Object.assign(o, { x: 435 });
  assert.equal(turbo.scene.attack(p, "special"), true);
  turbo.step();
  assert.equal(p.energy, 100);
  for (let i = 0; i < 120; i++) {
    turbo.step();
    assert.equal(p.energy, 100);
    assert.equal(o.energy, 100);
  }
  // clocks: same number of renders, turbo spends more game time
  plain.scene.timer = 60;
  turbo.scene.timer = 60;
  turbo.scene.hitstop = 0;
  turbo.scene.phase = "fight";
  Object.assign(turbo.scene.fighters[1], { hp: 100 });
  plain.step(100);
  turbo.step(100);
  const a = 60 - plain.scene.timer,
    b = 60 - turbo.scene.timer;
  assert.ok(b > a, `turbo ${b} > plain ${a}`);
  assert.ok(Math.abs(b / a - 1.35) < 1e-6, `ratio ${b / a}`);
  plain.control.destroy();
  turbo.control.destroy();
});

test("turbo keeps hitstop and frame data in game time", async () => {
  const plain = await setup();
  const turbo = await setup({ cheats: { unlocked: true, turbo: true } });
  const frames = (h) => {
    const [p, o] = h.scene.fighters;
    Object.assign(p, { x: 350, face: 1, energy: 100 });
    Object.assign(o, { x: 435, hp: 100 });
    h.scene.attack(p, "heavy");
    let n = 0;
    while (p.attack && n < 500) {
      h.step();
      n++;
    }
    return n;
  };
  const a = frames(plain),
    b = frames(turbo);
  assert.ok(b < a, `turbo heavy finishes in fewer renders (${b} < ${a})`);
  assert.ok(Math.abs(a / b - 1.35) < 0.15, `ratio ${a / b}`);
  plain.control.destroy();
  turbo.control.destroy();
});

test("big head adds one cropped overlay per fighter, follows it, and leaves hits alone", async () => {
  const plain = await setup();
  const big = await setup({ cheats: { unlocked: true, bigHead: true } });
  assert.equal(big.sprites.length, 4);
  const damage = (h) => {
    const [p, o] = h.scene.fighters;
    Object.assign(p, { x: 350, face: 1, energy: 100 });
    Object.assign(o, { x: 435, hp: 100 });
    h.scene.attack(p, "medium");
    h.step(60);
    return o.hp;
  };
  assert.equal(damage(big), damage(plain));
  for (const [i, f] of big.scene.fighters.entries()) {
    const head = f.head;
    assert.ok(head);
    assert.equal(head.frame, f.sprite.frame);
    assert.equal(head.x, f.sprite.x);
    assert.ok(head.y < f.y, "the head sits above the feet");
    assert.ok(head.scale > f.sprite.scale * 1.5, "the head is drawn larger");
    assert.ok(head.calls.some(([k]) => k === "setCrop"), `fighter ${i} head is cropped`);
    assert.ok(head.calls.some(([k, v]) => k === "setFlipX" && typeof v === "boolean"));
  }
  let destroyed = 0;
  for (const f of big.scene.fighters) f.head.destroy = () => destroyed++;
  big.control.destroy();
  assert.equal(destroyed, 2);
  plain.control.destroy();
});

test("crt overlay sits in the combat container, never takes input, and is removed on destroy", async () => {
  const h = await setup({ cheats: { unlocked: true, crt: true }, reducedMotion: false });
  const crt = h.window.document.querySelector(".mvm-combat .cheat-crt");
  assert.ok(crt);
  assert.match(crt.getAttribute("style"), /pointer-events:\s*none/);
  assert.match(crt.getAttribute("style"), /cheat-crt-flicker/);
  h.control.destroy();
  assert.equal(h.window.document.querySelector(".cheat-crt"), null);
  const calm = await setup({ cheats: { unlocked: true, crt: true }, reducedMotion: true });
  assert.match(calm.window.document.querySelector(".cheat-crt").getAttribute("style"), /animation:\s*none/);
  calm.control.destroy();
});

test("rainbow tints the effect layers and survives hits and POWERs", async () => {
  const h = await setup({ cheats: { unlocked: true, rainbow: true } });
  const tints = [];
  h.scene.pixel = new Proxy({ tintEffects: (c) => tints.push(c) }, { get: (t, k) => t[k] ?? (() => {}) });
  const [p, o] = h.scene.fighters;
  Object.assign(p, { x: 350, face: 1, energy: 100 });
  Object.assign(o, { x: 435, hp: 100 });
  h.scene.attack(p, "special");
  h.step(80);
  assert.ok(o.hp < 100);
  assert.ok(tints.length > 10);
  assert.ok(new Set(tints).size > 3, "the tint changes over time");
  h.control.destroy();
});

test("the match result lists the active cheats; without cheats the result is unchanged", async () => {
  const finish = async (h) => {
    const [p] = h.scene.fighters;
    p.rounds = 2;
    h.scene.phase = "result";
    h.scene.phaseTime = 0.001;
    h.step();
    await new Promise((r) => setTimeout(r, 0));
    return h.ended;
  };
  const cheated = await setup({ cheats: { unlocked: true, meter: true, lives30: true } });
  const r = await finish(cheated);
  assert.deepEqual(Array.from(r.cheats), ["meter", "lives30"]);
  assert.equal(r.winner, "player");
  const plain = await setup();
  const r2 = await finish(plain);
  assert.equal("cheats" in r2, false);
  cheated.control.destroy();
  plain.control.destroy();
});

test("lives30 alone is not an in-match cheat (no HUD tag)", async () => {
  const h = await setup({ cheats: { unlocked: true, lives30: true } });
  assert.equal(h.window.document.querySelector(".mvm-cheats-tag"), null);
  h.control.destroy();
});

test("combat without the helper module loaded ignores settings.cheats", async () => {
  const h = await setup({ cheats: ALL, withHelpers: false });
  assert.equal(h.window.document.querySelector(".mvm-cheats-tag"), null);
  h.step(10);
  assert.ok(Math.abs(60 - h.scene.timer - 10 * 0.016) < 1e-9);
  h.control.destroy();
});
