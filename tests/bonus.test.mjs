import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { Window } from "happy-dom";
const source = (
  await readFile(new URL("../src/bonus.js", import.meta.url), "utf8")
).replace(/export /g, "");
function setup() {
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = "<main></main>";
  let now = 0,
    tick,
    timeout,
    result,
    count = 0;
  const context = vm.createContext({
    document,
    performance: { now: () => now },
    setInterval: (fn) => ((tick = fn), 1),
    clearInterval: () => {
      tick = null;
    },
    setTimeout: (fn) => ((timeout = fn), 2),
    clearTimeout: () => {
      timeout = null;
    },
  });
  vm.runInContext(source, context);
  const game = context.startBonus({
    container: document.querySelector("main"),
    character: {
      name: "JR",
      portrait: "/jr.png",
      combatSheet: "/jr-combat.png",
    },
    arena: { background: "/arena.png" },
    settings: { reducedMotion: true },
    onEnd: (r) => {
      result = r;
      count++;
    },
  });
  return {
    window,
    document,
    game,
    get result() {
      return result;
    },
    get count() {
      return count;
    },
    advance(ms) {
      now += ms;
      tick?.();
    },
    complete() {
      timeout?.();
    },
    hit(key) {
      document.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
  };
}
test("bonus six controls register keyboard damage, cooldown prevents repeat spam, cleanup removes listeners", () => {
  const h = setup();
  assert.equal(h.document.querySelectorAll("[data-strike]").length, 6);
  h.hit("o");
  assert.equal(h.document.querySelector("meter").value, 227 / 240);
  h.hit("o");
  assert.equal(h.document.querySelector("meter").value, 227 / 240);
  h.advance(300);
  h.hit("j");
  assert.equal(h.document.querySelector("meter").value, 222 / 240);
  h.game.destroy();
  h.hit("j");
  assert.equal(h.document.querySelector("section"), null);
  assert.equal(h.count, 0);
});
test("bonus destruction earns time reward and finishes once", () => {
  const h = setup();
  for (let i = 0; i < 19; i++) {
    h.hit("o");
    h.advance(300);
  }
  assert.equal(h.document.querySelector("meter").value, 0);
  assert.equal(
    h.document.querySelector(".mvm-bonus-target").dataset.broken,
    "true",
  );
  h.complete();
  assert.equal(h.result.destroyed, true);
  assert.ok(h.result.score > 6000);
  h.complete();
  assert.equal(h.count, 1);
  h.game.destroy();
});
test("bonus timer expires and skip exits without duplicate completion", () => {
  const h = setup();
  h.advance(21000);
  assert.equal(h.document.querySelector("[data-time]").textContent, "00");
  h.complete();
  assert.equal(h.result.destroyed, false);
  assert.equal(h.result.skipped, false);
  assert.equal(h.count, 1);
  h.game.destroy();
  const skip = setup();
  skip.document.querySelector(".mvm-bonus-exit").click();
  assert.equal(skip.result.skipped, true);
  skip.advance(22000);
  skip.complete();
  assert.equal(skip.count, 1);
  skip.game.destroy();
});

test("bonus attacks select six different rows of the fighter combat atlas", () => {
  const h = setup();
  const fighter = h.document.querySelector(".mvm-bonus-fighter");
  assert.ok(fighter.style.backgroundImage.includes("/jr-combat.png"));
  const rows = new Set();
  for (const key of ["j", "k", "l", "u", "i", "o"]) {
    h.hit(key);
    rows.add(fighter.style.backgroundPosition);
    assert.equal(fighter.dataset.attacking, "true");
    h.advance(300);
    assert.equal(fighter.style.backgroundPosition, "0% 0%");
  }
  assert.equal(rows.size, 6);
  h.game.destroy();
});
