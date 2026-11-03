// Pixel effects over the page: screen transitions, result-screen celebrations and the bonus stage.
// One 320×180 canvas covers the viewport (scaled to cover, pixels kept square) and only runs its
// animation loop while something is playing.
import { createPixelStage, SINGLE_LAYER, PIXEL_W, PIXEL_H, loadFx, preloadFx, coverTime } from "./pixelfx.js";
import { SCREEN_FX } from "./fx-map.js";

let stage = null,
  canvas = null,
  raf = 0,
  last = 0,
  quality = "full",
  reduced = false;

function ensure() {
  if (stage || typeof document === "undefined") return stage;
  stage = createPixelStage({ quality, layers: SINGLE_LAYER, cap: 24 });
  canvas = stage.layers[0].canvas;
  if (!canvas) return stage;
  canvas.className = "screen-fx";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    zIndex: "9000",
    pointerEvents: "none",
    imageRendering: "pixelated",
    display: "none",
  });
  document.body.append(canvas);
  layout();
  addEventListener("resize", layout);
  return stage;
}
// cover the viewport with square pixels; returns the scale
function layout() {
  if (!canvas) return 1;
  const s = Math.max(innerWidth / PIXEL_W, innerHeight / PIXEL_H);
  Object.assign(canvas.style, {
    width: `${PIXEL_W * s}px`,
    height: `${PIXEL_H * s}px`,
    left: `${(innerWidth - PIXEL_W * s) / 2}px`,
    top: `${(innerHeight - PIXEL_H * s) / 2}px`,
  });
  return s;
}
/** A viewport point (or an element's centre) in the overlay's pixel space. */
export function toPixels(point) {
  let x = innerWidth / 2,
    y = innerHeight / 2;
  if (point?.getBoundingClientRect) {
    const r = point.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top + r.height / 2;
  } else if (point) ({ x = x, y = y } = point);
  const s = Math.max(innerWidth / PIXEL_W, innerHeight / PIXEL_H);
  return { x: (x - (innerWidth - PIXEL_W * s) / 2) / s, y: (y - (innerHeight - PIXEL_H * s) / 2) / s };
}

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  stage.update(dt);
  stage.render();
  canvas.style.display = stage.visible("over") ? "block" : "none";
  if (stage.count) raf = requestAnimationFrame(loop);
  else {
    raf = 0;
    stage.render(true);
    canvas.style.display = "none";
  }
}
function wake() {
  if (raf || !canvas) return;
  last = performance.now();
  raf = requestAnimationFrame(loop);
}

/** Settings: "full" | "lite" | "off", and reduced motion (no transitions). */
export function configureScreenFx({ quality: q = "full", reducedMotion = false } = {}) {
  quality = q;
  reduced = reducedMotion;
  stage?.setQuality(q);
}

/** Play an effect on the page. at: an element, a viewport point {x, y}, or the screen centre. */
export function screenBurst(id, { at, ...o } = {}) {
  if (quality === "off" || !ensure() || !canvas) return null;
  const p = toPixels(at);
  const h = stage.spawn(id, { x: p.x, y: p.y, ...o });
  wake();
  return h;
}

/** Open a screen on its transition, started at the moment it covers the page. */
export function screenTransition(name) {
  const id = SCREEN_FX.transitions[name];
  if (!id || reduced || quality === "off" || !ensure() || !canvas) return;
  loadFx(id).then((mod) => {
    if (!mod) return;
    const [x, y] = mod.meta?.origin ?? [0, 0];
    stage.clear(true, (i) => i.id.startsWith("transitions/"));
    stage.spawn(id, { x, y, skip: coverTime(id, mod), tier: "core" });
    wake();
  });
}

/** Fetch the transitions ahead of time so the first screen change is not late. */
export function preloadScreenFx() {
  if (quality === "off") return;
  preloadFx(Object.values(SCREEN_FX.transitions));
}
