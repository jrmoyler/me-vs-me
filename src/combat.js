import Phaser from "phaser";
import { motionFrame } from "./motion.js";
import {
  MOVES,
  moveFrame,
  moveName,
  movePhase,
  kitFor,
  TRIAL_SEQUENCE,
  freshTrial,
  trialHit,
  trialDrop,
  buildKeyMap,
  bindingsFor,
  keyLabel,
} from "./moves.js";
import { paintAtmosphere, paintPower, paintProjectile } from "./stage-effects.js";
import {
  SPECIAL_COST,
  KNOCKDOWN_TIME,
  LAUNCH_POP,
  JUGGLE_LIMIT,
  createAttack,
  cancelAttack,
  canBeHit,
  freshFighterState,
  inMeleeRange,
  hitOutcome,
  roundOutcome,
  AI_PROFILES,
  AIR_LAND_COOLDOWN,
  ANTI_AIR_RANGE,
  CANCEL_ROUTE,
  PUNISH_WINDOW,
  PROJECTILE_CAP,
  SPARK_CAP,
  WAKEUP_REVERSALS,
  hitstopFor,
  impactPulse,
  throwRange,
  wakeupWindow,
} from "./combat-rules.js";
import { createTouchController } from "./controller.js";

const CSS = `
.mvm-combat{position:relative;width:100%;height:100%;min-height:300px;background:#080914;overflow:hidden;isolation:isolate}.mvm-combat canvas{display:block;width:100%;height:100%;object-fit:contain}.mvm-hud{position:absolute;inset:16px 3% auto;display:grid;grid-template-columns:1fr 72px 1fr;gap:14px;pointer-events:none;font-family:inherit;color:white;text-shadow:0 2px #000}.mvm-hud-name{font-size:clamp(10px,1.7vw,19px);font-weight:900;letter-spacing:.07em;margin-bottom:5px;text-transform:uppercase}.mvm-hud-right{text-align:right}.mvm-health{height:20px;border:3px solid #f6e0a0;background:#542a37;box-shadow:0 3px #000}.mvm-health>i{display:block;height:100%;background:linear-gradient(#fff292,#edb42a);transition:width .12s}.mvm-hud-right .mvm-health>i{margin-left:auto}.mvm-energy{height:5px;background:#27293c;margin-top:5px}.mvm-energy>i{display:block;height:100%;background:#7cecde;transition:width .1s}.mvm-rounds{font-size:15px;color:#ffd96b;letter-spacing:6px;margin-top:3px}.mvm-clock{font-size:36px;text-align:center;font-weight:950;color:#ffdf74;line-height:1}.mvm-clock small{display:block;font-size:9px;color:white;letter-spacing:2px;margin-bottom:4px}.mvm-pause-button{position:absolute;right:12px;bottom:13px;z-index:4;border:1px solid #ffffff55;background:#111827cc;color:white;padding:8px 12px;cursor:pointer}.mvm-message{position:absolute;inset:39% 0 auto;text-align:center;pointer-events:none;color:#ffe6a2;font-size:clamp(24px,5vw,64px);font-weight:950;font-style:italic;text-shadow:4px 4px #421849,-2px -2px #090915;letter-spacing:.06em}.mvm-overlay{position:absolute;inset:0;background:#090a17df;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:18px;z-index:10;color:white;backdrop-filter:blur(8px)}.mvm-overlay h2{font-size:40px;margin:0}.mvm-overlay button{padding:14px 35px;min-width:220px;background:#edbb57;color:#171121;border:0;font:700 15px inherit;cursor:pointer}.mvm-overlay button:last-child{background:#252638;color:white}.mvm-help{position:absolute;left:16px;bottom:14px;color:#ffffff88;font-size:10px;letter-spacing:1px;pointer-events:none}.mvm-combat[data-touch="true"] .mvm-help{display:none}.mvm-local-hint{display:none;position:absolute;left:50%;top:96px;transform:translateX(-50%);max-width:92%;padding:6px 10px;background:#070b13df;color:#e5d6b1;font:9px monospace;letter-spacing:1px;text-align:center;pointer-events:none;z-index:4}.mvm-combat[data-touch="true"] .mvm-local-hint{display:block}.mvm-trial-hint,.mvm-data{position:absolute;left:50%;transform:translateX(-50%);padding:6px 12px;background:#070b13ef;border:1px solid #e8d7ac55;color:#ffe395;font:10px monospace;letter-spacing:1px;text-transform:uppercase;white-space:nowrap;pointer-events:none;z-index:4}.mvm-trial-hint{top:22%}.mvm-trial-hint[data-status="pass"]{color:#7cecde;border-color:#7cecde}.mvm-trial-hint[data-status="fail"]{color:#ff8fb1;border-color:#ff8fb1}.mvm-data{bottom:96px;color:#cfe6ff}.mvm-trial-hint:empty,.mvm-data:empty{display:none}.mvm-training-tools{flex-wrap:wrap;max-width:94%}.mvm-combo[data-pop="a"]{animation:mvm-pop-a .18s ease-out}.mvm-combo[data-pop="b"]{animation:mvm-pop-b .18s ease-out}@keyframes mvm-pop-a{from{transform:scale(1.35)}to{transform:scale(1)}}@keyframes mvm-pop-b{from{transform:scale(1.35)}to{transform:scale(1)}}.reduced-motion .mvm-combo{animation:none!important}@media(prefers-reduced-motion:reduce){.mvm-combo{animation:none!important}}
@media(max-width:600px){.mvm-hud{inset:10px 3% auto;gap:8px;grid-template-columns:1fr 48px 1fr}.mvm-health{height:14px;border-width:2px}.mvm-clock{font-size:26px}.mvm-rounds{font-size:11px}}
`;

export async function startCombat({
  container,
  player,
  opponent,
  arena,
  difficulty = "normal",
  mode = "arcade",
  onEnd,
  onExit,
  onHud,
  settings = {},
  onMoves,
}) {
  if (!container) throw new Error("Combat needs a container");
  const bindings = bindingsFor(settings.keys);
  const keyMap = buildKeyMap(settings.keys);
  const helpLine = (i) => {
    const k = (control) => keyLabel(bindings[i ? "p2" : "p1"][control]);
    return `${k("left")} ${k("right")} MOVE · ${k("jump")} JUMP · ${k("crouch")} CROUCH · ${k("light")} ${k("medium")} ${k("heavy")} PUNCH · ${k("kick")} ${k("mediumKick")} ${k("heavyKick")} KICK · ${k("special")} POWER · ${k("block")} GUARD · ${k("block")}+${k("light")} THROW`;
  };
  const wrapper = document.createElement("div");
  wrapper.className = "mvm-combat";
  wrapper.dataset.touch = String(
    matchMedia("(pointer:coarse)").matches || innerWidth < 800,
  );
  const style = document.createElement("style");
  style.textContent = CSS;
  wrapper.append(style);
  const safe = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  wrapper.insertAdjacentHTML(
    "beforeend",
    `<div class="mvm-hud"><div><div class="mvm-hud-name">${safe(player.name)}</div><div class="mvm-health"><i data-health="0"></i></div><div class="mvm-energy"><i data-energy="0"></i></div><div class="mvm-rounds" data-rounds="0">○ ○</div></div><div class="mvm-clock"><small>TIME</small><span data-time>60</span><button class="mvm-pause-button" aria-label="Pause match">Ⅱ PAUSE</button></div><div class="mvm-hud-right"><div class="mvm-hud-name">${safe(opponent.name)}</div><div class="mvm-health"><i data-health="1"></i></div><div class="mvm-energy"><i data-energy="1"></i></div><div class="mvm-rounds" data-rounds="1">○ ○</div></div></div><div class="mvm-message"></div><div class="mvm-help">${helpLine(0)}${mode === "local" ? ` / P2 ${helpLine(1)}` : " · ESC PAUSE · CHAIN LP→MP→HP ON HIT"}</div>`,
  );
  container.append(wrapper);
  wrapper.insertAdjacentHTML(
    "beforeend",
    '<div class="mvm-loading" role="status"><small>ME / VS / ME</small><strong>PREPARING THE ARENA</strong><div><i></i></div><span>Loading fighters and stage…</span></div>',
  );
  wrapper.querySelectorAll(".mvm-health").forEach((el, i) => {
    el.setAttribute("role", "progressbar");
    el.setAttribute(
      "aria-label",
      `${i === 0 ? player.name : opponent.name} health`,
    );
    el.setAttribute("aria-valuemin", "0");
    el.setAttribute("aria-valuemax", "100");
  });
  const message = wrapper.querySelector(".mvm-message");
  wrapper.dataset.mode = mode;
  let assetFailed = false;
  wrapper.insertAdjacentHTML(
    "beforeend",
    `<div class="mvm-stage-label">${safe(arena.name)} <span>${mode === "training" ? "TRAINING / INFINITE METER" : mode === "local" ? "VERSUS / FIRST TO TWO" : "FIRST TO TWO"}</span></div><div class="mvm-power-callout" aria-live="polite"></div><div class="mvm-combo" data-side="0"></div><div class="mvm-combo" data-side="1"></div><div class="mvm-hit-callout" aria-live="polite"></div><div class="mvm-training-readout"></div><div class="mvm-trial-hint" aria-live="polite"></div><div class="mvm-data"></div>${mode === "local" ? '<div class="mvm-local-hint">ON-SCREEN PAD IS PLAYER ONE · PLUG IN A SECOND PAD OR USE THE KEYBOARD FOR PLAYER TWO</div>' : ""}`,
  );
  wrapper.querySelectorAll(".mvm-energy").forEach((el, i) => {
    el.insertAdjacentHTML(
      "afterend",
      `<div class="mvm-meter-label" data-meter-label="${i}"></div>`,
    );
  });
  // Training lab state. The dummy cycles OPEN → GUARD → CROUCH GUARD → RECORD → PLAY.
  const DUMMY_MODES = ["open", "guard", "crouch", "record", "play"];
  const DUMMY_LABELS = {
    open: "OPEN",
    guard: "GUARD",
    crouch: "CROUCH GUARD",
    record: "RECORD",
    play: "PLAY",
  };
  const RECORD_SECONDS = 4;
  const RECORD_HZ = 30;
  const training = {
    dummy: "open",
    recording: [],
    recordT: 0,
    playT: 0,
    pendingStrike: null,
    trial: null,
    data: false,
  };
  function setDummy(next) {
    training.dummy = next;
    if (next === "record") {
      training.recording = [];
      training.recordT = 0;
      training.pendingStrike = null;
    }
    if (next === "play") training.playT = 0;
    const button = wrapper.querySelector('[data-training="guard"]');
    if (button) {
      button.textContent = `DUMMY: ${DUMMY_LABELS[next]}${next === "record" ? " ●" : ""}`;
      button.setAttribute("aria-pressed", String(next !== "open"));
    }
  }
  function toggleTrial() {
    training.trial = training.trial ? null : freshTrial();
    wrapper
      .querySelector('[data-training="trial"]')
      ?.setAttribute("aria-pressed", String(Boolean(training.trial)));
  }
  function toggleData() {
    training.data = !training.data;
    wrapper
      .querySelector('[data-training="data"]')
      ?.setAttribute("aria-pressed", String(training.data));
  }
  function resetTraining() {
    training.recording = [];
    training.recordT = 0;
    training.playT = 0;
    training.pendingStrike = null;
    if (training.dummy === "record" || training.dummy === "play") setDummy("open");
    if (training.trial) training.trial = freshTrial();
  }
  if (mode === "training") {
    wrapper.insertAdjacentHTML(
      "beforeend",
      '<div class="mvm-training-tools"><button data-training="reset">RESET</button><button data-training="guard" aria-pressed="false">DUMMY: OPEN</button><button data-training="trial" aria-pressed="false">TRIAL</button><button data-training="data" aria-pressed="false">DATA</button><button data-training="moves">MOVES</button></div>',
    );
    wrapper.querySelector('[data-training="reset"]').onclick = () => {
      if (scene && !paused) {
        scene.resetRound();
        resetTraining();
        Object.keys(stats).forEach((k) => (stats[k] = 0));
      }
    };
    wrapper.querySelector('[data-training="guard"]').onclick = () =>
      setDummy(
        DUMMY_MODES[(DUMMY_MODES.indexOf(training.dummy) + 1) % DUMMY_MODES.length],
      );
    wrapper.querySelector('[data-training="trial"]').onclick = toggleTrial;
    wrapper.querySelector('[data-training="data"]').onclick = toggleData;
    wrapper.querySelector('[data-training="moves"]').onclick = () => {
      pause();
      onMoves?.();
    };
  }
  const inputs = [{}, {}];
  const buffers = [null, null];
  const pressed = [{}, {}];
  const listeners = [];
  const bind = (target, event, callback, opts) => {
    target.addEventListener(event, callback, opts);
    listeners.push(() => target.removeEventListener(event, callback, opts));
  };
  let padPrevious = [{}, {}];
  function padInput(index) {
    const pad = navigator.getGamepads?.()[index];
    if (!pad) return {};
    const a = {
      left: pad.axes[0] < -0.3 || pad.buttons[14]?.pressed,
      right: pad.axes[0] > 0.3 || pad.buttons[15]?.pressed,
      jump: pad.buttons[12]?.pressed,
      crouch: pad.axes[1] > 0.4 || pad.buttons[13]?.pressed,
      light: pad.buttons[0]?.pressed,
      medium: pad.buttons[2]?.pressed,
      heavy: pad.buttons[4]?.pressed,
      kick: pad.buttons[1]?.pressed,
      mediumKick: pad.buttons[3]?.pressed,
      heavyKick: pad.buttons[5]?.pressed,
      special: pad.buttons[7]?.pressed,
      block: pad.buttons[6]?.pressed,
    };
    const start = pad.buttons[9]?.pressed;
    if (start && !padPrevious[index].start) {
      paused ? resume() : pause();
    }
    for (const move of MOVES)
      if (a[move.type] && !padPrevious[index][move.type] && !paused)
        pressed[index][move.type] = true;
    padPrevious[index] = { ...a, start };
    return a;
  }
  const mergeInput = (keyboard, pad) =>
    Object.fromEntries(
      [...new Set([...Object.keys(keyboard), ...Object.keys(pad)])].map(
        (key) => [key, Boolean(keyboard[key] || pad[key])],
      ),
    );
  let game,
    scene,
    paused = false,
    destroyed = false,
    ended = false,
    overlay;
  const sounds = settings.sound !== false && settings.muted !== true;
  let audio;
  function beep(freq, duration = 0.08, type = "square", volume = 0.045) {
    if (!sounds) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      const o = audio.createOscillator(),
        g = audio.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, audio.currentTime);
      o.frequency.exponentialRampToValueAtTime(
        Math.max(40, freq * 0.45),
        audio.currentTime + duration,
      );
      g.gain.setValueAtTime(volume, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
      o.connect(g);
      g.connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + duration);
    } catch {}
  }
  function clearInputs() {
    for (let i = 0; i < 2; i++) {
      inputs[i] = {};
      pressed[i] = {};
      buffers[i] = null;
    }
    controller?.release();
  }
  function resume() {
    if (destroyed || ended || assetFailed || scene?.assetFailure) return;
    paused = false;
    overlay?.remove();
    overlay = null;
    clearInputs();
  }
  function pause() {
    if (destroyed || ended || paused) return;
    paused = true;
    clearInputs();
    overlay = document.createElement("div");
    overlay.className = "mvm-overlay";
    overlay.innerHTML =
      "<h2>MATCH PAUSED</h2><p>Take a breath. Your rival can wait.</p><button>RESUME FIGHT</button><button>LEAVE MATCH</button>";
    wrapper.append(overlay);
    overlay.children[2].onclick = resume;
    overlay.children[3].onclick = () => {
      destroy();
      onExit?.();
    };
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Match paused");
    const movesButton = document.createElement("button");
    movesButton.textContent = "MOVE LIST";
    movesButton.onclick = () => onMoves?.();
    if (onMoves) overlay.insertBefore(movesButton, overlay.children[3]);
    overlay.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const buttons = [...overlay.querySelectorAll("button")];
      if (e.shiftKey && document.activeElement === buttons[0]) {
        e.preventDefault();
        buttons.at(-1).focus();
      } else if (!e.shiftKey && document.activeElement === buttons.at(-1)) {
        e.preventDefault();
        buttons[0].focus();
      }
    });
    overlay.children[2].focus();
  }
  wrapper.querySelector(".mvm-pause-button").onclick = pause;
  bind(window, "keydown", (e) => {
    if (e.code === "Escape") {
      if (document.querySelector(".modal-layer")) return;
      e.preventDefault();
      paused ? resume() : pause();
      return;
    }
    const k = keyMap[e.code];
    if (!k) return;
    e.preventDefault();
    if (paused) return;
    if (!inputs[k[0]][k[1]]) pressed[k[0]][k[1]] = true;
    inputs[k[0]][k[1]] = true;
  });
  bind(window, "keyup", (e) => {
    const k = keyMap[e.code];
    if (k) {
      e.preventDefault();
      inputs[k[0]][k[1]] = false;
    }
  });
  bind(window, "resize", () => {
    wrapper.dataset.touch = String(
      matchMedia("(pointer:coarse)").matches || innerWidth < 800,
    );
  });
  bind(window, "blur", pause);
  bind(document, "visibilitychange", () => {
    if (document.hidden) pause();
  });
  const controller = createTouchController({
    mount: wrapper,
    haptics: settings.reducedMotion !== true,
    onChange: (control, down) => {
      inputs[0][control] = !paused && down;
    },
    onPress: (control) => {
      if (!paused) pressed[0][control] = true;
    },
  });
  const stats = {
    damageDealt: 0,
    damageTaken: 0,
    hits: 0,
    blocked: 0,
    specials: 0,
    throws: 0,
    maxCombo: 0,
  };
  class Fight extends Phaser.Scene {
    preload() {
      this.load.on("progress", (progress) => {
        const loading = wrapper.querySelector(".mvm-loading");
        if (loading) {
          loading.querySelector("i").style.width =
            `${Math.round(progress * 100)}%`;
          loading.querySelector("span").textContent =
            `${Math.round(progress * 100)}% · Loading fighters and stage`;
        }
      });
      this.load.on("loaderror", (file) => {
        if (assetFailed) return;
        this.assetFailure = true;
        assetFailed = true;
        overlay?.remove();
        wrapper.querySelector(".mvm-loading")?.remove();
        paused = true;
        overlay = document.createElement("div");
        overlay.className = "mvm-overlay";
        overlay.innerHTML =
          "<h2>ASSET LOAD FAILED</h2><p>A fighter or arena could not load. Return and try again.</p><button>RETURN TO SELECT</button>";
        wrapper.append(overlay);
        overlay.querySelector("button").onclick = () => {
          destroy();
          onExit?.();
        };
      });
      this.load.image("stage", arena.background);
      [player, opponent].forEach((c, i) => {
        this.load.spritesheet(`ready${i}`, c.sheet, {
          frameWidth: c.frameWidth,
          frameHeight: c.frameHeight,
        });
        this.load.spritesheet(`fighter${i}`, c.combatSheet, {
          frameWidth: 320,
          frameHeight: 320,
        });
        this.load.spritesheet(`motion${i}`, c.motionSheet, {
          frameWidth: 320,
          frameHeight: 320,
        });
      });
    }
    create() {
      if (this.assetFailure) return;
      scene = this;
      wrapper.querySelector(".mvm-loading")?.remove();
      this.add.image(480, 270, "stage").setDisplaySize(960, 540);
      this.add.rectangle(480, 510, 960, 60, 0x080a16, 0.28);
      this.atmosphere = this.add.graphics().setDepth(3);
      this.fx = this.add.graphics().setDepth(9);
      this.fighters = [player, opponent].map((c, i) => {
        const sprite = this.add
          .sprite(i ? 690 : 270, 450, `ready${i}`, 0)
          .setOrigin(
            (c.anchorX || 160) / (c.frameWidth || 320),
            (c.anchorY || 296) / (c.frameHeight || 320),
          )
          .setDepth(5);
        const scale = 190 / (c.bodyHeight || 176);
        sprite.setScale(scale).setFlipX(i === 1);
        const shadow = this.add
          .ellipse(sprite.x, 450, 96, 17, 0x000000, 0.35)
          .setDepth(2);
        return {
          c,
          sprite,
          shadow,
          scale,
          motionScale: 190 / (c.motionBodyHeight || c.bodyHeight || 176),
          x: sprite.x,
          y: 450,
          vy: 0,
          hp: 100,
          energy: 35,
          rounds: 0,
          face: i ? -1 : 1,
          lastHit: -100,
          guard: false,
          crouch: false,
          ...freshFighterState(),
        };
      });
      this.powerUntil = 0;
      this.timer = 60;
      this.phase = "intro";
      this.phaseTime = 2.2;
      this.elapsed = 0;
      this.hitstop = 0;
      this.aiClock = 0;
      this.aiAction = {};
      this.aiMemory = { blockedInRow: 0, feint: false, px: undefined };
      this.rng = Math.random;
      this.tally = {};
      this.log = [];
      this.training = training;
      this.sparks = [];
      this.projectiles = [];
      this.pendingHits = [];
      message.textContent = "ROUND 1";
      this.sync();
    }
    sync() {
      this.fighters.forEach((f, i) => {
        wrapper
          .querySelector(`[data-health="${i}"]`)
          .parentElement.setAttribute(
            "aria-valuenow",
            String(Math.round(f.hp)),
          );
        wrapper.querySelector(`[data-health="${i}"]`).style.width =
          `${Math.max(0, f.hp)}%`;
        wrapper.querySelector(`[data-energy="${i}"]`).style.width =
          `${f.energy}%`;
        wrapper.querySelector(`[data-rounds="${i}"]`).textContent =
          "● ".repeat(f.rounds) + "○ ".repeat(2 - f.rounds);
      });
      this.fighters.forEach((f, i) => {
        const label = wrapper.querySelector(`[data-meter-label="${i}"]`);
        label.textContent =
          f.energy >= SPECIAL_COST
            ? `POWER READY · ${Math.floor(f.energy)}`
            : `CHARGING ${Math.floor(f.energy)} / ${SPECIAL_COST}`;
        label.dataset.ready = String(f.energy >= SPECIAL_COST);
      });
      const ready = this.fighters[0].energy >= SPECIAL_COST;
      controller.setPowerReady(
        ready,
        this.fighters[0].energy,
        `${player.move}. ${ready ? "Ready" : `Requires ${SPECIAL_COST} meter`}`,
      );
      wrapper.querySelector("[data-time]").textContent = String(
        Math.ceil(this.timer),
      ).padStart(2, "0");
      onHud?.({
        player: this.fighters[0].hp,
        opponent: this.fighters[1].hp,
        time: Math.ceil(this.timer),
      });
    }
    // Bounded event record for tests and the training readout.
    note(kind, index, detail = {}) {
      const key = `${kind}${index}`;
      this.tally[key] = (this.tally[key] || 0) + 1;
      this.log.push({ t: this.elapsed, kind, index, ...detail });
      if (this.log.length > 64) this.log.shift();
    }
    // CPU personality: difficulty sets reflexes, the fighter's kit sets the game plan.
    ai(dt) {
      this.aiClock -= dt;
      const ai = this.fighters[1],
        p = this.fighters[0];
      const prof = AI_PROFILES[difficulty] || AI_PROFILES.normal;
      const mem = this.aiMemory;
      // Track the player's drift so an anti-air can be timed to where they will be.
      const vx = mem.px === undefined || !dt ? 0 : (p.x - mem.px) / dt;
      mem.px = p.x;
      // A strike that just landed gets an immediate follow-up decision.
      const fresh =
        prof.cancels && ai.attack?.landed && this.aiAction.from !== ai.attack;
      if (this.aiClock > 0 && !fresh) return this.aiAction;
      this.aiClock = prof.think;
      const rng = this.rng;
      const kit = kitFor(ai.c);
      const dx = p.x - ai.x,
        dist = Math.abs(dx);
      const toward = dx >= 0 ? "right" : "left",
        away = dx >= 0 ? "left" : "right";
      const a = {};
      const act = (why) => {
        a.why = why;
        this.aiAction = a;
        return a;
      };
      if (ai.down > 0) {
        if (prof.wakeup === "mix") a[rng() < 0.5 ? "block" : "throw"] = true;
        else if (prof.wakeup === "block" && rng() < prof.wakeBlock) a.block = true;
        return act("wakeup");
      }
      if (ai.attack) {
        if (prof.cancels && ai.attack.landed) {
          const next =
            ai.attack.landed === "hit" &&
            ai.energy >= SPECIAL_COST &&
            rng() < 0.35
              ? "special"
              : CANCEL_ROUTE[ai.attack.type];
          if (next) a[next] = true;
          a.from = ai.attack;
          return act("cancel");
        }
        return act("busy");
      }
      if (ai.blockstun > 0) {
        a.block = true;
        a.crouch = ai.crouch;
        return act("blockstun");
      }
      if (ai.stun > 0 || ai.launched) return act("reeling");
      // Anti-air: only CPUs that can see the jump coming.
      if (prof.antiAir && p.y < 440 && p.vy < 0 && dist < ANTI_AIR_RANGE) {
        const self = { ...ai, attack: null, cooldown: 0, guard: false, face: dx >= 0 ? 1 : -1 };
        for (const type of ["heavy", "heavyKick"]) {
          const m = createAttack(self, type);
          const t = m.start + m.active / 2;
          const future = {
            ...p,
            x: p.x + vx * t,
            y: Math.min(450, p.y + p.vy * t + 725 * t * t),
          };
          if (future.y < 449 && inMeleeRange(self, future, m) && rng() < prof.antiAir) {
            a[type] = true;
            return act("anti-air");
          }
        }
      }
      const shot = this.projectiles.some(
        (s) => s.target === ai && Math.abs(s.x - ai.x) < 260,
      );
      const threat =
        shot ||
        (p.attack &&
          p.attack.family !== "throw" &&
          p.attack.t < p.attack.start + p.attack.active &&
          dist < p.attack.reach + 70);
      if (threat && rng() < prof.block) {
        a.block = true;
        if (
          p.attack?.height === "low" &&
          (prof.readsHeight || rng() < 0.5)
        )
          a.crouch = true;
        return act("block");
      }
      if (
        prof.punish &&
        p.attack &&
        !p.attack.landed &&
        p.attack.t > p.attack.start + p.attack.active &&
        dist < 150
      ) {
        a[dist < 125 ? "heavy" : "mediumKick"] = true;
        return act("punish");
      }
      const reach = throwRange(ai);
      const turtle =
        p.guard && p.y >= 449 && p.guardTime >= prof.turtle && dist < 220;
      const mixup =
        kit.role === "rushdown" && mem.blockedInRow >= 2 && dist < 220;
      if (prof.throws && (turtle || mixup)) {
        if (dist <= reach) {
          a.throw = true;
          mem.blockedInRow = 0;
          return act("throw");
        }
        a[toward] = true;
        return act("close-in");
      }
      if (kit.role === "counter" && ai.punish > 0 && dist < 150) {
        a[dist < 125 ? "heavy" : "medium"] = true;
        return act("counter-punish");
      }
      const power = createAttack({ ...ai, attack: null, cooldown: 0, guard: false }, "special");
      const powerReach = power
        ? power.variant === 3
          ? p.y >= 449 && dist > 110
          : dist < power.reach + 10
        : false;
      const usePower = (chance) =>
        power && (prof.smartPower ? powerReach : rng() < chance);
      const normal = () => MOVES[Math.floor(rng() * 6)].type;
      switch (kit.role) {
        case "zoner":
          if (dist > 180 && usePower(0.6) && (prof.smartPower || dist < 420)) {
            a.special = true;
            return act("zone");
          }
          if (dist < 150 && rng() < 0.55) {
            a[away] = true;
            return act("space");
          }
          if (dist < 175) a[rng() < 0.5 ? "mediumKick" : "heavyKick"] = true;
          else if (dist > 330) a[toward] = true;
          return act("zone");
        case "rushdown":
          if (dist > 115) {
            a[toward] = true;
            if (rng() < 0.06) a.jump = true;
            return act("rush");
          }
          if (usePower(0.2)) a.special = true;
          else if (rng() < 0.8)
            a[["light", "kick", "medium", "mediumKick"][Math.floor(rng() * 4)]] = true;
          return act("rush");
        case "counter":
          if (dist > 280) a[toward] = true;
          else if (dist < 125 && rng() < 0.35) a.light = true;
          else if (dist < 200 && rng() < 0.3) a.block = true;
          return act("wait");
        case "grappler-lite":
          if (dist > reach) {
            a[toward] = true;
            return act("close-in");
          }
          if (prof.throws && mem.feint) {
            a.throw = true;
            mem.feint = false;
            return act("throw");
          }
          a.light = true;
          mem.feint = true;
          return act("feint");
        default:
          if (dist > 125) {
            a[toward] = true;
            if (rng() < 0.045) a.jump = true;
            return act("approach");
          }
          if (rng() < 0.75) a[usePower(0.25) ? "special" : normal()] = true;
          if (dist < 65 && rng() < 0.15) a[away] = true;
          if (rng() < 0.025) a.jump = true;
          return act("mix");
      }
    }
    // Training dummy input: fixed guards, a recorder driven by P1's controls, or playback.
    dummyInput(dt, p1) {
      const t = training;
      if (t.dummy === "guard") return { input: { block: true } };
      if (t.dummy === "crouch") return { input: { block: true, crouch: true } };
      if (t.dummy === "record") {
        const held = {};
        for (const k of ["left", "right", "jump", "crouch", "block"])
          if (p1[k]) held[k] = true;
        const strike = buffers[0]?.type;
        buffers[0] = null;
        if (strike) t.pendingStrike = strike;
        t.recordT += dt;
        while (t.recording.length < Math.min(RECORD_SECONDS * RECORD_HZ, Math.ceil(t.recordT * RECORD_HZ))) {
          t.recording.push({ ...held, strike: t.pendingStrike });
          t.pendingStrike = null;
        }
        if (t.recording.length >= RECORD_SECONDS * RECORD_HZ) setDummy("play");
        return { input: strike ? { ...held, [strike]: true } : held, puppet: true };
      }
      if (t.dummy === "play" && t.recording.length) {
        t.playT += dt;
        const frame =
          t.recording[Math.floor(t.playT * RECORD_HZ) % t.recording.length];
        const input = { ...frame };
        delete input.strike;
        if (frame.strike) input[frame.strike] = true;
        return { input };
      }
      return { input: {} };
    }
    attack(f, type, viaCancel = false, crouch = false) {
      const m = viaCancel
        ? cancelAttack(f, type, { crouch })
        : createAttack(f, type, { crouch });
      if (!m) return false;
      f.attack = m;
      f.lastMove = type;
      f.lastAttack = m;
      f.guard = false;
      if (viaCancel) this.note("cancel", this.fighters.indexOf(f), { type });
      if (type === "special") {
        f.energy -= SPECIAL_COST;
        if (f === this.fighters[0]) stats.specials++;
        beep(390, 0.18, "sawtooth", 0.035);
        const callout = wrapper.querySelector(".mvm-power-callout");
        callout.textContent = `${f.c.name} / ${f.c.move}`;
        callout.style.setProperty("--power-color", f.c.color);
        callout.classList.add("visible");
        this.powerUntil = this.elapsed + 1.15;
      } else beep(type === "heavy" ? 145 : 240, 0.055, "triangle", 0.025);
      return true;
    }
    tickFighter(f, enemy, a, dt, index) {
      f.cooldown = Math.max(0, f.cooldown - dt);
      f.stun = Math.max(0, f.stun - dt);
      f.blockstun = Math.max(0, f.blockstun - dt);
      f.down = Math.max(0, f.down - dt);
      f.punish = Math.max(0, f.punish - dt);
      f.comboFlash = Math.max(0, f.comboFlash - dt);
      f.energy = Math.min(100, f.energy + dt * 5);
      const human = index === 0 || mode === "local";
      let strike = human
        ? buffers[index]?.type
        : a.throw
          ? "throw"
          : [...MOVES].reverse().find((m) => a[m.type])?.type;
      // GUARD + LP is the throw chord on keyboard, pad and touch alike.
      if (strike === "light" && a.block) strike = "throw";
      // Wakeup: the tail of a knockdown accepts guard, jump or a reversal.
      if (f.down > 0 && f.down <= wakeupWindow(f) && !f.launched) {
        const reversal =
          WAKEUP_REVERSALS.includes(strike) &&
          (strike !== "special" || f.energy >= SPECIAL_COST);
        if (reversal || a.jump || a.block) {
          f.down = 0;
          this.note("wakeup", index, {
            action: reversal ? strike : a.jump ? "jump" : "guard",
          });
        }
      }
      const free = f.stun <= 0 && f.down <= 0 && !f.launched;
      const grounded = f.y >= 449;
      if (!f.attack && free) f.face = enemy.x >= f.x ? 1 : -1;
      // Guard holds for the whole blockstun window: a follow-up cannot slip through.
      f.guard = f.blockstun > 0 || (!!a.block && grounded && !f.attack && free);
      f.crouch =
        (!!a.crouch && grounded && !f.attack && free) || !!f.attack?.crouch;
      f.guardTime = f.guard ? f.guardTime + dt : 0;
      const speed = 185 + Math.min(10, Number(f.c.speed) || 5) * 9;
      // Air normals keep the jump's drift; grounded strikes plant the feet.
      if ((!f.attack || f.attack.air) && free && !f.guard && !f.crouch) {
        f.x += ((a.right ? 1 : 0) - (a.left ? 1 : 0)) * speed * dt;
        if (a.jump && grounded && !f.attack) {
          f.vy = -540;
          beep(260, 0.08, "sine", 0.02);
        }
      }
      if (strike) {
        const crouching = !!a.crouch && grounded;
        const cancels = human || (AI_PROFILES[difficulty]?.cancels ?? difficulty !== "easy");
        const started = f.attack
          ? cancels && this.attack(f, strike, true, crouching)
          : free &&
            (!f.guard || strike === "throw") &&
            this.attack(f, strike, false, crouching);
        if (started && human) buffers[index] = null;
      }
      const wasAirborne = f.y < 449;
      f.vy += 1450 * dt;
      f.y += f.vy * dt;
      if (f.y >= 450) {
        f.y = 450;
        f.vy = 0;
        if (f.launched) {
          // Landing from a launch ends the combo with a knockdown.
          f.launched = false;
          f.juggles = 0;
          f.stun = 0;
          f.down = KNOCKDOWN_TIME;
        }
        // Landing ends an air normal; the short cooldown keeps jump-ins from linking.
        if (wasAirborne && f.attack?.air) {
          f.attack = null;
          f.cooldown = AIR_LAND_COOLDOWN;
        }
      }
      if (f.comboHits && free) f.comboHits = 0;
      f.x = Phaser.Math.Clamp(f.x, 65, 895);
      if (f.attack) {
        const m = f.attack;
        m.t += dt;
        if (m.type === "special" && m.t < m.start) {
          if (m.travel)
            f.x = Phaser.Math.Clamp(
              f.x + ((f.face * m.travel) / m.start) * dt,
              65,
              895,
            );
          if (m.lift && m.t < dt * 2 && f.y >= 449) f.vy = -m.lift;
        }

        if (!m.hit && m.t >= m.start && m.t <= m.start + m.active) {
          if (m.type === "special" && m.variant === 3) {
            m.hit = true;
            if (this.projectiles.length < PROJECTILE_CAP)
              this.projectiles.push({
                x: f.x + f.face * 50,
                y: f.y - 95,
                face: f.face,
                owner: f,
                target: enemy,
                move: m,
                index,
                life: 1.5,
              });
          }
          if (canBeHit(enemy) && inMeleeRange(f, enemy, m)) {
            m.hit = true;
            this.pendingHits.push([
              f,
              enemy,
              { ...m, face: f.face, source: m },
              index,
            ]);
          }
        }
        if (m.t >= m.duration) {
          f.attack = null;
          f.cooldown = 0.07;
        }
      }
      this.renderFighter(f, a, dt, index);
    }
    // One render tick of white on a clean hit, the hurt blush, and the arcade shadow's tint.
    tint(f) {
      if (f.flash > 0) {
        f.flash--;
        f.sprite.setTintFill(0xffffff);
      } else if (f.stun > 0 && f.visualTime < 0.05) f.sprite.setTint(0xffc6b4);
      else if (f.c.shadow) f.sprite.setTint(0x9186d6);
      else f.sprite.clearTint();
    }
    rumble(index, ms) {
      if (settings.reducedMotion || !(index === 0 || mode === "local")) return;
      try {
        navigator
          .getGamepads?.()
          [index]?.vibrationActuator?.playEffect?.("dual-rumble", {
            duration: ms,
            strongMagnitude: Math.min(1, ms / 70),
            weakMagnitude: 0.5,
          });
      } catch {}
    }
    renderFighter(f, a, dt, index, forcedState) {
      const moving =
        !f.attack &&
        !f.guard &&
        !f.crouch &&
        f.stun <= 0 &&
        f.down <= 0 &&
        !f.launched &&
        (a.left || a.right);
      const state =
        forcedState ||
        (f.attack
          ? "attack"
          : f.down > 0
            ? "down"
            : f.stun > 0 || f.launched
              ? "hurt"
              : f.guard
                ? "guard"
                : f.y < 449
                  ? "jump"
                  : f.crouch
                    ? "crouch"
                    : moving
                      ? "walk"
                      : "idle");
      if (f.visualState !== state) {
        f.visualState = state;
        f.visualTime = 0;
      } else f.visualTime = (f.visualTime || 0) + dt;
      const texture = state === "idle"
        ? `ready${index}`
        : state === "attack"
          ? `fighter${index}`
          : `motion${index}`;
      if (f.textureKey !== texture) {
        f.sprite.setTexture(texture);
        f.textureKey = texture;
      }
      const frame =
        state === "attack"
          ? moveFrame(f.attack)
          : state === "idle"
            ? 0
            : state === "crouch"
              ? 4
              : state === "down"
                ? f.down > 0.3
                  ? motionFrame("ko", f.visualTime)
                  : motionFrame("hurt", 1)
                : motionFrame(state, f.visualTime, f.vy);
      f.sprite.setFrame(frame);
      // Limb animation comes from authored frames; no squash or rotation substitutes.
      const bob =
        state === "idle" && !settings.reducedMotion
          ? Math.sin(this.elapsed * 4 + index) * 0.65
          : 0;
      f.sprite
        .setRotation(0)
        .setPosition(f.x, f.y + bob)
        .setFlipX(f.face < 0)
        // The motion atlas can be packed at a different height from the ready and combat art.
        .setScale(texture === `motion${index}` ? f.motionScale : f.scale);
      f.shadow.setPosition(f.x, 452).setScale(1 - (450 - f.y) / 600);
      this.tint(f);
    }

    callout(text) {
      const el = wrapper.querySelector(".mvm-hit-callout");
      el.textContent = text;
      el.classList.add("visible");
      this.calloutUntil = this.elapsed + 0.7;
    }
    hit(f, e, m, index) {
      // A hit only extends a combo while the target is still reeling or airborne.
      const inCombo = e.stun > 0 || e.launched;
      const airborne = e.y < 449;
      const outcome = hitOutcome(f, e, m);
      const { blocking, damage } = outcome;
      if (m.source) m.source.landed = blocking ? "block" : "hit";
      e.hp = outcome.health;
      e.x = Phaser.Math.Clamp(
        e.x + (m.face ?? f.face) * outcome.knockback,
        65,
        895,
      );
      f.energy = outcome.energy;
      f.punish = 0;
      if (blocking) {
        e.blockstun = outcome.blockstun;
        e.comboHits = 0;
        e.punish = outcome.blockstun + PUNISH_WINDOW;
        f.combo = 0;
      } else if (outcome.throw) {
        // Hard knockdown straight to the floor: no juggle, no combo credit.
        Object.assign(e, {
          stun: 0,
          attack: null,
          guard: false,
          launched: false,
          juggles: 0,
          vy: 0,
          y: 450,
          comboHits: 0,
          down: KNOCKDOWN_TIME,
        });
        f.combo = 0;
        f.lastHit = this.elapsed;
        this.callout("THROW!");
      } else {
        e.stun = outcome.stun;
        e.attack = null;
        e.comboHits = outcome.comboHits;
        if (outcome.launch) {
          e.launched = true;
          e.juggles = 0;
          e.vy = -outcome.launch;
        } else if (outcome.juggle) {
          e.juggles++;
          e.vy = Math.min(e.vy, -LAUNCH_POP);
        }
        if (outcome.knockdown) {
          e.launched = true;
          e.juggles = JUGGLE_LIMIT;
          e.vy = Math.min(e.vy, -300);
        }
        f.combo = inCombo ? f.combo + 1 : 1;
        f.comboDisplay = f.combo;
        f.comboFlash = 1;
        f.lastHit = this.elapsed;
        if (outcome.counter) this.callout("COUNTER!");
      }
      if (index === 1) this.aiMemory.blockedInRow = blocking ? this.aiMemory.blockedInRow + 1 : 0;
      this.note(blocking ? "block" : outcome.throw ? "throw" : "hit", index, {
        type: m.type,
        air: Boolean(m.air),
      });
      if (!blocking && airborne && !m.air && (m.type === "heavy" || m.type === "heavyKick"))
        this.note("antiair", index);
      if (mode === "training" && index === 0 && training.trial)
        trialHit(training.trial, m.type, outcome.comboHits, blocking);
      // Hitstop by weight; blocks freeze for 60%. Reduced motion keeps it (frame data).
      this.hitstop = hitstopFor(m, blocking);
      // The struck sprite flashes white for one render tick on a clean hit only.
      e.flash = !blocking && !settings.reducedMotion ? 1 : 0;
      if (index === 0) {
        stats.damageDealt += damage;
        if (!blocking) {
          stats.hits++;
          if (outcome.throw) stats.throws++;
          stats.maxCombo = Math.max(stats.maxCombo, f.combo);
        }
      } else {
        stats.damageTaken += damage;
        if (blocking) stats.blocked++;
      }
      const pulse = blocking ? 8 : impactPulse(m);
      controller.vibrate(pulse);
      this.rumble(index, pulse);
      this.rumble(1 - index, pulse);
      this.sparks.push({
        x: (f.x + e.x) / 2,
        y: Math.min(f.y, e.y) - 90,
        life: 0.22,
        block: blocking,
        special: m.type === "special",
        throw: outcome.throw,
        tier: m.tier ?? 1,
      });
      if (this.sparks.length > SPARK_CAP)
        this.sparks.splice(0, this.sparks.length - SPARK_CAP);
      if (!settings.reducedMotion) {
        if (blocking) this.cameras.main.shake(30, 0.0015);
        else
          this.cameras.main.shake(
            m.type === "special" ? 100 : 35 + (m.tier ?? 1) * 12,
            m.type === "special" ? 0.007 : 0.002 + (m.tier ?? 1) * 0.0007,
          );
      }
      beep(
        blocking ? 600 : m.type === "heavy" ? 90 : 130,
        0.1,
        blocking ? "triangle" : "square",
        0.045,
      );
    }
    trainingReadout(p) {
      const trial = training.trial;
      const trialText = trial
        ? trial.status === "active"
          ? ` · TRIAL ${trial.step}/${TRIAL_SEQUENCE.length} · DROPS ${trial.drops}/3`
          : ` · TRIAL ${trial.status.toUpperCase()}`
        : "";
      const rec =
        training.dummy === "record"
          ? ` · RECORDING ${Math.max(0, RECORD_SECONDS - training.recordT).toFixed(1)}s`
          : "";
      wrapper.querySelector(".mvm-training-readout").textContent =
        `${moveName(p.c, p.lastMove)} · ${movePhase(p.attack)} / ${Math.round(stats.damageDealt)} DAMAGE · ${stats.hits} HITS${trialText}${rec}`;
      const hint = wrapper.querySelector(".mvm-trial-hint");
      if (!trial) hint.textContent = "";
      else {
        hint.dataset.status = trial.status;
        const names = TRIAL_SEQUENCE.map((t) => moveName(p.c, t).toUpperCase());
        hint.textContent =
          trial.status === "pass"
            ? "TRIAL PASS · JAB → CROSS → UPPERCUT → POWER"
            : trial.status === "fail"
              ? "TRIAL FAIL · RESET TO TRY AGAIN"
              : `TRIAL · ${names.join(" → ")} · NEXT: ${names[trial.step]}`;
      }
      const data = wrapper.querySelector(".mvm-data");
      const m = p.attack || p.lastAttack;
      if (!training.data || !m) {
        data.textContent = training.data ? "DATA · READY" : "";
        return;
      }
      const ms = (x) => Math.round(x * 1000);
      const tags = [
        m.height === "low" && "LOW",
        m.height === "overhead" && "OVERHEAD",
        m.family === "throw" && "THROW",
        m.air && "AIR",
      ].filter(Boolean);
      data.textContent = `DATA · ${moveName(p.c, m.type).toUpperCase()} · ${movePhase(p.attack)} · STARTUP ${ms(m.start)} · ACTIVE ${ms(m.active)} · RECOVERY ${ms(m.duration - m.start - m.active)} · HITSTUN ${ms(m.hitstun)} · BLOCKSTUN ${ms(m.blockstun)} MS${tags.length ? ` · ${tags.join(" ")}` : ""}`;
    }
    finishRound() {
      const [p, o] = this.fighters;
      const result = roundOutcome(p, o);
      const win =
        result.winner === "player"
          ? p
          : result.winner === "opponent"
            ? o
            : null;
      p.rounds = result.playerRounds;
      o.rounds = result.opponentRounds;
      this.phase = "result";
      this.roundWinner = win;
      this.fighters.forEach((f) => {
        f.attack = null;
        f.visualState = null;
      });
      this.phaseTime = 2.5;
      message.textContent = win
        ? (this.timer <= 0 ? "TIME! " : "K.O. ") +
          (mode === "local"
            ? win === p
              ? "PLAYER ONE WINS"
              : "PLAYER TWO WINS"
            : win === p
              ? "YOU WIN"
              : "RIVAL WINS")
        : "DRAW — REMATCH";
      this.sync();
    }
    resetRound() {
      this.fighters.forEach((f, i) => {
        Object.assign(f, {
          x: i ? 690 : 270,
          y: 450,
          vy: 0,
          hp: 100,
          energy: Math.max(35, f.energy),
          guard: false,
          crouch: false,
          lastHit: -100,
          ...freshFighterState(),
        });
        f.sprite
          .setTexture(`ready${i}`)
          .setPosition(f.x, 450)
          .setFrame(0)
          .clearTint();
        f.textureKey = `ready${i}`;
        f.visualState = null;
      });
      this.projectiles = [];
      this.pendingHits = [];
      this.sparks = [];
      this.hitstop = 0;
      this.aiClock = 0;
      this.aiAction = {};
      this.aiMemory = { blockedInRow: 0, feint: false, px: undefined };
      this.powerUntil = 0;
      this.timer = 60;
      this.phase = "intro";
      this.phaseTime = 2;
      message.textContent = `ROUND ${1 + this.fighters[0].rounds + this.fighters[1].rounds}`;
      clearInputs();
      this.sync();
    }
    update(_, delta) {
      if (destroyed) return;
      const pads = [padInput(0), padInput(1)];
      if (paused || destroyed || ended || !this.fighters) return;
      const dt = Math.min(delta / 1000, 0.035);
      for (let i = 0; i < 2; i++) {
        const type = [...MOVES].reverse().find((m) => pressed[i][m.type])?.type;
        if (type && this.phase === "fight") {
          // A press during a move waits for the cancel window or the recovery.
          const current = this.fighters[i].attack;
          buffers[i] = {
            type,
            life: current ? current.duration - current.t + 0.16 : 0.16,
          };
        }
        pressed[i] = {};
        if (buffers[i] && (buffers[i].life -= dt) <= 0) buffers[i] = null;
      }
      this.elapsed += dt;
      this.fx.clear();
      paintAtmosphere(
        this.atmosphere,
        arena,
        this.elapsed,
        settings.reducedMotion,
      );
      for (const f of this.fighters)
        paintPower(this.fx, f, this.elapsed, settings.reducedMotion);
      if (this.elapsed > this.powerUntil)
        wrapper.querySelector(".mvm-power-callout").classList.remove("visible");
      if (this.elapsed > (this.calloutUntil ?? 0))
        wrapper.querySelector(".mvm-hit-callout").classList.remove("visible");
      const activePlayer = this.fighters[0];
      this.fighters.forEach((f, i) => {
        const el = wrapper.querySelector(`.mvm-combo[data-side="${i}"]`);
        if (!el) return;
        const shown =
          (i === 0 || mode === "local") && f.comboFlash > 0 && f.comboDisplay > 1;
        const text = shown ? `${f.comboDisplay} HIT COMBO` : "";
        // The counter pops each time it grows.
        if (shown && text !== el.textContent)
          el.dataset.pop = el.dataset.pop === "a" ? "b" : "a";
        el.textContent = text;
      });
      if (mode === "training") this.trainingReadout(activePlayer);
      this.sparks = this.sparks.filter((s) => (s.life -= dt) > 0);
      for (const s of this.sparks) {
        // Size and ray count scale with the strike's tier; blocks are small and cool.
        const tier = s.special ? 4 : s.tier;
        const rays = 6 + tier * 2;
        const size = (40 + tier * 12) * (s.block ? 0.6 : 1);
        this.fx.lineStyle(
          s.special ? 5 : 2 + Math.min(2, tier),
          s.block ? 0x9fb4c0 : s.throw ? 0xff6ad5 : 0xffe49e,
          s.life / 0.22,
        );
        for (let j = 0; j < rays; j++) {
          let a = (j * Math.PI * 2) / rays;
          let r = (1 - s.life / 0.22) * size;
          this.fx.lineBetween(
            s.x + Math.cos(a) * r * 0.4,
            s.y + Math.sin(a) * r * 0.4,
            s.x + Math.cos(a) * r,
            s.y + Math.sin(a) * r,
          );
        }
      }
      if (this.phase !== "fight") {
        if (this.phase === "result")
          this.fighters.forEach((f, i) => {
            f.vy += 1450 * dt;
            f.y = Math.min(450, f.y + f.vy * dt);
            this.renderFighter(
              f,
              {},
              dt,
              i,
              !this.roundWinner
                ? "idle"
                : f === this.roundWinner
                  ? "victory"
                  : "ko",
            );
          });
        this.phaseTime -= dt;
        if (this.phase === "intro") {
          if (this.phaseTime < 0.7) message.textContent = "FIGHT!";
          if (this.phaseTime <= 0) {
            this.phase = "fight";
            message.textContent = "";
            clearInputs();
          }
        } else if (this.phaseTime <= 0) {
          const [p, o] = this.fighters;
          if (p.rounds >= 2 || o.rounds >= 2) {
            ended = true;
            const result = {
              winner: p.rounds >= 2 ? "player" : "opponent",
              playerRounds: p.rounds,
              opponentRounds: o.rounds,
              stats: {
                ...stats,
                damageDealt: Math.round(stats.damageDealt),
                damageTaken: Math.round(stats.damageTaken),
              },
            };
            queueMicrotask(() => {
              if (!destroyed) onEnd?.(result);
            });
          } else this.resetRound();
        }
        return;
      }
      if (this.hitstop > 0) {
        this.hitstop -= dt;
        this.fighters.forEach((f) => this.tint(f));
        return;
      }
      this.timer = mode === "training" ? 60 : Math.max(0, this.timer - dt);
      let p1 = mergeInput(inputs[0], pads[0]);
      let p2;
      if (mode === "training") {
        const dummy = this.dummyInput(dt, p1);
        p2 = dummy.input;
        if (dummy.puppet) p1 = {};
      } else p2 = mode === "local" ? mergeInput(inputs[1], pads[1]) : this.ai(dt);
      for (const shot of this.projectiles) {
        shot.life -= dt;
        shot.x += shot.face * (shot.move.projectileSpeed || 580) * dt;
        paintProjectile(this.fx, shot, settings.reducedMotion ? 0 : this.elapsed);
        if (
          canBeHit(shot.target) &&
          Math.abs(shot.x - shot.target.x) < 45 &&
          Math.abs(shot.y - (shot.target.y - 95)) < 65
        ) {
          this.pendingHits.push([
            shot.owner,
            shot.target,
            { ...shot.move, face: shot.face, source: shot.move },
            shot.index,
          ]);
          shot.life = 0;
        }
      }
      this.projectiles = this.projectiles.filter(
        (p) => p.life > 0 && p.x > 0 && p.x < 960,
      );
      this.tickFighter(this.fighters[0], this.fighters[1], p1, dt, 0);
      this.tickFighter(this.fighters[1], this.fighters[0], p2, dt, 1);
      for (const hit of this.pendingHits) this.hit(...hit);
      this.pendingHits = [];
      const [p, o] = this.fighters;
      // A trial drops when the dummy recovers before the POWER lands.
      if (training.trial && o.comboHits === 0) trialDrop(training.trial);
      if (Math.abs(p.x - o.x) < 62 && Math.abs(p.y - o.y) < 100) {
        const mid = (p.x + o.x) / 2,
          sign = p.x <= o.x ? 1 : -1;
        p.x = Phaser.Math.Clamp(mid - sign * 31, 65, 895);
        o.x = Phaser.Math.Clamp(mid + sign * 31, 65, 895);
      }
      if (mode === "training") {
        p.energy = 100;
        if (o.hp <= 0) {
          o.hp = 100;
          o.x = 690;
          message.textContent = "DUMMY RESET";
          this.time.delayedCall(650, () => {
            if (!destroyed) message.textContent = "";
          });
        }
        p.hp = 100;
      } else if (p.hp <= 0 || o.hp <= 0 || this.timer <= 0) this.finishRound();
      if (Math.floor(this.elapsed * 12) !== this.lastSync) {
        this.lastSync = Math.floor(this.elapsed * 12);
        this.sync();
      }
    }
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    listeners.forEach((fn) => fn());
    controller.destroy();
    game?.destroy(true);
    audio?.close().catch(() => {});
    wrapper.remove();
  }
  game = new Phaser.Game({
    type: Phaser.AUTO,
    callbacks: { postBoot: () => (wrapper.dataset.loaded = "true") },
    parent: wrapper,
    width: 960,
    height: 540,
    backgroundColor: "#090a17",
    pixelArt: true,
    antialias: false,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: Fight,
    audio: { noAudio: true },
    input: { keyboard: false },
    render: { roundPixels: true },
  });
  return { destroy, pause, resume };
}
