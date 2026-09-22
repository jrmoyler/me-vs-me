import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { createTouchController, padDirection, ATTACKS, DIRECTIONS } from "../src/controller.js";

function setup() {
  const window = new Window({ url: "http://localhost" });
  window.document.body.innerHTML = '<div class="mvm-combat" data-touch="true"><div id="mount"></div></div>';
  const events = [], presses = [];
  const controller = createTouchController({
    mount: window.document.querySelector("#mount"),
    onChange: (control, down) => events.push(`${control}:${down ? "down" : "up"}`),
    onPress: (control) => presses.push(control),
    haptics: false,
  });
  const pointer = (target, type, { id = 1, x = 0, y = 0 } = {}) => {
    const Ctor = window.PointerEvent || window.MouseEvent;
    const event = new Ctor(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: id });
    if (event.pointerId !== id) Object.defineProperty(event, "pointerId", { value: id });
    target.dispatchEvent(event);
  };
  const root = controller.element;
  return { window, controller, events, presses, pointer, root, dpad: root.querySelector(".mvm-dpad"), button: (c) => root.querySelector(`[data-control="${c}"]`) };
}

test("padDirection maps eight sectors with a dead zone", () => {
  const dir = (x, y) => DIRECTIONS.filter((k) => padDirection(x, y, 70)[k]).join("+");
  assert.equal(dir(60, 0), "right");
  assert.equal(dir(45, 45), "right+crouch");
  assert.equal(dir(0, 60), "crouch");
  assert.equal(dir(-45, 45), "left+crouch");
  assert.equal(dir(-60, 0), "left");
  assert.equal(dir(-45, -45), "left+jump");
  assert.equal(dir(0, -60), "jump");
  assert.equal(dir(45, -45), "right+jump");
  assert.equal(dir(8, 4), "", "dead zone");
  assert.equal(dir(0, 0), "");
  assert.equal(DIRECTIONS.filter((k) => padDirection(50, 0, 0)[k]).length, 0);
});

test("the d-pad slides: one pointer walks, diagonals jump forward, release clears everything", () => {
  const h = setup();
  h.pointer(h.dpad, "pointerdown", { x: 60, y: 0 });
  assert.deepEqual(h.events, ["right:down"]);
  assert.equal(h.dpad.dataset.dir, "right");
  assert.equal(h.dpad.dataset.active, "true");
  h.pointer(h.dpad, "pointermove", { x: 45, y: -45 });
  assert.deepEqual(h.events.slice(1), ["jump:down"]);
  h.pointer(h.dpad, "pointermove", { x: -60, y: -60 });
  assert.deepEqual(h.events.slice(2), ["left:down", "right:up"]);
  assert.equal(h.dpad.dataset.dir, "left jump");
  h.pointer(h.dpad, "pointermove", { id: 9, x: 60, y: 60 });
  assert.equal(h.events.length, 4, "a foreign pointer never steers the pad");
  h.pointer(h.dpad, "pointerdown", { id: 9, x: 60, y: 60 });
  assert.equal(h.events.length, 4, "a second finger on the pad is ignored");
  h.pointer(h.dpad, "pointerup", { x: -60, y: -60 });
  assert.deepEqual(h.events.slice(4).sort(), ["jump:up", "left:up"]);
  assert.equal(h.dpad.dataset.active, "false");
  assert.equal(h.presses.filter((c) => c === "right").length, 1);
  h.controller.destroy();
});

test("attack keys are tap edges, guard is a hold, and fingers stay independent", () => {
  const h = setup();
  assert.equal(h.root.querySelectorAll("[data-control]").length, ATTACKS.length + 2);
  assert.equal(h.root.querySelector(".mvm-pause-button"), null);
  h.pointer(h.button("light"), "pointerdown", { id: 2 });
  assert.deepEqual(h.events, ["light:down"]);
  assert.deepEqual(h.presses, ["light"]);
  assert.ok(h.button("light").classList.contains("held"));
  h.pointer(h.button("heavyKick"), "pointerdown", { id: 3 });
  h.pointer(h.button("block"), "pointerdown", { id: 4 });
  assert.deepEqual(h.events.slice(1), ["heavyKick:down", "block:down"]);
  h.pointer(h.button("light"), "pointerup", { id: 2 });
  assert.deepEqual(h.events.slice(3), ["light:up"]);
  assert.equal(h.button("light").classList.contains("held"), false);
  assert.ok(h.button("heavyKick").classList.contains("held"));
  h.pointer(h.button("light"), "pointerup", { id: 2 });
  assert.equal(h.events.length, 4, "a second release is a no-op");
  h.pointer(h.root.querySelector('[data-side="right"]'), "pointercancel", { id: 3 });
  assert.deepEqual(h.events.slice(4), ["heavyKick:up"]);
  assert.deepEqual(h.presses, ["light", "heavyKick", "block"], "one press per tap");
  h.pointer(h.root.querySelector(".mvm-cluster"), "pointerdown", { id: 5 });
  assert.equal(h.events.length, 5, "touching the gap between keys does nothing");
  h.controller.destroy();
});

test("power readiness, release and destroy", () => {
  const h = setup();
  const power = h.button("special");
  assert.equal(power.dataset.ready, "false");
  h.controller.setPowerReady(true, 100, "Crown Breaker. Ready");
  assert.equal(power.dataset.ready, "true");
  assert.equal(power.textContent, "POWER ◆");
  assert.equal(power.getAttribute("aria-label"), "Crown Breaker. Ready");
  h.controller.setPowerReady(false, 12.7);
  assert.equal(power.textContent, "POWER 12");
  h.pointer(h.dpad, "pointerdown", { x: 60, y: 0 });
  h.pointer(h.button("medium"), "pointerdown", { id: 2 });
  h.pointer(h.button("block"), "pointerdown", { id: 3 });
  h.controller.release();
  assert.deepEqual(h.events.slice(3).sort(), ["block:up", "medium:up", "right:up"]);
  assert.equal(h.root.querySelectorAll(".held").length, 0);
  h.pointer(h.button("medium"), "pointerup", { id: 2 });
  assert.equal(h.events.length, 6, "released pointers are forgotten");
  h.controller.destroy();
  assert.equal(h.window.document.querySelector(".mvm-touch"), null);
  h.pointer(h.dpad, "pointerdown", { x: 60, y: 0 });
  assert.equal(h.events.length, 6, "destroyed controllers emit nothing");
});
