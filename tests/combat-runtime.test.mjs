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
        x: 435,
        y: 450,
        vy: 0,
        hp: 100,
        attack: null,
        stun: 0,
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
