// Code-driven cutscenes. Every shot animates the shipped fighter sheets and
// arena backgrounds with DOM + CSS + WebAudio: no video, no generated imagery.
//
//   playCutscene(kind, context, options) -> Promise<{ kind, skipped }>
//
// kind:    "intro" | "ladder" | "tournament" | "victory" | "defeat" | "shadow" | "bonus" | "final"
// context: { player, opponent, fighters: [...], arena, mode: "arcade" | "tournament" }
//          fighters/players accept a roster index, a character id, or a character object;
//          arena accepts an index, an arena id, or an arena object.
// options: { container, reducedMotion, sound, seed, timers, now }
//
// The camera language is shared by every scene: letterbox bars that can widen to
// scope, film grain and vignette, whip-pan cuts, slow camera pushes, impact frames,
// shockwaves, anamorphic flares, particle weather (dust, embers, petals, ash, sparks),
// lower-third nameplates and a small synthesized score (drones, risers, braams, booms).
//
// Skippable by click/tap, Enter/Space/Escape, or gamepad A/Start. Resolves once, after
// every node, timer, listener, and audio context it created has been removed.
import { characters as ROSTER } from "./characters.js";
import { arenas as ARENAS } from "./arenas.js";
import { kitFor } from "./moves.js";
import { BONUS_DURATION } from "./bonus.js";

export const CUTSCENE_KINDS = ["intro", "ladder", "tournament", "victory", "defeat", "shadow", "bonus", "final"];

// Sheet layouts, matching combat.js: idle = 16 frames in one row; motion = 4x6
// (walk, jump, guard, hurt, ko, victory); combat = 4x7 (one move per row, row 6 = power).
const SHEETS = {
  idle: { key: "sheet", cols: (c) => c.frameCount || 16, rows: 1 },
  motion: { key: "motionSheet", cols: () => 4, rows: 6 },
  combat: { key: "combatSheet", cols: () => 4, rows: 7 },
};
const ANIMS = {
  idle: { sheet: "idle", row: 0, frames: null, fps: 15, loop: true },
  walk: { sheet: "motion", row: 0, frames: [0, 1, 2, 3], fps: 9, loop: true },
  jump: { sheet: "motion", row: 1, frames: [0, 1, 2, 3], fps: 8, loop: false },
  guard: { sheet: "motion", row: 2, frames: [0, 1, 2], fps: 12, loop: false },
  hurt: { sheet: "motion", row: 3, frames: [0, 1, 2, 3], fps: 14, loop: false },
  ko: { sheet: "motion", row: 4, frames: [0, 1, 2, 3], fps: 7, loop: false },
  victory: { sheet: "motion", row: 5, frames: [0, 1, 2, 3], fps: 5, loop: false },
  uppercut: { sheet: "combat", row: 2, frames: [0, 1, 2, 3], fps: 10, loop: false },
  sidekick: { sheet: "combat", row: 4, frames: [0, 1, 2, 3], fps: 10, loop: false },
  roundhouse: { sheet: "combat", row: 5, frames: [0, 1, 2, 3], fps: 10, loop: false },
  power: { sheet: "combat", row: 6, frames: [0, 1, 2, 3], fps: 7, loop: false },
};

let active = null;
export const isCutscenePlaying = () => Boolean(active);
export function skipCutscene() {
  active?.finish(true);
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pad2 = (n) => String(n).padStart(2, "0");
const cssUrl = (u) => `url("${String(u ?? "").replace(/["\\\n]/g, "")}")`;

export function resolveFighter(ref, roster = ROSTER) {
  if (ref && typeof ref === "object") return ref;
  if (typeof ref === "number" && roster[ref]) return roster[ref];
  if (typeof ref === "string") return roster.find((c) => c.id === ref) ?? roster[Number(ref)] ?? roster[0];
  return roster[0];
}
export function resolveArena(ref, list = ARENAS) {
  if (ref && typeof ref === "object") return ref;
  if (typeof ref === "number" && list[ref]) return list[ref];
  if (typeof ref === "string") return list.find((a) => a.id === ref) ?? list[0];
  return list[0];
}
/** The quote a fighter says in victory / defeat cutscenes. */
export const fighterQuote = (c) => c?.quote || c?.description || "The only rival is you.";

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Procedural score (WebAudio): a compressed master bus with a synthetic room reverb,
// and a kit of cinematic cues. Silently disabled when unavailable.
function soundKit(win, enabled) {
  let ac = null, bus = null, verb = null;
  const ctx = () => {
    if (!enabled) return null;
    try {
      const AC = win.AudioContext || win.webkitAudioContext;
      if (!AC) return null;
      if (!ac) {
        ac = new AC();
        const comp = ac.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.ratio.value = 4;
        const master = ac.createGain();
        master.gain.value = 0.9;
        comp.connect(master).connect(ac.destination);
        bus = comp;
        try {
          // Decaying stereo noise as an impulse response: a big dark hall.
          const len = Math.floor(ac.sampleRate * 2.4), ir = ac.createBuffer(2, len, ac.sampleRate);
          for (let ch = 0; ch < 2; ch++) {
            const d = ir.getChannelData(ch);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2;
          }
          verb = ac.createConvolver();
          verb.buffer = ir;
          const wet = ac.createGain();
          wet.gain.value = 0.4;
          verb.connect(wet).connect(comp);
        } catch {
          verb = null;
        }
      }
      if (ac.state === "suspended") ac.resume?.();
      return ac;
    } catch {
      return null;
    }
  };
  const route = (a, node, send) => {
    node.connect(bus);
    if (verb && send > 0) {
      const s = a.createGain();
      s.gain.value = send;
      node.connect(s).connect(verb);
    }
  };
  const tone = (type, from, to, dur, vol = 0.05, delay = 0, { attack = 0.005, send = 0.15, cutoff = 0 } = {}) => {
    const a = ctx();
    if (!a) return;
    try {
      const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + delay;
      o.type = type;
      o.frequency.setValueAtTime(from, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      let head = o;
      if (cutoff) {
        const f = a.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.setValueAtTime(cutoff, t);
        head = o.connect(f);
      }
      head.connect(g);
      route(a, g, send);
      o.start(t);
      o.stop(t + dur + 0.05);
    } catch {}
  };
  const noise = (dur, freq, vol = 0.05, type = "highpass", { delay = 0, sweep = 0, attack = 0, send = 0.2 } = {}) => {
    const a = ctx();
    if (!a) return;
    try {
      const t = a.currentTime + delay;
      const len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (attack ? Math.min(1, i / (len * attack)) : (1 - i / len) ** 2);
      const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      src.buffer = buf;
      f.type = type;
      f.frequency.setValueAtTime(freq, t);
      if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
      f.Q.value = type === "bandpass" ? 3 : 0.7;
      g.gain.setValueAtTime(vol, t);
      if (attack) g.gain.setValueAtTime(vol, t + dur - 0.02), g.gain.linearRampToValueAtTime(0, t + dur);
      src.connect(f).connect(g);
      route(a, g, send);
      src.start(t);
    } catch {}
  };
  const kit = {
    thump: () => (tone("sine", 140, 38, 0.45, 0.11), noise(0.12, 900, 0.03, "lowpass")),
    hit: () => (tone("square", 220, 60, 0.16, 0.05, 0, { cutoff: 1400 }), noise(0.14, 2400, 0.05, "bandpass", { send: 0.3 })),
    boom: () => (tone("sine", 92, 26, 1.8, 0.24, 0, { send: 0.5 }), noise(0.6, 380, 0.09, "lowpass", { send: 0.6 })),
    shatter: () => (noise(0.9, 2600, 0.08, "highpass", { send: 0.5 }), tone("triangle", 1900, 700, 0.3, 0.02), noise(0.4, 5200, 0.03, "highpass", { delay: 0.12 })),
    whoosh: () => noise(0.34, 500, 0.05, "bandpass", { sweep: 3200, send: 0.1 }),
    riser: (dur = 1) => (noise(dur, 280, 0.05, "bandpass", { sweep: 6200, attack: 0.95, send: 0.4 }), tone("sawtooth", 110, 440, dur, 0.012, 0, { attack: dur * 0.9, cutoff: 1800 })),
    heartbeat: () => (tone("sine", 72, 40, 0.2, 0.18, 0, { send: 0.2 }), tone("sine", 66, 38, 0.22, 0.12, 0.24, { send: 0.2 })),
    braam: () =>
      [55, 55.5, 82.4, 110.3].forEach((f, i) => tone("sawtooth", f, f * 0.985, 2.4, 0.05 - i * 0.008, 0, { attack: 0.06, send: 0.6, cutoff: 900 })),
    drone: (dur = 4) => [55, 55.35, 82.5].forEach((f) => tone("triangle", f, f * 1.01, dur, 0.035, 0, { attack: dur * 0.45, send: 0.7 })),
    sting: () => [392, 523.3, 659.3, 784].forEach((f, i) => tone("square", f, f, 1.1, 0.016, i * 0.012, { attack: 0.01, send: 0.7, cutoff: 3200 })),
    chime: () => [523, 659, 784, 1047].forEach((f, i) => tone("square", f, f * 1.001, 0.22, 0.02, i * 0.11, { send: 0.4 })),
    tick: () => tone("square", 1800, 1700, 0.05, 0.02, 0, { send: 0.1 }),
    low: () => tone("sawtooth", 110, 55, 0.9, 0.035, 0, { send: 0.4, cutoff: 700 }),
    close: () => {
      try {
        ac?.close?.();
      } catch {}
      ac = bus = verb = null;
    },
  };
  return kit;
}

/**
 * Play one cutscene. Always resolves (never rejects) with { kind, skipped }.
 */
export function playCutscene(kind, context = {}, options = {}) {
  active?.finish(true);
  const scene = SCENES[kind];
  const container = options.container ?? globalThis.document?.body;
  if (!scene || !container) return Promise.resolve({ kind, skipped: true });
  const doc = container.ownerDocument ?? globalThis.document;
  const win = doc.defaultView ?? globalThis;
  const timers = options.timers ?? {
    setTimeout: (f, ms) => win.setTimeout(f, ms),
    clearTimeout: (id) => win.clearTimeout(id),
    setInterval: (f, ms) => win.setInterval(f, ms),
    clearInterval: (id) => win.clearInterval(id),
  };
  const now = options.now ?? (() => win.performance?.now?.() ?? Date.now());
  const reduced =
    options.reducedMotion ??
    (doc.body?.classList?.contains("reduced-motion") || Boolean(win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches));
  const roster = options.characters ?? ROSTER;
  const arenaList = options.arenas ?? ARENAS;

  return new Promise((resolve) => {
    const timeouts = new Set();
    const sprites = [];
    const typers = [];
    const rand = seeded(options.seed ?? 20260925);
    const sfx = soundKit(win, options.sound !== false);
    const previousFocus = doc.activeElement;
    const inerted = [];
    let interval = null, done = false;

    const el = (tag, cls = "", html = "") => {
      const n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (html) n.innerHTML = html;
      return n;
    };
    const root = el("div", `cutscene cs-${kind}${reduced ? " cs-reduced" : ""}`);
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.dataset.kind = kind;
    const stage = el("div", "cs-stage");
    const flashEl = el("div", "cs-flash");
    const caption = el("p", "cs-caption");
    caption.setAttribute("aria-live", "polite");
    const skipBtn = el("button", "cs-skip", 'SKIP <span aria-hidden="true">▸▸</span><small>ENTER · TAP · START</small>');
    skipBtn.type = "button";
    skipBtn.setAttribute("aria-label", "Skip cutscene");
    const progress = el("div", "cs-progress");
    // Film layers sit over the picture and under the letterbox: grain, vignette, halation.
    const film = el("div", "cs-film");
    film.setAttribute("aria-hidden", "true");
    film.append(el("div", "cs-grain"), el("div", "cs-vig"));
    root.append(stage, film, el("div", "cs-bar cs-bar-top"), el("div", "cs-bar cs-bar-bottom"), caption, flashEl, progress, skipBtn);

    const ctx = {
      kind, context, reduced, doc, win, root, stage, rand, sfx, roster, arenaList, el, esc,
      at(ms, fn) {
        const id = timers.setTimeout(() => {
          timeouts.delete(id);
          if (!done) fn();
        }, ms);
        timeouts.add(id);
        return id;
      },
      fighter: (ref) => resolveFighter(ref, roster),
      arena: (ref) => resolveArena(ref, arenaList),
      arenaLayer(arena, cls = "") {
        const n = el("div", `cs-arena ${cls}`);
        n.style.setProperty("--arena-color", arena.color || "#46e1df");
        // Gradient underlay keeps the shot readable if the background fails to load.
        n.style.backgroundImage = `${cssUrl(arena.background)}, linear-gradient(180deg, #0b0f1c, ${arena.color || "#46e1df"}55 70%, #06070c)`;
        n.dataset.arena = arena.id;
        return n;
      },
      actor(character, anim, { x = 50, flip = false, cls = "" } = {}) {
        const a = el("div", `cs-actor ${cls}`);
        const s = el("div", "cs-sprite");
        a.append(s);
        a.style.left = `${x}%`;
        a.style.setProperty("--fighter-color", character.color || "#ee5943");
        if (flip) a.style.setProperty("--flip", "-1");
        s.setAttribute("role", "img");
        s.setAttribute("aria-label", character.name);
        const sp = { a, s, character, anim: null, start: 0 };
        sprites.push(sp);
        a.play = (name, opts) => ctx.play(sp, name, opts);
        a.moveTo = (nx, ms, ease = "linear") => {
          a.style.setProperty("--walk", `${reduced ? 0 : ms}ms`);
          a.style.setProperty("--walk-ease", ease);
          a.style.left = `${nx}%`;
        };
        ctx.play(sp, anim);
        return a;
      },
      play(sp, name, { fps } = {}) {
        const anim = ANIMS[name] ?? ANIMS.idle;
        const sheet = SHEETS[anim.sheet];
        sp.anim = fps ? { ...anim, fps } : anim;
        sp.cols = sheet.cols(sp.character);
        sp.rows = sheet.rows;
        sp.frames = anim.frames ?? Array.from({ length: sp.cols }, (_, i) => i);
        sp.start = now();
        sp.s.dataset.anim = name;
        sp.s.style.backgroundImage = cssUrl(sp.character[sheet.key] || sp.character.sheet);
        sp.s.style.backgroundSize = `${sp.cols * 100}% ${sp.rows * 100}%`;
        drawSprite(sp);
      },
      portrait(character, cls = "cs-portrait") {
        const n = el("div", cls);
        n.style.backgroundImage = cssUrl(character.portrait);
        n.style.setProperty("--fighter-color", character.color || "#ee5943");
        n.setAttribute("role", "img");
        n.setAttribute("aria-label", character.name);
        return n;
      },
      caption(text) {
        caption.innerHTML = `<span class="cs-sr">${esc(text)}</span><span class="cs-typed" aria-hidden="true"></span>`;
        ctx.type(caption.querySelector(".cs-typed"), text);
      },
      type(node, text, cps = 38) {
        if (reduced) node.textContent = text;
        else typers.push({ node, text, start: now(), cps });
      },
      flash(color = "#fff") {
        if (reduced) return;
        flashEl.style.background = color;
        flashEl.classList.remove("go");
        void flashEl.offsetWidth;
        flashEl.classList.add("go");
      },
      shake(strength = "") {
        if (reduced) return;
        root.classList.remove("cs-shake", "cs-shake-hard");
        void root.offsetWidth;
        root.classList.add(strength === "hard" ? "cs-shake-hard" : "cs-shake");
        ctx.at(520, () => root.classList.remove("cs-shake", "cs-shake-hard"));
      },
      // Impact frame: two frames of inverted, crushed picture, the way fighting-game
      // trailers punctuate a hit. Never with reduced motion.
      impact(tone = "") {
        if (reduced) return;
        const cls = tone === "red" ? "cs-impact-red" : "cs-impact";
        root.classList.add(cls);
        ctx.at(90, () => root.classList.remove(cls));
      },
      // Camera: move any layer with a transition. Poses are in % of the layer.
      cam(node, { x = 0, y = 0, s = 1, r = 0 } = {}, ms = 0, ease = "cubic-bezier(.25,.1,.2,1)") {
        if (reduced) return;
        node.style.transition = ms && !reduced ? `transform ${ms}ms ${ease}` : "none";
        node.style.transform = `translate(${x}%, ${y}%) scale(${s}) rotate(${r}deg)`;
      },
      // Letterbox height, e.g. "16vh" for scope framing; null restores the default.
      bars(h) {
        if (h) root.style.setProperty("--cs-bar", h);
        else root.style.removeProperty("--cs-bar");
      },
      particles(host, type, count, colors = ["#fff"]) {
        if (reduced) return null;
        const layer = el("div", `cs-particles cs-p-${type}`);
        layer.setAttribute("aria-hidden", "true");
        for (let i = 0; i < count; i++) {
          const p = el("i");
          const set = (k, v) => p.style.setProperty(k, v);
          set("--x", `${(rand() * 100).toFixed(1)}%`);
          set("--y", `${(rand() * 100).toFixed(1)}%`);
          set("--s", `${(0.4 + rand() * 1.1).toFixed(2)}`);
          set("--d", `${(type === "sparks" ? 0.5 + rand() * 0.6 : 2.4 + rand() * 4).toFixed(2)}s`);
          set("--delay", `${(type === "sparks" ? rand() * 0.08 : -rand() * 5).toFixed(2)}s`);
          set("--drift", `${((rand() - 0.5) * 24).toFixed(1)}vw`);
          set("--a", `${(rand() * 360).toFixed(0)}deg`);
          set("--dist", `${(18 + rand() * 32).toFixed(1)}vmin`);
          set("--r", `${Math.floor(180 + rand() * 720)}deg`);
          set("--c", colors[i % colors.length]);
          layer.append(p);
        }
        host.append(layer);
        return layer;
      },
      shockwave(host, x = 50, y = 50, color = "#fff") {
        if (reduced) return;
        const n = el("div", "cs-shock");
        n.style.left = `${x}%`;
        n.style.top = `${y}%`;
        n.style.setProperty("--c", color);
        host.append(n);
      },
      // Anamorphic streak: a thin horizontal flare with a hot core.
      flare(host, y = 50, color = "#9fe8ff", x = 50) {
        if (reduced) return;
        const n = el("div", "cs-flare");
        n.style.top = `${y}%`;
        n.style.left = `${x}%`;
        n.style.setProperty("--c", color);
        host.append(n);
      },
      beam(host, x = 50, color = "#fff6dc", cls = "") {
        const n = el("div", `cs-beam ${cls}`);
        n.style.left = `${x}%`;
        n.style.setProperty("--c", color);
        host.append(n);
        return n;
      },
      // Lower-third name card. side: "l" or "r".
      nameplate(character, { side = "l", label = "" } = {}) {
        let kit = null;
        try {
          kit = kitFor(character);
        } catch {}
        const n = el(
          "div",
          `cs-nameplate side-${side}`,
          `<i class="cs-np-bar"></i><small>${esc(label)}</small><strong>${esc(character.name)}</strong><span>${esc(character.title || "")}${kit ? ` · ${esc(kit.label)}` : ""}</span>`,
        );
        n.style.setProperty("--fighter-color", character.color || "#ee5943");
        return n;
      },
      on: (node) => node.classList.add("on"),
      off: (node) => node.classList.remove("on"),
      shot(cls = "") {
        const n = el("div", `cs-shot ${cls}`);
        stage.append(n);
        return n;
      },
      // transition: "fade" (default), "cut", "whip-l", "whip-r", "zoom"
      cut(next, transition = "fade") {
        stage.querySelectorAll(".cs-shot.on").forEach((n) => n !== next && n.classList.remove("on", "cs-in-cut", "cs-in-whip-l", "cs-in-whip-r", "cs-in-zoom"));
        next.classList.remove("cs-in-cut", "cs-in-whip-l", "cs-in-whip-r", "cs-in-zoom");
        if (transition !== "fade") next.classList.add(`cs-in-${transition}`);
        next.classList.add("on");
      },
      title(html, cls = "") {
        const n = el("div", `cs-title ${cls}`, html);
        return n;
      },
      preload(urls) {
        // Warm the browser cache without ever waiting on it.
        for (const u of urls) {
          try {
            if (u && win.Image) {
              const img = new win.Image();
              img.decoding = "async";
              img.src = u;
            }
          } catch {}
        }
      },
      finish,
    };

    function drawSprite(sp) {
      const { anim, frames } = sp;
      let i;
      if (reduced) i = anim.loop ? 0 : frames.length - 1;
      else {
        const n = Math.floor(((now() - sp.start) / 1000) * anim.fps);
        i = anim.loop ? ((n % frames.length) + frames.length) % frames.length : Math.min(Math.max(n, 0), frames.length - 1);
      }
      const col = frames[i], row = anim.row;
      const x = sp.cols > 1 ? (col / (sp.cols - 1)) * 100 : 0;
      const y = sp.rows > 1 ? (row / (sp.rows - 1)) * 100 : 0;
      sp.s.style.backgroundPosition = `${x.toFixed(4)}% ${y.toFixed(4)}%`;
    }

    // Gamepad: only a fresh press skips (buttons held when the scene starts are ignored).
    const PAD_BUTTONS = [0, 9];
    const padHeld = new Set();
    const readPads = () => {
      try {
        return [...(win.navigator?.getGamepads?.() ?? [])].filter(Boolean);
      } catch {
        return [];
      }
    };
    for (const p of readPads()) for (const b of PAD_BUTTONS) if (p.buttons?.[b]?.pressed) padHeld.add(`${p.index}:${b}`);

    function tick() {
      if (done) return;
      for (const sp of sprites) if (!reduced) drawSprite(sp);
      for (let i = typers.length - 1; i >= 0; i--) {
        const t = typers[i];
        const n = Math.floor(((now() - t.start) / 1000) * t.cps);
        t.node.textContent = t.text.slice(0, n);
        if (n >= t.text.length) typers.splice(i, 1);
      }
      for (const p of readPads())
        for (const b of PAD_BUTTONS) {
          const id = `${p.index}:${b}`;
          if (p.buttons?.[b]?.pressed) {
            if (!padHeld.has(id)) return finish(true);
          } else padHeld.delete(id);
        }
    }

    const onKey = (e) => {
      // A cutscene owns the keyboard: nothing underneath reacts while it plays.
      e.stopImmediatePropagation();
      if (e.repeat) return;
      if (["Enter", " ", "Spacebar", "Escape", "Esc"].includes(e.key) || e.code === "Space") {
        e.preventDefault();
        finish(true);
      }
    };
    const onClick = (e) => {
      e.preventDefault?.();
      e.stopPropagation?.();
      finish(true);
    };

    function finish(skipped) {
      if (done) return;
      done = true;
      for (const id of timeouts) timers.clearTimeout(id);
      timeouts.clear();
      if (interval !== null) timers.clearInterval(interval);
      win.removeEventListener("keydown", onKey, true);
      root.removeEventListener("click", onClick);
      root.remove();
      for (const n of inerted) n.inert = false;
      doc.body?.classList.remove("cutscene-open");
      sfx.close();
      if (previousFocus?.isConnected) {
        try {
          previousFocus.focus({ preventScroll: true });
        } catch {}
      }
      if (active === handle) active = null;
      resolve({ kind, skipped });
    }
    const handle = { finish, root };
    active = handle;

    let duration = 6000;
    try {
      duration = scene(ctx) ?? duration;
    } catch (error) {
      // A broken scene must never trap the player.
      console.error?.(error);
      finish(true);
      return;
    }
    root.style.setProperty("--cs-duration", `${duration}ms`);
    root.setAttribute("aria-label", root.getAttribute("aria-label") || `${kind} cutscene`);

    for (const n of [...container.children]) {
      if (!n.inert) {
        n.inert = true;
        inerted.push(n);
      }
    }
    container.append(root);
    doc.body?.classList.add("cutscene-open");
    win.addEventListener("keydown", onKey, true);
    root.addEventListener("click", onClick);
    try {
      skipBtn.focus({ preventScroll: true });
    } catch {}
    ctx.at(30, () => root.classList.add("cs-bars-in", "cs-running"));
    // Every scene ends on a short fade to black so the cut back to the menus is soft.
    if (!reduced) ctx.at(Math.max(0, duration - 420), () => root.classList.add("cs-fadeout"));
    interval = timers.setInterval(tick, 33);
    ctx.at(duration, () => finish(false));
  });
}

// ---------------------------------------------------------------------------
// Scenes: each builds its DOM into ctx.stage, schedules beats, returns duration.
// ---------------------------------------------------------------------------

function fracture(ctx, cx, cy, rays, jitter) {
  const { rand } = ctx;
  const paths = [];
  for (let i = 0; i < rays; i++) {
    const ang = (i / rays) * Math.PI * 2 + rand() * 0.5;
    let x = cx, y = cy, d = `M${x.toFixed(1)} ${y.toFixed(1)}`;
    const steps = 4 + Math.floor(rand() * 3);
    for (let s = 1; s <= steps; s++) {
      const r = (s / steps) * (70 + rand() * 40);
      const a = ang + (rand() - 0.5) * jitter;
      x = cx + Math.cos(a) * r;
      y = cy + Math.sin(a) * r;
      d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    paths.push(d);
  }
  for (let ring = 1; ring <= 2; ring++) {
    const r = 9 * ring + rand() * 6;
    let d = "";
    for (let i = 0; i <= rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const rr = r * (0.8 + rand() * 0.4);
      d += `${i ? " L" : "M"}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`;
    }
    paths.push(d);
  }
  return `<svg class="cs-crack" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${paths
    .map((d, i) => `<path d="${d}" pathLength="1" style="animation-delay:${(i % 6) * 40}ms"/>`)
    .join("")}</svg>`;
}

function shatter(ctx, host, innerHTML, count = 16) {
  const { rand, el } = ctx;
  const cx = 45 + rand() * 10, cy = 42 + rand() * 12;
  const shards = el("div", "cs-shards");
  const pts = (a, r) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  const angles = Array.from({ length: count / 2 }, (_, i) => (i / (count / 2)) * Math.PI * 2 + (rand() - 0.5) * 0.35);
  angles.forEach((a0, i) => {
    const a1 = angles[(i + 1) % angles.length] + (i === angles.length - 1 ? Math.PI * 2 : 0);
    const ring = 14 + rand() * 16;
    const pieces = [
      [[cx, cy], pts(a0, ring), pts(a1, ring)],
      [pts(a0, ring), pts(a0, 160), pts(a1, 160), pts(a1, ring)],
    ];
    pieces.forEach((poly, layer) => {
      const shard = el("div", "cs-shard", innerHTML);
      shard.style.clipPath = `polygon(${poly.map(([x, y]) => `${x.toFixed(1)}% ${y.toFixed(1)}%`).join(",")})`;
      const mid = (a0 + a1) / 2, dist = (layer ? 70 : 30) + rand() * 40;
      shard.style.setProperty("--dx", `${(Math.cos(mid) * dist).toFixed(1)}vmin`);
      shard.style.setProperty("--dy", `${(Math.sin(mid) * dist + 18).toFixed(1)}vmin`);
      shard.style.setProperty("--rot", `${((rand() - 0.5) * 70).toFixed(1)}deg`);
      shard.style.setProperty("--rx", `${((rand() - 0.5) * 140).toFixed(0)}deg`);
      shard.style.setProperty("--delay", `${Math.floor(rand() * 90)}ms`);
      shards.append(shard);
    });
  });
  host.append(shards);
  return shards;
}

function confetti(ctx, host, colors, count) {
  const { rand, el } = ctx;
  const layer = el("div", "cs-confetti");
  layer.setAttribute("aria-hidden", "true");
  for (let i = 0; i < count; i++) {
    const p = el("i");
    p.style.setProperty("--x", `${(rand() * 100).toFixed(1)}%`);
    p.style.setProperty("--drift", `${((rand() - 0.5) * 30).toFixed(1)}vw`);
    p.style.setProperty("--d", `${(2.6 + rand() * 2.8).toFixed(2)}s`);
    p.style.setProperty("--delay", `${(rand() * 1.6).toFixed(2)}s`);
    p.style.setProperty("--r", `${Math.floor(360 + rand() * 900)}deg`);
    p.style.setProperty("--c", colors[i % colors.length]);
    if (i % 3 === 0) p.className = "wide";
    layer.append(p);
  }
  host.append(layer);
  return layer;
}

// A deterministic, varied cast for montages: shuffled with the scene's seeded RNG.
function pickCast(ctx, exclude, n) {
  const pool = (ctx.context.fighters?.length ? ctx.context.fighters.map(ctx.fighter) : ctx.roster).filter((c) => c && c.id !== exclude.id);
  const list = [...new Set(pool)];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  while (list.length && list.length < n) list.push(list[list.length % Math.max(1, pool.length)]);
  return list.slice(0, n);
}

const CROWN_SVG =
  '<svg class="cs-crown" viewBox="0 0 120 80" aria-hidden="true"><path d="M8 70 L14 22 L38 46 L60 8 L82 46 L106 22 L112 70 Z"/><rect x="8" y="66" width="104" height="10"/><circle cx="14" cy="20" r="6"/><circle cx="60" cy="7" r="7"/><circle cx="106" cy="20" r="6"/></svg>';

const SCENES = {
  // THE INTRO: a studio-style cold open in six acts.
  //   ident → the mirror (it moves on its own) → the shatter → roster montage
  //   → triptych → face-off and clash in the Mirror Garden → logo slam.
  intro(ctx) {
    const { el, esc, reduced, context, roster, arenaList } = ctx;
    const hero = ctx.fighter(context.player ?? 0);
    const garden = arenaList.find((a) => a.id === "mirror-garden") ?? ctx.arena(2);
    const stages = arenaList.filter((a) => a !== garden);
    const cast = reduced ? [] : pickCast(ctx, hero, 9);
    const T = reduced
      ? { mirror: 700, stir: 1300, crack: 1700, shatter: 2300, face: 2500, guard: 3300, logo: 4300, end: 6800 }
      : { mirror: 1900, stir: 2900, crack: 3500, shatter: 4300, montage: 4750, beat: 600, tri: 8350, face: 9650, guard: 10400, charge: 11200, clash: 12450, logo: 13400, end: 18400 };
    ctx.root.setAttribute("aria-label", "Intro: Me vs Me");
    ctx.preload([hero.sheet, hero.portrait, hero.motionSheet, hero.combatSheet, garden.background, ...stages.map((a) => a.background), ...cast.map((c) => c.combatSheet)]);

    // Act 0: studio ident over black, with a heartbeat under it.
    const ident = ctx.shot("cs-ident-shot");
    const identCopy = el("div", "cs-ident", '<small>COLLECTIVE AI <b>×</b> HATAALII</small><span>PRESENT</span><i class="cs-ident-rule"></i>');
    ident.append(el("div", "cs-leak"), identCopy);
    ctx.cut(ident, "cut");
    ctx.at(60, () => {
      ctx.on(identCopy);
      ctx.sfx.drone(reduced ? 3 : 6);
    });
    ctx.at(reduced ? 300 : 650, () => ctx.sfx.heartbeat());
    if (!reduced) ctx.at(1450, () => ctx.sfx.heartbeat());

    // Act 1: the mirror. The hero stands before it; the reflection moves on its own.
    const s1 = ctx.shot("cs-mirror-shot");
    const room = el("div", "cs-cam");
    room.append(el("div", "cs-vignette"), el("div", "cs-floor"));
    ctx.beam(room, 50, "#bfe9ff", "cs-beam-soft");
    const mirror = el("div", "cs-mirror");
    const glassHTML = `<div class="cs-glass" style="background-image:url('${esc(String(hero.portrait).replace(/'/g, ""))}'), radial-gradient(circle at 50% 38%, #3a5a78, #0b1220 72%)"></div>`;
    mirror.innerHTML = `${glassHTML}<div class="cs-sheen"></div><div class="cs-eyes"></div>`;
    mirror.setAttribute("role", "img");
    mirror.setAttribute("aria-label", `${hero.name} in the mirror`);
    const onlooker = ctx.actor(hero, "idle", { x: 22, cls: "cs-onlooker" });
    room.append(mirror, onlooker);
    ctx.particles(room, "dust", 34, ["#dff4ff", "#9fe8ff"]);
    s1.append(room);
    ctx.at(T.mirror, () => {
      ctx.cut(s1);
      ctx.cam(room, { s: 1.02, y: 1 });
      ctx.at(40, () => ctx.cam(room, { s: 1.16, y: -2 }, T.shatter - T.mirror, "cubic-bezier(.4,0,.3,1)"));
      ctx.caption("ONE MIND.");
      ctx.sfx.heartbeat();
    });
    ctx.at(T.stir, () => {
      mirror.classList.add("cs-stir");
      onlooker.play("guard");
      ctx.caption("TWO WILLS.");
      ctx.sfx.heartbeat();
      ctx.sfx.riser((T.shatter - T.stir) / 1000);
    });
    ctx.at(T.crack, () => {
      mirror.insertAdjacentHTML("beforeend", fracture(ctx, 50, 44, 9, 0.5));
      ctx.shake();
      ctx.sfx.thump();
    });

    // Act 2: the shatter. Shards tumble in slow motion; impact frame; braam.
    ctx.at(T.shatter, () => {
      shatter(ctx, mirror, glassHTML, 22);
      mirror.classList.add("broken");
      ctx.flash();
      ctx.impact();
      ctx.shake("hard");
      ctx.flare(room, 44, "#bff4ff");
      ctx.sfx.shatter();
      ctx.sfx.boom();
      ctx.sfx.braam();
      ctx.caption(`${roster.length} WAYS TO FIGHT.`);
    });

    // Act 3: the montage. Whip-pan cuts across the real arenas, each on a strike.
    const beats = ["power", "roundhouse", "uppercut", "walk", "power", "sidekick"];
    cast.slice(0, 6).forEach((c, i) => {
      const start = T.montage + i * T.beat;
      const dir = i % 2 ? "r" : "l";
      const anim = beats[i];
      const dash = anim === "walk";
      const arena = stages[(i * 3 + 1) % stages.length];
      const shot = ctx.shot(`cs-montage from-${dir}`);
      const bg = ctx.arenaLayer(arena, "cs-parallax");
      const slash = el("div", "cs-slash");
      slash.style.setProperty("--fighter-color", c.color || "#ee5943");
      const name = el("div", "cs-shot-name", `<span>${esc(c.name)}</span><small>${esc(c.move || c.title || "")} · ${esc(arena.name)}</small>`);
      const actor = ctx.actor(c, anim, { x: dash ? (dir === "l" ? -20 : 120) : dir === "l" ? 38 : 62, flip: dir === "r", cls: dash ? "cs-dash" : "cs-pose" });
      shot.append(bg, slash, el("div", "cs-speedlines"), name, actor);
      ctx.at(start, () => {
        ctx.cut(shot, `whip-${dir}`);
        ctx.sfx.whoosh();
        actor.play(anim);
        ctx.cam(bg, { s: 1.22, x: dir === "l" ? 3 : -3 });
        ctx.at(20, () => ctx.cam(bg, { s: 1.06, x: dir === "l" ? -2 : 2 }, T.beat + 200, "ease-out"));
        if (dash) ctx.at(20, () => actor.moveTo(dir === "l" ? 120 : -20, T.beat + 120));
        else
          ctx.at(Math.round(T.beat * 0.45), () => {
            ctx.flash(c.color || "#fff");
            ctx.impact(i % 2 ? "red" : "");
            ctx.shockwave(shot, dir === "l" ? 52 : 48, 58, c.color || "#fff");
            ctx.sfx.hit();
          });
      });
    });
    if (!reduced) ctx.at(T.montage + 40, () => ctx.caption(`${roster.length} IDENTITIES. ONE ORIGINAL.`));

    // Act 3b: triptych. Three more fighters in three diagonal panels.
    if (!reduced) {
      const tri = ctx.shot("cs-tri-shot");
      const panels = cast.slice(6, 9).map((c, i) => {
        const p = el("div", `cs-tri-panel p${i}`);
        p.style.setProperty("--fighter-color", c.color || "#ee5943");
        p.append(ctx.arenaLayer(stages[(i * 4 + 2) % stages.length], "cs-parallax"), ctx.actor(c, "victory", { x: 50, flip: i === 2, cls: "cs-tri-actor" }));
        p.append(el("div", "cs-tri-name", `<strong>${esc(c.name)}</strong><small>${esc(c.title || "")}</small>`));
        tri.append(p);
        return p;
      });
      ctx.at(T.tri, () => {
        ctx.cut(tri, "cut");
        ctx.caption(`${arenaList.length} PLACES TO SETTLE IT.`);
        panels.forEach((p, i) =>
          ctx.at(i * 170, () => {
            ctx.on(p);
            p.querySelector(".cs-actor")?.play("victory");
            ctx.sfx.hit();
            ctx.shake();
          }),
        );
      });
    }

    // Act 4: the face-off in the Mirror Garden, framed in scope. Then the clash.
    const face = ctx.shot("cs-faceoff");
    const faceCam = el("div", "cs-cam");
    faceCam.append(ctx.arenaLayer(garden), el("div", "cs-mirror-line"), el("div", "cs-aura cs-aura-l"), el("div", "cs-aura cs-aura-r"));
    const me = ctx.actor(hero, "idle", { x: 28, cls: "cs-me" });
    const reflection = ctx.actor(hero, "idle", { x: 72, flip: true, cls: "cs-reflection" });
    faceCam.append(me, reflection);
    ctx.particles(faceCam, "petals", 34, ["#f6c7d4", "#daa1b2", "#fff0f4", "#e98fa9"]);
    const plateMe = ctx.nameplate(hero, { side: "l", label: "PLAYER 01" });
    const plateYou = ctx.nameplate({ ...hero, name: `${hero.name}?` }, { side: "r", label: "THE REFLECTION" });
    face.append(faceCam, plateMe, plateYou);
    ctx.at(T.face, () => {
      ctx.cut(face, reduced ? "fade" : "zoom");
      ctx.bars("15vh");
      ctx.cam(faceCam, { s: 1 });
      ctx.at(40, () => ctx.cam(faceCam, { s: 1.14, y: 2 }, 2800, "cubic-bezier(.3,0,.2,1)"));
      me.play("idle");
      reflection.play("idle");
      ctx.caption("ONE RIVAL.");
      ctx.sfx.low();
    });
    ctx.at(T.face + (reduced ? 300 : 350), () => ctx.on(plateMe));
    ctx.at(T.face + (reduced ? 500 : 650), () => ctx.on(plateYou));
    ctx.at(T.guard, () => {
      me.play("guard");
      reflection.play("guard");
      ctx.caption("THE ONLY RIVAL IS YOU.");
      ctx.sfx.heartbeat();
    });
    if (!reduced) {
      ctx.at(T.charge, () => {
        ctx.off(plateMe);
        ctx.off(plateYou);
        face.classList.add("cs-charge");
        me.play("power", { fps: 4 });
        reflection.play("power", { fps: 4 });
        ctx.cam(faceCam, { s: 1.3, y: 4 }, T.clash - T.charge, "cubic-bezier(.6,0,.9,.6)");
        ctx.sfx.riser((T.clash - T.charge) / 1000);
      });
      ctx.at(T.clash - 320, () => {
        me.moveTo(44, 300, "cubic-bezier(.7,0,1,.6)");
        reflection.moveTo(56, 300, "cubic-bezier(.7,0,1,.6)");
      });
      ctx.at(T.clash, () => {
        face.classList.add("cs-clashed");
        ctx.flash("#fff");
        ctx.impact();
        ctx.at(110, () => ctx.impact("red"));
        ctx.shake("hard");
        ctx.shockwave(faceCam, 50, 58, "#ffe8a3");
        ctx.flare(faceCam, 58, "#ffd9a8");
        ctx.particles(faceCam, "sparks", 40, ["#fff", "#ffe8a3", hero.color || "#ee5943", "#9fe8ff"]);
        ctx.sfx.boom();
        ctx.sfx.shatter();
        // Knockback: both reel away from the clash.
        ctx.at(140, () => {
          me.play("hurt");
          reflection.play("hurt");
          me.moveTo(30, 520, "cubic-bezier(.1,.8,.3,1)");
          reflection.moveTo(70, 520, "cubic-bezier(.1,.8,.3,1)");
        });
      });
    }

    // Act 5: the logo. ME slams, its mirror image slams back, VS detonates between them.
    const logo = ctx.shot("cs-logo-shot");
    const logoCam = el("div", "cs-cam");
    const wrap = ctx.title(
      `<div class="cs-logo-row"><span class="cs-l cs-l-me">ME</span><em class="cs-l cs-l-vs">VS</em><span class="cs-l cs-l-me2" aria-hidden="true">ME</span></div><i class="cs-logo-rule"></i><small class="cs-logo-sub"><span class="cs-sr">THE MIRROR TOURNAMENT</span><span class="cs-typed" aria-hidden="true"></span></small>`,
      "cs-logo-wrap",
    );
    wrap.querySelector(".cs-logo-row").setAttribute("aria-label", "Me vs Me");
    logoCam.append(el("div", "cs-rays"), wrap);
    logo.append(logoCam);
    ctx.at(T.logo, () => {
      ctx.cut(logo, "cut");
      ctx.bars(null);
      ctx.on(wrap);
      ctx.cam(logoCam, { s: 1.08 });
      ctx.at(40, () => ctx.cam(logoCam, { s: 1 }, 4200, "ease-out"));
      wrap.classList.add("m1");
      ctx.sfx.hit();
      ctx.shake();
    });
    ctx.at(T.logo + (reduced ? 0 : 240), () => {
      wrap.classList.add("m2");
      ctx.sfx.hit();
      ctx.shake();
    });
    ctx.at(T.logo + (reduced ? 0 : 560), () => {
      wrap.classList.add("vs");
      ctx.flash("#ffe8a3");
      ctx.impact();
      ctx.shake("hard");
      ctx.shockwave(logoCam, 50, 46, "#ee5943");
      ctx.flare(logoCam, 46, "#ffb8a8");
      ctx.particles(logoCam, "embers", 46, ["#ffb75e", "#ee5943", "#ffe8a3"]);
      ctx.sfx.boom();
      ctx.sfx.sting();
    });
    ctx.at(T.logo + (reduced ? 200 : 1150), () => {
      wrap.classList.add("sub");
      ctx.type(wrap.querySelector(".cs-logo-sub .cs-typed"), "THE MIRROR TOURNAMENT", 30);
    });
    ctx.at(T.logo + (reduced ? 400 : 1900), () => ctx.caption("KNOW THYSELF."));
    return T.end;
  },

  ladder(ctx) {
    const { el, esc, reduced, context, roster } = ctx;
    const player = ctx.fighter(context.player ?? 0);
    const arena = ctx.arena(context.arena ?? 0);
    const ladder = (context.fighters?.length ? context.fighters : roster.map((_, i) => i).filter((i) => roster[i].id !== player.id)).map(ctx.fighter);
    const first = context.opponent != null ? ctx.fighter(context.opponent) : ladder[0];
    const T = reduced ? { shadow: 500, title: 1300, end: 4200 } : { walk: 3000, shadow: 3500, title: 4900, end: 7800 };
    ctx.root.setAttribute("aria-label", `Arcade ladder begins: ${player.name} enters ${arena.name}`);
    ctx.preload([arena.background, player.motionSheet, player.sheet]);

    const shot = ctx.shot("cs-ladder-shot");
    const cam = el("div", "cs-cam");
    cam.append(ctx.arenaLayer(arena, "cs-kenburns"));
    ctx.beam(cam, 36, "#fff1d6", "cs-beam-soft");
    const rungs = el("div", "cs-ladder");
    rungs.setAttribute("aria-hidden", "true");
    ladder.slice(0, 19).forEach((c, i) => {
      const r = ctx.portrait(c, "cs-rung");
      r.style.setProperty("--i", i);
      r.style.setProperty("--delay", `${((i * 137) % 900) / 1000}s`);
      rungs.append(r);
    });
    cam.append(rungs, el("div", "cs-floor-glow"));
    const hero = ctx.actor(player, reduced ? "idle" : "walk", { x: reduced ? 36 : -12, cls: "cs-hero" });
    const shadow = ctx.actor(player, "idle", { x: 68, flip: true, cls: "cs-shade" });
    cam.append(shadow, hero);
    ctx.particles(cam, "dust", 24, ["#fff1d6", arena.color || "#46e1df"]);
    const plate = ctx.nameplate(player, { side: "l", label: "CHALLENGER" });
    const card = ctx.title(
      `<span class="cs-eyebrow">STAGE 01 · ${esc(arena.name)}</span><h2>THE LADDER <em>BEGINS.</em></h2><small>${ladder.length} REFLECTIONS${first ? ` · FIRST: ${esc(first.name)}` : ""}</small>`,
      "cs-card-title",
    );
    shot.append(cam, plate, card);
    ctx.cut(shot);
    ctx.cam(cam, { s: 1.04 });
    ctx.at(40, () => ctx.cam(cam, { s: 1.14, y: 2 }, T.end, "ease-in-out"));
    ctx.at(120, () => {
      ctx.caption(`${arena.subtitle || arena.name}`);
      ctx.sfx.drone(T.end / 1000);
    });
    if (!reduced) {
      ctx.at(60, () => hero.moveTo(36, T.walk - 100));
      ctx.at(T.walk, () => {
        hero.play("idle");
        rungs.classList.add("awake");
        ctx.on(plate);
        ctx.caption(`${ladder.length} REFLECTIONS STAND IN YOUR WAY.`);
      });
    } else {
      rungs.classList.add("awake");
      ctx.on(plate);
    }
    ctx.at(T.shadow, () => {
      ctx.on(shadow);
      shadow.play("idle");
      ctx.flash("#ee5943");
      ctx.impact("red");
      ctx.shake();
      ctx.sfx.braam();
      if (reduced) ctx.caption(`${ladder.length} REFLECTIONS STAND IN YOUR WAY.`);
    });
    ctx.at(T.shadow + (reduced ? 400 : 700), () => hero.play("guard"));
    ctx.at(T.title, () => {
      ctx.off(plate);
      ctx.on(card);
      ctx.flare(cam, 30, "#ffd0a8");
      ctx.sfx.boom();
      ctx.caption("EVERY VERSION HAS SOMETHING TO PROVE.");
    });
    return T.end;
  },

  tournament(ctx) {
    const { el, esc, reduced, context, roster } = ctx;
    const ids = (context.fighters?.length ? context.fighters : roster.map((_, i) => i)).map(ctx.fighter);
    // Always eight seats: pad from the roster if fewer were supplied.
    const seats = [...ids];
    for (let i = 0; seats.length < 8 && i < roster.length; i++) if (!seats.includes(roster[i])) seats.push(roster[i]);
    const eight = seats.slice(0, 8);
    const arena = ctx.arena(context.arena ?? 0);
    const T = reduced ? { cards: 0, gap: 0, title: 500, match: 1500, end: 4600 } : { cards: 350, gap: 330, title: 3450, match: 5200, end: 8600 };
    ctx.root.setAttribute("aria-label", `Tournament begins: ${eight.map((c) => c.name).join(", ")}`);
    ctx.preload(eight.map((c) => c.portrait));

    const shot = ctx.shot("cs-tournament-shot");
    const back = el("div", "cs-cam");
    back.append(ctx.arenaLayer(arena, "cs-blurred"), el("div", "cs-rays"), el("div", "cs-spots"));
    shot.append(back);
    ctx.particles(shot, "dust", 22, ["#ffe8a3", "#fff"]);
    const bracket = el("div", "cs-bracket");
    const side = (list, cls, offset) => {
      const s = el("div", `cs-side ${cls}`);
      for (let p = 0; p < 2; p++) {
        const pair = el("div", "cs-pair");
        list.slice(p * 2, p * 2 + 2).forEach((c, j) => {
          const seed = offset + p * 2 + j;
          const card = el("div", "cs-seat");
          card.style.setProperty("--fighter-color", c.color || "#ee5943");
          card.dataset.fighter = c.id;
          card.append(ctx.portrait(c, "cs-seat-art"));
          card.append(el("div", "cs-seat-copy", `<small>SEED ${pad2(seed + 1)}</small><strong>${esc(c.name)}</strong>`));
          pair.append(card);
        });
        s.append(pair);
      }
      return s;
    };
    const left = side(eight.slice(0, 4), "cs-left", 0), right = side(eight.slice(4, 8), "cs-right", 4);
    const center = ctx.title(`<span class="cs-eyebrow">${eight.length} ENTER · 1 REMAINS</span><h2>THE MIRROR <em>TOURNAMENT.</em></h2>`, "cs-center");
    center.insertAdjacentHTML("afterbegin", CROWN_SVG);
    bracket.append(left, center, right);
    shot.append(bracket);
    ctx.cut(shot);
    ctx.cam(back, { s: 1.12 });
    ctx.at(40, () => ctx.cam(back, { s: 1, r: 0 }, T.end, "ease-out"));
    ctx.at(100, () => {
      ctx.caption("EIGHT VERSIONS. ONE BRACKET.");
      ctx.sfx.drone(T.end / 1000);
    });
    const seatsEls = [...left.querySelectorAll(".cs-seat"), ...right.querySelectorAll(".cs-seat")];
    // Alternate sides so the bracket fills in like a draw: 1, 5, 2, 6, ...
    const order = [0, 4, 1, 5, 2, 6, 3, 7];
    order.forEach((idx, n) =>
      ctx.at(T.cards + n * T.gap, () => {
        const s = seatsEls[idx];
        if (!s) return;
        ctx.on(s);
        if (!reduced) {
          ctx.sfx.whoosh();
          ctx.sfx.tick();
        }
      }),
    );
    ctx.at(T.cards + 8 * T.gap + 60, () => {
      bracket.classList.add("cs-lines");
      if (!reduced) ctx.sfx.riser(Math.max(0.3, (T.title - T.cards - 8 * T.gap) / 1000));
    });
    ctx.at(T.title, () => {
      ctx.on(center);
      ctx.flash("#ffe8a3");
      ctx.impact();
      ctx.shake();
      ctx.flare(shot, 50, "#ffe8a3");
      ctx.sfx.boom();
      ctx.sfx.sting();
    });
    ctx.at(T.match, () => {
      seatsEls[0]?.classList.add("cs-up");
      seatsEls[1]?.classList.add("cs-up");
      bracket.classList.add("cs-first-match");
      ctx.sfx.hit();
      ctx.caption(`ROUND ONE: ${eight[0].name} VS ${eight[1].name}`);
    });
    return T.end;
  },

  victory(ctx) {
    const { el, esc, reduced, context } = ctx;
    const champ = ctx.fighter(context.player ?? 0);
    const arena = ctx.arena(context.arena ?? 4);
    const loser = context.opponent != null ? ctx.fighter(context.opponent) : null;
    const tournament = context.mode === "tournament";
    const quote = fighterQuote(champ);
    const T = reduced ? { pose: 200, title: 400, quote: 800, end: 5200 } : { pose: 700, title: 1000, quote: 2300, end: 8800 };
    ctx.root.setAttribute("aria-label", `${tournament ? "Tournament" : "Arcade"} victory: ${champ.name}`);
    ctx.preload([arena.background, champ.motionSheet]);

    const shot = ctx.shot("cs-victory-shot");
    const cam = el("div", "cs-cam");
    cam.append(ctx.arenaLayer(arena, "cs-kenburns"), el("div", "cs-rays cs-gold"), el("div", "cs-sweep"));
    const spot = ctx.beam(cam, 34, "#ffe8a3", "cs-beam-gold");
    if (loser) cam.append(ctx.actor(loser, "ko", { x: 11, flip: true, cls: "cs-fallen" }));
    const hero = ctx.actor(champ, "idle", { x: 34, cls: "cs-champ" });
    cam.append(hero);
    ctx.particles(cam, "embers", 30, ["#ffe8a3", "#ffb75e", champ.color || "#ee5943"]);
    shot.append(cam);
    const copy = el(
      "div",
      "cs-copy",
      `<span class="cs-eyebrow">${esc(champ.name)} · ${esc(champ.title || "")}</span><h2>${tournament ? "TOURNAMENT <em>CHAMPION.</em>" : "SELF <em>MASTERED.</em>"}</h2><small>${tournament ? "EIGHT ENTERED. ONE REMAINS." : `${Number(context.fighters?.length) || ctx.roster.length - 1} REFLECTIONS DEFEATED`}</small><blockquote class="cs-quote"><p><span class="cs-sr">${esc(quote)}</span><span class="cs-typed" aria-hidden="true"></span></p><cite>— ${esc(champ.name)}</cite></blockquote>`,
    );
    if (tournament) copy.insertAdjacentHTML("afterbegin", CROWN_SVG);
    shot.append(copy);
    ctx.cut(shot);
    ctx.cam(cam, { s: 1.12, x: 2 });
    ctx.at(40, () => ctx.cam(cam, { s: 1, x: 0 }, T.end, "cubic-bezier(.2,.6,.2,1)"));
    ctx.at(T.pose, () => {
      hero.play("victory");
      shot.classList.add("cs-lit");
      ctx.on(spot);
      ctx.flash("#ffe8a3");
      ctx.impact();
      ctx.flare(cam, 40, "#ffe8a3", 34);
      ctx.sfx.boom();
      ctx.sfx.chime();
    });
    ctx.at(T.title, () => {
      ctx.on(copy);
      ctx.sfx.sting();
      if (!reduced) confetti(ctx, shot, [champ.color || "#ee5943", "#ffe8a3", "#eee9d9", "#ee5943", arena.color || "#46e1df"], 70);
    });
    ctx.at(T.quote, () => {
      copy.classList.add("cs-quoted");
      ctx.type(copy.querySelector(".cs-typed"), `“${quote}”`, 30);
    });
    return T.end;
  },

  defeat(ctx) {
    const { el, esc, reduced, context } = ctx;
    const fallen = ctx.fighter(context.player ?? 0);
    const winner = ctx.fighter(context.opponent ?? 1);
    const arena = ctx.arena(context.arena ?? 0);
    const tournament = context.mode === "tournament";
    const quote = fighterQuote(winner);
    const T = reduced ? { title: 300, quote: 700, end: 4600 } : { hit: 250, fall: 650, crack: 1150, stand: 1800, title: 2400, quote: 3200, end: 7800 };
    ctx.root.setAttribute("aria-label", `Defeat: ${winner.name} stands over ${fallen.name}`);
    ctx.preload([arena.background, fallen.motionSheet, winner.motionSheet, winner.combatSheet]);

    const shot = ctx.shot("cs-defeat-shot");
    const world = el("div", "cs-world cs-cam");
    world.append(ctx.arenaLayer(arena));
    const down = ctx.actor(fallen, reduced ? "ko" : "hurt", { x: reduced ? 24 : 32, cls: "cs-down" });
    world.append(down);
    const standing = ctx.actor(winner, reduced ? "victory" : "power", { x: reduced ? 36 : 50, flip: true, cls: "cs-winner" });
    const copy = el(
      "div",
      "cs-copy",
      `<span class="cs-eyebrow">${esc(winner.name)} WINS · ${esc(arena.name)}</span><h2>${tournament ? "ELIMINATED<em>.</em>" : "GAME <em>OVER.</em>"}</h2><small>THE REFLECTION HAD THE EDGE.</small><blockquote class="cs-quote"><p><span class="cs-sr">${esc(quote)}</span><span class="cs-typed" aria-hidden="true"></span></p><cite>— ${esc(winner.name)}</cite></blockquote>`,
    );
    shot.append(world, standing, copy);
    ctx.particles(shot, "ash", 40, ["#bdbdbd", "#8a8a8a", "#e8e2d4"]);
    ctx.cut(shot);
    ctx.at(100, () => ctx.sfx.heartbeat());
    if (reduced) {
      shot.classList.add("cs-desat");
      shot.insertAdjacentHTML("beforeend", fracture(ctx, 30, 60, 8, 0.4));
    } else {
      ctx.cam(world, { s: 1.22, x: 6, y: 4 });
      ctx.at(T.hit, () => {
        ctx.flash();
        ctx.impact();
        ctx.shake("hard");
        ctx.sfx.boom();
        // Slow motion: the fall plays at a third of its normal rate while the camera drifts back.
        ctx.cam(world, { s: 1.05, x: 2, y: 1 }, T.stand, "cubic-bezier(.2,.7,.2,1)");
      });
      ctx.at(T.fall, () => {
        down.play("ko", { fps: 4 });
        down.moveTo(24, 900, "cubic-bezier(.2,.7,.3,1)");
      });
      ctx.at(T.crack, () => {
        shot.insertAdjacentHTML("beforeend", fracture(ctx, 30, 60, 8, 0.4));
        shot.classList.add("cs-desat");
        ctx.shake();
        ctx.sfx.shatter();
      });
      ctx.at(T.stand, () => {
        standing.play("victory");
        standing.moveTo(36, 700);
        ctx.sfx.heartbeat();
      });
    }
    ctx.at(T.title, () => {
      ctx.on(copy);
      ctx.sfx.low();
      ctx.sfx.braam();
    });
    ctx.at(T.quote, () => {
      copy.classList.add("cs-quoted");
      ctx.type(copy.querySelector(".cs-typed"), `“${quote}”`, 30);
    });
    return T.end;
  },

  // Arcade final: the player's own shadow peels off the floor and stands up.
  shadow(ctx) {
    const { el, esc, reduced, context } = ctx;
    const hero = ctx.fighter(context.player ?? 0);
    const arena = ctx.arena(context.arena ?? 0);
    const cleared = Math.max(0, (Number(context.fighters?.length) || 1) - 1);
    const T = reduced ? { rise: 500, title: 1200, end: 4800 } : { flicker: 300, rise: 2000, stand: 2900, title: 4300, face: 5600, end: 8600 };
    ctx.root.setAttribute("aria-label", `Final: ${hero.name} faces their own shadow`);
    ctx.preload([arena.background, hero.sheet, hero.motionSheet]);

    const shot = ctx.shot("cs-shadow-shot");
    const cam = el("div", "cs-cam");
    const bg = ctx.arenaLayer(arena, "cs-dim");
    const me = ctx.actor(hero, "idle", { x: 38, cls: "cs-hero" });
    const cast = ctx.actor(hero, "idle", { x: 38, flip: true, cls: "cs-cast" });
    cam.append(bg, el("div", "cs-red-floor"), cast, me);
    ctx.beam(cam, 38, "#ffe0d0", "cs-beam-soft cs-beam-flicker");
    ctx.particles(cam, "embers", 26, ["#ee5943", "#ff8a6b", "#3a0d08"]);
    const card = ctx.title(
      `<span class="cs-eyebrow">FINAL · ${esc(arena.name)}${cleared ? ` · ${cleared} REFLECTIONS CLEARED` : ""}</span><h2>YOUR <em>SHADOW.</em></h2><small>EVERY REFLECTION LED HERE.</small>`,
      "cs-card-title",
    );
    const plateMe = ctx.nameplate(hero, { side: "l", label: "YOU" });
    const plateShadow = ctx.nameplate({ ...hero, name: `SHADOW ${hero.name}`, color: "#ee5943" }, { side: "r", label: "THE LAST REFLECTION" });
    shot.append(cam, card, plateMe, plateShadow);
    ctx.cut(shot);
    ctx.cam(cam, { s: 1.18, y: 3 });
    ctx.at(40, () => ctx.cam(cam, { s: 1.04, y: 0 }, T.end, "cubic-bezier(.3,0,.2,1)"));
    ctx.at(80, () => {
      ctx.caption("THE ARENA GOES QUIET.");
      ctx.sfx.drone(T.end / 1000);
      if (!reduced) shot.classList.add("cs-flickering");
    });
    if (!reduced) {
      ctx.at(700, () => ctx.sfx.heartbeat());
      ctx.at(1500, () => ctx.sfx.heartbeat());
    }
    ctx.at(T.rise, () => {
      cast.classList.add("risen");
      cast.moveTo(66, reduced ? 0 : 900, "cubic-bezier(.5,0,.2,1)");
      ctx.caption("YOUR SHADOW STANDS UP.");
      ctx.sfx.riser(0.9);
    });
    ctx.at(T.stand ?? T.rise, () => {
      cast.classList.add("awake");
      me.play("guard");
      ctx.flash("#ee5943");
      ctx.impact("red");
      ctx.shake("hard");
      ctx.flare(cam, 52, "#ff8a6b", 66);
      ctx.sfx.braam();
      ctx.sfx.boom();
    });
    ctx.at(T.title, () => {
      ctx.on(card);
      ctx.sfx.hit();
    });
    ctx.at(T.face ?? T.title + 600, () => {
      ctx.on(plateMe);
      ctx.on(plateShadow);
      me.play("idle");
      ctx.caption("THE LAST REFLECTION IS YOU.");
      ctx.sfx.low();
    });
    return T.end;
  },

  // Destruction bonus: the hero walks in, a crystal mirror stands ready, 3-2-1-BREAK.
  bonus(ctx) {
    const { el, esc, reduced, context } = ctx;
    const hero = ctx.fighter(context.player ?? 0);
    const arena = ctx.arena(context.arena ?? 0);
    const seconds = Number(context.seconds) || BONUS_DURATION;
    const T = reduced ? { title: 300, end: 4000 } : { walk: 1650, title: 1800, count: 3000, gap: 520, go: 4560, end: 6400 };
    ctx.root.setAttribute("aria-label", `Bonus stage: ${hero.name} breaks the reflection`);
    ctx.preload([arena.background, hero.motionSheet, hero.combatSheet]);

    const shot = ctx.shot("cs-bonus-shot");
    const cam = el("div", "cs-cam");
    cam.append(ctx.arenaLayer(arena, "cs-kenburns"));
    const crystal = el("div", "cs-crystal");
    crystal.setAttribute("aria-hidden", "true");
    const actor = ctx.actor(hero, reduced ? "idle" : "walk", { x: reduced ? 34 : -14, cls: "cs-hero" });
    cam.append(crystal, actor);
    ctx.particles(cam, "dust", 20, ["#bff4ff", "#fff"]);
    const card = ctx.title(
      `<span class="cs-eyebrow">INTERMISSION · ${esc(arena.name)}</span><h2>BONUS <em>STAGE.</em></h2><small>${seconds} SECONDS · BREAK YOUR REFLECTION</small>`,
      "cs-card-title",
    );
    const count = el("div", "cs-count");
    count.setAttribute("aria-hidden", "true");
    shot.append(cam, card, count);
    ctx.cut(shot);
    ctx.cam(cam, { s: 1.06 });
    ctx.at(40, () => ctx.cam(cam, { s: 1.16, x: -2 }, T.end, "ease-in-out"));
    ctx.at(100, () => ctx.caption("BREAK YOUR REFLECTION."));
    if (!reduced) {
      ctx.at(60, () => actor.moveTo(34, T.walk - 80));
      ctx.at(T.walk, () => actor.play("idle"));
    }
    ctx.at(T.title, () => {
      ctx.on(card);
      ctx.flash("#bff4ff");
      ctx.sfx.boom();
    });
    if (!reduced) {
      ["3", "2", "1"].forEach((n, i) =>
        ctx.at(T.count + i * T.gap, () => {
          count.textContent = n;
          count.classList.remove("go");
          void count.offsetWidth;
          count.classList.add("go");
          ctx.sfx.tick();
        }),
      );
      ctx.at(T.go, () => {
        count.textContent = "BREAK!";
        count.classList.remove("go");
        void count.offsetWidth;
        count.classList.add("go", "cs-break");
        actor.play("power");
        crystal.insertAdjacentHTML("beforeend", fracture(ctx, 50, 50, 8, 0.5));
        ctx.flash();
        ctx.impact();
        ctx.shake("hard");
        ctx.shockwave(cam, 70, 55, "#9fe8ff");
        ctx.particles(cam, "sparks", 30, ["#fff", "#9fe8ff", "#55d6e8"]);
        ctx.sfx.shatter();
        ctx.sfx.hit();
        ctx.caption(`${seconds} SECONDS. GO!`);
      });
    }
    return T.end;
  },

  // Tournament final: two finalists step into spotlights, the crown descends, they clash.
  final(ctx) {
    const { el, esc, reduced, context } = ctx;
    const a = ctx.fighter(context.player ?? 0);
    const b = ctx.fighter(context.opponent ?? 1);
    const arena = ctx.arena(context.arena ?? 0);
    const T = reduced ? { spotA: 200, spotB: 400, crown: 600, title: 800, end: 4800 } : { spotA: 500, spotB: 1400, crown: 2400, title: 3500, clash: 5400, end: 8600 };
    ctx.root.setAttribute("aria-label", `Tournament final: ${a.name} versus ${b.name}`);
    ctx.preload([arena.background, a.sheet, b.sheet, a.combatSheet, b.combatSheet]);

    const shot = ctx.shot("cs-final-shot");
    const cam = el("div", "cs-cam");
    cam.append(ctx.arenaLayer(arena, "cs-dim"));
    const beamA = ctx.beam(cam, 28, "#fff1d6", "cs-spot");
    const beamB = ctx.beam(cam, 72, "#fff1d6", "cs-spot");
    const left = ctx.actor(a, "idle", { x: 28, cls: "cs-finalist" });
    const right = ctx.actor(b, "idle", { x: 72, flip: true, cls: "cs-finalist" });
    cam.append(left, right);
    const crown = el("div", "cs-crown-drop", CROWN_SVG);
    cam.append(crown);
    ctx.particles(cam, "dust", 28, ["#ffe8a3", "#fff"]);
    const plateA = ctx.nameplate(a, { side: "l", label: "FINALIST · YOU" });
    const plateB = ctx.nameplate(b, { side: "r", label: "FINALIST" });
    const card = ctx.title(`<span class="cs-eyebrow">${esc(arena.name)} · ONE WIN FROM THE CROWN</span><h2>THE <em>FINAL.</em></h2>`, "cs-card-title");
    shot.append(cam, plateA, plateB, card);
    ctx.cut(shot);
    ctx.cam(cam, { s: 1.1, y: 2 });
    ctx.at(40, () => ctx.cam(cam, { s: 1, y: 0 }, T.end, "ease-out"));
    ctx.at(80, () => {
      ctx.caption("SEVEN FIGHTS DECIDED. ONE LEFT.");
      ctx.sfx.drone(T.end / 1000);
    });
    ctx.at(T.spotA, () => {
      ctx.on(beamA);
      ctx.on(left);
      ctx.on(plateA);
      ctx.sfx.thump();
    });
    ctx.at(T.spotB, () => {
      ctx.on(beamB);
      ctx.on(right);
      ctx.on(plateB);
      ctx.sfx.thump();
    });
    ctx.at(T.crown, () => {
      ctx.on(crown);
      ctx.flare(cam, 30, "#ffe8a3");
      ctx.sfx.chime();
    });
    ctx.at(T.title, () => {
      ctx.on(card);
      ctx.flash("#ffe8a3");
      ctx.impact();
      ctx.shake();
      ctx.sfx.boom();
      ctx.sfx.sting();
      ctx.caption(`${a.name} VS ${b.name}`);
    });
    if (!reduced) {
      ctx.at(T.clash - 500, () => {
        left.play("power");
        right.play("power");
        ctx.sfx.riser(0.5);
      });
      ctx.at(T.clash, () => {
        shot.classList.add("cs-clashed");
        ctx.flash();
        ctx.impact("red");
        ctx.shake("hard");
        ctx.shockwave(cam, 50, 58, "#ffe8a3");
        ctx.particles(cam, "sparks", 36, ["#fff", "#ffe8a3", a.color || "#ee5943", b.color || "#46e1df"]);
        ctx.sfx.boom();
        ctx.sfx.braam();
      });
    }
    return T.end;
  },
};

export default playCutscene;
