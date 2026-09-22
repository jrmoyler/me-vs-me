#!/usr/bin/env node
// Drive the built game into a match on phone and tablet viewports, screenshot the
// touch controller, and assert target sizes and that nothing overlaps Pause.
//
//   npm run build && node scripts/qa-screens.mjs
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";

async function loadPlaywright() {
  const require = createRequire(import.meta.url);
  if (process.env.PLAYWRIGHT_MODULE) return require(process.env.PLAYWRIGHT_MODULE);
  try {
    return require("playwright");
  } catch {}
  const root = execFileSync("npm", ["root", "-g"]).toString().trim();
  return require(path.join(root, "playwright"));
}

const dist = path.resolve("dist");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
};
const server = createServer(async (req, res) => {
  let pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (pathname === "/") pathname = "/index.html";
  try {
    const file = path.join(dist, pathname);
    const data = await readFile(file);
    res.writeHead(200, {
      "content-type": types[path.extname(file)] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;

const VIEWPORTS = [
  ["phone-portrait", 390, 844],
  ["phone-landscape", 844, 390],
  ["small-phone-portrait", 320, 568],
  ["tablet-portrait", 1024, 1366],
  ["tablet-landscape", 1366, 1024],
];
const overlap = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const report = [];
await mkdir("docs/qa", { recursive: true });
for (const [name, width, height] of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("mvm-onboarded", "true");
    localStorage.setItem(
      "mvm-settings",
      JSON.stringify({ sound: false, reducedMotion: true, difficulty: "normal" }),
    );
  });
  const problems = [];
  try {
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.click(".start-button");
    await page.click('[data-action="confirm-fighter"]');
    await page.click('[data-action="confirm-fighter"]');
    await page.click('[data-action="fight"]');
    await page.waitForSelector('.mvm-combat[data-loaded="true"]', { timeout: 60000 });
    await page.waitForSelector(".mvm-loading", { state: "detached", timeout: 60000 });
    await page.waitForTimeout(2600);
    const boxes = await page.evaluate(() => {
      const rect = (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      };
      return {
        touch: document.querySelector(".mvm-combat").dataset.touch,
        pause: rect(document.querySelector(".mvm-pause-button")),
        hud: rect(document.querySelector(".mvm-hud")),
        canvas: rect(document.querySelector(".mvm-combat canvas")),
        dpad: rect(document.querySelector(".mvm-dpad")),
        controls: [...document.querySelectorAll(".mvm-touch [data-control]")].map((el) => ({
          control: el.dataset.control,
          ...rect(el),
        })),
      };
    });
    if (boxes.touch !== "true") problems.push("touch controls are not enabled");
    const minSize = width >= 900 ? 64 : 44;
    for (const c of [...boxes.controls, { control: "d-pad", ...boxes.dpad }]) {
      if (Math.min(c.w, c.h) < minSize)
        problems.push(`${c.control} is ${c.w.toFixed(0)}×${c.h.toFixed(0)}`);
      if (overlap(c, boxes.pause)) problems.push(`${c.control} overlaps Pause`);
      if (overlap(c, boxes.hud)) problems.push(`${c.control} overlaps the HUD`);
      if (c.x < 0 || c.y < 0 || c.x + c.w > width || c.y + c.h > height)
        problems.push(`${c.control} leaves the viewport`);
    }
    if (width < height) {
      const lowest = Math.max(...boxes.controls.map((c) => c.y + c.h), boxes.dpad.y + boxes.dpad.h);
      const highest = Math.min(...boxes.controls.map((c) => c.y), boxes.dpad.y);
      if (highest < boxes.canvas.y + boxes.canvas.h)
        problems.push("portrait controls overlap the canvas");
      void lowest;
    }
    await page.screenshot({
      path: `docs/qa/controller-${name}.jpg`,
      type: "jpeg",
      quality: 78,
    });
  } catch (error) {
    problems.push(error.message.split("\n")[0]);
  }
  report.push({ name, width, height, problems });
  await context.close();
}
await browser.close();
server.close();
for (const r of report)
  console.log(
    `${r.problems.length ? "FAIL" : "ok  "} ${r.name.padEnd(22)} ${r.width}×${r.height} ${r.problems.join("; ")}`,
  );
if (report.some((r) => r.problems.length)) process.exitCode = 1;
