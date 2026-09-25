// Code-driven cutscenes. Every shot animates the shipped fighter sheets and
// arena backgrounds with DOM + CSS: no video, no generated imagery.
//
//   playCutscene(kind, context, options) -> Promise<{ kind, skipped }>
//
// kind:    "intro" | "ladder" | "tournament" | "victory" | "defeat"
// context: { player, opponent, fighters: [...], arena, mode: "arcade" | "tournament" }
//          fighters/players accept a roster index, a character id, or a character object;
//          arena accepts an index, an arena id, or an arena object.
// options: { container, reducedMotion, sound, seed, timers, now }
//
// Skippable by click/tap, Enter/Space/Escape, or gamepad A/Start. Resolves once, after
// every node, timer, listener, and audio context it created has been removed.
import { characters as ROSTER } from "./characters.js";
import { arenas as ARENAS } from "./arenas.js";

export const CUTSCENE_KINDS = ["intro", "ladder", "tournament", "victory", "defeat"];

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
  guard: { sheet: "motion", row: 2, frames: [0, 1, 2], fps: 12, loop: false },
  hurt: { sheet: "motion", row: 3, frames: [0, 1, 2, 3], fps: 14, loop: false },
  ko: { sheet: "motion", row: 4, frames: [0, 1, 2, 3], fps: 7, loop: false },
  victory: { sheet: "motion", row: 5, frames: [0, 1, 2, 3], fps: 5, loop: false },
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

// Tiny procedural sound kit (WebAudio). Silently disabled when unavailable.
function soundKit(win, enabled) {
  let ac = null;
  const ctx = () => {
    if (!enabled) return null;
    try {
      const AC = win.AudioContext || win.webkitAudioContext;
      if (!AC) return null;
      ac ||= new AC();
      if (ac.state === "suspended") ac.resume?.();
      return ac;
    } catch {
      return null;
    }
  };
  const tone = (type, from, to, dur, vol = 0.05, delay = 0) => {
    const a = ctx();
    if (!a) return;
    try {
      const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + delay;
      o.type = type;
      o.frequency.setValueAtTime(from, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g).connect(a.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch {}
  };
  const noise = (dur, freq, vol = 0.05, type = "highpass") => {
    const a = ctx();
    if (!a) return;
    try {
      const len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
      const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      src.buffer = buf;
      f.type = type;
      f.frequency.value = freq;
      g.gain.value = vol;
      src.connect(f).connect(g).connect(a.destination);
      src.start();
    } catch {}
  };
  return {
    thump: () => (tone("sine", 140, 38, 0.45, 0.11), noise(0.12, 900, 0.03, "lowpass")),
    shatter: () => (noise(0.7, 2600, 0.07), tone("triangle", 1900, 700, 0.3, 0.02)),
    whoosh: () => noise(0.35, 1200, 0.035, "bandpass"),
    chime: () => [523, 659, 784, 1047].forEach((f, i) => tone("square", f, f * 1.001, 0.22, 0.02, i * 0.11)),
    low: () => tone("sawtooth", 110, 55, 0.9, 0.035),
    close: () => {
      try {
        ac?.close?.();
      } catch {}
      ac = null;
    },
  };
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
    root.append(stage, el("div", "cs-bar cs-bar-top"), el("div", "cs-bar cs-bar-bottom"), caption, flashEl, progress, skipBtn);

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
        a.play = (name) => ctx.play(sp, name);
        a.moveTo = (nx, ms) => {
          a.style.setProperty("--walk", `${reduced ? 0 : ms}ms`);
          a.style.left = `${nx}%`;
        };
        ctx.play(sp, anim);
        return a;
      },
      play(sp, name) {
        const anim = ANIMS[name] ?? ANIMS.idle;
        const sheet = SHEETS[anim.sheet];
        sp.anim = anim;
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
      on: (node) => node.classList.add("on"),
      off: (node) => node.classList.remove("on"),
      shot(cls = "") {
        const n = el("div", `cs-shot ${cls}`);
        stage.append(n);
        return n;
      },
      cut(next) {
        stage.querySelectorAll(".cs-shot.on").forEach((n) => n !== next && n.classList.remove("on"));
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

const SCENES = {
  intro(ctx) {
    const { el, esc, reduced, context, roster, arenaList } = ctx;
    const hero = ctx.fighter(context.player ?? 0);
    const garden = arenaList.find((a) => a.id === "mirror-garden") ?? ctx.arena(2);
    const T = reduced
      ? { crack: 500, shatter: 900, face: 1500, logo: 3300, end: 5200 }
      : { crack: 1150, shatter: 1750, montage: 2350, face: 5600, logo: 7600, end: 9600 };
    ctx.root.setAttribute("aria-label", "Intro: Me vs Me");
    ctx.preload([hero.sheet, hero.portrait, garden.background, ...arenaList.map((a) => a.background)]);

    // Shot 1: the mirror.
    const s1 = ctx.shot("cs-mirror-shot");
    s1.append(el("div", "cs-vignette"));
    const mirror = el("div", "cs-mirror");
    const glassHTML = `<div class="cs-glass" style="background-image:url('${esc(String(hero.portrait).replace(/'/g, ""))}'), radial-gradient(circle at 50% 38%, #3a5a78, #0b1220 72%)"></div>`;
    mirror.innerHTML = `${glassHTML}<div class="cs-sheen"></div>`;
    mirror.setAttribute("role", "img");
    mirror.setAttribute("aria-label", `${hero.name} in the mirror`);
    s1.append(mirror);
    ctx.cut(s1);
    ctx.at(150, () => ctx.caption("ONE MIND."));
    ctx.at(T.crack, () => {
      mirror.insertAdjacentHTML("beforeend", fracture(ctx, 50, 44, 9, 0.5));
      ctx.shake();
      ctx.sfx.thump();
    });
    ctx.at(T.shatter, () => {
      shatter(ctx, mirror, glassHTML, 18);
      mirror.classList.add("broken");
      ctx.flash();
      ctx.shake("hard");
      ctx.sfx.shatter();
      ctx.caption(`${roster.length} WAYS TO FIGHT.`);
    });

    // Shots 2-5: fighters flash across the real arenas.
    if (!reduced) {
      const others = (context.fighters?.length ? context.fighters.map(ctx.fighter) : [1, 2, 11, 18].map((i) => roster[i % roster.length])).slice(0, 4);
      others.forEach((c, i) => {
        const start = T.montage + i * 800;
        const shot = ctx.shot(`cs-montage ${i % 2 ? "from-right" : "from-left"}`);
        shot.append(ctx.arenaLayer(arenaList[i % arenaList.length], "cs-zoom"), el("div", "cs-speedlines"));
        shot.append(el("div", "cs-shot-name", `<span>${esc(c.name)}</span><small>${esc(c.title || "")}</small>`));
        const dash = i % 2 === 0;
        const actor = ctx.actor(c, dash ? "walk" : "power", { x: dash ? -18 : 50, flip: i % 2 === 1, cls: dash ? "cs-dash" : "cs-pose" });
        shot.append(actor);
        ctx.at(start, () => {
          ctx.cut(shot);
          ctx.sfx.whoosh();
          actor.play(dash ? "walk" : "power");
          if (dash) ctx.at(20, () => actor.moveTo(118, 820));
          else ctx.flash(c.color);
        });
      });
    }

    // Shot 6: Hataalii faces his reflection.
    const face = ctx.shot("cs-faceoff");
    face.append(ctx.arenaLayer(garden, "cs-push"), el("div", "cs-mirror-line"));
    const me = ctx.actor(hero, "idle", { x: 30, cls: "cs-me" });
    const reflection = ctx.actor(hero, "idle", { x: 70, flip: true, cls: "cs-reflection" });
    face.append(me, reflection);
    ctx.at(T.face, () => {
      ctx.cut(face);
      me.play("idle");
      reflection.play("idle");
      ctx.caption("THE ONLY RIVAL IS YOU.");
    });
    ctx.at(T.face + (reduced ? 900 : 1200), () => {
      me.play("guard");
      reflection.play("guard");
      ctx.sfx.low();
    });

    // Shot 7: logo slam.
    const logo = ctx.shot("cs-logo-shot");
    logo.append(el("div", "cs-rays"), ctx.title(`<span class="cs-logo">ME <em>VS</em> ME</span><small>THE MIRROR TOURNAMENT</small>`, "cs-logo-wrap"));
    ctx.at(T.logo, () => {
      ctx.cut(logo);
      ctx.on(logo.querySelector(".cs-title"));
      ctx.flash("#ffe8a3");
      ctx.shake("hard");
      ctx.sfx.thump();
      ctx.caption("KNOW THYSELF.");
    });
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
    shot.append(ctx.arenaLayer(arena, "cs-kenburns"));
    const rungs = el("div", "cs-ladder");
    rungs.setAttribute("aria-hidden", "true");
    ladder.slice(0, 19).forEach((c, i) => {
      const r = ctx.portrait(c, "cs-rung");
      r.style.setProperty("--i", i);
      r.style.setProperty("--delay", `${((i * 137) % 900) / 1000}s`);
      rungs.append(r);
    });
    shot.append(rungs, el("div", "cs-floor-glow"));
    const hero = ctx.actor(player, reduced ? "idle" : "walk", { x: reduced ? 36 : -12, cls: "cs-hero" });
    const shadow = ctx.actor(player, "idle", { x: 68, flip: true, cls: "cs-shadow" });
    shot.append(shadow, hero);
    const card = ctx.title(
      `<span class="cs-eyebrow">STAGE 01 · ${esc(arena.name)}</span><h2>THE LADDER <em>BEGINS.</em></h2><small>${ladder.length} REFLECTIONS${first ? ` · FIRST: ${esc(first.name)}` : ""}</small>`,
      "cs-card-title",
    );
    shot.append(card);
    ctx.cut(shot);
    ctx.at(120, () => ctx.caption(`${arena.subtitle || arena.name}`));
    if (!reduced) {
      ctx.at(60, () => hero.moveTo(36, T.walk - 100));
      ctx.at(T.walk, () => {
        hero.play("idle");
        rungs.classList.add("awake");
        ctx.caption(`${ladder.length} REFLECTIONS STAND IN YOUR WAY.`);
      });
    } else rungs.classList.add("awake");
    ctx.at(T.shadow, () => {
      ctx.on(shadow);
      shadow.play("idle");
      ctx.flash("#ee5943");
      ctx.shake();
      ctx.sfx.low();
      if (reduced) ctx.caption(`${ladder.length} REFLECTIONS STAND IN YOUR WAY.`);
    });
    ctx.at(T.shadow + (reduced ? 400 : 700), () => hero.play("guard"));
    ctx.at(T.title, () => {
      ctx.on(card);
      ctx.sfx.thump();
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
    shot.append(ctx.arenaLayer(arena, "cs-blurred"), el("div", "cs-rays"));
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
    bracket.append(left, center, right);
    shot.append(bracket);
    ctx.cut(shot);
    ctx.at(100, () => ctx.caption("EIGHT VERSIONS. ONE BRACKET."));
    const seatsEls = [...left.querySelectorAll(".cs-seat"), ...right.querySelectorAll(".cs-seat")];
    // Alternate sides so the bracket fills in like a draw: 1, 5, 2, 6, ...
    const order = [0, 4, 1, 5, 2, 6, 3, 7];
    order.forEach((idx, n) =>
      ctx.at(T.cards + n * T.gap, () => {
        const s = seatsEls[idx];
        if (!s) return;
        ctx.on(s);
        if (!reduced) ctx.sfx.whoosh();
      }),
    );
    ctx.at(T.cards + 8 * T.gap + 60, () => bracket.classList.add("cs-lines"));
    ctx.at(T.title, () => {
      ctx.on(center);
      ctx.flash("#ffe8a3");
      ctx.shake();
      ctx.sfx.thump();
    });
    ctx.at(T.match, () => {
      seatsEls[0]?.classList.add("cs-up");
      seatsEls[1]?.classList.add("cs-up");
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
    shot.append(ctx.arenaLayer(arena, "cs-kenburns"), el("div", "cs-rays cs-gold"), el("div", "cs-sweep"));
    if (loser) shot.append(ctx.actor(loser, "ko", { x: 11, flip: true, cls: "cs-fallen" }));
    const hero = ctx.actor(champ, "idle", { x: 34, cls: "cs-champ" });
    shot.append(hero);
    const copy = el(
      "div",
      "cs-copy",
      `<span class="cs-eyebrow">${esc(champ.name)} · ${esc(champ.title || "")}</span><h2>${tournament ? "TOURNAMENT <em>CHAMPION.</em>" : "SELF <em>MASTERED.</em>"}</h2><small>${tournament ? "EIGHT ENTERED. ONE REMAINS." : `${Number(context.fighters?.length) || ctx.roster.length - 1} REFLECTIONS DEFEATED`}</small><blockquote class="cs-quote"><p><span class="cs-sr">${esc(quote)}</span><span class="cs-typed" aria-hidden="true"></span></p><cite>— ${esc(champ.name)}</cite></blockquote>`,
    );
    shot.append(copy);
    ctx.cut(shot);
    ctx.at(T.pose, () => {
      hero.play("victory");
      shot.classList.add("cs-lit");
      ctx.flash("#ffe8a3");
      ctx.sfx.chime();
    });
    ctx.at(T.title, () => {
      ctx.on(copy);
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
    const world = el("div", "cs-world");
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
    ctx.cut(shot);
    if (reduced) {
      shot.classList.add("cs-desat");
      shot.insertAdjacentHTML("beforeend", fracture(ctx, 30, 60, 8, 0.4));
    } else {
      ctx.at(T.hit, () => {
        ctx.flash();
        ctx.shake("hard");
        ctx.sfx.thump();
      });
      ctx.at(T.fall, () => {
        down.play("ko");
        down.moveTo(24, 500);
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
      });
    }
    ctx.at(T.title, () => {
      ctx.on(copy);
      ctx.sfx.low();
    });
    ctx.at(T.quote, () => {
      copy.classList.add("cs-quoted");
      ctx.type(copy.querySelector(".cs-typed"), `“${quote}”`, 30);
    });
    return T.end;
  },
};

export default playCutscene;
