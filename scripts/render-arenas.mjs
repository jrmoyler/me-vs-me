#!/usr/bin/env node
// Encode arena artwork into the exact container the game and tests expect:
// opaque, lossy, simple-VP8 WebP at 1536×864. Also validates and builds a QA sheet.
//
//   node scripts/render-arenas.mjs --encode asset-sources/arenas [id …]
//   node scripts/render-arenas.mjs --check
//   node scripts/render-arenas.mjs --sheet docs/qa/ten-arenas.jpg
//
// Uses Playwright's Chromium (the global install works: PLAYWRIGHT_MODULE overrides).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { parseArgs } from "node:util";
import { arenas } from "../src/arenas.js";

export const WIDTH = 1536;
export const HEIGHT = 864;
const MAX_BYTES = 620 * 1024;
const publicRoot = path.resolve("public");

function chunks(buffer) {
  const list = [];
  for (let offset = 12; offset + 8 <= buffer.length; ) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    list.push({ id, offset, size, data: buffer.subarray(offset + 8, offset + 8 + size) });
    offset += 8 + size + (size % 2);
  }
  return list;
}

// Chromium wraps canvas output in the extended (VP8X) container even when the
// image is opaque. Without an ALPH chunk the VP8 bitstream is unchanged, so the
// file can be rewritten as the simple container the game's tests parse.
export function simplifyWebp(buffer) {
  if (buffer.toString("ascii", 12, 16) !== "VP8X") return buffer;
  const list = chunks(buffer);
  if (list.some((c) => c.id === "ALPH"))
    throw new Error("encoded image has alpha; fill the canvas opaque first");
  const vp8 = list.find((c) => c.id === "VP8 ");
  if (!vp8) throw new Error("no lossy VP8 bitstream found (lossless output?)");
  const header = Buffer.alloc(8);
  header.write("VP8 ", 0, "ascii");
  header.writeUInt32LE(vp8.size, 4);
  const padding = vp8.size % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
  const body = Buffer.concat([Buffer.from("WEBP", "ascii"), header, vp8.data, padding]);
  const riff = Buffer.alloc(8);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}

export function inspectWebp(buffer) {
  if (
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  )
    throw new Error("not a WebP file");
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk !== "VP8 ")
    throw new Error(
      `expected the simple lossy VP8 container, got ${JSON.stringify(chunk)} (alpha or lossless output)`,
    );
  return {
    width: buffer.readUInt16LE(26) & 0x3fff,
    height: buffer.readUInt16LE(28) & 0x3fff,
    bytes: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

async function loadPlaywright() {
  const require = createRequire(import.meta.url);
  if (process.env.PLAYWRIGHT_MODULE) return require(process.env.PLAYWRIGHT_MODULE);
  try {
    return require("playwright");
  } catch {}
  const root = execFileSync("npm", ["root", "-g"]).toString().trim();
  return require(path.join(root, "playwright"));
}

const outputFor = (arena) => path.join(publicRoot, arena.background.slice(1));

async function withPage(fn) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: WIDTH, height: HEIGHT },
    });
    await page.setContent(
      '<!doctype html><body style="margin:0;background:#101319"><canvas id="c"></canvas></body>',
    );
    return await fn(page);
  } finally {
    await browser.close();
  }
}

const mime = (file) =>
  file.endsWith(".webp")
    ? "image/webp"
    : file.endsWith(".jpg") || file.endsWith(".jpeg")
      ? "image/jpeg"
      : "image/png";

async function encode(sourceDir, ids, quality) {
  const targets = arenas.filter((a) => !ids.length || ids.includes(a.id));
  const jobs = [];
  for (const arena of targets) {
    const source = [".png", ".jpg", ".jpeg", ".webp"]
      .map((ext) => path.join(sourceDir, arena.id + ext))
      .find((file) => existsSync(file));
    if (!source) {
      if (ids.length) throw new Error(`No source image for ${arena.id} in ${sourceDir}`);
      continue;
    }
    jobs.push({ arena, source });
  }
  if (!jobs.length) throw new Error(`Nothing to encode from ${sourceDir}`);
  await withPage(async (page) => {
    for (const { arena, source } of jobs) {
      const bytes = await readFile(source);
      const dataUrl = await page.evaluate(
        async ({ src, w, h, q }) => {
          const img = new Image();
          img.src = src;
          await img.decode();
          const canvas = document.querySelector("#c");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d", { alpha: false });
          ctx.fillStyle = "#101319";
          ctx.fillRect(0, 0, w, h); // opaque fill: no alpha plane in the output
          const scale = Math.max(w / img.width, h / img.height);
          const dw = img.width * scale,
            dh = img.height * scale;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
          return canvas.toDataURL("image/webp", q);
        },
        {
          src: `data:${mime(source)};base64,${bytes.toString("base64")}`,
          w: WIDTH,
          h: HEIGHT,
          q: quality,
        },
      );
      const out = simplifyWebp(Buffer.from(dataUrl.split(",")[1], "base64"));
      const info = inspectWebp(out);
      if (info.width !== WIDTH || info.height !== HEIGHT)
        throw new Error(`${arena.id}: encoded ${info.width}×${info.height}`);
      await mkdir(path.dirname(outputFor(arena)), { recursive: true });
      await writeFile(outputFor(arena), out);
      console.log(
        `${arena.id.padEnd(18)} ${path.relative(process.cwd(), outputFor(arena))} ${(info.bytes / 1024).toFixed(0)} KB`,
      );
    }
  });
}

async function check() {
  const seen = new Map();
  let failed = false;
  for (const arena of arenas) {
    try {
      const info = inspectWebp(await readFile(outputFor(arena)));
      const problems = [];
      if (info.width !== WIDTH || info.height !== HEIGHT)
        problems.push(`${info.width}×${info.height}`);
      if (info.bytes > MAX_BYTES) problems.push(`${(info.bytes / 1024).toFixed(0)} KB`);
      if (seen.has(info.sha256)) problems.push(`duplicate of ${seen.get(info.sha256)}`);
      seen.set(info.sha256, arena.id);
      console.log(
        `${problems.length ? "FAIL" : "ok  "} ${arena.id.padEnd(18)} ${info.width}×${info.height} ${(info.bytes / 1024).toFixed(0)} KB ${problems.join(", ")}`,
      );
      failed ||= problems.length > 0;
    } catch (error) {
      failed = true;
      console.log(`FAIL ${arena.id.padEnd(18)} ${error.message}`);
    }
  }
  if (failed) process.exitCode = 1;
}

async function sheet(target) {
  const columns = 5,
    cell = { w: 384, h: 216 },
    rows = Math.ceil(arenas.length / columns);
  const images = [];
  for (const arena of arenas)
    images.push({
      name: arena.name,
      src: `data:image/webp;base64,${(await readFile(outputFor(arena))).toString("base64")}`,
    });
  const jpeg = await withPage((page) =>
    page.evaluate(
      async ({ images, columns, rows, cell }) => {
        const canvas = document.querySelector("#c");
        canvas.width = columns * cell.w;
        canvas.height = rows * (cell.h + 26);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#101319";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < images.length; i++) {
          const img = new Image();
          img.src = images[i].src;
          await img.decode();
          const x = (i % columns) * cell.w,
            y = Math.floor(i / columns) * (cell.h + 26);
          ctx.drawImage(img, x, y, cell.w, cell.h);
          ctx.fillStyle = "#eee9d9";
          ctx.font = "bold 13px monospace";
          ctx.fillText(`${String(i + 1).padStart(2, "0")}  ${images[i].name.toUpperCase()}`, x + 8, y + cell.h + 18);
        }
        return canvas.toDataURL("image/jpeg", 0.82);
      },
      { images, columns, rows, cell },
    ),
  );
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(jpeg.split(",")[1], "base64"));
  console.log(`Contact sheet written to ${target}`);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    encode: { type: "string" },
    check: { type: "boolean" },
    sheet: { type: "string" },
    quality: { type: "string", default: "0.82" },
  },
});
if (values.encode) await encode(values.encode, positionals, Number(values.quality));
if (values.sheet) await sheet(values.sheet);
if (values.check || (!values.encode && !values.sheet)) await check();
