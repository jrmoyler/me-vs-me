import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { characters } from "../src/characters.js";
import { arenas } from "../src/arenas.js";
import { POWERS } from "../src/moves.js";
import { POWER_FX, ARENA_FX, SCREEN_FX, BONUS_FX, MATCH_FX, usedFxIds, powerFxFor } from "../src/fx-map.js";
import { createPixelStage, setFxLoader, loadFx, rampFrom, coverTime, SINGLE_LAYER } from "../src/pixelfx.js";
import { createFrame, clearFrame, createFx } from "../src/vendor/pixelfx/core/index.js";
import { usesOf } from "../src/fx-lab.js";

const root = new URL("../src/vendor/pixelfx/fx/", import.meta.url);
const library = readdirSync(root)
  .filter((c) => !c.endsWith(".js"))
  .flatMap((c) =>
    readdirSync(new URL(`${c}/`, root))
      .filter((f) => f.endsWith(".js") && !f.startsWith("_"))
      .map((f) => `${c}/${f.slice(0, -3)}`),
  )
  .sort();
setFxLoader((id) => import(new URL(`${id}.js`, root)));

test("the vendored pixelfx library has all 244 effects", () => {
  assert.equal(library.length, 244);
});

test("every one of the 244 effects is used somewhere in the game", () => {
  const used = usedFxIds();
  assert.deepEqual(library.filter((id) => !used.includes(id)), [], "effects with no place in the game");
  assert.deepEqual(used.filter((id) => !library.includes(id)), [], "mapped ids that are not in the library");
  for (const id of library) assert.ok(usesOf(id, { characters, arenas }).length > 0, `${id} has no listed use in the FX LAB`);
});

test("every fighter's POWER has a charge, an impact, a finisher and an entrance", () => {
  for (const c of characters) {
    assert.ok(POWER_FX[c.id], `${c.id} has no POWER effects`);
    const kit = powerFxFor(c);
    for (const part of ["charge", "impact", "finisher", "entrance"]) assert.ok(kit[part], `${c.id} has no ${part}`);
    assert.match(kit.finisher, /^moves\//, `${c.id} finisher is a whole move`);
    if (POWERS[c.id]?.variant === 3) assert.ok(kit.projectile, `${c.id} fires a shot but has no projectile effect`);
  }
});

test("every arena has weather for round one and the final round, and scenery", () => {
  for (const a of arenas) {
    const fx = ARENA_FX[a.id];
    assert.ok(fx, `${a.id} has no ambience`);
    assert.equal(fx.weather.length, 2);
    assert.ok(fx.weather[1], `${a.id} has no final-round weather`);
    assert.ok(fx.critters.length > 0, `${a.id} has no critters`);
  }
});

test("each screen transition is a full-screen effect and covers the frame part-way through", async () => {
  for (const id of Object.values(SCREEN_FX.transitions)) {
    const mod = await loadFx(id);
    assert.deepEqual(mod.meta.size, [320, 180], id);
    const t = coverTime(id, mod);
    assert.ok(t > 0 && t < mod.meta.duration, `${id} cover time ${t}`);
  }
});

test("every effect plays for a second without throwing and draws something", async () => {
  const frame = createFrame(320, 180);
  for (const id of library) {
    const mod = await loadFx(id);
    const fx = createFx(mod, { x: 160, y: 140 });
    let drew = false;
    for (let i = 0; i < 30; i++) {
      fx.update(1 / 30);
      clearFrame(frame);
      fx.draw(frame, "back");
      fx.draw(frame, "front");
      if (!drew) drew = frame.color.some((c) => c) || frame.light.some((c) => c);
    }
    assert.ok(drew, `${id} drew nothing in its first second`);
  }
});

test("a stage spawns, ages, stops and caps its effects", async () => {
  const stage = createPixelStage({ quality: "full", cap: 3, document: null });
  await loadFx("impacts/hit-spark");
  await loadFx("weather/rain");
  const rain = stage.spawn("weather/rain", { layer: "weather", x: 160, y: 170 });
  const spark = stage.spawn("impacts/hit-spark", { x: 100, y: 80 });
  assert.equal(stage.count, 2);
  for (let i = 0; i < 40; i++) stage.update(1 / 30);
  stage.render(true);
  assert.ok(spark.done, "a one-shot finishes");
  assert.ok(!rain.done, "weather loops");
  for (let i = 0; i < 6; i++) stage.spawn("impacts/hit-spark", { x: 10 * i, y: 80 });
  stage.update(0);
  assert.ok(stage.count <= 4, "combat effects are capped; ambience is not");
  const loop = stage.spawn("weather/rain", { layer: "weather", x: 160, y: 170, life: 0.2 });
  for (let i = 0; i < 30; i++) stage.update(1 / 30);
  assert.ok(loop.done, "a loop with a life fades out and ends");
});

test("lite drops ambience and extras, off draws nothing", () => {
  const lite = createPixelStage({ quality: "lite", document: null });
  assert.ok(lite.spawn("weather/rain", { layer: "weather" }).done);
  assert.ok(lite.spawn("ui/damage-number", { tier: "extra" }).done);
  assert.ok(!lite.spawn("impacts/hit-spark", {}).done);
  const off = createPixelStage({ quality: "off", layers: SINGLE_LAYER, document: null });
  assert.ok(off.spawn("impacts/hit-spark", {}).done);
  assert.equal(off.count, 0);
});

test("fighter palettes ramp dark to bright through the fighter's colour", () => {
  const ramp = rampFrom("#ff6148", 8);
  assert.equal(ramp.length, 8);
  const luma = (h) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
  for (let i = 1; i < ramp.length; i++) assert.ok(luma(ramp[i]) >= luma(ramp[i - 1]), ramp.join());
  assert.equal(ramp.at(-1), "#ffffff");
});

test("match and bonus effects name real library effects", () => {
  for (const id of [...Object.values(MATCH_FX), ...Object.values(BONUS_FX)]) assert.ok(library.includes(id), id);
});
