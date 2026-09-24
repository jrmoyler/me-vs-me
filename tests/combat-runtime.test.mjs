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
async function setup(character = characters[0], mode = "training", opts = {}) {
  const window = new Window({ url: "http://localhost" });
  window.document.body.innerHTML = '<div id="host"></div>';
  let scene;
  const shakes = [];
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
        scene.cameras = { main: { shake: (...args) => shakes.push(args) } };
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
    opponent: opts.opponent ?? characters[1],
    arena: arenas[0],
    mode,
    difficulty: opts.difficulty ?? "normal",
    settings: { sound: false, reducedMotion: true, ...opts.settings },
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
    shakes,
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
function duel(character = characters[0], opts = {}) {
  return setup(character, "duel", opts).then((h) => {
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
  // Every frame of the whiffed jab's remaining duration (rushdown kits recover sooner).
  const frames = Math.floor((p.attack.duration - p.attack.t) / 0.016) - 1;
  assert.ok(frames >= 17);
  for (let i = 0; i < frames; i++) {
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

// --- Defense answers ------------------------------------------------------------
const hold = (h, code) => h.key(code, "keydown");
const release = (h, code) => h.key(code, "keyup");
function training(character = characters[0], opts = {}) {
  return setup(character, "training", opts).then((h) => {
    const [p, o] = h.scene.fighters;
    Object.assign(p, { x: 350, y: 450, vy: 0, face: 1 });
    Object.assign(o, { x: 435, y: 450, vy: 0, face: -1 });
    h.tap = (code) => {
      h.key(code, "keydown");
      h.key(code, "keyup");
    };
    h.until = (predicate, limit = 120) => {
      let n = 0;
      while (!predicate() && n++ < limit) h.step(1);
      return predicate();
    };
    h.button = (name) => h.window.document.querySelector(`[data-training="${name}"]`);
    return h;
  });
}
for (const guard of [{ block: true }, { block: true, crouch: true }])
  test(`GUARD+LP throws a ${guard.crouch ? "crouching" : "standing"} guard into a hard knockdown`, async () => {
    const h = await duel();
    const [p, o] = h.scene.fighters;
    h.scene.ai = () => guard;
    o.x = p.x + 66;
    h.step(1);
    assert.equal(o.guard, true);
    hold(h, "ShiftLeft");
    h.tap("KeyJ");
    h.step(1);
    assert.equal(p.attack.type, "throw", "Shift+J is the throw chord");
    assert.ok(h.until(() => o.down > 0, 40), "the throw floors a guarding rival");
    assert.equal(o.hp, 100 - 12);
    assert.equal(o.launched, false, "hard knockdown, no juggle");
    assert.equal(p.combo, 0);
    assert.equal(h.window.document.querySelector(".mvm-hit-callout").textContent, "THROW!");
    assert.ok(Math.abs(h.scene.hitstop - 0.1) < 0.02 || h.scene.hitstop <= 0.1);
    h.control.destroy();
  });
test("a whiffed throw is a long, punishable commitment; a faster jab beats throw startup", async () => {
  const h = await duel();
  const [p, o] = h.scene.fighters;
  o.x = p.x + 140;
  hold(h, "ShiftLeft");
  h.tap("KeyJ");
  h.step(1);
  release(h, "ShiftLeft");
  assert.equal(p.attack.type, "throw");
  h.step(30);
  assert.equal(o.hp, 100, "out of range");
  assert.equal(p.attack?.type, "throw", "still recovering 0.48 s later");
  assert.ok(h.until(() => !p.attack, 30));
  // Both press at once: the jab is active before the throw grabs.
  o.x = p.x + 66;
  Object.assign(p, { cooldown: 0 });
  let once = true;
  h.scene.ai = () => (once ? ((once = false), { light: true }) : {});
  hold(h, "ShiftLeft");
  h.tap("KeyJ");
  assert.ok(h.until(() => p.hp < 100, 30), "the jab lands first");
  assert.equal(p.attack, null, "the throw was interrupted");
  assert.equal(o.hp, 100);
  h.control.destroy();
});
test("crouching LK is a low: it beats standing guard and is stopped by crouching guard; roundhouse is the reverse", async () => {
  const h = await training();
  const [p, o] = h.scene.fighters;
  h.button("guard").click();
  assert.equal(h.scene.training.dummy, "guard");
  hold(h, "KeyS");
  h.step(1);
  h.tap("KeyU");
  h.step(1);
  assert.equal(p.attack.height, "low");
  assert.ok(h.until(() => o.hp < 100, 40));
  assert.ok(o.stun > 0 && o.blockstun === 0, "a standing guard fails a low");
  release(h, "KeyS");
  h.until(() => !p.attack && o.stun <= 0, 60);
  h.button("guard").click();
  assert.equal(h.scene.training.dummy, "crouch");
  Object.assign(o, { hp: 100, x: 435 });
  hold(h, "KeyS");
  h.step(2);
  h.tap("KeyU");
  assert.ok(h.until(() => o.hp < 100, 40));
  assert.ok(o.blockstun > 0 && o.stun === 0, "crouching guard blocks the low");
  release(h, "KeyS");
  h.until(() => !p.attack && o.blockstun <= 0, 60);
  Object.assign(o, { hp: 100, x: 435 });
  h.step(2);
  h.tap("KeyO");
  assert.ok(h.until(() => o.hp < 100, 60));
  assert.ok(o.stun > 0, "roundhouse is an overhead: crouching guard fails");
  h.control.destroy();
});
test("jumping jab lands in training, heavy normals refuse to start in the air, landing ends the air normal", async () => {
  const h = await training();
  const [p, o] = h.scene.fighters;
  o.x = 410;
  hold(h, "KeyW");
  h.step(2);
  release(h, "KeyW");
  assert.ok(p.y < 449);
  h.tap("KeyL");
  h.step(1);
  assert.equal(p.attack, null, "no uppercut in the air");
  h.until(() => p.vy > 0, 40);
  h.tap("KeyJ");
  h.step(1);
  assert.equal(p.attack?.type, "light");
  assert.equal(p.attack.air, true);
  assert.equal(p.attack.height, "overhead");
  assert.ok(h.until(() => o.hp < 100, 40), "the jumping jab connects");
  assert.ok(o.stun <= rules.AIR_HITSTUN + 1e-9);
  assert.ok(h.until(() => p.y >= 450, 60));
  assert.equal(p.attack, null, "landing ends the attack");
  assert.ok(p.cooldown > 0 && p.cooldown <= rules.AIR_LAND_COOLDOWN);
  h.control.destroy();
});
test("wakeup: the knockdown is inert until its last moment, then guard, jump or a reversal comes out", async () => {
  const h = await duel();
  const [p] = h.scene.fighters;
  p.down = 0.6;
  hold(h, "ShiftLeft");
  h.step(2);
  assert.ok(p.down > 0.5, "early knockdown ignores guard");
  h.until(() => p.down <= rules.WAKEUP_WINDOW, 60);
  h.step(1);
  assert.equal(p.down, 0);
  assert.equal(p.guard, true, "wake block");
  assert.equal(h.scene.tally.wakeup0, 1);
  release(h, "ShiftLeft");
  h.step(2);
  p.down = 0.1;
  h.tap("KeyU");
  h.step(1);
  assert.equal(p.attack?.type, "kick", "reversal low kick");
  Object.assign(p, { attack: null, cooldown: 0, down: 0.1 });
  hold(h, "KeyW");
  h.step(1);
  release(h, "KeyW");
  assert.ok(p.vy < 0, "wake jump");
  h.control.destroy();
});

// --- CPU personality --------------------------------------------------------------
function bout(difficulty, opts = {}) {
  return setup(opts.character ?? characters[0], "duel", {
    difficulty,
    opponent: opts.opponent ?? characters[1],
  }).then((h) => {
    h.scene.rng = rules.seededRandom(opts.seed ?? 7);
    const [p, o] = h.scene.fighters;
    Object.assign(p, { x: 350, face: 1, energy: 35 });
    Object.assign(o, { x: 416, face: -1, energy: 35 });
    return h;
  });
}
test("hard CPU throws a turtling player", async () => {
  const h = await bout("hard");
  const [p] = h.scene.fighters;
  hold(h, "ShiftLeft");
  let thrown = false;
  for (let i = 0; i < 240 && !thrown; i++) {
    h.step(1);
    p.hp = 100;
    thrown = (h.scene.tally.throw1 || 0) > 0;
  }
  assert.ok(thrown, "a held guard eventually eats a throw");
  h.control.destroy();
});
test("hard CPU anti-airs a jumping player across a seeded 8 second bout", async () => {
  const h = await bout("hard", { seed: 11 });
  const [p, o] = h.scene.fighters;
  for (let i = 0; i < 500; i++) {
    // Keep jumping in from about 200 px out.
    if (p.y >= 450 && p.down <= 0 && p.stun <= 0 && !p.launched) {
      Object.assign(p, { x: Math.max(80, o.x - 200) });
      hold(h, "KeyW");
      hold(h, "KeyD");
    } else release(h, "KeyW");
    h.step(1);
    p.hp = o.hp = 100;
  }
  assert.ok((h.scene.tally.antiair1 || 0) >= 1, JSON.stringify(h.scene.tally));
  h.control.destroy();
});
test("easy CPU never cancels across a seeded 8 second bout; normal does", async () => {
  for (const [difficulty, expectCancels] of [["easy", false], ["normal", true]]) {
    let cancels = 0, attacks = 0;
    for (const seed of [3, 5, 9]) {
      const h = await bout(difficulty, { seed });
      const [p, o] = h.scene.fighters;
      for (let i = 0; i < 500; i++) {
        h.step(1);
        Object.assign(p, { hp: 100, x: Math.min(p.x, o.x - 70) });
        o.hp = 100;
      }
      cancels += h.scene.tally.cancel1 || 0;
      attacks += (h.scene.tally.hit1 || 0) + (h.scene.tally.block1 || 0);
      h.control.destroy();
    }
    assert.ok(attacks > 3, `${difficulty} CPU attacks`);
    if (expectCancels) assert.ok(cancels > 0, "normal CPU uses cancels");
    else assert.equal(cancels, 0, "easy CPU never cancels");
  }
});

// --- Training lab -------------------------------------------------------------------
test("trial: the scripted jab, cross, uppercut, POWER chain passes for every fighter", async () => {
  for (const c of characters) {
    const h = await training(c);
    const [p, o] = h.scene.fighters;
    h.button("trial").click();
    assert.equal(h.button("trial").getAttribute("aria-pressed"), "true");
    h.tap("KeyJ");
    h.step(1);
    h.tap("KeyK");
    assert.ok(h.until(() => p.attack?.type === "medium"), `${c.id}: cross`);
    h.tap("KeyL");
    assert.ok(h.until(() => p.attack?.type === "heavy"), `${c.id}: uppercut`);
    h.tap("KeyQ");
    assert.ok(h.until(() => p.attack?.type === "special"), `${c.id}: power`);
    assert.ok(h.until(() => h.scene.training.trial.status !== "active", 200), `${c.id}: resolves`);
    assert.equal(h.scene.training.trial.status, "pass", c.id);
    assert.equal(o.comboHits, 4);
    h.step(1);
    assert.match(h.window.document.querySelector(".mvm-trial-hint").textContent, /PASS/);
    assert.match(h.window.document.querySelector(".mvm-training-readout").textContent, /TRIAL PASS/);
    h.control.destroy();
  }
});
test("trial: three dropped combos fail it, and RESET clears the trial and the dummy recording", async () => {
  const h = await training();
  const [p, o] = h.scene.fighters;
  h.button("trial").click();
  for (let n = 0; n < 3; n++) {
    Object.assign(o, { x: p.x + 85 });
    h.tap("KeyJ");
    assert.ok(h.until(() => h.scene.training.trial.step === 1, 40));
    assert.ok(h.until(() => h.scene.training.trial.drops === n + 1, 90), `drop ${n + 1}`);
    h.until(() => !p.attack && o.stun <= 0, 60);
  }
  assert.equal(h.scene.training.trial.status, "fail");
  h.step(1);
  assert.match(h.window.document.querySelector(".mvm-trial-hint").textContent, /FAIL/);
  h.scene.training.recording.push({ block: true });
  h.button("reset").click();
  assert.deepEqual(h.scene.training.trial, moves.freshTrial());
  assert.equal(h.scene.training.recording.length, 0);
  assert.equal(o.hp, 100);
  h.control.destroy();
});
test("dummy modes cycle; RECORD captures 4 s of P1-driven dummy input at 30 Hz and PLAY loops a guard hold", async () => {
  const h = await training();
  const [p, o] = h.scene.fighters;
  const labels = [];
  for (let i = 0; i < 5; i++) {
    h.button("guard").click();
    labels.push(h.button("guard").textContent.replace(" ●", ""));
  }
  assert.deepEqual(labels, ["DUMMY: GUARD", "DUMMY: CROUCH GUARD", "DUMMY: RECORD", "DUMMY: PLAY", "DUMMY: OPEN"]);
  h.button("guard").click();
  h.button("guard").click();
  h.button("guard").click();
  assert.equal(h.scene.training.dummy, "record");
  const px = p.x;
  hold(h, "ShiftLeft");
  h.step(10);
  assert.equal(o.guard, true, "P1's guard drives the dummy while recording");
  assert.equal(p.guard, false);
  assert.equal(p.x, px);
  h.step(250);
  release(h, "ShiftLeft");
  assert.equal(h.scene.training.dummy, "play", "recording ends after four seconds");
  assert.equal(h.scene.training.recording.length, 120);
  let guarded = 0;
  for (let i = 0; i < 300; i++) {
    h.step(1);
    if (o.guard) guarded++;
  }
  assert.ok(guarded > 290, `playback repeats the guard hold across loops (${guarded}/300)`);
  h.control.destroy();
});
test("DATA prints the live move's frame data and height tags", async () => {
  const h = await training();
  const data = h.window.document.querySelector(".mvm-data");
  h.step(1);
  assert.equal(data.textContent, "");
  h.button("data").click();
  hold(h, "KeyS");
  h.step(1);
  h.tap("KeyU");
  h.step(3);
  assert.match(data.textContent, /STARTUP \d+ · ACTIVE \d+ · RECOVERY \d+ · HITSTUN \d+ · BLOCKSTUN \d+ MS · LOW/);
  release(h, "KeyS");
  h.until(() => !h.scene.fighters[0].attack, 60);
  h.step(6);
  hold(h, "ShiftLeft");
  h.tap("KeyJ");
  h.step(2);
  assert.match(data.textContent, /THROW/);
  h.control.destroy();
});

// --- Impact ------------------------------------------------------------------------------
test("hitstop follows weight, blocks freeze for 60%, reduced motion skips shake and flash but keeps hitstop", async () => {
  for (const reducedMotion of [false, true]) {
    const h = await duel(characters[1], { settings: { reducedMotion } });
    const [p, o] = h.scene.fighters;
    const expected = { light: 0.04, medium: 0.06, heavy: 0.09, kick: 0.04, mediumKick: 0.06, heavyKick: 0.09, special: 0.12 };
    for (const [type, stop] of Object.entries(expected)) {
      Object.assign(o, { ...rules.freshFighterState(), x: 435, y: 450, vy: 0, hp: 100, guard: false });
      Object.assign(p, { attack: null, cooldown: 0, energy: 100, x: 350, face: 1 });
      h.scene.hitstop = 0;
      h.scene.attack(p, type);
      assert.ok(h.until(() => o.hp < 100), type);
      assert.ok(Math.abs(h.scene.hitstop - stop) < 1e-9, `${type} hitstop ${h.scene.hitstop}`);
      assert.equal(o.flash, reducedMotion ? 0 : 1, "clean hits flash unless motion is reduced");
      h.until(() => h.scene.hitstop <= 0 && !p.attack, 120);
      assert.equal(o.flash, 0, "the flash lasts one render tick");
    }
    // Blocked: 60% hitstop, no flash, a smaller shake.
    h.scene.ai = () => ({ block: true });
    Object.assign(o, { ...rules.freshFighterState(), x: 435, hp: 100 });
    h.step(2);
    const shakes = h.shakes.length;
    Object.assign(p, { attack: null, cooldown: 0 });
    h.scene.attack(p, "heavy");
    assert.ok(h.until(() => o.hp < 100));
    assert.ok(o.blockstun > 0);
    assert.ok(Math.abs(h.scene.hitstop - 0.09 * 0.6) < 1e-9);
    assert.equal(o.flash, 0, "the block path never sets the hit flash");
    if (reducedMotion) assert.equal(h.shakes.length, 0, "reduced motion never enqueues a shake");
    else {
      assert.equal(h.shakes.length, shakes + 1);
      assert.ok(h.shakes.at(-1)[0] < h.shakes[2][0], "block shake is smaller than a heavy hit");
    }
    h.control.destroy();
  }
});
test("tick budget: three seconds of POWER spam keeps sparks and projectiles bounded", async () => {
  const h = await setup(characters[2], "duel", { opponent: characters[8] });
  const [p, o] = h.scene.fighters;
  h.scene.ai = () => ({ special: true, light: true });
  let maxSparks = 0, maxShots = 0;
  for (let i = 0; i < 180; i++) {
    p.energy = o.energy = 100;
    p.hp = o.hp = 100;
    h.key("KeyQ", "keydown");
    h.key("KeyQ", "keyup");
    h.scene.update(0, 16.7);
    maxSparks = Math.max(maxSparks, h.scene.sparks.length);
    maxShots = Math.max(maxShots, h.scene.projectiles.length);
  }
  assert.ok(maxShots >= 1, "projectiles were fired");
  assert.ok(maxSparks <= rules.SPARK_CAP, `sparks ${maxSparks}`);
  assert.ok(maxShots <= rules.PROJECTILE_CAP, `projectiles ${maxShots}`);
  assert.ok(h.scene.log.length <= 64);
  h.control.destroy();
});

// --- Versus ------------------------------------------------------------------------------
test("local versus: player two walks and jabs from arrows and numpad in the same match", async () => {
  const h = await setup(characters[0], "local");
  const [p, o] = h.scene.fighters;
  Object.assign(p, { x: 350 });
  Object.assign(o, { x: 520 });
  hold(h, "ArrowLeft");
  h.step(20);
  release(h, "ArrowLeft");
  assert.ok(o.x < 520, "P2 walks");
  assert.equal(p.x, 350);
  h.key("Numpad1", "keydown");
  h.key("Numpad1", "keyup");
  h.step(1);
  assert.equal(o.attack?.type, "light", "P2 jabs");
  for (let i = 0; i < 30 && p.hp >= 100; i++) h.step(1);
  assert.ok(p.hp < 100, "the jab lands on player one");
  assert.match(h.window.document.querySelector(".mvm-local-hint").textContent, /PLAYER ONE/);
  assert.match(h.window.document.querySelector(".mvm-help").textContent, /P2 ← →/);
  h.control.destroy();
});
