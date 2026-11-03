// The pixel effects layer: plays pixelfx effects (src/vendor/pixelfx, MIT) on small frames that are
// scaled up onto the 960×540 game, so every effect keeps square pixels.
//
// A fight draws five frames, each composited into its own canvas, back to front:
//   weather        the far half of the stage's weather (sky, far rain, the wet floor), behind everything
//   life           critters and arena props, behind the fighters
//   under          the back half of combat effects, behind the fighters
//   over           the front half of combat effects, in front of the fighters
//   weather-front  the near half of the weather, in front of the fighters, so they stand inside it
// Weather is drawn at 320×180 (its effects are sized to that frame); combat effects and scenery at
// 480×270, so a hit spark sits at the scale of the fighters instead of the scale of the screen.
// Effect modules load lazily (one small chunk each), so only what a match uses is downloaded.
import { createFrame, clearFrame, createFx, composite } from "./vendor/pixelfx/core/index.js";

/** The screen frame every transition and menu effect is drawn on, and its scale on the 960×540 game. */
export const PIXEL_SCALE = 3;
export const PIXEL_W = 320;
export const PIXEL_H = 180;
/** The finer frame combat effects and scenery are drawn on. */
export const COMBAT_SCALE = 2;
export const COMBAT_W = 480;
export const COMBAT_H = 270;

const PREFIX = "./vendor/pixelfx/fx/";
// Vite turns this into one lazy chunk per effect. Outside Vite (node tests) there is no glob.
let LOADERS = {};
try {
  LOADERS = import.meta.glob(["./vendor/pixelfx/fx/*/*.js", "!./vendor/pixelfx/fx/*/_*.js"]);
} catch {}
let extraLoader = null;
/** Node tooling can supply its own loader: (id) => import(...). */
export function setFxLoader(fn) {
  extraLoader = fn;
}

/** Every effect id in the vendored library, e.g. "fire/campfire". */
export const FX_IDS = Object.keys(LOADERS)
  .map((k) => k.slice(PREFIX.length, -3))
  .sort();

const modules = new Map();
const pending = new Map();
/** The loaded module for an effect, or null while it is still loading. */
export const fxModule = (id) => modules.get(id) ?? null;
/** Load an effect module (cached). Resolves to null for an unknown id. */
export function loadFx(id) {
  if (modules.has(id)) return Promise.resolve(modules.get(id));
  if (pending.has(id)) return pending.get(id);
  const load = LOADERS[`${PREFIX}${id}.js`] ?? (extraLoader && (() => extraLoader(id)));
  if (!load) return Promise.resolve(null);
  const p = Promise.resolve()
    .then(load)
    .then((mod) => {
      modules.set(id, mod);
      pending.delete(id);
      return mod;
    })
    .catch(() => {
      pending.delete(id);
      return null;
    });
  pending.set(id, p);
  return p;
}
/** Load several effects at once; never rejects. */
export const preloadFx = (ids) => Promise.all([...new Set(ids.filter(Boolean))].map(loadFx));

// ---- colours -------------------------------------------------------------------------------
const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
const toHex = (r, g, b) => `#${[r, g, b].map((v) => clamp255(v).toString(16).padStart(2, "0")).join("")}`;
/** A dark-to-bright ramp of n hex colours through a fighter's colour, for an effect's palette option. */
export function rampFrom(color, n = 8) {
  const v = parseInt(String(color || "#ffffff").replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  const r = (v >> 16) & 255,
    g = (v >> 8) & 255,
    b = v & 255;
  return Array.from({ length: n }, (_, i) => {
    const u = i / (n - 1);
    // the bottom half darkens toward ink, the top half lifts toward white
    if (u < 0.6) {
      const k = 0.12 + (u / 0.6) * 0.88;
      return toHex(r * k, g * k, b * k);
    }
    const k = (u - 0.6) / 0.4;
    return toHex(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k);
  });
}

// ---- a fighter as a pixelfx actor ------------------------------------------------------------
/**
 * Build a pixelfx actor (the silhouette and colours status effects wrap) from an image cell.
 * The cell is shrunk to the layer's pixel scale; (anchorX, anchorY) are the feet inside the cell, in
 * source px; scale is the on-screen scale the game draws the cell at.
 */
export function actorFromImage(image, { sx = 0, sy = 0, sw, sh, anchorX = sw / 2, anchorY = sh, scale = 1, pixelScale = PIXEL_SCALE } = {}) {
  if (typeof document === "undefined" || !image) return null;
  const k = scale / pixelScale,
    w = Math.max(1, Math.round(sw * k)),
    h = Math.max(1, Math.round(sh * k));
  let data;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, w, h);
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
  // crop to the opaque body so the effect loops only over the fighter
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > 110) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const mw = x1 - x0 + 1,
    mh = y1 - y0 + 1,
    mask = new Uint8Array(mw * mh),
    pixels = new Uint32Array(mw * mh);
  for (let y = 0; y < mh; y++)
    for (let x = 0; x < mw; x++) {
      const j = ((y + y0) * w + x + x0) * 4;
      if (data[j + 3] <= 110) continue;
      mask[y * mw + x] = 1;
      pixels[y * mw + x] = (255 << 24) | (data[j + 2] << 16) | (data[j + 1] << 8) | data[j];
    }
  const fx = Math.round(anchorX * k),
    fy = Math.round(anchorY * k);
  const ax = x0 - fx,
    ay = y0 - fy;
  return {
    mask: { w: mw, h: mh, data: mask },
    pixels,
    x: ax,
    y: ay,
    w: mw,
    h: mh,
    k: 2,
    head: [Math.round(ax + mw / 2), ay],
    chest: [Math.round(ax + mw / 2), Math.round(ay + mh * 0.32)],
  };
}

// ---- transitions start where they cover the screen --------------------------------------------
const coverCache = new Map();
/** The time (s) at which a full-screen effect covers the most of the frame, found by sampling it. */
export function coverTime(id, mod = fxModule(id)) {
  if (coverCache.has(id)) return coverCache.get(id);
  if (!mod) return 0;
  const frame = createFrame(PIXEL_W, PIXEL_H);
  const fx = createFx(mod, { x: mod.meta?.origin?.[0] ?? 160, y: mod.meta?.origin?.[1] ?? 90 });
  const D = mod.meta?.duration ?? 1;
  let best = 0,
    bestT = D / 2;
  for (let t = 0; t < D * 0.75; t += 1 / 30) {
    fx.update(1 / 30);
    clearFrame(frame);
    fx.draw(frame);
    let n = 0;
    for (let i = 0; i < frame.color.length; i += 7) if (frame.color[i] >>> 24 === 255) n++;
    if (n > best) {
      best = n;
      bestT = t + 1 / 30;
    }
  }
  coverCache.set(id, bestT);
  return bestT;
}

// ---- the stage ------------------------------------------------------------------------------
/**
 * The layers a fight draws, back to front. kind says which instances a layer paints:
 * "weather" and "life" are ambient (slow), "back"/"front" are the two halves of combat effects.
 * half splits an ambient kind the same way: "back" paints what an effect draws behind a character
 * (far rain, the sky, the wet floor), "front" what it draws in front (the near drops); an effect
 * without a back half is painted whole on the back layer and not at all on the front one.
 * phase staggers the slow layers so they never repaint on the same frame.
 */
export const COMBAT_LAYERS = [
  { name: "weather", kind: "weather", half: "back", w: PIXEL_W, h: PIXEL_H, fps: 12, phase: 0 },
  { name: "life", kind: "life", w: COMBAT_W, h: COMBAT_H, fps: 10, phase: 0.05 },
  { name: "under", kind: "back", w: COMBAT_W, h: COMBAT_H, fps: 30 },
  { name: "over", kind: "front", w: COMBAT_W, h: COMBAT_H, fps: 30 },
  { name: "weather-front", kind: "weather", half: "front", w: PIXEL_W, h: PIXEL_H, fps: 12, phase: 0.03 },
];
/** One layer that draws everything: menus, transitions, the bonus stage and the FX LAB. */
export const SINGLE_LAYER = [{ name: "over", kind: "all", w: PIXEL_W, h: PIXEL_H, fps: 30 }];
const AMBIENT_KINDS = new Set(["weather", "life"]);
const DRAW_STEP = 1 / 30;

/**
 * A pixel effects stage. Options:
 *   quality: "full" | "lite" | "off"  (lite drops ambience and cosmetic extras, off draws nothing)
 *   cap: most live combat instances (oldest cosmetic ones are cut first)
 *   layers: COMBAT_LAYERS (default) or SINGLE_LAYER
 * spawn(id, o) takes the effect's own options plus:
 *   x, y        position in its layer's pixels (320×180 unless the layer says otherwise)
 *   layer       "weather" | "life" (ambient) or "combat" (default)
 *   life        seconds before it is told to stop (loops fade out, one-shots cut short)
 *   follow      () => ({ x, y, flip? }) read every frame, for effects that stay on a fighter
 *   velocity    [vx, vy] pixels per second
 *   delay       seconds before it starts
 *   skip        seconds to fast-forward on start (start a transition where it covers the screen)
 *   speed       playback rate (1): a transition at 1.6 uncovers the screen in 60% of its time
 *   frozen      true: the instance holds still while the stage is frozen (hitstop)
 *   tier        "core" | "extra" (lite quality drops extras and all ambience)
 */
export function createPixelStage({ quality = "full", cap = 28, layers = COMBAT_LAYERS, document: doc = globalThis.document } = {}) {
  const L = layers.map((l) => ({
    ...l,
    frame: createFrame(l.w, l.h),
    canvas: null,
    ctx: null,
    img: null,
    clock: -(l.phase ?? 0),
    dirty: true,
    drawn: 0,
  }));
  const byName = Object.fromEntries(L.map((l) => [l.name, l]));
  if (doc?.createElement)
    for (const l of L) {
      const c = doc.createElement("canvas");
      c.width = l.w;
      c.height = l.h;
      l.canvas = c;
      try {
        // CPU-backed: the pixels are written on the CPU and uploaded as a texture, never read back from the GPU
        l.ctx = c.getContext("2d", { willReadFrequently: true });
        l.img = l.ctx?.createImageData(l.w, l.h) ?? null;
      } catch {
        l.ctx = null;
      }
    }
  const single = L.length === 1;
  const kindOf = (o) => (single ? "all" : o.layer === "weather" || o.layer === "ambient" ? "weather" : o.layer === "life" ? "life" : "combat");
  let live = [];
  let serial = 0;
  const stage = {
    quality,
    layers: L,
    canvases: Object.fromEntries(L.map((l) => [l.name, l.canvas])),
    /** How many pixels across a layer is (positions passed to spawn are in these units). */
    sizeOf: (layer) => byName[layer] ?? L[0],
    get count() {
      return live.length;
    },
    get live() {
      return live.map((i) => i.id);
    },
    /** Whether a layer showed anything the last time it was painted. */
    visible: (name) => (byName[name]?.drawn ?? 0) > 0,
    setQuality(q) {
      stage.quality = q;
      if (q === "off") stage.clear();
      if (q === "lite") live.filter((i) => i.tier === "extra" || AMBIENT_KINDS.has(i.kind)).forEach((i) => i.handle.stop(true));
    },
    spawn(id, o = {}) {
      const kind = kindOf(o);
      const tier = o.tier ?? (AMBIENT_KINDS.has(kind) ? "extra" : "core");
      let inst = null;
      const handle = {
        id,
        stopped: false,
        done: false,
        stop(now = false) {
          handle.stopped = true;
          if (now) handle.done = true;
          inst?.fx?.stop();
        },
      };
      if (!id || stage.quality === "off" || (stage.quality === "lite" && tier === "extra")) {
        handle.done = true;
        return handle;
      }
      inst = {
        id,
        handle,
        n: serial++,
        kind,
        tier,
        o,
        fx: null,
        mod: null,
        age: 0,
        delay: o.delay ?? 0,
        life: o.life ?? Infinity,
        speed: o.speed > 0 ? o.speed : 1,
        frozen: Boolean(o.frozen),
        follow: o.follow,
        velocity: o.velocity,
      };
      const start = (mod) => {
        if (!mod || handle.done) {
          handle.done = true;
          return;
        }
        const { layer, life, follow, velocity, delay, skip, speed, frozen, tier: _t, ...opts } = o;
        try {
          inst.mod = mod;
          inst.fx = createFx(mod, opts);
          if (skip > 0) {
            const n = Math.ceil(skip / DRAW_STEP);
            for (let i = 0; i < n; i++) inst.fx.update(skip / n);
          }
          if (handle.stopped) inst.fx.stop();
        } catch {
          handle.done = true;
        }
      };
      const mod = fxModule(id);
      if (mod) start(mod);
      else loadFx(id).then(start);
      live.push(inst);
      // over the cap: cut the oldest cosmetic extra first, then the oldest combat effect
      const combat = live.filter((i) => !AMBIENT_KINDS.has(i.kind) && !i.handle.done);
      if (combat.length > cap) {
        const victim = combat.find((i) => i.tier === "extra" && i !== inst) ?? combat.find((i) => i !== inst);
        victim?.handle.stop(true);
      }
      return handle;
    },
    /** Stop everything that matches (now: drop it this frame instead of fading). */
    clear(now = true, filter = () => true) {
      for (const i of live) if (filter(i)) i.handle.stop(now);
    },
    /** Advance every effect; frozen: hold the instances that asked to freeze (hitstop). */
    update(dt, { frozen = false } = {}) {
      for (const i of live) {
        if (i.handle.done) continue;
        if (frozen && i.frozen) continue;
        if (i.delay > 0) {
          i.delay -= dt;
          continue;
        }
        if (!i.fx) continue;
        const step = dt * i.speed;
        i.age += step;
        if (i.follow) {
          const p = i.follow();
          if (p) {
            i.fx.options.x = p.x;
            i.fx.options.y = p.y;
            if (p.flip !== undefined) i.fx.options.flip = p.flip;
          }
        } else if (i.velocity) {
          i.fx.options.x += i.velocity[0] * step;
          i.fx.options.y += i.velocity[1] * step;
        }
        try {
          i.fx.update(step);
        } catch {
          i.handle.done = true;
        }
        if (i.age >= i.life && !i.handle.stopped) i.handle.stop();
        if (i.fx.done()) i.handle.done = true;
        markDirty(i.kind);
      }
      const before = live.length;
      const gone = live.filter((i) => i.handle.done);
      if (gone.length) {
        live = live.filter((i) => !i.handle.done);
        gone.forEach((i) => markDirty(i.kind));
      }
      if (live.length !== before) markDirty("all");
      for (const l of L) l.clock += dt;
    },
    /** Paint layers whose turn has come. force: paint all now. Returns the names repainted. */
    render(force = false) {
      const out = [];
      for (const l of L) {
        const step = 1 / (l.fps || 30);
        if (!force && l.clock < step) continue;
        l.clock = Math.min(l.clock - step, step);
        if (force) l.clock = 0;
        if (paint(l)) out.push(l.name);
      }
      return out;
    },
    destroy() {
      live = [];
    },
  };
  function markDirty(kind) {
    for (const l of L)
      if (l.kind === "all" || kind === "all" || l.kind === kind || (kind === "combat" && (l.kind === "back" || l.kind === "front"))) l.dirty = true;
  }
  function paint(l) {
    if (!l.dirty) return false;
    l.dirty = false;
    const frame = l.frame;
    clearFrame(frame);
    let n = 0;
    for (const i of live) {
      if (!i.fx || i.delay > 0 || i.handle.done) continue;
      try {
        if (l.kind === "all") i.fx.draw(frame);
        else if (l.kind === "weather" || l.kind === "life") {
          if (i.kind !== l.kind) continue;
          if (!l.half) i.fx.draw(frame);
          else if (i.mod?.drawBack) i.fx.draw(frame, l.half);
          else if (l.half === "back") i.fx.draw(frame);
          else continue;
        } else if (i.kind === "combat") i.fx.draw(frame, l.kind);
        else continue;
        n++;
      } catch {
        i.handle.done = true;
      }
    }
    // nothing drawn now and nothing last time: the canvas is already clear
    if (!n && !l.drawn) return false;
    l.drawn = n;
    if (l.ctx && l.img) {
      composite(frame, l.img.data, null);
      l.ctx.putImageData(l.img, 0, 0);
    }
    return true;
  }
  return stage;
}
