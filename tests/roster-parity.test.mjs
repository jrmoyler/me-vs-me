import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { characters } from "../src/characters.js";
import { POWERS, KITS, ROLES, kitFor } from "../src/moves.js";
import { createAttack } from "../src/combat-rules.js";

// The original eleven set the bar every later fighter is held to.
const originals = characters.slice(0, 11);
const newer = characters.slice(11);
const effects = readFileSync(new URL("../src/stage-effects.js", import.meta.url), "utf8");
const casesIn = (from, to) =>
  new Set([...effects.slice(effects.indexOf(from), to ? effects.indexOf(to) : undefined).matchAll(/case "([a-z]+)"/g)].map((m) => m[1]));
const powerCases = casesIn("export function paintPower", "export function paintProjectile");
const projectileCases = casesIn("export function paintProjectile");

test("roster parity: the original eleven and twenty-four newer fighters", () => {
  assert.deepEqual(
    originals.map((c) => c.id),
    "hataalii urban gauntlet tote vector kinetic corvette curly pixel tweed varsity".split(" "),
  );
  assert.equal(newer.length, 24);
});

test("roster parity: every newer fighter carries the same identity and atlas fields as the originals", () => {
  const fields = Object.keys(originals[0]).sort();
  for (const c of originals) assert.deepEqual(Object.keys(c).sort(), fields, c.id);
  for (const c of newer) {
    assert.deepEqual(Object.keys(c).sort(), fields, `${c.id}: same data fields`);
    for (const key of ["name", "title", "description", "move", "quote"])
      assert.ok(typeof c[key] === "string" && c[key].trim().length >= 3, `${c.id}.${key}`);
    assert.equal(c.combatFrameCount, 28);
    assert.equal(c.motionFrameCount, 24);
  }
});

test("roster parity: every POWER profile has the fields of the originals' POWER class", () => {
  const shape = (p) => Object.keys(p).sort().join(",");
  const byVariant = {};
  for (const c of originals) (byVariant[POWERS[c.id].variant] ||= new Set()).add(shape(POWERS[c.id]));
  // Sweeps and command dashes travel, launchers also lift, projectiles carry a speed.
  for (const shapes of Object.values(byVariant)) assert.equal(shapes.size, 1);
  for (const c of newer) {
    const p = POWERS[c.id];
    assert.ok(byVariant[p.variant], `${c.id}: POWER class ${p.variant} exists among the originals`);
    assert.ok(byVariant[p.variant].has(shape(p)), `${c.id}: ${shape(p)}`);
    if (p.variant !== 3) assert.ok(p.travel > 0, `${c.id}: melee POWER moves the fighter`);
    if (p.variant === 2) assert.ok(p.lift > 0, `${c.id}: launcher lifts`);
    if (p.variant === 3) assert.ok(p.projectileSpeed > 0, `${c.id}: projectile speed`);
  }
});

test("roster parity: newer POWER frame data stays inside the originals' damage, startup, active and duration ranges", () => {
  const range = (key, list = originals) => {
    const v = list.map((c) => POWERS[c.id][key]);
    return [Math.min(...v), Math.max(...v)];
  };
  for (const key of ["damage", "start", "active", "duration"]) {
    const [lo, hi] = range(key);
    for (const c of newer) {
      const v = POWERS[c.id][key];
      assert.ok(v >= lo && v <= hi, `${c.id}.${key} = ${v}, originals span ${lo}–${hi}`);
    }
  }
  const [, projectileReach] = range("reach", originals.filter((c) => POWERS[c.id].variant === 3));
  for (const c of newer.filter((c) => POWERS[c.id].variant === 3))
    assert.ok(POWERS[c.id].reach <= projectileReach, `${c.id}: projectile reach`);
  // The built move keeps the illustrated impact pose inside its damage window.
  for (const c of characters) {
    const m = createAttack({ c, energy: 100 }, "special");
    assert.ok(m.start + m.active < m.duration, c.id);
  }
});

test("roster parity: every fighter has a kit role, a job line and a POWER class", () => {
  assert.deepEqual(Object.keys(KITS).sort(), characters.map((c) => c.id).sort());
  for (const c of characters) {
    const kit = kitFor(c);
    assert.ok(ROLES[kit.role], c.id);
    assert.ok(kit.job && kit.powerClass !== "SIGNATURE" && kit.style, c.id);
  }
  const roles = Object.fromEntries(newer.slice(-8).map((c) => [c.id, kitFor(c).role]));
  assert.deepEqual(roles, {
    patchrunner: "rushdown",
    starscribe: "zoner",
    sovereign: "grappler-lite",
    circuitbreaker: "zoner",
    ironchef: "balanced",
    eventhorizon: "zoner",
    crimsonoracle: "counter",
    dunevoyager: "rushdown",
  });
  for (const id of ["patchrunner", "dunevoyager"]) assert.equal(kitFor({ id }).job, "command dash");
  for (const id of ["starscribe", "circuitbreaker", "eventhorizon"]) assert.equal(kitFor({ id }).job, "projectile zoning");
});

test("roster parity: every newer POWER style has its own case in each effect switch it reaches", () => {
  // The originals' own painters are unchanged; each one that has a case keeps it.
  for (const style of ["crown", "shatter", "star", "vector", "shock", "counter", "sweep"]) assert.ok(powerCases.has(style), style);
  for (const c of newer) assert.ok(powerCases.has(POWERS[c.id].style), `${c.id}: paintPower case "${POWERS[c.id].style}"`);
  // Every projectile POWER, original or newer, travels as its own shape.
  for (const c of characters.filter((c) => POWERS[c.id].variant === 3))
    assert.ok(projectileCases.has(POWERS[c.id].style), `${c.id}: paintProjectile case "${POWERS[c.id].style}"`);
  // No case is dead: each one belongs to a fighter.
  const styles = new Set(Object.values(POWERS).map((p) => p.style));
  for (const style of [...powerCases, ...projectileCases]) assert.ok(styles.has(style), `${style} belongs to a fighter`);
});
