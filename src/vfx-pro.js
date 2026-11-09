// VFX PRO: the high-end layer over a fight. src/combat.js calls five hooks (create, onPower, onHit,
// onRoundEnd, update, destroy); everything else lives here so the fight logic never depends on it.
//
//   - one WebGL post pass on the main camera (MvmVfxPro): thresholded bloom, chromatic aberration,
//     a screen-space shockwave ripple, radial blur, the cut-in desaturation and a cinematic grade
//     (split tone toward the arena colour, gentle contrast, vignette, film grain);
//   - additive particle sparks (velocity streaks + embers) and glow halos scaled by strike tier;
//   - radial speed lines and two-frame ink/cream impact frames on POWER hits and the K.O.;
//   - a POWER "cinematic freeze": the world darkens and desaturates while a diagonal cut-in band
//     with the fighter's bust and POWER name sweeps across, then releases (~0.45 s);
//   - fighter-colour afterimages on jumps, heavy normals, POWERs and big knockback;
//   - dynamic light: POWER charge and shots glow on both fighters and brighten the floor.
//
// Quality follows Settings → Pixel effects (vfxProfile below); WebGL-only parts are feature
// detected, every hook is wrapped so nothing here can throw into the fight, and destroy() frees
// all of it. The freeze holds the whole simulation like a pause (combat.js returns early from
// update), so frame data, hitstop and every combat outcome are unchanged.
import { pixelQuality } from "./combat-fx.js";

const W = 960;
const H = 540;
const FLOOR = 450;
// The cabinet palette (src/style.css): ink, red, gold, cream.
export const PALETTE = { ink: 0x0b0a12, red: 0xee5943, gold: 0xedbb57, cream: 0xfff1cf, white: 0xffffff };

// ---- pure maths (unit-tested in tests/vfx-pro.test.mjs) -----------------------------------------

/** Which parts of the layer are on, by Settings → Pixel effects tier and reduced motion. */
export function vfxProfile(settings = {}) {
  const tier = pixelQuality(settings);
  const reduced = Boolean(settings.reducedMotion);
  const none = {
    tier,
    reduced,
    enabled: false,
    shader: false,
    bloom: false,
    bloomStrength: 0,
    halos: false,
    sparks: false,
    sparkCap: 0,
    embers: false,
    chroma: false,
    shockwave: false,
    radialBlur: false,
    speedLines: false,
    impactFrames: false,
    cutIn: false,
    freeze: false,
    trails: false,
    light: false,
    floorLight: false,
    grade: false,
    grain: false,
    vignette: false,
  };
  if (tier === "off") return none;
  // Reduced motion: gentle bloom only, nothing that flashes, shakes, warps or flies.
  if (reduced) return { ...none, enabled: true, shader: true, bloom: true, bloomStrength: 0.32, halos: true };
  const base = { ...none, enabled: true, shader: true, bloom: true, halos: true, sparks: true, embers: true };
  if (tier === "lite") return { ...base, bloomStrength: 0.42, sparkCap: 90 };
  return {
    ...base,
    bloomStrength: 0.55,
    sparkCap: 220,
    chroma: true,
    shockwave: true,
    radialBlur: true,
    speedLines: true,
    impactFrames: true,
    cutIn: true,
    freeze: true,
    trails: true,
    light: true,
    floorLight: true,
    grade: true,
    grain: true,
    vignette: true,
  };
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const easeOutCubic = (u) => 1 - (1 - clamp01(u)) ** 3;
export const easeOutExpo = (u) => (u >= 1 ? 1 : 1 - 2 ** (-10 * clamp01(u)));
export const easeInCubic = (u) => clamp01(u) ** 3;

/** Shockwave ring: radius races out (ease-out cubic) while the push fades (quadratic). */
export function shockwave(t, duration = 0.45) {
  if (!(duration > 0) || t < 0 || t >= duration) return { radius: t >= duration ? 1 : 0, strength: 0, done: t >= duration };
  const u = t / duration;
  return { radius: easeOutCubic(u), strength: (1 - u) ** 2, done: false };
}

/** Chromatic aberration pulse: a near-instant attack (first 12%), then a quadratic decay. */
export function chromaPulse(t, duration = 0.22, peak = 1) {
  if (!(duration > 0) || t < 0 || t >= duration) return 0;
  const attack = duration * 0.12;
  if (t < attack) return peak * (t / attack);
  return peak * (1 - (t - attack) / (duration - attack)) ** 2;
}

/** An afterimage's alpha at a given age: starts at `start`, fades out quadratically. */
export function trailAlpha(age, life = 0.24, start = 0.5) {
  if (!(life > 0) || age < 0 || age >= life) return 0;
  return start * (1 - age / life) ** 2;
}

// The POWER cut-in: slide in, hold, snap out. 0.45 s in all.
export const CUT_IN = { in: 0.08, hold: 0.27, out: 0.1, total: 0.45 };

/** Where the cut-in is at time t: phase, progress within it, band offset (0 = centred) and dim. */
export function cutInPhase(t, timing = CUT_IN) {
  const { in: tin, hold, out, total } = timing;
  if (t < 0) return { phase: "pending", k: 0, slide: -1, open: 0, dim: 0 };
  if (t >= total) return { phase: "done", k: 1, slide: 1, open: 0, dim: 0 };
  // the world dims in fast and comes back over the snap out
  const dim = Math.min(clamp01(t / 0.05), clamp01((total - t) / out));
  if (t < tin) {
    const k = t / tin;
    return { phase: "in", k, slide: -(1 - easeOutExpo(k)), open: 1, dim };
  }
  if (t < tin + hold) return { phase: "hold", k: (t - tin) / hold, slide: 0, open: 1, dim };
  const k = (t - tin - hold) / out;
  return { phase: "out", k, slide: easeInCubic(k), open: 1 - easeInCubic(k), dim };
}

// Impact frames: two ink/cream frames, the first held two render ticks, the second one.
export const IMPACT_FRAMES = [0.034, 0.052];
/** 0 = ink silhouettes on a light field, 1 = inverted (light silhouettes on ink), -1 = over. */
export function impactFrameAt(t) {
  if (t < 0) return -1;
  for (let i = 0; i < IMPACT_FRAMES.length; i++) if (t < IMPACT_FRAMES[i]) return i;
  return -1;
}

/** Particles for one strike: velocity streaks and embers by tier (POWER = 4), within the cap. */
export function sparkBudget(tier = 1, { block = false, power = false, counter = false, cap = 220 } = {}) {
  const t = power ? 4 : Math.max(1, Math.min(3, Math.round(tier) || 1));
  let streaks = block ? 5 + t : 6 + t * 6 + (counter ? 6 : 0) + (power ? 10 : 0);
  let embers = block ? 0 : t * 4 + (counter ? 4 : 0) + (power ? 12 : 0);
  const scale = Math.min(1, cap / Math.max(1, streaks + embers));
  streaks = Math.floor(streaks * scale);
  embers = Math.floor(embers * scale);
  return { streaks, embers, speed: 340 + t * 150, life: 200 + t * 45 };
}

/** Light from a source at `dist` px: smooth falloff to zero at `radius`. */
export function lightFalloff(dist, radius = 420) {
  const u = clamp01(Math.abs(dist) / radius);
  return (1 - u * u) ** 2;
}

/** "#rrggbb" → [r, g, b] in 0..1 (white on bad input). */
export function rgb(hex) {
  const v = parseInt(String(hex ?? "").replace("#", "").padEnd(6, "f").slice(0, 6), 16);
  if (Number.isNaN(v)) return [1, 1, 1];
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}
export const hexNumber = (hex, fallback = 0xffffff) => {
  const v = parseInt(String(hex ?? "").replace("#", ""), 16);
  return Number.isNaN(v) ? fallback : v;
};

/** The arena's grade tint: its colour, normalised so the grade shifts hue without dimming. */
export function gradeTint(hex) {
  const [r, g, b] = rgb(hex);
  const m = Math.max(r, g, b, 0.001);
  return [r / m, g / m, b / m];
}

// ---- the post pass ------------------------------------------------------------------------------

export const PIPELINE = "MvmVfxPro";
export const FRAG = `
#define SHADER_NAME MVM_VFX_PRO_FS
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uCenter;
uniform vec3 uShock;      // radius (uv height units), ring width, push
uniform float uChroma;
uniform float uRadial;
uniform float uBloom;
uniform float uThreshold;
uniform float uDesat;
uniform float uDarken;
uniform vec3 uGrade;
uniform float uGradeAmt;
uniform float uVignette;
uniform float uGrain;
varying vec2 outTexCoord;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 bright(vec2 uv) {
  vec3 c = texture2D(uMainSampler, uv).rgb;
  float l = max(c.r, max(c.g, c.b));
  return c * smoothstep(uThreshold, 1.0, l);
}

void main() {
  vec2 uv = outTexCoord;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 d = (uv - uCenter) * aspect;
  float dist = length(d);
  vec2 dir = dist > 0.0001 ? d / dist : vec2(0.0);

  // shockwave: a lens-shaped push on a ring around the impact
  if (uShock.z > 0.0) {
    float x = (dist - uShock.x) / uShock.y;
    float ring = x * exp(-x * x * 2.0);
    uv -= dir / aspect * ring * uShock.z;
  }
  vec4 src = texture2D(uMainSampler, uv);
  vec3 col = src.rgb;

  // chromatic aberration, stronger away from the impact
  if (uChroma > 0.0) {
    vec2 off = dir / aspect * uChroma * (0.0025 + dist * 0.012);
    col.r = texture2D(uMainSampler, uv + off).r;
    col.b = texture2D(uMainSampler, uv - off).b;
  }

  // radial blur toward the impact, leaving its centre sharp
  if (uRadial > 0.0) {
    vec3 acc = col;
    for (int i = 1; i < 8; i++) {
      float s = float(i) / 8.0 * uRadial * 0.07;
      acc += texture2D(uMainSampler, uv - (uv - uCenter) * s).rgb;
    }
    col = mix(col, acc / 8.0, smoothstep(0.04, 0.35, dist));
  }

  // bloom: a bright pass over three rings of taps, so only what glows blooms
  if (uBloom > 0.0) {
    vec2 px = 1.0 / uResolution;
    vec3 b = bright(uv) * 0.5;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7853982 + 0.3926991;
      vec2 o = vec2(cos(a), sin(a)) * px;
      b += bright(uv + o * 4.0) * 0.42;
      b += bright(uv + o * 10.0) * 0.3;
      b += bright(uv + o * 20.0) * 0.18;
    }
    col += b * (uBloom / 7.0);
  }

  // the cut-in: the world drains of colour and light behind the band
  float l = luma(col);
  col = mix(col, vec3(l) * vec3(0.92, 0.95, 1.08), uDesat);
  col *= 1.0 - uDarken;

  // grade: shadows lean toward the arena colour, highlights toward warm cream, gentle S-curve
  if (uGradeAmt > 0.0) {
    float lg = luma(col);
    vec3 shadowTone = mix(vec3(1.0), uGrade * 0.82 + 0.18, 0.55);
    vec3 lightTone = vec3(1.04, 1.0, 0.93);
    vec3 toned = col * mix(shadowTone, lightTone, smoothstep(0.15, 0.75, lg));
    vec3 curved = toned * toned * (3.0 - 2.0 * toned);
    col = mix(col, mix(toned, curved, 0.35), uGradeAmt);
  }
  if (uVignette > 0.0) {
    vec2 q = (outTexCoord - 0.5) * vec2(1.0, 0.82);
    col *= 1.0 - uVignette * smoothstep(0.32, 0.78, length(q));
  }
  if (uGrain > 0.0) {
    float n = fract(sin(dot(floor(outTexCoord * uResolution) + floor(uTime * 24.0) * 17.0, vec2(12.9898, 78.233))) * 43758.5453);
    col += (n - 0.5) * uGrain * (1.0 - luma(col) * 0.6);
  }
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), src.a);
}
`;

/** The uniform values for one frame (pure, so the mix of effects is testable). */
export function shaderUniforms(state, profile) {
  // an impact frame is a flat graphic: no bloom, blur or fringing smearing the silhouettes
  const flat = Boolean(state.impactOn);
  const shock = profile.shockwave && state.shock ? shockwave(state.shock.t, state.shock.duration) : null;
  return {
    center: state.center ?? [0.5, 0.5],
    shock: shock && !shock.done ? [shock.radius * (state.shock.reach ?? 0.6), 0.045 + shock.radius * 0.03, shock.strength * (state.shock.push ?? 0.02)] : [0, 1, 0],
    chroma: !flat && profile.chroma && state.chroma ? chromaPulse(state.chroma.t, state.chroma.duration, state.chroma.peak) : 0,
    radial: !flat && profile.radialBlur && state.radial ? chromaPulse(state.radial.t, state.radial.duration, state.radial.peak) : 0,
    bloom: profile.bloom && !flat ? profile.bloomStrength : 0,
    desat: profile.freeze ? 0.85 * (state.dim ?? 0) : 0,
    darken: profile.freeze ? 0.42 * (state.dim ?? 0) : 0,
    gradeAmt: profile.grade ? 0.55 : 0,
    vignette: profile.vignette ? 0.22 : 0,
    grain: profile.grain ? 0.035 : 0,
  };
}

function definePipeline(Phaser) {
  const Base = Phaser?.Renderer?.WebGL?.Pipelines?.PostFXPipeline;
  if (!Base) return null;
  return class MvmVfxPro extends Base {
    constructor(game) {
      super({ game, name: PIPELINE, fragShader: FRAG });
      this.u = null;
      this.time = 0;
      this.grade = [1, 1, 1];
    }
    onPreRender() {
      const u = this.u;
      if (!u) return;
      this.set2f("uResolution", this.renderer.width, this.renderer.height);
      this.set1f("uTime", this.time);
      this.set2f("uCenter", u.center[0], u.center[1]);
      this.set3f("uShock", u.shock[0], u.shock[1], u.shock[2]);
      this.set1f("uChroma", u.chroma);
      this.set1f("uRadial", u.radial);
      this.set1f("uBloom", u.bloom);
      this.set1f("uThreshold", 0.8);
      this.set1f("uDesat", u.desat);
      this.set1f("uDarken", u.darken);
      this.set3f("uGrade", this.grade[0], this.grade[1], this.grade[2]);
      this.set1f("uGradeAmt", u.gradeAmt);
      this.set1f("uVignette", u.vignette);
      this.set1f("uGrain", u.grain);
    }
  };
}

// ---- textures ---------------------------------------------------------------------------------

function canvasTexture(scene, key, w, h, draw, Phaser) {
  if (scene.textures.exists?.(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return null;
  draw(tex.getContext(), w, h);
  tex.setFilter?.(Phaser?.Textures?.FilterMode?.LINEAR ?? 0);
  tex.refresh();
  return key;
}
function makeTextures(scene, Phaser) {
  if (!scene.textures?.createCanvas) return null;
  const radial = (stops) => (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) / 2);
    for (const [at, color] of stops) g.addColorStop(at, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  return {
    dot: canvasTexture(scene, "mvm-vfx-dot", 32, 32, radial([[0, "rgba(255,255,255,1)"], [0.35, "rgba(255,255,255,0.85)"], [1, "rgba(255,255,255,0)"]]), Phaser),
    glow: canvasTexture(scene, "mvm-vfx-glow", 128, 128, radial([[0, "rgba(255,255,255,0.9)"], [0.25, "rgba(255,255,255,0.45)"], [0.6, "rgba(255,255,255,0.12)"], [1, "rgba(255,255,255,0)"]]), Phaser),
    // a velocity streak: bright head, long tapered tail (drawn pointing +x)
    streak: canvasTexture(
      scene,
      "mvm-vfx-streak",
      64,
      8,
      (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(0.7, "rgba(255,255,255,0.75)");
        g.addColorStop(1, "rgba(255,255,255,1)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w - 6, 1);
        ctx.quadraticCurveTo(w, h / 2, w - 6, h - 1);
        ctx.closePath();
        ctx.fill();
      },
      Phaser,
    ),
    // an anamorphic flare: a wide horizontal streak for the hottest impacts
    flare: canvasTexture(
      scene,
      "mvm-vfx-flare",
      256,
      16,
      (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(0.5, "rgba(255,255,255,1)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        const v = ctx.createLinearGradient(0, 0, 0, h);
        ctx.fillRect(0, h / 2 - 2, w, 4);
        v.addColorStop(0, "rgba(255,255,255,0)");
        v.addColorStop(0.5, "rgba(255,255,255,0.35)");
        v.addColorStop(1, "rgba(255,255,255,0)");
        ctx.globalCompositeOperation = "destination-in";
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = g;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(0, h / 2 - 1, w, 2);
      },
      Phaser,
    ),
  };
}

// ---- the layer ----------------------------------------------------------------------------------

/**
 * Builds the layer for a fight scene, or returns null when the tier is OFF or the scene cannot
 * host it. `Phaser` is passed in (combat.js already imports it) so this module stays node-safe.
 */
export function createVfxPro({ scene, Phaser, settings = {}, arena, mode } = {}) {
  const profile = vfxProfile(settings);
  if (!profile.enabled || !scene?.add || !scene.fighters) return null;
  const fighters = scene.fighters;
  const renderer = scene.sys?.game?.renderer ?? scene.game?.renderer;
  const webgl = Boolean(renderer?.pipelines && Phaser?.WEBGL !== undefined && renderer.type === Phaser.WEBGL);
  const cam = scene.cameras?.main;
  const colors = fighters.map((f) => hexNumber(f.c?.color, PALETTE.gold));
  const uid = Math.random().toString(36).slice(2, 8);
  const made = []; // game objects to destroy
  const state = { center: [0.5, 0.5], shock: null, chroma: null, radial: null, dim: 0, time: 0 };
  let destroyed = false;
  let freeze = null;
  let lastFreeze = -10;
  let clock = 0;
  let impact = null;
  let lines = null;

  const guard = (fn) => {
    try {
      return fn();
    } catch (error) {
      if (globalThis.__mvmVfxDebug) console.warn("vfx-pro", error);
      return undefined;
    }
  };
  const keep = (obj) => {
    if (obj) made.push(obj);
    return obj;
  };

  const tex = guard(() => makeTextures(scene, Phaser)) ?? null;

  // the post pass (WebGL only)
  let pipe = null;
  if (profile.shader && webgl && cam?.setPostPipeline)
    guard(() => {
      const Pipe = definePipeline(Phaser);
      if (!Pipe) return;
      if (!renderer.pipelines.postPipelineClasses?.has?.(PIPELINE)) renderer.pipelines.addPostPipeline(PIPELINE, Pipe);
      cam.setPostPipeline(PIPELINE);
      const got = cam.getPostPipeline?.(PIPELINE);
      pipe = Array.isArray(got) ? got[got.length - 1] : got;
      if (pipe) pipe.grade = gradeTint(arena?.color);
    });

  // particle sparks: three streak tiers, embers and a POWER burst, all additive and reused
  const emitters = {};
  if (profile.sparks && tex?.streak && scene.add.particles)
    guard(() => {
      const along = { onEmit: () => 0, onUpdate: (p) => (Math.atan2(p.velocityY, p.velocityX) * 180) / Math.PI };
      const hot = [PALETTE.white, PALETTE.cream, PALETTE.gold, PALETTE.red];
      const streak = (scale, extra = {}) =>
        keep(
          scene.add
            .particles(0, 0, tex.streak, {
              emitting: false,
              blendMode: "ADD",
              speed: { min: 260, max: 900 },
              angle: { min: 0, max: 360 },
              lifespan: { min: 140, max: 300 },
              scaleX: { start: scale * 1.3, end: scale * 0.15 },
              scaleY: { start: scale, end: scale * 0.4 },
              rotate: along,
              color: hot,
              alpha: { start: 1, end: 0 },
              gravityY: 300,
              maxAliveParticles: Math.ceil(profile.sparkCap * 0.6),
              ...extra,
            })
            .setDepth(9.52),
        );
      emitters.light = streak(0.55, { speed: { min: 200, max: 520 }, lifespan: { min: 110, max: 200 } });
      emitters.heavy = streak(0.85);
      emitters.power = streak(1.15, { speed: { min: 420, max: 1300 }, lifespan: { min: 200, max: 420 }, gravityY: 120 });
      emitters.block = streak(0.5, { color: [PALETTE.white, 0xdff3ff, 0x9fb4c0], speed: { min: 160, max: 420 }, lifespan: { min: 90, max: 170 }, gravityY: 0 });
      if (profile.embers && tex.dot)
        emitters.embers = keep(
          scene.add
            .particles(0, 0, tex.dot, {
              emitting: false,
              blendMode: "ADD",
              speed: { min: 60, max: 320 },
              angle: { min: 200, max: 340 },
              lifespan: { min: 420, max: 900 },
              scale: { start: 0.32, end: 0 },
              alpha: { start: 1, end: 0 },
              gravityY: 520,
              maxAliveParticles: Math.ceil(profile.sparkCap * 0.4),
            })
            .setDepth(9.51),
        );
    });

  // glow halos and flares (pooled additive images): bloom you can see on any renderer
  const halos = [];
  function halo(x, y, { scale = 1, color = PALETTE.cream, alpha = 0.9, life = 0.2, flare = false, sx = 1, sy = 1, depth = 9.5 } = {}) {
    if (!profile.halos || !tex?.glow) return null;
    let h = halos.find((o) => o.life <= 0);
    if (!h) {
      if (halos.length >= 24) h = halos.reduce((a, b) => (a.life < b.life ? a : b));
      else {
        const image = keep(scene.add.image(0, 0, tex.glow).setVisible(false));
        image.setBlendMode?.("ADD");
        h = { image, life: 0 };
        halos.push(h);
      }
    }
    h.image.setTexture(flare && tex.flare ? tex.flare : tex.glow);
    h.image.setPosition(x, y).setDepth(depth).setTint?.(color);
    Object.assign(h, { life, max: life, alpha, scale, sx, sy, flare });
    h.image.setVisible(true);
    return h;
  }
  function tickHalos(dt) {
    for (const h of halos) {
      if (h.life <= 0) continue;
      h.life -= dt;
      const u = 1 - Math.max(0, h.life) / h.max;
      if (h.life <= 0) {
        h.image.setVisible(false);
        continue;
      }
      h.image.setVisible(!state.impactOn);
      const grow = h.flare ? 0.6 + u * 0.8 : 0.7 + easeOutCubic(u) * 0.6;
      h.image.setScale(h.scale * grow * h.sx, h.scale * (h.flare ? 1 - u * 0.6 : grow) * h.sy);
      h.image.setAlpha(h.alpha * (1 - u) ** 1.6);
    }
  }

  // speed lines and the visible shock ring
  const lineGfx = profile.speedLines ? keep(guard(() => scene.add.graphics().setDepth(9.56))) : null;
  const ringGfx = profile.shockwave ? keep(guard(() => scene.add.graphics().setDepth(9.53))) : null;
  ringGfx?.setBlendMode?.("ADD");
  function speedLines(x, y, { duration = 0.22, color = PALETTE.cream, inner = 170, count = 34 } = {}) {
    if (!lineGfx) return;
    lines = { t: 0, duration, x, y, color, inner, count, flip: 0, rays: null };
  }
  function drawLines(dt) {
    if (!lineGfx) return;
    lineGfx.clear();
    if (!lines) return;
    lines.t += dt;
    const u = lines.t / lines.duration;
    if (u >= 1) {
      lines = null;
      return;
    }
    // re-scatter every other render tick so the lines flicker like hand-drawn ones
    if (lines.flip++ % 2 === 0) {
      lines.rays = Array.from({ length: lines.count }, () => ({ a: Math.random() * Math.PI * 2, r: lines.inner * (1 + Math.random() * 0.9), w: 0.0035 + Math.random() * 0.0095, accent: Math.random() < 0.22 }));
    }
    const fade = u < 0.15 ? 1 : 1 - (u - 0.15) / 0.85;
    const reach = 1300;
    const frame = impact ? impact.frame : -1;
    lineGfx.setDepth(frame >= 0 ? 9.86 : 9.56);
    for (const ray of lines.rays) {
      const r0 = ray.r * (1 + u * 0.35);
      const ax = lines.x + Math.cos(ray.a) * r0,
        ay = lines.y + Math.sin(ray.a) * r0;
      const b1 = ray.a - ray.w,
        b2 = ray.a + ray.w;
      if (frame === 0) lineGfx.fillStyle(PALETTE.ink, 0.85);
      else if (frame === 1) lineGfx.fillStyle(PALETTE.cream, 0.85);
      else lineGfx.fillStyle(ray.accent ? lines.color : PALETTE.cream, (ray.accent ? 0.55 : 0.7) * fade);
      lineGfx.fillTriangle(ax, ay, lines.x + Math.cos(b1) * reach, lines.y + Math.sin(b1) * reach, lines.x + Math.cos(b2) * reach, lines.y + Math.sin(b2) * reach);
    }
  }
  let ring = null;
  function drawRing(dt) {
    if (!ringGfx) return;
    ringGfx.clear();
    if (!ring) return;
    ring.t += dt;
    const s = shockwave(ring.t, ring.duration);
    if (s.done) {
      ring = null;
      return;
    }
    ringGfx.lineStyle(2 + 6 * s.strength, ring.color, 0.5 * s.strength);
    ringGfx.strokeCircle(ring.x, ring.y, 18 + s.radius * ring.reach);
    ringGfx.lineStyle(1.5, PALETTE.white, 0.7 * s.strength);
    ringGfx.strokeCircle(ring.x, ring.y, 12 + s.radius * ring.reach * 0.82);
  }

  // where a world point sits on screen, as shader uv (the post pass samples y from the bottom)
  function toUv(x, y) {
    const view = cam?.worldView;
    const zoom = cam?.zoom || 1;
    const sx = view ? (x - view.x) * zoom : x;
    const sy = view ? (y - view.y) * zoom : y;
    return [sx / W, 1 - sy / H];
  }
  function shock(x, y, { push = 0.02, reach = 0.6, duration = 0.45, color = PALETTE.cream } = {}) {
    if (!profile.shockwave) return;
    state.center = toUv(x, y);
    state.shock = { t: 0, duration, push, reach };
    ring = { t: 0, duration: duration * 0.8, x, y, reach: reach * 330, color };
  }
  function chroma(peak, duration = 0.22, x, y) {
    if (!profile.chroma) return;
    if (x !== undefined) state.center = toUv(x, y);
    state.chroma = { t: 0, duration, peak };
  }
  function radial(peak, duration = 0.28) {
    if (!profile.radialBlur) return;
    state.radial = { t: 0, duration, peak };
  }

  // ---- impact frames: ink silhouettes on a cream field, then inverted --------------------------
  const field = profile.impactFrames ? keep(guard(() => scene.add.rectangle(W / 2, H / 2, W * 1.4, H * 1.4, PALETTE.cream, 1).setDepth(4.95).setVisible(false))) : null;
  function impactFrame(kind) {
    if (!field) return;
    impact = { t: 0, kind, frame: -2 };
  }
  // combat.js re-tints its fighters every frame after our update; the impact tint goes on after it
  const lateTint = () => guard(() => impact && applyImpactTint(impact.frame));
  if (field) scene.events?.on?.("postupdate", lateTint);
  function drawImpact(dt) {
    if (!impact || !field) return;
    const ko = impact.kind === "ko";
    // combat.js flashes the camera white on a K.O.: that white tick leads, the impact frames cut
    // through it, and the flash comes back as they end
    if (ko && cam?.flashEffect?.isRunning) {
      cam.flashEffect.reset?.();
      impact.reflash = true;
    }
    const frame = impactFrameAt(impact.t);
    impact.t += dt;
    if (frame === impact.frame) return applyImpactTint(frame);
    impact.frame = frame;
    if (frame < 0) return endImpact();
    // a flat two-tone graphic over everything: the field above the stage, effects and vignette,
    // the fighters' silhouettes above the field
    if (!impact.depths) {
      impact.depths = fighters.map((f) => f.sprite?.depth ?? 5);
      for (const f of fighters) f.sprite?.setDepth?.(9.9);
    }
    // POWER: cream field / ink bodies, then ink / cream. K.O.: red field / ink, then ink / cream.
    field.setFillStyle?.(frame === 0 ? (ko ? PALETTE.red : PALETTE.cream) : PALETTE.ink, 1);
    field.setDepth?.(9.8).setVisible(true);
    applyImpactTint(frame);
  }
  function endImpact() {
    field?.setVisible(false);
    fighters.forEach((f, i) => {
      f.sprite?.clearTint?.();
      if (impact?.depths) f.sprite?.setDepth?.(impact.depths[i]);
    });
    if (impact?.reflash) cam?.flash?.(90, 255, 244, 214);
    impact = null;
  }
  function applyImpactTint(frame) {
    if (frame < 0) return;
    for (const f of fighters) f.sprite?.setTintFill?.(frame === 0 ? PALETTE.ink : PALETTE.cream);
  }

  // ---- afterimages --------------------------------------------------------------------------------
  const ghosts = [];
  const trailWatch = fighters.map((f) => ({ x: f.x, y: f.y, cool: 0 }));
  function ghost(f, i) {
    const s = f.sprite;
    if (!s?.texture || !s.frame) return;
    let g = ghosts.find((o) => o.age >= o.life);
    if (!g) {
      if (ghosts.length >= 14) return;
      const image = keep(scene.add.image(0, 0, s.texture.key, s.frame.name).setVisible(false));
      image.setBlendMode?.("ADD");
      g = { image, age: 1, life: 0 };
      ghosts.push(g);
    }
    g.image
      .setTexture(s.texture.key, s.frame.name)
      .setOrigin(s.originX, s.originY)
      .setPosition(s.x, s.y)
      .setScale(s.scaleX, s.scaleY)
      .setFlipX(s.flipX)
      .setDepth(4.8)
      .setVisible(true);
    g.image.setTintFill?.(colors[i]);
    Object.assign(g, { age: 0, life: 0.3, start: 0.55 });
  }
  function tickTrails(dt, frozen) {
    for (const g of ghosts) {
      if (g.age >= g.life) continue;
      if (!frozen) g.age += dt;
      const a = trailAlpha(g.age, g.life, g.start);
      if (a <= 0) g.image.setVisible(false);
      else g.image.setAlpha(a);
    }
    if (!profile.trails || frozen || !(dt > 0)) return;
    fighters.forEach((f, i) => {
      const w = trailWatch[i];
      const vx = (f.x - w.x) / dt;
      w.x = f.x;
      w.y = f.y;
      w.cool -= dt;
      const m = f.attack;
      const swinging = m && (m.type === "special" || m.type === "heavy" || m.type === "heavyKick") && m.t < m.start + m.active + 0.04;
      const air = f.y < 440 && Math.abs(f.vy) > 120;
      const fast = Math.abs(vx) > 330 && Math.abs(vx) < 4000;
      if ((swinging || air || fast || f.launched) && w.cool <= 0 && scene.phase !== "intro") {
        w.cool = 0.05;
        ghost(f, i);
      }
    });
  }

  // ---- dynamic light ------------------------------------------------------------------------------
  const glows = fighters.map((f) => {
    if (!profile.light || !webgl) return null;
    return guard(() => {
      const fx = f.sprite?.preFX;
      if (!fx?.addGlow) return null;
      fx.setPadding?.(12);
      const glow = fx.addGlow(0xffffff, 0, 0, false, 0.1, 12);
      glow.active = false;
      return glow;
    });
  });
  const floor = profile.floorLight
    ? fighters.map(() => {
        const h = guard(() => keep(scene.add.image(0, FLOOR + 2, tex?.glow).setDepth(2.5).setVisible(false)));
        h?.setBlendMode?.("ADD");
        return h;
      })
    : [];
  const shotGlows = [];
  function tickLight() {
    // each light: x, y, colour, intensity
    const lights = [];
    fighters.forEach((f, i) => {
      const m = f.attack;
      if (m?.type === "special") {
        const charge = m.t < m.start ? 0.55 + 0.45 * (m.t / Math.max(0.01, m.start)) : Math.max(0, 1 - (m.t - m.start) / 0.35);
        if (charge > 0) lights.push({ x: f.x, y: f.y - 95, color: colors[i], k: freeze && freeze.owner === f ? 1 : charge, owner: i });
      }
    });
    const shots = scene.projectiles ?? [];
    shots.forEach((s, j) => {
      const i = s.index ?? fighters.indexOf(s.owner);
      lights.push({ x: s.x, y: s.y, color: colors[i] ?? PALETTE.gold, k: 0.85, shot: true });
      if (!profile.halos || !tex?.glow) return;
      let g = shotGlows[j];
      if (!g) {
        g = keep(scene.add.image(0, 0, tex.glow).setDepth(9.49));
        g.setBlendMode?.("ADD");
        shotGlows[j] = g;
      }
      const flick = 0.85 + Math.sin(clock * 40 + j) * 0.08;
      g.setVisible(true).setPosition(s.x, s.y).setTint?.(colors[i] ?? PALETTE.gold);
      g.setScale(1.5 * flick, 1.1 * flick).setAlpha(0.75);
    });
    for (let j = shots.length; j < shotGlows.length; j++) shotGlows[j]?.setVisible(false);
    // rim light on each fighter from the brightest light near them
    fighters.forEach((f, i) => {
      let best = null,
        bestK = 0;
      for (const l of lights) {
        const k = l.owner === i ? l.k * 1.0 : l.k * lightFalloff(Math.hypot(l.x - f.x, l.y - (f.y - 95)), 380) * 0.75;
        if (k > bestK) [best, bestK] = [l, k];
      }
      const glow = glows[i];
      if (glow) {
        glow.active = bestK > 0.02;
        if (best) glow.color = best.color;
        glow.outerStrength = bestK * (best?.owner === i ? 5 : 3.2);
        glow.innerStrength = bestK * 0.6;
      }
      const fl = floor[i];
      if (fl && tex?.glow) {
        // the floor brightens under whoever is lit, or under a passing shot
        const src = best;
        if (src && bestK > 0.03) {
          const fx = src.shot ? src.x : f.x;
          fl.setVisible(true).setPosition(fx, FLOOR + 2).setTint?.(src.color);
          fl.setScale(3.4, 0.42).setAlpha(Math.min(0.7, bestK * 0.7));
        } else fl.setVisible(false);
      }
    });
  }

  // ---- the POWER cut-in (an overlay scene, so the post pass never touches the band) --------------
  const busts = fighters.map((f, i) => `mvm-vfx-bust-${uid}-${i}`);
  let overlay = null;
  let band = null;
  if (profile.cutIn && scene.scene?.add && Phaser?.Scene)
    guard(() => {
      fighters.forEach((f, i) => {
        const src = f.c?.bust || f.c?.portrait;
        if (src && scene.load?.image) scene.load.image(busts[i], src);
      });
      scene.load?.start?.();
      const key = `mvm-vfx-overlay-${uid}`;
      class Overlay extends Phaser.Scene {
        constructor() {
          super({ key });
        }
        create() {
          overlay = this;
        }
      }
      scene.scene.add(key, Overlay, true);
      state.overlayKey = key;
    });

  // the HUD's POWER callout (DOM) would sit on top of the band; it waits until the band has gone
  const callout = guard(() => scene.sys?.game?.canvas?.parentElement?.querySelector?.(".mvm-power-callout")) ?? null;
  function hideCallout(hidden) {
    if (callout?.style) callout.style.visibility = hidden ? "hidden" : "";
  }
  function buildBand(owner) {
    const o = overlay;
    if (!o?.add) return null;
    const i = fighters.indexOf(owner);
    const dir = i === 1 ? -1 : 1;
    const color = colors[i];
    const c = o.add.container(W / 2, H / 2 + 4).setRotation(-0.105 * dir);
    const parts = {};
    parts.dim = o.add.rectangle(W / 2, H / 2, W, H, PALETTE.ink, webgl ? 0 : 0.5).setDepth(-2);
    parts.lines = o.add.graphics().setDepth(-1);
    const add = (obj) => (c.add(obj), obj);
    add(o.add.rectangle(0, 0, 1600, 176, PALETTE.ink, 0.94));
    const hazeKey = tex?.glow;
    if (hazeKey) {
      parts.haze = add(o.add.image(-dir * 250, 0, hazeKey).setScale(6.5, 1.6).setTint(color).setAlpha(0.7));
      parts.haze.setBlendMode?.("ADD");
    }
    // the bust, cropped to a strip through the eyes
    if (o.textures.exists(busts[i])) {
      const img = o.add.image(-dir * 245, 0, busts[i]);
      const fw = img.width || 768,
        fh = img.height || 768;
      const top = fh * 0.33,
        rows = fh * 0.4;
      const scale = 168 / rows;
      img.setScale(scale).setFlipX(dir < 0);
      img.setCrop(0, top, fw, rows);
      img.y = -(top + rows / 2 - fh / 2) * scale;
      parts.bust = add(img);
    }
    // edge stripes: the fighter's colour over gold over red
    add(o.add.rectangle(0, -84, 1600, 10, color, 1));
    add(o.add.rectangle(0, 85, 1600, 5, PALETTE.gold, 1));
    add(o.add.rectangle(0, 93, 1600, 3, PALETTE.red, 1));
    // a light sweep across the band
    parts.shine = add(o.add.rectangle(0, 0, 46, 210, PALETTE.white, 0.22).setRotation(0.38));
    parts.shine.setBlendMode?.("ADD");
    const name = String(owner.c?.move || "POWER").toUpperCase();
    const textX = dir * 150;
    parts.eyebrow = add(
      o.add
        .text(textX, -46, `${String(owner.c?.name || "").toUpperCase()}  ·  POWER`, { fontFamily: "Impact, 'Arial Narrow', sans-serif", fontSize: "20px", color: "#edbb57", fontStyle: "bold" })
        .setOrigin(0.5)
        .setLetterSpacing?.(6),
    );
    const big = o.add
      .text(textX, 12, name, { fontFamily: "Impact, 'Arial Narrow', sans-serif", fontSize: name.length > 16 ? "52px" : "64px", color: "#fff1cf", fontStyle: "italic bold", stroke: "#0b0a12", strokeThickness: 8 })
      .setOrigin(0.5);
    big.setShadow?.(5, 5, `#${color.toString(16).padStart(6, "0")}`, 0, true, false);
    parts.name = add(big);
    c.setDepth(1);
    return { c, parts, dir, color, owner, i };
  }
  function tickBand(t) {
    if (!band) return;
    const p = cutInPhase(t);
    const { c, parts, dir } = band;
    if (p.phase === "done") {
      for (const obj of [c, parts.dim, parts.lines]) obj?.destroy?.();
      band = null;
      hideCallout(false);
      return;
    }
    hideCallout(true);
    c.x = W / 2 + p.slide * dir * 1250 + (p.phase === "hold" ? dir * 22 * p.k : p.phase === "out" ? dir * 22 : 0);
    c.scaleY = p.open;
    c.alpha = p.phase === "out" ? 1 - p.k * 0.4 : 1;
    if (parts.dim) parts.dim.alpha = webgl ? 0 : 0.5 * p.dim;
    if (parts.shine) parts.shine.x = -dir * 700 + dir * 1400 * clamp01(t / CUT_IN.total);
    if (parts.name) parts.name.x = dir * (150 + (p.phase === "hold" ? -26 * p.k : p.phase === "out" ? -26 : 0));
    // speed lines from the fighter, behind the band
    const g = parts.lines;
    if (g) {
      g.clear();
      const f = band.owner;
      const view = cam?.worldView;
      const zoom = cam?.zoom || 1;
      const ox = view ? (f.x - view.x) * zoom : f.x,
        oy = view ? (f.y - 95 - view.y) * zoom : f.y - 95;
      const fade = p.dim;
      for (let k = 0; k < 40; k++) {
        const a = Math.random() * Math.PI * 2,
          w = 0.004 + Math.random() * 0.014,
          r0 = 90 + Math.random() * 120;
        g.fillStyle(k % 4 === 0 ? band.color : PALETTE.cream, 0.4 * fade);
        g.fillTriangle(ox + Math.cos(a) * r0, oy + Math.sin(a) * r0, ox + Math.cos(a - w) * 1300, oy + Math.sin(a - w) * 1300, ox + Math.cos(a + w) * 1300, oy + Math.sin(a + w) * 1300);
      }
    }
  }

  // ---- sparks --------------------------------------------------------------------------------------
  function burst(x, y, { tier = 1, block = false, power = false, counter = false, color, face = 1 }) {
    const b = sparkBudget(tier, { block, power, counter, cap: profile.sparkCap });
    const em = block ? emitters.block : power ? emitters.power : tier >= 3 || counter ? emitters.heavy : emitters.light;
    if (em && b.streaks) {
      // most of the spray goes the way the blow travels
      const spread = power ? 180 : 70;
      const base = face < 0 ? 180 : 0;
      em.setEmitterAngle?.({ min: base - spread, max: base + spread });
      em.explode(Math.ceil(b.streaks * 0.7), x, y);
      em.setEmitterAngle?.({ min: 0, max: 360 });
      em.explode(Math.floor(b.streaks * 0.3), x, y);
    }
    if (emitters.embers && b.embers) {
      emitters.embers.setParticleTint?.(power || counter ? color : PALETTE.gold);
      emitters.embers.explode(b.embers, x, y);
    }
  }

  // ---- hooks ------------------------------------------------------------------------------------------
  const api = {
    profile,
    webgl,
    get holding() {
      return Boolean(freeze);
    },
    /** A snapshot of what is playing (for QA scripts and tests). */
    get debug() {
      return { freeze: freeze?.t ?? null, band: Boolean(band), impact: impact ? impact.frame : null, lines: Boolean(lines), shock: state.shock?.t ?? null, chroma: state.chroma?.t ?? null, pipeline: Boolean(pipe), overlay: Boolean(overlay), ghosts: ghosts.filter((g) => g.age < g.life).length };
    },
    /** A POWER started: freeze the world for the cut-in (full tier only). */
    onPower(f) {
      guard(() => {
        if (!profile.freeze || destroyed || !f || clock - lastFreeze < 0.6) return;
        const i = fighters.indexOf(f);
        if (i < 0) return;
        freeze = { t: 0, owner: f };
        lastFreeze = clock;
        band = buildBand(f);
        state.center = toUv(f.x, f.y - 95);
        if (profile.halos) halo(f.x, f.y - 95, { scale: 2.6, color: colors[i], alpha: 0.9, life: CUT_IN.total + 0.1 });
      });
    },
    /** A strike connected or was blocked. */
    onHit({ attacker: f, defender: e, move: m = {}, outcome = {}, blocking = false } = {}) {
      guard(() => {
        if (destroyed || !f || !e) return;
        const power = m.type === "special";
        const face = m.face ?? f.face ?? 1;
        const x = m.projectile ? e.x - face * 22 : (f.x + e.x) / 2;
        const y = Math.min(f.y, e.y) - 90;
        const tier = power ? 4 : m.tier ?? 1;
        const counter = Boolean(outcome.counter) && !blocking;
        const i = fighters.indexOf(f);
        const color = colors[i] ?? PALETTE.gold;
        burst(x, y, { tier, block: blocking, power, counter, color, face });
        // bloom you can see: a hot core, plus an anamorphic flare on the big ones
        halo(x, y, { scale: blocking ? 0.7 : 0.75 + tier * 0.28, color: blocking ? 0xdff3ff : PALETTE.cream, alpha: blocking ? 0.6 : 0.95, life: 0.16 + tier * 0.03 });
        if (!blocking && (tier >= 3 || counter)) halo(x, y, { flare: true, scale: power ? 1.1 : 0.75, sx: 2.4, sy: 2.2, color: power ? color : PALETTE.gold, alpha: 0.85, life: 0.22 });
        if (power) halo(x, y, { scale: 3.2, color, alpha: 0.55, life: 0.4, depth: 9.48 });
        if (blocking) return;
        const heavy = power || counter || tier >= 3;
        if (!heavy) return;
        chroma(power ? 1 : counter ? 0.8 : 0.5, power ? 0.26 : 0.18, x, y);
        shock(x, y, { push: power ? 0.026 : counter ? 0.018 : 0.012, reach: power ? 0.75 : 0.45, duration: power ? 0.5 : 0.36, color: power ? color : PALETTE.cream });
        speedLines(x, y, { duration: power ? 0.3 : 0.18, color, inner: power ? 230 : 260, count: power ? 64 : 44 });
        if (power) {
          radial(0.8, 0.3);
          impactFrame("power");
        }
      });
    },
    /** A round ended (combat.js finishRound). */
    onRoundEnd({ winner, loser, ko } = {}) {
      guard(() => {
        if (destroyed || !ko || !loser) return;
        const x = loser.x,
          y = loser.y - 95;
        const i = fighters.indexOf(winner);
        const color = colors[i] ?? PALETTE.gold;
        impactFrame("ko");
        chroma(1.25, 0.42, x, y);
        shock(x, y, { push: 0.034, reach: 1.0, duration: 0.7, color });
        radial(0.7, 0.5);
        speedLines(x, y, { duration: 0.5, color, inner: 220, count: 72 });
        burst(x, y, { tier: 4, power: true, color, face: winner?.face ?? 1 });
        halo(x, y, { scale: 2.6, color: PALETTE.cream, alpha: 0.6, life: 0.45, depth: 9.48 });
        halo(x, y, { flare: true, scale: 1.4, sx: 2.6, sy: 2.6, color, alpha: 0.9, life: 0.4 });
      });
    },
    /**
     * Every frame, before the simulation. Returns true while the POWER cut-in holds the world
     * (combat.js then skips the frame exactly like a pause).
     */
    update(dt = 0) {
      if (destroyed) return false;
      return Boolean(
        guard(() => {
          clock += dt;
          if (pipe) pipe.time = clock;
          let holding = false;
          if (freeze) {
            freeze.t += dt;
            if (!band && overlay && freeze.t < CUT_IN.in) band = buildBand(freeze.owner);
            tickBand(freeze.t);
            state.dim = cutInPhase(freeze.t).dim;
            if (freeze.t >= CUT_IN.total) {
              const f = freeze.owner;
              freeze = null;
              state.dim = 0;
              // the release: a burst of light and a ripple off the fighter
              shock(f.x, f.y - 95, { push: 0.014, reach: 0.5, duration: 0.4, color: colors[fighters.indexOf(f)] });
              chroma(0.45, 0.16);
            } else holding = true;
          }
          const frozen = holding || (scene.hitstop ?? 0) > 0;
          for (const k of ["shock", "chroma", "radial"]) {
            const s = state[k];
            if (!s) continue;
            s.t += dt;
            if (s.t >= s.duration) state[k] = null;
          }
          state.impactOn = Boolean(impact && impact.frame >= 0);
          if (pipe) pipe.u = shaderUniforms(state, profile);
          tickHalos(dt);
          drawLines(dt);
          drawRing(dt);
          drawImpact(dt);
          tickTrails(dt, frozen);
          if (profile.light || profile.halos) tickLight();
          return holding;
        }),
      );
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      guard(() => {
        if (pipe) cam?.removePostPipeline?.(PIPELINE);
      });
      guard(() => scene.events?.off?.("postupdate", lateTint));
      fighters.forEach((f, i) => guard(() => glows[i] && f.sprite?.preFX?.remove?.(glows[i])));
      for (const obj of made) guard(() => obj?.destroy?.());
      made.length = 0;
      guard(() => band?.c?.destroy?.());
      guard(() => hideCallout(false));
      guard(() => state.overlayKey && scene.scene?.remove?.(state.overlayKey));
      band = null;
      overlay = null;
      pipe = null;
    },
  };
  if (typeof location !== "undefined" && /[?&]vfxqa\b/.test(location.search ?? "")) globalThis.__mvmVfx = { scene, api, state };
  return api;
}
