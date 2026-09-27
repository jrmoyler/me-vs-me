import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
const size = (png) => [png.readUInt32BE(16), png.readUInt32BE(20)];

test("the page links an installable manifest with any and maskable icons", () => {
  const html = read("index.html").toString();
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest"\/>/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png"\/>/);
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  for (const key of ["name", "short_name", "start_url", "scope", "display", "background_color", "theme_color"])
    assert.ok(manifest[key], `manifest.${key}`);
  assert.ok(["fullscreen", "standalone"].includes(manifest.display));
  const icons = Object.fromEntries(manifest.icons.map((i) => [`${i.sizes} ${i.purpose}`, i.src]));
  for (const want of ["192x192 any", "512x512 any", "512x512 maskable"]) assert.ok(icons[want], want);
  for (const icon of [...manifest.icons, { src: "/icons/apple-touch-icon.png", sizes: "180x180" }]) {
    const file = `public${icon.src}`;
    assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), file);
    assert.deepEqual(size(read(file)), icon.sizes.split("x").map(Number), file);
  }
});

test("the service worker carries the placeholders the build fills and caches art by path", () => {
  const sw = read("public/sw.js").toString();
  assert.match(sw, /const VERSION = "[^"]*";/);
  assert.match(sw, /const PRECACHE = \[[^\]]*\];/);
  assert.match(sw, /\/assets\/characters\//);
  assert.match(sw, /request\.mode === "navigate"/);
  const config = read("vite.config.js").toString();
  assert.match(config, /const VERSION = /, "vite.config.js stamps the version");
  assert.match(config, /const PRECACHE = /, "vite.config.js fills the precache list");
});

test("only a production build served over HTTP registers the worker", () => {
  const pwa = read("src/pwa.js").toString();
  assert.match(pwa, /\/\^https\?:\$\/\.test\(location\.protocol\)/, "file:// offline packages stay uncached");
  assert.match(pwa, /import\.meta\.env\?\.PROD/, "the dev server stays uncached");
  assert.match(read("src/main.js").toString(), /registerPWA\(\);/);
});
