import test from "node:test";
import assert from "node:assert/strict";
import { motionFrame, MOTION_STATES } from "../src/motion.js";
test("walk cycles four distinct frames and returns seamlessly to the first", () => {
  assert.deepEqual(
    [0, 0.1, 0.2, 0.3, 0.4].map((t) => motionFrame("walk", t)),
    [0, 1, 2, 3, 0],
  );
});
test("jump poses follow physics ascent and descent; guard settles into a held block", () => {
  assert.equal(motionFrame("jump", 0, -100), 5);
  assert.equal(motionFrame("jump", 0, 100), 6);
  assert.equal(motionFrame("guard", 0), 8);
  assert.equal(motionFrame("guard", 3), 10);
});
test("knockout and victory hold their final authored pose without looping upright", () => {
  assert.equal(motionFrame("ko", 0), 16);
  assert.equal(motionFrame("ko", 10), 19);
  assert.equal(motionFrame("victory", 0), 20);
  assert.equal(motionFrame("victory", 10), 23);
});
test("every motion pose index remains in its own atlas row", () => {
  for (const [row, state] of MOTION_STATES.entries())
    for (const t of [0, 0.02, 0.07, 0.15, 0.3, 0.9, 10]) {
      const frame = motionFrame(state, t, 20);
      assert.ok(frame >= row * 4 && frame < row * 4 + 4);
    }
});
