// VFX PRO (src/vfx-pro.js): the quality profile, the pure timing curves, and a runtime pass over a
// stub scene (no WebGL, no pipelines) to prove the layer degrades without throwing.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  vfxProfile,
  shockwave,
  chromaPulse,
  trailAlpha,
  cutInPhase,
  CUT_IN,
  impactFrameAt,
  IMPACT_FRAMES,
  sparkBudget,
  lightFalloff,
  gradeTint,
  rgb,
  hexNumber,
  shaderUniforms,
  createVfxPro,
  FRAG,
  PIPELINE,
} from "../src/vfx-pro.js";
import { characters } from "../src/characters.js";
import { arenas } from "../src/arenas.js";

const MOTION = ["chroma", "shockwave", "radialBlur", "speedLines", "impactFrames", "cutIn", "freeze", "trails", "light", "floorLight", "grade", "grain", "vignette"];

test("profile: FULL turns everything on, LITE keeps sparks and bloom, OFF turns the layer off", () => {
  const full = vfxProfile({ pixelFx: "full" });
  assert.equal(full.enabled, true);
  for (const k of ["bloom", "halos", "sparks", "embers", ...MOTION]) assert.equal(full[k], true, k);
  assert.ok(full.bloomStrength > 0 && full.sparkCap > 0);

  const lite = vfxProfile({ pixelFx: "lite" });
  assert.equal(lite.enabled, true);
  for (const k of ["bloom", "halos", "sparks"]) assert.equal(lite[k], true, k);
  for (const k of MOTION) assert.equal(lite[k], false, k);
  assert.ok(lite.sparkCap < full.sparkCap, "lite spends fewer particles");

  const off = vfxProfile({ pixelFx: "off" });
  assert.equal(off.enabled, false);
  for (const k of ["shader", "bloom", "halos", "sparks", ...MOTION]) assert.equal(off[k], false, k);
});

test("profile: reduced motion keeps gentle bloom only, whatever the tier", () => {
  for (const pixelFx of ["full", "lite", undefined]) {
    const p = vfxProfile({ pixelFx, reducedMotion: true });
    assert.equal(p.enabled, true);
    assert.equal(p.bloom, true);
    assert.ok(p.bloomStrength > 0 && p.bloomStrength < vfxProfile({ pixelFx: "full" }).bloomStrength, "gentler bloom");
    for (const k of ["sparks", "embers", ...MOTION]) assert.equal(p[k], false, `${pixelFx}: ${k}`);
  }
  assert.equal(vfxProfile({ pixelFx: "off", reducedMotion: true }).enabled, false);
  // pure: same input, same output; garbage never throws
  assert.deepEqual(vfxProfile({ pixelFx: "full" }), vfxProfile({ pixelFx: "full" }));
  assert.doesNotThrow(() => vfxProfile());
});

test("shockwave easing: the ring races out and its push fades to nothing", () => {
  assert.deepEqual(shockwave(0, 0.5), { radius: 0, strength: 1, done: false });
  let last = -1;
  for (let t = 0; t < 0.5; t += 0.05) {
    const s = shockwave(t, 0.5);
    assert.ok(s.radius >= last && s.radius <= 1);
    assert.ok(s.strength >= 0 && s.strength <= 1);
    last = s.radius;
  }
  assert.ok(shockwave(0.1, 0.5).radius > 0.1 / 0.5, "ease-out: ahead of linear early");
  assert.equal(shockwave(0.5, 0.5).done, true);
  assert.equal(shockwave(0.6, 0.5).strength, 0);
  assert.equal(shockwave(-1, 0.5).strength, 0);
  assert.equal(shockwave(0.1, 0).strength, 0);
});

test("chromatic pulse: near-instant attack to the peak, then decays to zero", () => {
  const d = 0.25;
  assert.equal(chromaPulse(0, d), 0);
  assert.ok(Math.abs(chromaPulse(d * 0.12, d, 0.8) - 0.8) < 1e-9, "peaks at 12%");
  assert.ok(chromaPulse(d * 0.5, d) < chromaPulse(d * 0.2, d));
  assert.equal(chromaPulse(d, d), 0);
  assert.equal(chromaPulse(-0.1, d), 0);
  for (let t = 0; t <= d; t += 0.01) assert.ok(chromaPulse(t, d, 1) <= 1);
});

test("trail fade: starts at its alpha and fades monotonically out by the end of its life", () => {
  assert.equal(trailAlpha(0, 0.25, 0.4), 0.4);
  let last = 1;
  for (let a = 0; a < 0.25; a += 0.02) {
    const v = trailAlpha(a, 0.25, 0.4);
    assert.ok(v <= last && v >= 0);
    last = v;
  }
  assert.equal(trailAlpha(0.25, 0.25), 0);
  assert.equal(trailAlpha(-0.1, 0.25), 0);
});

test("cut-in timing: ~0.45 s, slides in, holds centred, snaps out, and the dim rises and falls", () => {
  assert.ok(Math.abs(CUT_IN.in + CUT_IN.hold + CUT_IN.out - CUT_IN.total) < 1e-9);
  assert.ok(CUT_IN.total >= 0.4 && CUT_IN.total <= 0.5);
  assert.equal(cutInPhase(0).phase, "in");
  assert.equal(cutInPhase(0).slide, -1, "starts off screen");
  assert.equal(cutInPhase(0).dim, 0);
  assert.equal(cutInPhase(CUT_IN.in + 0.01).phase, "hold");
  assert.equal(cutInPhase(CUT_IN.in + 0.01).slide, 0);
  assert.equal(cutInPhase(0.2).dim, 1);
  const out = cutInPhase(CUT_IN.in + CUT_IN.hold + CUT_IN.out / 2);
  assert.equal(out.phase, "out");
  assert.ok(out.slide > 0 && out.open < 1 && out.dim < 1);
  assert.equal(cutInPhase(CUT_IN.total).phase, "done");
  assert.equal(cutInPhase(CUT_IN.total).dim, 0);
  let last = -2;
  for (let t = 0; t < CUT_IN.total; t += 0.01) {
    const p = cutInPhase(t);
    assert.ok(p.slide >= last - 1e-9, "the band only ever moves one way");
    last = p.slide;
  }
});

test("impact frames: two frames, 2–3 render ticks in all, then over", () => {
  assert.equal(impactFrameAt(0), 0);
  assert.equal(impactFrameAt(IMPACT_FRAMES[0] - 0.001), 0);
  assert.equal(impactFrameAt(IMPACT_FRAMES[0]), 1);
  assert.equal(impactFrameAt(IMPACT_FRAMES[1]), -1);
  assert.equal(impactFrameAt(-0.1), -1);
  const ticks = IMPACT_FRAMES[IMPACT_FRAMES.length - 1] * 60;
  assert.ok(ticks >= 2 && ticks <= 3.5, `${ticks} ticks at 60 fps`);
});

test("spark budget grows with the strike, POWER is biggest, blocks are small, the cap holds", () => {
  const light = sparkBudget(1),
    heavy = sparkBudget(3),
    power = sparkBudget(1, { power: true }),
    block = sparkBudget(3, { block: true });
  assert.ok(light.streaks < heavy.streaks && heavy.streaks < power.streaks);
  assert.ok(light.embers < heavy.embers && heavy.embers < power.embers);
  assert.equal(block.embers, 0);
  assert.ok(block.streaks < heavy.streaks);
  assert.ok(sparkBudget(3, { counter: true }).streaks > heavy.streaks);
  const capped = sparkBudget(1, { power: true, cap: 20 });
  assert.ok(capped.streaks + capped.embers <= 20);
  assert.doesNotThrow(() => sparkBudget(NaN));
});

test("light falloff, colour helpers and the arena grade tint", () => {
  assert.equal(lightFalloff(0), 1);
  assert.equal(lightFalloff(500, 400), 0);
  assert.ok(lightFalloff(100, 400) > lightFalloff(300, 400));
  assert.deepEqual(rgb("#ff0000"), [1, 0, 0]);
  assert.deepEqual(rgb("nope"), [1, 1, 1]);
  assert.equal(hexNumber("#46e1df"), 0x46e1df);
  assert.equal(hexNumber(undefined, 7), 7);
  for (const a of arenas) {
    const g = gradeTint(a.color);
    assert.ok(Math.max(...g) === 1 && Math.min(...g) >= 0, a.id);
  }
});

test("shader uniforms: reduced motion and LITE never warp, flash or desaturate; impact frames stay flat", () => {
  const busy = { center: [0.4, 0.6], shock: { t: 0.05, duration: 0.4, push: 0.02, reach: 0.6 }, chroma: { t: 0.02, duration: 0.2, peak: 1 }, radial: { t: 0.05, duration: 0.3, peak: 1 }, dim: 1 };
  const full = shaderUniforms(busy, vfxProfile({ pixelFx: "full" }));
  assert.ok(full.shock[2] > 0 && full.chroma > 0 && full.radial > 0 && full.desat > 0 && full.darken > 0 && full.bloom > 0 && full.grain > 0);
  for (const settings of [{ pixelFx: "full", reducedMotion: true }, { pixelFx: "lite" }]) {
    const u = shaderUniforms(busy, vfxProfile(settings));
    assert.equal(u.shock[2], 0);
    assert.equal(u.chroma, 0);
    assert.equal(u.radial, 0);
    assert.equal(u.desat, 0);
    assert.equal(u.darken, 0);
    assert.equal(u.grain, 0);
    assert.ok(u.bloom > 0, "bloom stays");
  }
  const flat = shaderUniforms({ ...busy, impactOn: true }, vfxProfile({ pixelFx: "full" }));
  assert.equal(flat.bloom, 0);
  assert.equal(flat.chroma, 0);
  assert.equal(flat.radial, 0);
  // every uniform the pipeline sets is declared in the shader
  for (const name of ["uResolution", "uTime", "uCenter", "uShock", "uChroma", "uRadial", "uBloom", "uThreshold", "uDesat", "uDarken", "uGrade", "uGradeAmt", "uVignette", "uGrain", "uMainSampler"])
    assert.match(FRAG, new RegExp(`uniform \\w+ ${name};`), name);
  assert.equal(PIPELINE, "MvmVfxPro");
});

// ─── runtime over a stub scene: Canvas-like renderer, no pipelines, no WebGL ───
function stub() {
  const calls = [];
  const obj = (kind) => {
    const target = { kind, x: 0, y: 0, alpha: 1, visible: true, destroyed: false, width: 768, height: 768 };
    const proxy = new Proxy(target, {
      get(t, key) {
        if (key in t) return t[key];
        if (key === "then") return undefined;
        return (...args) => {
          calls.push([kind, key]);
          if (key === "destroy") t.destroyed = true;
          if (key === "setVisible") t.visible = args[0];
          if (key === "setPosition") [t.x, t.y] = args;
          return proxy;
        };
      },
      set(t, key, value) {
        t[key] = value;
        return true;
      },
    });
    return proxy;
  };
  const made = [];
  const factory = new Proxy({}, { get: (_, kind) => (...args) => {
    const o = obj(kind);
    made.push(o);
    return o;
  } });
  const ctx = new Proxy({}, { get: (_, k) => (k === "createRadialGradient" || k === "createLinearGradient" ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
  const handlers = {};
  const scenes = [];
  class Scene {
    constructor(config) {
      this.config = config;
    }
  }
  const fighters = [characters[0], characters[1]].map((c, i) => ({
    c,
    x: i ? 650 : 560,
    y: 450,
    vy: 0,
    face: i ? -1 : 1,
    hp: 100,
    energy: 100,
    sprite: obj("sprite"),
  }));
  const scene = {
    add: factory,
    fighters,
    projectiles: [],
    phase: "fight",
    hitstop: 0,
    sys: { game: { renderer: { type: 1 }, canvas: null } },
    cameras: { main: { zoom: 1, worldView: { x: 0, y: 0 } } },
    textures: { exists: () => false, createCanvas: () => ({ getContext: () => ctx, refresh() {}, setFilter() {} }) },
    events: { on: (e, fn) => (handlers[e] = fn), off: (e) => delete handlers[e] },
    load: { image: (k) => calls.push(["load", k]), start() {} },
    scene: {
      add(key, Klass, start) {
        const s = new Klass();
        s.add = factory;
        s.textures = { exists: () => true };
        scenes.push(key);
        if (start) s.create();
        return s;
      },
      remove: (key) => scenes.splice(scenes.indexOf(key), 1),
    },
  };
  const Phaser = { WEBGL: 2, CANVAS: 1, Scene, Textures: { FilterMode: { LINEAR: 0 } } };
  return { scene, Phaser, calls, made, handlers, scenes, fighters };
}

test("runtime: OFF builds nothing; a missing scene never throws", () => {
  const s = stub();
  assert.equal(createVfxPro({ scene: s.scene, Phaser: s.Phaser, settings: { pixelFx: "off" } }), null);
  assert.equal(createVfxPro({}), null);
  assert.equal(createVfxPro(), null);
  assert.equal(s.made.length, 0);
});

test("runtime: Canvas renderer (no pipelines) degrades, the cut-in holds 0.45 s, then everything is freed", () => {
  const s = stub();
  const vfx = createVfxPro({ scene: s.scene, Phaser: s.Phaser, settings: { pixelFx: "full" }, arena: arenas[0], mode: "duel" });
  assert.ok(vfx);
  assert.equal(vfx.webgl, false);
  assert.equal(vfx.debug.pipeline, false, "no post pass without WebGL");
  assert.equal(vfx.debug.overlay, true, "the cut-in still has its own scene");
  assert.deepEqual(s.scenes.length, 1);
  const [p, o] = s.fighters;
  // the hold lasts exactly the cut-in and never longer
  assert.equal(vfx.update(1 / 60), false);
  vfx.onPower(p);
  let held = 0;
  for (let i = 0; i < 60; i++) if (vfx.update(1 / 60)) held++;
  assert.ok(Math.abs(held / 60 - CUT_IN.total) < 2 / 60, `held ${held} frames`);
  assert.equal(vfx.holding, false);
  // a second POWER straight after still freezes once the short cooldown passes
  for (let i = 0; i < 40; i++) vfx.update(1 / 60);
  vfx.onPower(o);
  assert.equal(vfx.update(1 / 60), true);
  for (let i = 0; i < 40; i++) vfx.update(1 / 60);
  // hits of every kind, a projectile and a K.O. never throw
  assert.doesNotThrow(() => {
    vfx.onHit({ attacker: p, defender: o, move: { type: "light", tier: 1, face: 1 }, outcome: {}, blocking: false });
    vfx.onHit({ attacker: p, defender: o, move: { type: "heavy", tier: 3, face: 1 }, outcome: { counter: true }, blocking: false });
    vfx.onHit({ attacker: p, defender: o, move: { type: "medium", tier: 2 }, outcome: {}, blocking: true });
    vfx.onHit({ attacker: p, defender: o, move: { type: "special", face: 1, projectile: true }, outcome: {}, blocking: false });
    s.scene.projectiles.push({ x: 600, y: 355, owner: p, index: 0, face: 1 });
    p.attack = { type: "special", t: 0.1, start: 0.3, active: 0.1 };
    for (let i = 0; i < 30; i++) vfx.update(1 / 60);
    vfx.onRoundEnd({ winner: p, loser: o, ko: true });
    for (let i = 0; i < 60; i++) vfx.update(1 / 60);
    vfx.onHit({});
    vfx.onPower(null);
  });
  assert.equal(vfx.debug.impact, null, "impact frames finish");
  vfx.destroy();
  assert.equal(s.scenes.length, 0, "the overlay scene is removed");
  assert.ok(s.made.filter((m) => m.kind !== "sprite").every((m) => m.destroyed || m.kind === "text" || m.kind === "container" || m.kind === "rectangle" || m.kind === "image" || m.kind === "graphics"));
  assert.equal(s.handlers.postupdate, undefined, "late-tint listener removed");
  assert.doesNotThrow(() => vfx.destroy());
  assert.equal(vfx.update(1 / 60), false, "a destroyed layer never holds");
});

test("runtime: reduced motion never freezes, warps or trails", () => {
  const s = stub();
  const vfx = createVfxPro({ scene: s.scene, Phaser: s.Phaser, settings: { pixelFx: "full", reducedMotion: true }, arena: arenas[0] });
  assert.ok(vfx);
  vfx.onPower(s.fighters[0]);
  assert.equal(vfx.update(1 / 60), false);
  vfx.onHit({ attacker: s.fighters[0], defender: s.fighters[1], move: { type: "special" }, outcome: {} });
  vfx.onRoundEnd({ winner: s.fighters[0], loser: s.fighters[1], ko: true });
  vfx.update(1 / 60);
  const d = vfx.debug;
  assert.equal(d.freeze, null);
  assert.equal(d.impact, null);
  assert.equal(d.lines, false);
  assert.equal(d.shock, null);
  assert.equal(d.chroma, null);
  assert.equal(d.ghosts, 0);
  assert.equal(s.scenes.length, 0, "no cut-in scene");
  vfx.destroy();
});

test("combat.js keeps its VFX PRO hooks minimal and guarded", () => {
  const src = readFileSync(new URL("../src/combat.js", import.meta.url), "utf8");
  const hooks = src.split("\n").filter((l) => /vfx|VfxPro/i.test(l));
  assert.ok(hooks.length <= 12, `${hooks.length} lines mention the layer`);
  assert.match(src, /typeof createVfxPro === "function"/);
  for (const hook of ["this.vfx?.onPower(", "this.vfx?.onHit(", "this.vfx?.onRoundEnd(", "this.vfx?.update(dt)", "scene?.vfx?.destroy()"]) assert.ok(src.includes(hook), hook);
});
