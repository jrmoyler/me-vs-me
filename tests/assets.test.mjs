import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { characters } from "../src/characters.js";
import { arenas } from "../src/arenas.js";

const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
function asset(path) {
  assert.match(path, /^\/assets\/[\w./-]+$/);
  assert.ok(!path.includes(".."), "Asset path must stay inside public");
  const full = publicRoot + path.slice(1);
  assert.ok(existsSync(full), `Missing asset: ${path}`);
  return readFileSync(full);
}
function png(data, decode = false) {
  assert.equal(data.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  const width = data.readUInt32BE(16),
    height = data.readUInt32BE(20);
  if (!decode) return { width, height };
  assert.equal(data[24], 8, "Expected 8-bit image");
  assert.equal(data[25], 6, "Expected RGBA image");
  assert.equal(data[28], 0, "Expected non-interlaced image");
  const chunks = [];
  for (let offset = 8; offset < data.length;) {
    const length = data.readUInt32BE(offset);
    if (data.toString("ascii", offset + 4, offset + 8) === "IDAT")
      chunks.push(data.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)),
    stride = width * 4;
  assert.equal(raw.length, (stride + 1) * height);
  const pixels = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c,
      pa = Math.abs(p - a),
      pb = Math.abs(p - b),
      pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    assert.ok(filter <= 4, "Valid PNG row filter");
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x,
        a = x >= 4 ? pixels[at - 4] : 0;
      const b = y ? pixels[at - stride] : 0,
        c = y && x >= 4 ? pixels[at - stride - 4] : 0;
      const predict = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][
        filter
      ];
      pixels[at] = (raw[y * (stride + 1) + x + 1] + predict) & 255;
    }
  }
  return { width, height, pixels };
}

test("roster contains eleven distinct identities and signature attacks", () => {
  assert.equal(characters.length, 11);
  for (const key of ["id", "name", "move", "sheet", "portrait"])
    assert.equal(
      new Set(characters.map((c) => c[key])).size,
      11,
      `Unique ${key}`,
    );
});

test("all five arena manifests resolve to distinct 1536×864 WebP artwork", () => {
  assert.equal(arenas.length, 5);
  for (const key of ["id", "name", "background"])
    assert.equal(new Set(arenas.map((a) => a[key])).size, 5);
  const art = arenas.map((a) => {
    assert.match(a.color, /^#[a-f\d]{6}$/i);
    const data = asset(a.background);
    assert.equal(data.toString("ascii", 0, 4), "RIFF");
    assert.equal(data.toString("ascii", 8, 12), "WEBP");
    assert.equal(data.readUInt16LE(26) & 0x3fff, 1536);
    assert.equal(data.readUInt16LE(28) & 0x3fff, 864);
    return createHash("sha256").update(data).digest("hex");
  });
  assert.equal(new Set(art).size, 5);
});

for (const fighter of characters) {
  test(`${fighter.name}: combat metadata and portrait are valid`, () => {
    for (const stat of ["speed", "power", "reach"])
      assert.ok(
        Number.isFinite(fighter[stat]) &&
          fighter[stat] >= 1 &&
          fighter[stat] <= 10,
        stat,
      );
    assert.match(fighter.color, /^#[a-f\d]{6}$/i);
    assert.equal(fighter.frameCount, 16);
    assert.ok(fighter.frameDuration >= 16 && fighter.frameDuration <= 200);
    assert.ok(
      fighter.bodyHeight > 0 && fighter.bodyHeight < fighter.frameHeight,
    );
    assert.ok(fighter.anchorX > 0 && fighter.anchorX < fighter.frameWidth);
    assert.ok(
      fighter.anchorY > fighter.bodyHeight &&
        fighter.anchorY < fighter.frameHeight,
    );
    const portrait = png(asset(fighter.portrait));
    assert.ok(portrait.width >= 256 && portrait.height >= 256);
  });
  test(`${fighter.name}: sixteen sheet frames remain transparent, grounded, and unclipped`, () => {
    const { width, height, pixels } = png(asset(fighter.sheet), true);
    assert.equal(width, fighter.frameWidth * fighter.frameCount);
    assert.equal(height, fighter.frameHeight);
    for (let frame = 0; frame < fighter.frameCount; frame++) {
      let left = width,
        top = height,
        right = -1,
        bottom = -1;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < fighter.frameWidth; x++) {
          if (pixels[(y * width + frame * fighter.frameWidth + x) * 4 + 3]) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
      assert.ok(right >= left, `Frame ${frame} contains visible pixels`);
      assert.ok(
        left > 0 &&
          right < fighter.frameWidth - 1 &&
          top > 0 &&
          bottom < height - 1,
        `Frame ${frame} must not touch sheet edges`,
      );
      assert.ok(
        Math.abs(bottom + 1 - fighter.anchorY) <= 2,
        `Frame ${frame} feet must match ground anchor`,
      );
    }
  });
}

for (const fighter of characters) {
  test(`${fighter.name}: seven distinct combat rows, 28 nonempty grounded frames`, () => {
    const { width, height, pixels } = png(asset(fighter.combatSheet), true);
    assert.equal(width, 1280);
    assert.equal(height, 2240);
    assert.equal(fighter.combatFrameCount, 28);
    const peaks = [];
    for (let row = 0; row < 7; row++)
      for (let col = 0; col < 4; col++) {
        let left = 320,
          right = -1,
          top = 320,
          bottom = -1;
        const hash = createHash("sha256");
        for (let y = 0; y < 320; y++) {
          const start = ((row * 320 + y) * width + col * 320) * 4;
          hash.update(pixels.subarray(start, start + 1280));
          for (let x = 0; x < 320; x++)
            if (pixels[start + x * 4 + 3]) {
              left = Math.min(left, x);
              right = Math.max(right, x);
              top = Math.min(top, y);
              bottom = Math.max(bottom, y);
            }
        }
        assert.ok(right >= left, `row ${row} pose ${col} is visible`);
        assert.ok(
          left > 0 && right < 319 && top > 0 && bottom < 319,
          `row ${row} pose ${col} has transparent padding`,
        );
        assert.ok(
          Math.abs(bottom + 1 - 296) <= 2,
          `row ${row} pose ${col} is grounded`,
        );
        if (col === 2) peaks.push(hash.digest("hex"));
      }
    assert.equal(
      new Set(peaks).size,
      7,
      "Seven genuinely different impact illustrations",
    );
  });
}

for (const fighter of characters)
  test(`${fighter.name}: 24 motion frames have alpha margins and six distinct state illustrations`, () => {
    const { width, height, pixels } = png(asset(fighter.motionSheet), true);
    assert.equal(width, 1280);
    assert.equal(height, 1920);
    assert.equal(fighter.motionFrameCount, 24);
    const states = [];
    for (let row = 0; row < 6; row++)
      for (let col = 0; col < 4; col++) {
        let left = 320,
          right = -1,
          top = 320,
          bottom = -1;
        const hash = createHash("sha256");
        for (let y = 0; y < 320; y++) {
          const start = ((row * 320 + y) * width + col * 320) * 4;
          hash.update(pixels.subarray(start, start + 1280));
          for (let x = 0; x < 320; x++)
            if (pixels[start + x * 4 + 3]) {
              left = Math.min(left, x);
              right = Math.max(right, x);
              top = Math.min(top, y);
              bottom = Math.max(bottom, y);
            }
        }
        assert.ok(right >= left, `row ${row} pose ${col} visible`);
        assert.ok(
          left > 0 && right < 319 && top > 0 && bottom < 319,
          `row ${row} pose ${col} no atlas clipping`,
        );
        assert.ok(
          Math.abs(bottom + 1 - 296) <= 2,
          `row ${row} pose ${col} grounded`,
        );
        if (col === 2) states.push(hash.digest("hex"));
      }
    assert.equal(new Set(states).size, 6);
  });
