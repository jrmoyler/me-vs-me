// Every fighter cell must show a whole pose standing on the ground line.
//
// The fourteen- and eight-fighter exports were cropped off their source grids: kicks, fists,
// heads and POWER effects stopped at hard straight lines, and some rows lost everything below
// the shins, so once grounded the fighter stood knee-deep in the floor. Several of the original
// motion atlases stood on a haze of invisible pixels and hovered up to 50px over the ground.
// scripts/fix-sprite-bounds.py rebuilt them; scripts/audit-sprites.py renders contact sheets.
// These checks keep every one of the 49 fighters' 68 cells honest.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { characters } from "../src/characters.js";

const CELL = 320;
const FLOOR = 295; // lowest visible row: the feet sit on the engine anchor at y=296
const MARGIN = 2;
const CUT_RUN = 16; // natural silhouettes meet their extreme column in at most ~15 solid pixels
const WALL = 40; // natural outlines stay under ~37px of dead-straight edge on one column or row
const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));

function decode(path) {
  const data = readFileSync(publicRoot + path.slice(1));
  const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
  assert.equal(data[25], 6, `${path} must be RGBA`);
  const chunks = [];
  for (let at = 8; at < data.length;) {
    const len = data.readUInt32BE(at);
    if (data.toString("ascii", at + 4, at + 8) === "IDAT") chunks.push(data.subarray(at + 8, at + 8 + len));
    at += len + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4;
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, a = x >= 4 ? px[i - 4] : 0, b = y ? px[i - stride] : 0, c = y && x >= 4 ? px[i - stride - 4] : 0;
      let p = 0;
      if (f === 1) p = a;
      else if (f === 2) p = b;
      else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) {
        const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[i] = (raw[y * (stride + 1) + x + 1] + p) & 255;
    }
  }
  return { width, height, px };
}

// Bounds, solid runs along the extremes, and body area of one 320×320 cell.
function cell(img, row, col) {
  const { width, px } = img;
  const at = (x, y) => ((row * CELL + y) * width + col * CELL + x) * 4;
  let top = CELL, bottom = -1, left = CELL, right = -1, anyBottom = -1, anyTop = CELL, anyLeft = CELL, anyRight = -1, body = 0;
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++) {
      const i = at(x, y), a = px[i + 3];
      if (!a) continue;
      anyTop = Math.min(anyTop, y); anyBottom = Math.max(anyBottom, y);
      anyLeft = Math.min(anyLeft, x); anyRight = Math.max(anyRight, x);
      if (a > 8) {
        top = Math.min(top, y); bottom = Math.max(bottom, y);
        left = Math.min(left, x); right = Math.max(right, x);
      }
      if (a >= 250 && px[i] + px[i + 1] + px[i + 2] < 555) body++;
    }
  const run = (get, n) => {
    let best = 0, cur = 0;
    for (let k = 0; k < n; k++) {
      cur = get(k) >= 200 ? cur + 1 : 0;
      best = Math.max(best, cur);
    }
    return best;
  };
  const alpha = (x, y) => px[at(x, y) + 3];
  // Longest total of straight edge (solid pixel, clear neighbour, runs of 6+) on one column/row.
  let wall = 0;
  const edge = (x, y, dx, dy) => {
    if (alpha(x, y) < 200) return false;
    const nx = x + dx, ny = y + dy;
    return nx < 0 || ny < 0 || nx >= CELL || ny >= CELL || alpha(nx, ny) < 64;
  };
  if (bottom >= 0)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1]])
      for (let line = 0; line < CELL; line++) {
        let total = 0, cur = 0;
        for (let k = 0; k <= CELL; k++) {
          const on = k < CELL && (dy ? edge(k, line, dx, dy) : edge(line, k, dx, dy));
          if (on) cur++;
          else {
            if (cur >= 6) total += cur;
            cur = 0;
          }
        }
        wall = Math.max(wall, total);
      }
  return {
    wall,
    visible: bottom >= 0,
    top, bottom, left, right, anyTop, anyBottom, anyLeft, anyRight, body,
    cutLeft: bottom < 0 ? 0 : run((y) => alpha(left, y), CELL),
    cutRight: bottom < 0 ? 0 : run((y) => alpha(right, y), CELL),
    cutTop: bottom < 0 ? 0 : run((x) => alpha(x, top), CELL),
  };
}

function atlasCells(c) {
  const out = [];
  const sheet = decode(c.sheet), combat = decode(c.combatSheet), motion = decode(c.motionSheet);
  for (let k = 0; k < c.frameCount; k++) out.push([`ready[${k}]`, cell(sheet, 0, k)]);
  for (let r = 0; r < 7; r++) for (let k = 0; k < 4; k++) out.push([`combat[${r}][${k}]`, cell(combat, r, k)]);
  for (let r = 0; r < 6; r++) for (let k = 0; k < 4; k++) out.push([`motion[${r}][${k}]`, cell(motion, r, k)]);
  return out;
}

const measured = new Map();
const cellsOf = (c) => {
  if (!measured.has(c.id)) measured.set(c.id, atlasCells(c));
  return measured.get(c.id);
};

for (const c of characters) {
  test(`${c.name}: every pose stays inside its cell, uncut, feet on the ground line`, () => {
    const original = characters.indexOf(c) < 11;
    for (const [name, s] of cellsOf(c)) {
      assert.ok(s.visible, `${c.id} ${name} is empty`);
      assert.ok(
        s.anyTop >= MARGIN && s.anyLeft >= MARGIN && s.anyRight <= CELL - 1 - MARGIN && s.anyBottom <= CELL - 1 - MARGIN,
        `${c.id} ${name} runs to the cell border (${s.anyLeft},${s.anyTop})-(${s.anyRight},${s.anyBottom})`,
      );
      assert.ok(s.anyBottom <= FLOOR, `${c.id} ${name} sinks ${s.anyBottom - FLOOR}px below the ground line`);
      assert.equal(s.bottom, FLOOR, `${c.id} ${name} feet at ${s.bottom}, not on the ground line ${FLOOR}`);
      assert.equal(s.anyBottom, s.bottom, `${c.id} ${name} stands on invisible pixels ${s.anyBottom - s.bottom}px under its feet`);
      // A drawn silhouette meets its outermost column or top row in a few pixels; a crop cut
      // meets it along a straight solid wall (a sliced fist, foot, head or effect).
      // The original eleven's ready sheets are GIF frames doubled with nearest-neighbour
      // sampling: flat brims become long runs there, and those frames were never cropped.
      if (original && name.startsWith("ready")) continue;
      assert.ok(s.wall < WALL, `${c.id} ${name} has a ${s.wall}px dead-straight crop edge`);
      assert.ok(s.cutLeft < CUT_RUN, `${c.id} ${name} is cut straight down its left side (${s.cutLeft}px)`);
      assert.ok(s.cutRight < CUT_RUN, `${c.id} ${name} is cut straight down its right side (${s.cutRight}px)`);
      assert.ok(s.cutTop < CUT_RUN, `${c.id} ${name} is cut straight across its top (${s.cutTop}px)`);
    }
  });
}

// Drawing scale, from the body's opaque area (glow left out): a row of attacks drawn 1.3× larger
// than the ready pose makes the fighter swell on screen when that attack plays.
for (const c of characters.slice(11)) {
  test(`${c.name}: attacks and movement are drawn at the ready pose's scale`, () => {
    const cells = new Map(cellsOf(c));
    const ready = cells.get("combat[0][0]").body;
    const scale = (names) => {
      const ks = names.map((n) => Math.sqrt(cells.get(n).body / ready)).sort((a, b) => a - b);
      return (ks[(ks.length - 1) >> 1] + ks[ks.length >> 1]) / 2;
    };
    for (let r = 1; r < 6; r++) {
      const k = scale([0, 1, 2, 3].map((k) => `combat[${r}][${k}]`));
      assert.ok(k >= 0.85 && k <= 1.18, `${c.id} combat row ${r} is drawn at ${k.toFixed(2)}× the ready pose`);
    }
    // The runtime draws the motion atlas at 190 / motionBodyHeight, the combat atlas at 190 / bodyHeight.
    const k = scale([0, 2, 5].flatMap((r) => [0, 1, 2, 3].map((k) => `motion[${r}][${k}]`))) * (c.bodyHeight / c.motionBodyHeight);
    assert.ok(k >= 0.85 && k <= 1.18, `${c.id} walks and guards at ${k.toFixed(2)}× its ready size on screen`);
  });
}

// Guards that lost their lower legs read as the fighter sinking into the floor (the fourteen's
// guards were 149-172px against a 176px stance before the rebuild).
for (const c of characters.slice(11)) {
  test(`${c.name}: standing guards keep their legs`, () => {
    const cells = new Map(cellsOf(c));
    const ready = cells.get("combat[0][0]");
    const readyH = ready.bottom - ready.top + 1;
    // Column 2 is a crouching block for the eight pack; the standing guards must keep their legs.
    // Evergreen blocks in a deep bow-drawn squat (legs whole, bent), so height can't measure it.
    if (c.id === "archer") return;
    for (const k of [0, 1, 3]) {
      const g = cells.get(`motion[2][${k}]`);
      const h = (g.bottom - g.top + 1) * (c.bodyHeight / c.motionBodyHeight);
      assert.ok(h >= 0.9 * readyH, `${c.id} guard ${k} is ${h.toFixed(0)}px against a ${readyH}px ready pose`);
    }
  });
}
