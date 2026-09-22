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
const source =
  readFileSync(new URL("../src/combat.js", import.meta.url), "utf8")
    .replace(/^import[\s\S]*?;\n/gm, "")
    .replace(
      "export async function startCombat",
      "async function startCombat",
    ) + "\nthis.startCombat=startCombat;";
function graphic(x = 0, y = 0) {
  const obj = { x, y, frame: 0 };
  return new Proxy(obj, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        if (key === "setFrame") target.frame = args[0];
        if (key === "setPosition") {
          target.x = args[0];
          target.y = args[1];
        }
        return obj.proxy;
      };
    },
  });
}
function art(x, y) {
  const g = graphic(x, y);
  g.proxy = g;
  return g;
}
async function setup(character = characters[0], mode = "training") {
  const window = new Window({ url: "http://localhost" });
  window.document.body.innerHTML = '<div id="host"></div>';
  let scene;
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
          sprite: art,
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
    queueMicrotask,
    console,
  });
  vm.runInContext(source, context);
  const control = await context.startCombat({
    container: window.document.querySelector("#host"),
    player: character,
    opponent: characters[1],
    arena: arenas[0],
    mode,
    settings: { sound: false, reducedMotion: true },
  });
  scene.phase = "fight";
  scene.fighters[0].energy = 100;
  const key = (code, type) =>
    window.dispatchEvent(
      new window.KeyboardEvent(type, { code, bubbles: true, cancelable: true }),
    );
  return {
    scene,
    control,
    window,
    key,
    step(n = 1) {
      for (let i = 0; i < n; i++) scene.update(0, 16);
    },
  };
}
test("a press released between renders still triggers exactly one strike", async () => {
  const h = await setup();
  h.key("KeyJ", "keydown");
  h.key("KeyJ", "keyup");
  h.step();
  assert.equal(h.scene.fighters[0].attack.type, "light");
  h.step(40);
  assert.equal(h.scene.fighters[0].attack, null);
  h.control.destroy();
});
test("holding attack does not automatically chain repeated moves", async () => {
  const h = await setup();
  h.key("KeyL", "keydown");
  h.step();
  assert.equal(h.scene.fighters[0].attack.type, "heavy");
  h.step(100);
  assert.equal(h.scene.fighters[0].attack, null);
  h.control.destroy();
});
test("pause freezes the combat clock and clears queued strikes", async () => {
  const h = await setup(characters[0], "duel");
  h.scene.ai = () => ({});
  h.key("KeyQ", "keydown");
  h.control.pause();
  const t = h.scene.timer;
  h.step(60);
  assert.equal(h.scene.timer, t);
  h.control.resume();
  h.step();
  assert.equal(h.scene.fighters[0].attack, null);
  h.control.destroy();
});
test("asset failure cannot be escaped into a broken scene", async () => {
  const h = await setup();
  h.scene.assetFailure = true;
  h.control.pause();
  h.control.resume();
  assert.ok(h.window.document.querySelector(".mvm-overlay"));
  h.control.destroy();
});
for (const c of characters)
  test(`${c.name}: runtime plays all seven atlas rows and each attack damages only once`, async () => {
    const h = await setup(c, "duel");
    h.scene.ai = () => ({});
    const [p, o] = h.scene.fighters;
    for (const spec of moves.MOVES) {
      Object.assign(p, {
        x: 350,
        y: 450,
        vy: 0,
        energy: 100,
        attack: null,
        stun: 0,
        cooldown: 0,
        face: 1,
      });
      Object.assign(o, {
        ...rules.freshFighterState(),
        x: 435,
        y: 450,
        vy: 0,
        hp: 100,
        guard: false,
      });
      h.scene.projectiles = [];
      h.scene.hitstop = 0;
      assert.equal(h.scene.attack(p, spec.type), true);
      const cost = spec.type === "special" ? rules.SPECIAL_COST : 0;
      assert.equal(p.energy, 100 - cost);
      h.step(1);
      assert.equal(p.sprite.frame, spec.row * 4);
      const hpBefore = o.hp;
      h.step(90);
      assert.ok(o.hp < hpBefore, `${spec.type} must connect`);
      const expected = rules.hitOutcome(
        { c, energy: 0 },
        { hp: 100, guard: false },
        rules.createAttack({ c, energy: 100 }, spec.type),
      ).damage;
      assert.ok(
        Math.abs(o.hp - (100 - expected)) < 0.0001,
        `${spec.type}: no duplicate damage`,
      );
    }
    h.control.destroy();
    assert.equal(h.window.document.querySelector(".mvm-combat"), null);
  });

test("walk, jump, guard and hurt select dedicated motion art; knockouts and victories animate", async () => {
  const h = await setup();
  const [p, o] = h.scene.fighters;
  for (const [patch, input, state] of [
    [{ stun: 0, guard: false, y: 450 }, { right: true }, "walk"],
    [{ y: 400, vy: -200 }, {}, "jump"],
    [{ y: 450, stun: 0, attack: null, guard: true }, {}, "guard"],
    [{ guard: false, stun: 0.1 }, {}, "hurt"],
  ]) {
    Object.assign(p, patch);
    h.scene.renderFighter(p, input, 0.016, 0);
    assert.equal(p.visualState, state);
    assert.equal(p.textureKey, "motion0");
  }
  p.hp = 100;
  o.hp = 0;
  h.scene.finishRound();
  h.step(40);
  assert.equal(p.visualState, "victory");
  assert.equal(p.sprite.frame, 23);
  assert.equal(o.visualState, "ko");
  assert.equal(o.sprite.frame, 19);
  h.control.destroy();
});

test('all fighters return to original ready art when idle and after round reset', async () => {
 for (const c of characters) {
  const h = await setup(c);
  const p = h.scene.fighters[0];
  p.attack = rules.createAttack(p, 'light');
  h.scene.renderFighter(p, {}, 0.016, 0);
  assert.equal(p.textureKey, 'fighter0');
  p.attack = null;
  h.scene.renderFighter(p, {}, 0.016, 0);
  assert.equal(p.textureKey, 'ready0');
  assert.equal(p.sprite.frame, 0);
  h.scene.resetRound();
  assert.equal(p.textureKey, 'ready0');
  h.control.destroy();
 }
});

test('Pause is a HUD control outside every fighting-button cluster', async () => {
 const h=await setup();
 const pause=h.window.document.querySelector('.mvm-pause-button');
 assert.ok(pause.closest('.mvm-clock'));
 assert.equal(pause.closest('.mvm-touch'),null);
 pause.click();
 assert.ok(h.window.document.querySelector('.mvm-overlay'));
 h.control.destroy();
});

// --- Combo system -----------------------------------------------------------
function duel(character = characters[0]) {
  return setup(character, "duel").then((h) => {
    h.scene.ai = () => ({});
    const [p, o] = h.scene.fighters;
    Object.assign(p, { x: 350, y: 450, vy: 0, face: 1, energy: 100 });
    Object.assign(o, { x: 435, y: 450, vy: 0, hp: 100, face: -1 });
    h.tap = (code) => {
      h.key(code, "keydown");
      h.key(code, "keyup");
    };
    h.until = (predicate, limit = 90) => {
      let n = 0;
      while (!predicate() && n++ < limit) h.step(1);
      return predicate();
    };
    h.damage = (type, target = {}) =>
      rules.hitOutcome(
        { c: character, energy: 0, face: 1 },
        { hp: 100, guard: false, ...target },
        rules.createAttack({ c: character, energy: 100 }, type),
      ).damage;
    return h;
  });
}
test("jab, cross and uppercut cancel into a true three-hit combo that launches and knocks down", async () => {
  const h = await duel();
  const [p, o] = h.scene.fighters;
  const combo = h.window.document.querySelector('.mvm-combo[data-side="0"]');
  h.tap("KeyJ");
  h.step(1);
  assert.equal(p.attack.type, "light");
  h.tap("KeyK"); // buffered during the jab's startup
  assert.ok(h.until(() => o.hp < 100));
  const afterJab = 100 - h.damage("light");
  assert.ok(Math.abs(o.hp - afterJab) < 1e-6);
  assert.ok(h.until(() => p.attack?.type === "medium", 30), "cross cancels the landed jab");
  assert.ok(o.stun > 0, "rival is still in hitstun when the cancel starts");
  h.tap("KeyL");
  assert.ok(h.until(() => o.hp < afterJab));
  const afterCross = afterJab - h.damage("medium", { comboHits: 1 });
  assert.ok(Math.abs(o.hp - afterCross) < 1e-6, "second hit is scaled to 90%");
  assert.equal(p.combo, 2);
  assert.ok(h.until(() => o.hp < afterCross));
  assert.ok(Math.abs(o.hp - (afterCross - h.damage("heavy", { comboHits: 2 }))) < 1e-6, "third hit is scaled to 80%");
  assert.equal(p.combo, 3);
  assert.equal(o.launched, true, "an uppercut inside a combo launches");
  h.step(1);
  assert.equal(combo.textContent, "3 HIT COMBO");
  assert.ok(h.until(() => o.down > 0, 120), "landing from the launch knocks the rival down");
  const hpDown = o.hp;
  Object.assign(p, { attack: null, cooldown: 0 });
  h.tap("KeyJ");
  h.step(30);
  assert.equal(o.hp, hpDown, "a downed rival cannot be hit");
  assert.ok(h.until(() => o.down <= 0, 120));
  assert.equal(o.launched, false);
  h.control.destroy();
});
test("guard holds through blockstun: a blocked string stays blocked, pushes back and never becomes a combo", async () => {
  const h = await duel();
  const [p, o] = h.scene.fighters;
  h.scene.ai = () => ({ block: true });
  h.step(1);
  assert.equal(o.guard, true);
  const startX = o.x;
  h.tap("KeyJ");
  h.step(1);
  h.tap("KeyU"); // low kick cancel lands inside the jab's blockstun
  assert.ok(h.until(() => o.hp < 100));
  const blockedJab = h.damage("light", { guard: true, face: -1 });
  assert.ok(Math.abs(o.hp - (100 - blockedJab)) < 1e-6);
  assert.ok(o.blockstun > 0 && o.x > startX, "blockstun and pushback apply");
  h.scene.ai = () => ({}); // the rival lets go of guard, yet blockstun still protects them
  assert.ok(h.until(() => p.attack?.type === "kick", 30), "kick cancels the blocked jab");
  const afterJab = o.hp;
  assert.ok(h.until(() => o.hp < afterJab));
  assert.ok(o.blockstun >= 0);
  assert.ok(Math.abs(o.hp - (afterJab - h.damage("kick", { guard: true, face: -1 }))) < 1e-6, "follow-up inside blockstun is still blocked");
  assert.equal(p.combo, 0);
  assert.equal(h.window.document.querySelector('.mvm-combo[data-side="0"]').textContent, "");
  Object.assign(o, { blockstun: 0.2, guard: true, stun: 0, attack: null });
  h.step(1);
  assert.equal(o.guard, true, "guard persists without input during blockstun");
  assert.equal(rules.createAttack(o, "light"), null, "no attacks inside blockstun");
  h.step(20);
  assert.equal(o.guard, false, "guard drops once blockstun ends and no block is held");
  h.control.destroy();
});
test("whiffed strikes cannot be cancelled but the buffered press still comes out after recovery", async () => {
  const h = await duel();
  const [p, o] = h.scene.fighters;
  o.x = 800;
  h.tap("KeyJ");
  h.step(1);
  h.tap("KeyK");
  for (let i = 0; i < 19; i++) {
    h.step(1);
    assert.equal(p.attack?.type, "light", `frame ${i}: a whiff never cancels`);
  }
  assert.ok(h.until(() => p.attack?.type === "medium", 30), "buffered cross comes out after the jab recovers");
  assert.equal(o.hp, 100);
  h.control.destroy();
});
test("striking a rival during their startup is a counter hit with a callout", async () => {
  const h = await duel();
  const [p, o] = h.scene.fighters;
  o.attack = rules.createAttack(o, "heavy");
  h.tap("KeyJ");
  assert.ok(h.until(() => o.hp < 100));
  const expected = h.damage("light", { attack: { t: 0, start: 1 } });
  assert.ok(Math.abs(o.hp - (100 - expected)) < 1e-6, "counter hits deal bonus damage");
  assert.ok(expected > h.damage("light"));
  assert.equal(o.attack, null, "the rival's move is interrupted");
  const callout = h.window.document.querySelector(".mvm-hit-callout");
  assert.equal(callout.textContent, "COUNTER!");
  assert.ok(callout.classList.contains("visible"));
  h.step(60);
  assert.equal(callout.classList.contains("visible"), false);
  h.control.destroy();
});
test("the power knocks down and a downed rival is left alone until they rise", async () => {
  const h = await duel();
  const [p, o] = h.scene.fighters;
  h.tap("KeyQ");
  assert.ok(h.until(() => o.hp < 100));
  assert.equal(o.launched, true);
  assert.equal(rules.canBeHit(o), false, "a knocked-down rival cannot be juggled");
  assert.ok(h.until(() => o.down > 0, 120));
  assert.equal(o.visualState, "down");
  assert.equal(o.textureKey, "motion1");
  assert.ok(h.until(() => o.down <= 0, 120));
  h.control.destroy();
});
