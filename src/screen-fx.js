// Pixel effects over the page: screen transitions, result-screen celebrations and the bonus stage.
// Two canvases cover the viewport (scaled to cover, pixels kept square) and only run their
// animation loop while something is playing:
//   transitions  320×180, the frame every transition is sized to, started where it covers the page
//   bursts       480×270, so a celebration or a bonus-stage effect sits at the scale of the page's
//                type and art instead of towering over it
import { createPixelStage, SINGLE_LAYER, PIXEL_W, PIXEL_H, COMBAT_W, COMBAT_H, loadFx, preloadFx, coverTime } from "./pixelfx.js";
import { SCREEN_FX } from "./fx-map.js";

const SIZES = {
  transitions: { w: PIXEL_W, h: PIXEL_H, z: "9001" },
  bursts: { w: COMBAT_W, h: COMBAT_H, z: "9000" },
};
const stages = {};
let quality = "full",
  reduced = false;

function ensure(name) {
  if (stages[name] || typeof document === "undefined") return stages[name] ?? null;
  const { w, h, z } = SIZES[name];
  const stage = createPixelStage({ quality, layers: [{ ...SINGLE_LAYER[0], w, h }], cap: 24 });
  const canvas = stage.layers[0].canvas;
  if (!canvas) return null;
  canvas.className = `screen-fx screen-fx-${name}`;
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    zIndex: z,
    pointerEvents: "none",
    imageRendering: "pixelated",
    display: "none",
  });
  document.body.append(canvas);
  const s = { name, stage, canvas, w, h, raf: 0, last: 0 };
  stages[name] = s;
  layout(s);
  addEventListener("resize", () => layout(s));
  return s;
}
// cover the viewport with square pixels; returns the scale
function layout(s) {
  const k = Math.max(innerWidth / s.w, innerHeight / s.h);
  Object.assign(s.canvas.style, {
    width: `${s.w * k}px`,
    height: `${s.h * k}px`,
    left: `${(innerWidth - s.w * k) / 2}px`,
    top: `${(innerHeight - s.h * k) / 2}px`,
  });
  return k;
}
/** A viewport point (or an element's centre) in a frame's pixel space (the burst frame by default). */
export function toPixels(point, { w = COMBAT_W, h = COMBAT_H } = {}) {
  let x = innerWidth / 2,
    y = innerHeight / 2;
  if (point?.getBoundingClientRect) {
    const r = point.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top + r.height / 2;
  } else if (point) ({ x = x, y = y } = point);
  const k = Math.max(innerWidth / w, innerHeight / h);
  return { x: (x - (innerWidth - w * k) / 2) / k, y: (y - (innerHeight - h * k) / 2) / k };
}

function loop(s, now) {
  const dt = Math.min(0.05, (now - s.last) / 1000 || 0);
  s.last = now;
  s.stage.update(dt);
  s.stage.render();
  s.canvas.style.display = s.stage.visible("over") ? "block" : "none";
  if (s.stage.count) s.raf = requestAnimationFrame((t) => loop(s, t));
  else {
    s.raf = 0;
    s.stage.render(true);
    s.canvas.style.display = "none";
  }
}
function wake(s) {
  if (s.raf) return;
  s.last = performance.now();
  s.raf = requestAnimationFrame((t) => loop(s, t));
}

/** Settings: "full" | "lite" | "off", and reduced motion (no transitions). */
export function configureScreenFx({ quality: q = "full", reducedMotion = false } = {}) {
  quality = q;
  reduced = reducedMotion;
  for (const s of Object.values(stages)) s.stage.setQuality(q);
}

/** Play an effect on the page. at: an element, a viewport point {x, y}, or the screen centre. */
export function screenBurst(id, { at, ...o } = {}) {
  if (quality === "off") return null;
  const s = ensure("bursts");
  if (!s) return null;
  const p = toPixels(at, s);
  const h = s.stage.spawn(id, { x: p.x, y: p.y, ...o });
  wake(s);
  return h;
}

/** The options every transition plays with: the cabinet's palette and ink, and its pace. */
export const transitionOptions = () => ({ palette: SCREEN_FX.palette, color: SCREEN_FX.ink, speed: SCREEN_FX.speed });

/** Open a screen on its transition, started at the moment it covers the page. */
export function screenTransition(name) {
  const id = SCREEN_FX.transitions[name];
  if (!id || reduced || quality === "off") return;
  const s = ensure("transitions");
  if (!s) return;
  loadFx(id).then((mod) => {
    if (!mod) return;
    const [x, y] = mod.meta?.origin ?? [0, 0];
    s.stage.clear(true, (i) => i.id.startsWith("transitions/"));
    s.stage.spawn(id, { x, y, skip: coverTime(id, mod), tier: "core", ...transitionOptions() });
    wake(s);
  });
}

/** Fetch the transitions ahead of time so the first screen change is not late. */
export function preloadScreenFx() {
  if (quality === "off") return;
  preloadFx(Object.values(SCREEN_FX.transitions));
}
