// Pixel effects for a fight: it watches the scene (attacks starting, POWERs charging, shots in
// flight, guards, meters, knockdowns) and gets told about hits and round ends. Which effect plays
// where comes from src/fx-map.js; the drawing is src/pixelfx.js, on three Phaser canvas textures.
import { createPixelStage, actorFromImage, fxModule, loadFx, preloadFx, rampFrom, PIXEL_SCALE } from "./pixelfx.js";
import { powerFxFor, guardFxFor, SMEAR_FX, HIT_FX, MATCH_FX, ARENA_FX } from "./fx-map.js";

const S = PIXEL_SCALE;
const FLOOR = 450;
const DEPTHS = { weather: 3.4, life: 3.6, under: 4.5, over: 9.5 };
const ALPHA = { weather: 0.85, life: 0.8, under: 1, over: 1 };

/** "full" on desktops, "lite" on phones, unless the player chose (settings.pixelFx). */
export function pixelQuality(settings = {}) {
  if (settings.pixelFx === "full" || settings.pixelFx === "lite" || settings.pixelFx === "off") return settings.pixelFx;
  let coarse = false;
  try {
    coarse = matchMedia("(pointer:coarse)").matches;
  } catch {}
  return settings.reducedMotion || coarse ? "lite" : "full";
}

// Where an effect wants to sit: ground effects at the feet, the rest at chest height.
function grounded(mod) {
  const m = mod?.meta;
  if (!m?.origin || !m?.size) return true;
  return m.actor ? true : m.origin[1] >= m.size[1] * 0.68;
}

export function createCombatFx({ scene, settings = {}, arena, mode, reducedMotion = settings.reducedMotion }) {
  const quality = pixelQuality(settings);
  if (quality === "off" || !scene?.textures?.addCanvas) return null;
  const stage = createPixelStage({ quality });
  const uid = `pfx${Math.random().toString(36).slice(2, 8)}`;
  const textures = {};
  const images = {};
  for (const l of stage.layers) {
    if (!l.canvas) continue;
    const key = `${uid}-${l.name}`;
    textures[l.name] = scene.textures.addCanvas(key, l.canvas);
    images[l.name] = scene.add
      .image(0, 0, key)
      .setOrigin(0, 0)
      .setScale(960 / l.w)
      .setDepth(DEPTHS[l.name])
      .setAlpha(ALPHA[l.name] ?? 1)
      .setVisible(false);
  }
  // critters and props live on the finer 480×270 grid; the map gives them in 320×180 units
  const LIFE = 480 / 320;
  const fighters = scene.fighters;
  const kits = fighters.map((f) => powerFxFor(f.c));
  const tints = fighters.map((f) => rampFrom(f.c.color));
  const ambient = ARENA_FX[arena?.id] ?? null;
  const watch = fighters.map(() => ({ attack: null, guardT: 0, guardFx: null, hp: 100, energy: 0, down: false, combo: 0, danger: false, dizzy: false }));
  const shots = new WeakMap();
  const actors = new Map();
  let weather = null,
    weatherId = null,
    trialStatus = null,
    roundsSeen = 0,
    destroyed = false;

  // Warm the modules a match will need so the first hit is not a frame late.
  preloadFx([
    ...kits.flatMap((k) => Object.values(k)),
    ...Object.values(SMEAR_FX),
    ...Object.values(HIT_FX),
    ...Object.values(MATCH_FX),
    ...fighters.map((f) => guardFxFor(f.c)),
    ...(ambient && quality === "full" ? [...ambient.weather, ...ambient.critters.map((c) => c.id), ...ambient.props.map((p) => p.id), ambient.landing] : []),
  ]);

  // ---- positions -----------------------------------------------------------------------------
  const feet = (f) => ({ x: f.x / S, y: Math.min(FLOOR, f.y) / S });
  const chest = (f) => ({ x: f.x / S, y: (f.y - 95) / S });
  const head = (f) => ({ x: f.x / S, y: (f.y - 185) / S });
  const flipOf = (f) => f.face < 0;

  // The fighter's current frame as a pixelfx actor, so status effects wrap the real silhouette.
  function actorOf(f) {
    const sprite = f.sprite;
    const frame = sprite?.frame;
    const image = sprite?.texture?.getSourceImage?.();
    if (!frame || !image) return undefined;
    const key = `${sprite.texture.key}:${frame.name}`;
    if (actors.has(key)) return actors.get(key);
    const actor = actorFromImage(image, {
      sx: frame.cutX,
      sy: frame.cutY,
      sw: frame.cutWidth,
      sh: frame.cutHeight,
      anchorX: (sprite.originX ?? 0.5) * frame.cutWidth,
      anchorY: (sprite.originY ?? 1) * frame.cutHeight,
      scale: Math.abs(sprite.scaleX || 1),
    });
    if (actors.size > 60) actors.clear();
    actors.set(key, actor || undefined);
    return actor || undefined;
  }

  function spawn(id, o = {}) {
    if (!id) return null;
    return stage.spawn(id, { frozen: true, ...o });
  }
  // On a fighter: placed at feet, chest or head, optionally riding along with them.
  function on(f, id, { at = "auto", follow = false, life, tint = false, ...o } = {}) {
    if (!id) return null;
    const mod = fxModule(id);
    const where = at === "auto" ? (grounded(mod) ? feet : chest) : at === "feet" ? feet : at === "head" ? head : chest;
    const p = where(f);
    const actor = mod?.meta?.actor || o.actor ? actorOf(f) : undefined;
    const opts = { ...p, flip: o.flip ?? flipOf(f), ...(actor ? { actor } : {}), ...(tint ? { palette: tints[fighters.indexOf(f)] } : {}), life, ...o };
    if (follow) opts.follow = () => ({ ...where(f), flip: o.flip ?? flipOf(f) });
    return spawn(id, opts);
  }
  // In front of a fighter, facing the way they face.
  function ahead(f, id, { dx = 14, tint = false, ...o } = {}) {
    if (!id) return null;
    const mod = fxModule(id);
    const p = grounded(mod) ? feet(f) : chest(f);
    return spawn(id, { x: p.x + f.face * dx, y: p.y, flip: flipOf(f), ...(tint ? { palette: tints[fighters.indexOf(f)] } : {}), ...o });
  }

  // ---- arena ambience ------------------------------------------------------------------------
  function setWeather(final) {
    if (!ambient || quality !== "full" || reducedMotion) return;
    const id = ambient.weather[final ? 1 : 0] ?? null;
    if (id === weatherId) return;
    weather?.stop();
    weather = null;
    weatherId = id;
    if (!id) return;
    // full-frame weather is placed by its own origin so it fills the 320×180 frame exactly
    loadFx(id).then((mod) => {
      if (!mod || weatherId !== id || destroyed) return;
      const [x, y] = mod.meta?.origin ?? [160, 180];
      weather = stage.spawn(id, { layer: "weather", x, y, ...(ambient.weatherPalette ? { palette: ambient.weatherPalette } : {}) });
    });
  }
  function startAmbience() {
    if (!ambient || quality !== "full" || reducedMotion) return;
    // weather origins sit at the bottom middle of their 320×180 frame
    for (const c of ambient.critters) stage.spawn(c.id, { layer: "life", x: c.x * LIFE, y: c.y * LIFE, flip: c.x > 160 });
    for (const p of ambient.props) stage.spawn(p.id, { layer: "life", x: p.x * LIFE, y: p.y * LIFE, flip: p.x > 160, light: 0.7 });
  }

  // ---- watching the fight ----------------------------------------------------------------------
  function watchFighter(f, i, dt) {
    const w = watch[i];
    const kit = kits[i];
    const enemy = fighters[1 - i];
    const m = f.attack;
    if (m !== w.attack) {
      w.attack = m;
      if (m && w.down) m._pfxWakeup = true;
      if (m?.type === "special") w.charge = on(f, kit.charge, { follow: true, life: m.start + 0.15, tint: kit.tint });
    }
    if (m && !m._pfxActive && m.t >= m.start) {
      m._pfxActive = true;
      if (m.type === "special") {
        w.charge?.stop();
        if (kit.release) {
          const self = fxModule(kit.release)?.meta?.actor;
          if (self) on(f, kit.release, { follow: true, life: 0.9 });
          else ahead(f, kit.release, { dx: 18, life: 1.1, tint: kit.tint });
        }
      } else {
        const smear =
          m.type === "throw"
            ? null
            : m.air
              ? SMEAR_FX.air
              : m._pfxWakeup
                ? SMEAR_FX.wakeup
                : m.type === "kick" && (m.crouch || m.height === "low")
                  ? SMEAR_FX.lowKick
                  : SMEAR_FX[m.type];
        if (smear) {
          const p = m.crouch || m.height === "low" ? feet(f) : chest(f);
          spawn(smear, { x: p.x + f.face * 6, y: p.y - (m.crouch ? 6 : 4), flip: flipOf(f), tier: "core" });
        }
      }
    }
    // guard aura after a beat of holding guard
    if (f.guard && !f.attack) {
      w.guardT += dt;
      const aura = guardFxFor(f.c);
      if (aura && w.guardT > 0.25 && !w.guardFx) w.guardFx = on(f, aura, { follow: true, at: "feet", tier: "extra" });
    } else {
      w.guardT = 0;
      w.guardFx?.stop();
      w.guardFx = null;
    }
    // knockdown and landings
    const down = f.down > 0;
    if (down && !w.down) {
      on(f, f.launchedBy ? HIT_FX.launchLanding : HIT_FX.knockdown, { at: "feet", life: 1.4 });
      f.launchedBy = null;
    }
    w.down = down;
    // meter crosses the POWER line
    if (w.energy < 35 && f.energy >= 35 && mode !== "training") on(f, MATCH_FX.powerReady, { at: "head", follow: true, life: 1.1, tier: "extra" });
    w.energy = f.energy;
    // health drops into the red: the bar flashes over their head and they get angry
    if (!w.danger && f.hp > 0 && f.hp <= 25 && mode !== "training") {
      w.danger = true;
      on(f, MATCH_FX.danger, { at: "head", y: head(f).y - 6, from: Math.min(1, w.hp / 100), to: f.hp / 100, life: 1.8, follow: false });
      on(f, MATCH_FX.rage, { follow: true, life: 2.4 });
    }
    w.hp = f.hp;
    // a long combo leaves the defender seeing stars
    if (f.comboHits >= 5 && !w.dizzy) {
      w.dizzy = true;
      on(f, MATCH_FX.dizzy, { follow: true, life: 1.4 });
    }
    if (!f.comboHits) w.dizzy = false;
    // the rival's combo counter (the HUD already counts player one's): at 3 hits and every 2 after
    const combo = enemy.comboHits ?? 0;
    if (combo >= 3 && combo !== w.combo && combo % 2 === 1) {
      w.combo = combo;
      if (i === 1 && mode !== "local") on(f, MATCH_FX.combo, { at: "head", y: head(f).y - 10, count: combo, life: 1.3, flip: false, tier: "extra" });
    }
    if (!combo) w.combo = 0;
  }

  function watchShots() {
    const live = new Set(scene.projectiles ?? []);
    for (const shot of live) {
      if (shots.has(shot)) continue;
      const i = shot.index ?? fighters.indexOf(shot.owner);
      const kit = kits[i] ?? {};
      const id = kit.projectile || "projectiles/plasma-shot";
      const handle = spawn(id, {
        x: shot.x / S,
        y: shot.y / S,
        flip: shot.face < 0,
        follow: () => ({ x: shot.x / S, y: shot.y / S }),
        ...(kit.tint ? { palette: tints[i] } : {}),
      });
      shots.set(shot, handle);
    }
    for (const f of fighters)
      for (const s of f._pfxShots ?? []) if (!live.has(s)) shots.get(s)?.stop();
    for (const f of fighters) f._pfxShots = [...live].filter((s) => s.owner === f);
  }

  // ---- what combat tells us ----------------------------------------------------------------------
  const api = {
    stage,
    get active() {
      return true;
    },
    /** A strike connected (or was blocked). */
    hit({ attacker: f, defender: e, move: m, outcome = {}, blocking, damage = 0, projectile = false, index }) {
      const p = { x: (f.x + e.x) / 2 / S, y: (Math.min(f.y, e.y) - 90) / S };
      const kit = kits[index ?? fighters.indexOf(f)];
      if (blocking) {
        if (projectile) spawn(HIT_FX.blockShot, { ...p, flip: f.face < 0 });
        else if (m.type === "special") on(e, HIT_FX.guardPower, { at: "chest", flip: e.face < 0 });
        else on(e, HIT_FX.block, { flip: e.face < 0 });
        return;
      }
      const special = m.type === "special";
      if (special) {
        if (projectile) spawn(HIT_FX.shot, { ...p, flip: f.face < 0, tier: "extra" });
        const mod = fxModule(kit.impact);
        const at = grounded(mod) ? feet(e) : chest(e);
        spawn(kit.impact, { ...at, flip: flipOf(f), life: 1.6, ...(kit.tint ? { palette: tints[fighters.indexOf(f)] } : {}), ...(mod?.meta?.actor ? { actor: actorOf(e) } : {}) });
        if (kit.status && e.hp > 0) on(e, kit.status, { follow: true, life: 1.6 });
        if (m.lift) e.launchedBy = m;
      } else if (outcome.throw) {
        spawn(HIT_FX.throw, { ...p, flip: flipOf(f) });
        spawn(SMEAR_FX.throw, { ...chest(f), flip: flipOf(f) });
      } else {
        spawn(outcome.counter ? HIT_FX.counter : HIT_FX[m.tier >= 3 ? "heavy" : m.tier >= 2 ? "medium" : "light"] ?? HIT_FX.light, { ...p, flip: flipOf(f) });
        if (m.height === "overhead" && m.type === "heavyKick") spawn(SMEAR_FX.overhead, { ...chest(f), flip: flipOf(f), tier: "extra" });
        if ((f.combo ?? 0) >= 4 || outcome.comboHits >= 4) spawn(SMEAR_FX.flurry, { ...chest(f), x: chest(f).x + f.face * 10, flip: flipOf(f), tier: "extra" });
      }
      if (m.tier >= 3 || special) on(e, HIT_FX.flash, { flip: e.face < 0, life: 0.5 });
      if (outcome.counter) {
        on(e, MATCH_FX.crit, { at: "head", y: head(e).y - 4, text: `${Math.round(damage)}!`, label: "COUNTER", flip: false, tier: "extra" });
        on(e, MATCH_FX.surprise, { flip: e.face < 0, tier: "extra" });
      } else if (damage >= 1) on(e, MATCH_FX.damage, { at: "head", x: head(e).x + (Math.random() * 10 - 5), text: `-${Math.round(damage)}`, flip: false, tier: "extra" });
      // meter flows back to the attacker now and then
      if (!special && (f.combo ?? 0) % 3 === 2) {
        const from = chest(e),
          to = chest(f);
        spawn(MATCH_FX.meter, { ...from, velocity: [(to.x - from.x) / 0.5, (to.y - from.y) / 0.5 - 20], life: 0.5, tier: "extra" });
      }
    },
    /** A round ended. */
    roundEnd({ winner, loser, ko, perfect, matchOver, finalBlow }) {
      if (!winner) {
        const [a, b] = fighters;
        spawn(MATCH_FX.draw, { x: (a.x + b.x) / 2 / S, y: (FLOOR - 90) / S, life: 1.6 });
        return;
      }
      const wi = fighters.indexOf(winner);
      const kit = kits[wi];
      const power = finalBlow?.type === "special";
      if (!ko) on(loser, MATCH_FX.timeUp, { follow: true, life: 2.4 });
      if (ko && power && !reducedMotion) spawn(HIT_FX.koFrame, { x: 160, y: 90, flip: winner.face < 0, frozen: false });
      on(winner, matchOver ? MATCH_FX.matchWon : MATCH_FX.roundWon, { at: "head", follow: true, life: 2.4, frozen: false });
      on(loser, MATCH_FX.roundLost, { at: "head", y: head(loser).y - 8, life: 1.5, frozen: false });
      if (!matchOver) return;
      if (perfect && !reducedMotion) spawn(MATCH_FX.perfect, { ...feet(loser), life: 2.6, frozen: false });
      // the deciding blow: the winner's flourish lands on the loser, then the loser's exit
      if (ko && kit.finisher && quality === "full") {
        const mod = fxModule(kit.finisher);
        const target = mod?.act?.target?.x ?? mod?.act?.targets?.[0]?.x ?? 60;
        const firstHit = mod?.act?.hits?.[0]?.t ?? 0.4;
        spawn(kit.finisher, { x: loser.x / S - winner.face * target, y: FLOOR / S, flip: winner.face < 0, skip: Math.max(0, firstHit - 0.45), life: 2.6, frozen: false });
      }
      const exit = ko && power ? (kit.ko ?? MATCH_FX.powerKo) : MATCH_FX.knockedOut;
      on(loser, exit, { life: 2.6, frozen: false, delay: 0.35 });
    },
    /** A round is about to start. round: 0-based; lastLoser: who lost the round before. */
    roundStart({ round, final, lastLoser }) {
      roundsSeen++;
      stage.clear(true, (i) => i.kind === "combat");
      setWeather(final);
      if (round === 0 && roundsSeen === 1) {
        startAmbience();
        fighters.forEach((f, i) => {
          const entrance = f.c.shadow || (i === 1 && scene.shadowFinal) ? MATCH_FX.shadowEntrance : kits[i].entrance;
          on(f, entrance, { at: "feet", life: 1.8, delay: 0.1 + i * 0.25, tint: kits[i].tint });
        });
      } else if (lastLoser) on(lastLoser, final ? MATCH_FX.comeback : MATCH_FX.blessing, { at: "feet", follow: true, life: 2, frozen: false });
      watch.forEach((w) => Object.assign(w, { danger: false, dizzy: false, combo: 0, hp: 100, down: false, guardFx: null, attack: null }));
    },
    trainingReset(player) {
      on(player, MATCH_FX.trainingReset, { at: "feet", life: 1.6 });
    },
    dummyReset(dummy) {
      on(dummy, MATCH_FX.dummyReset, { at: "head", life: 1.4 });
    },
    landing(f) {
      if (ambient?.landing && quality === "full") on(f, ambient.landing, { at: "feet", life: 1, tier: "extra" });
    },
    /** Every frame. frozen: hitstop is on. */
    tick(dt, { frozen = false } = {}) {
      if (scene.phase === "fight" || scene.phase === "result") {
        fighters.forEach((f, i) => watchFighter(f, i, dt));
        watchShots();
      }
      const trial = scene.training?.trial;
      if (mode === "training" && trial && trial.status !== trialStatus) {
        if (trial.status === "pass") on(fighters[0], MATCH_FX.trialPass, { at: "head", y: head(fighters[0]).y - 16, text: "TRIAL PASS", flip: false, life: 2.4 });
        trialStatus = trial.status;
      }
      stage.update(dt, { frozen });
      for (const layer of stage.render()) {
        textures[layer]?.refresh?.();
        images[layer]?.setVisible?.(stage.visible(layer));
      }
    },
    destroy() {
      destroyed = true;
      stage.destroy();
      actors.clear();
    },
  };
  return api;
}
