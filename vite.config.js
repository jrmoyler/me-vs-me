import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

// Fills public/sw.js's precache list with this build's page, bundle and icons, and stamps
// its version with their hash so each deploy replaces the installed game's cached shell.
function serviceWorkerPrecache() {
  let outDir = "dist";
  const files = [];
  return {
    name: "mvm-service-worker-precache",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    generateBundle(_, bundle) {
      for (const name of Object.keys(bundle)) if (!name.endsWith(".map")) files.push(`/${name}`);
    },
    closeBundle() {
      const icons = ["/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/icons/apple-touch-icon.png"];
      const precache = ["/", "/manifest.webmanifest", ...icons, ...files.filter((f) => f !== "/index.html")];
      const version = createHash("sha256").update(precache.join("\n")).digest("hex").slice(0, 12);
      const path = resolve(outDir, "sw.js");
      const source = readFileSync(path, "utf8")
        .replace(/const VERSION = "[^"]*";/, `const VERSION = "${version}";`)
        .replace(/const PRECACHE = \[[^\]]*\];/, `const PRECACHE = ${JSON.stringify(precache)};`);
      writeFileSync(path, source);
    },
  };
}

export default defineConfig({ plugins: [serviceWorkerPrecache()] });
