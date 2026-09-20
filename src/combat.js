import Phaser from "phaser";
import { motionFrame } from "./motion.js";
import { MOVES, moveFrame, moveName, movePhase } from "./moves.js";
import { paintAtmosphere, paintPower } from "./stage-effects.js";
import {
  SPECIAL_COST,
  createAttack,
  inMeleeRange,
  hitOutcome,
  roundOutcome,
} from "./combat-rules.js";

const CSS = `
.mvm-combat{position:relative;width:100%;height:100%;min-height:300px;background:#080914;overflow:hidden;isolation:isolate}.mvm-combat canvas{display:block;width:100%;height:100%;object-fit:contain}.mvm-hud{position:absolute;inset:16px 3% auto;display:grid;grid-template-columns:1fr 72px 1fr;gap:14px;pointer-events:none;font-family:inherit;color:white;text-shadow:0 2px #000}.mvm-hud-name{font-size:clamp(10px,1.7vw,19px);font-weight:900;letter-spacing:.07em;margin-bottom:5px;text-transform:uppercase}.mvm-hud-right{text-align:right}.mvm-health{height:20px;border:3px solid #f6e0a0;background:#542a37;box-shadow:0 3px #000}.mvm-health>i{display:block;height:100%;background:linear-gradient(#fff292,#edb42a);transition:width .12s}.mvm-hud-right .mvm-health>i{margin-left:auto}.mvm-energy{height:5px;background:#27293c;margin-top:5px}.mvm-energy>i{display:block;height:100%;background:#7cecde;transition:width .1s}.mvm-rounds{font-size:15px;color:#ffd96b;letter-spacing:6px;margin-top:3px}.mvm-clock{font-size:36px;text-align:center;font-weight:950;color:#ffdf74;line-height:1}.mvm-clock small{display:block;font-size:9px;color:white;letter-spacing:2px;margin-bottom:4px}.mvm-pause-button{position:absolute;right:12px;bottom:13px;z-index:4;border:1px solid #ffffff55;background:#111827cc;color:white;padding:8px 12px;cursor:pointer}.mvm-message{position:absolute;inset:39% 0 auto;text-align:center;pointer-events:none;color:#ffe6a2;font-size:clamp(24px,5vw,64px);font-weight:950;font-style:italic;text-shadow:4px 4px #421849,-2px -2px #090915;letter-spacing:.06em}.mvm-overlay{position:absolute;inset:0;background:#090a17df;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:18px;z-index:10;color:white;backdrop-filter:blur(8px)}.mvm-overlay h2{font-size:40px;margin:0}.mvm-overlay button{padding:14px 35px;min-width:220px;background:#edbb57;color:#171121;border:0;font:700 15px inherit;cursor:pointer}.mvm-overlay button:last-child{background:#252638;color:white}.mvm-touch{position:absolute;bottom:8px;left:2%;right:2%;display:flex;justify-content:space-between;align-items:end;pointer-events:none;z-index:3;touch-action:none}.mvm-touch-cluster{display:grid;grid-template-columns:repeat(3,48px);gap:5px;pointer-events:auto}.mvm-touch button{height:44px;border:1px solid #ffffff77;background:#121727c9;color:white;font-weight:900;font-size:12px;touch-action:none;user-select:none;border-radius:5px}.mvm-touch button:active,.mvm-touch button.held{background:#e6b449;color:#090b17}.mvm-touch .mvm-touch-up{grid-column:2}.mvm-touch .mvm-touch-left{grid-column:1}.mvm-touch .special{color:#ffdc76}.mvm-touch .wide{grid-column:span 3;height:31px}.mvm-combat[data-touch="false"] .mvm-touch{display:none}.mvm-combat[data-touch="true"] .mvm-pause-button{bottom:165px}.mvm-help{position:absolute;left:16px;bottom:14px;color:#ffffff88;font-size:10px;letter-spacing:1px;pointer-events:none}.mvm-combat[data-touch="true"] .mvm-help{display:none}@media(max-width:600px){.mvm-hud{inset:10px 3% auto;gap:8px;grid-template-columns:1fr 48px 1fr}.mvm-health{height:14px;border-width:2px}.mvm-clock{font-size:26px}.mvm-rounds{font-size:11px}.mvm-touch-cluster{grid-template-columns:repeat(3,42px)}.mvm-touch button{height:37px}}
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
    `<div class="mvm-hud"><div><div class="mvm-hud-name">${safe(player.name)}</div><div class="mvm-health"><i data-health="0"></i></div><div class="mvm-energy"><i data-energy="0"></i></div><div class="mvm-rounds" data-rounds="0">○ ○</div></div><div class="mvm-clock"><small>TIME</small><span data-time>60</span><button class="mvm-pause-button" aria-label="Pause match">Ⅱ PAUSE</button></div><div class="mvm-hud-right"><div class="mvm-hud-name">${safe(opponent.name)}</div><div class="mvm-health"><i data-health="1"></i></div><div class="mvm-energy"><i data-energy="1"></i></div><div class="mvm-rounds" data-rounds="1">○ ○</div></div></div><div class="mvm-message"></div><div class="mvm-help">A D MOVE · W JUMP · S CROUCH · J K L PUNCH · U I O KICK · Q POWER · SHIFT GUARD · ESC PAUSE</div><div class="mvm-touch"><div class="mvm-touch-cluster"><button class="mvm-touch-up" data-control="jump" aria-label="Jump">↑</button><button class="mvm-touch-left" data-control="left" aria-label="Move left">←</button><button data-control="crouch" aria-label="Crouch">↓</button><button data-control="right" aria-label="Move right">→</button></div><div class="mvm-touch-cluster"><button data-control="light" aria-label="Light punch">LP</button><button data-control="medium" aria-label="Medium punch">MP</button><button data-control="heavy" aria-label="Heavy punch">HP</button><button data-control="kick" aria-label="Light kick">LK</button><button data-control="mediumKick" aria-label="Medium kick">MK</button><button data-control="heavyKick" aria-label="Heavy kick">HK</button><button data-control="special" class="special">POWER</button><button data-control="block" style="grid-column:span 2">GUARD</button></div></div>`,
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
  let trainingGuard = false;
  let assetFailed = false;
  wrapper.insertAdjacentHTML(
    "beforeend",
    `<div class="mvm-stage-label">${safe(arena.name)} <span>${mode === "training" ? "TRAINING / INFINITE METER" : "FIRST TO TWO"}</span></div><div class="mvm-power-callout" aria-live="polite"></div><div class="mvm-combo"></div><div class="mvm-training-readout"></div>`,
  );
  wrapper.querySelectorAll(".mvm-energy").forEach((el, i) => {
    el.insertAdjacentHTML(
      "afterend",
      `<div class="mvm-meter-label" data-meter-label="${i}"></div>`,
    );
  });
  if (mode === "training") {
    wrapper.insertAdjacentHTML(
      "beforeend",
      '<div class="mvm-training-tools"><button data-training="reset">RESET</button><button data-training="guard" aria-pressed="false">DUMMY: OPEN</button><button data-training="moves">MOVES</button></div>',
    );
    wrapper.querySelector('[data-training="reset"]').onclick = () => {
      if (scene && !paused) {
        scene.resetRound();
        Object.keys(stats).forEach((k) => (stats[k] = 0));
      }
    };
    wrapper.querySelector('[data-training="guard"]').onclick = (e) => {
      trainingGuard = !trainingGuard;
      e.target.textContent = trainingGuard ? "DUMMY: GUARD" : "DUMMY: OPEN";
      e.target.setAttribute("aria-pressed", String(trainingGuard));
    };
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
    wrapper
      .querySelectorAll(".held")
      .forEach((b) => b.classList.remove("held"));
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
  const keyMap = {
    KeyA: [0, "left"],
    KeyD: [0, "right"],
    KeyW: [0, "jump"],
    KeyS: [0, "crouch"],
    KeyJ: [0, "light"],
    KeyK: [0, "medium"],
    KeyL: [0, "heavy"],
    KeyU: [0, "kick"],
    KeyI: [0, "mediumKick"],
    KeyO: [0, "heavyKick"],
    KeyQ: [0, "special"],
    ShiftLeft: [0, "block"],
    ShiftRight: [0, "block"],
    ArrowLeft: [1, "left"],
    ArrowRight: [1, "right"],
    ArrowUp: [1, "jump"],
    ArrowDown: [1, "crouch"],
    Numpad1: [1, "light"],
    Numpad2: [1, "medium"],
    Numpad3: [1, "heavy"],
    Numpad4: [1, "kick"],
    Numpad5: [1, "mediumKick"],
    Numpad6: [1, "heavyKick"],
    Numpad0: [1, "special"],
    Space: [1, "block"],
  };
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
  wrapper.querySelectorAll("[data-control]").forEach((button) => {
    const c = button.dataset.control;
    bind(button, "pointerdown", (e) => {
      e.preventDefault();
      if (paused) return;
      button.setPointerCapture(e.pointerId);
      pressed[0][c] = true;
      inputs[0][c] = true;
      button.classList.add("held");
    });
    const up = (e) => {
      e.preventDefault();
      inputs[0][c] = false;
      button.classList.remove("held");
    };
    bind(button, "pointerup", up);
    bind(button, "pointercancel", up);
    bind(button, "lostpointercapture", up);
  });
  const stats = {
    damageDealt: 0,
    damageTaken: 0,
    hits: 0,
    blocked: 0,
    specials: 0,
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
          x: sprite.x,
          y: 450,
          vy: 0,
          hp: 100,
          energy: 35,
          rounds: 0,
          face: i ? -1 : 1,
          attack: null,
          cooldown: 0,
          stun: 0,
          combo: 0,
          lastHit: -100,
          guard: false,
          crouch: false,
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
      const powerButton = wrapper.querySelector('[data-control="special"]');
      const ready = this.fighters[0].energy >= SPECIAL_COST;
      powerButton.dataset.ready = String(ready);
      powerButton.setAttribute(
        "aria-label",
        `${player.move}. ${ready ? "Ready" : "Requires 35 meter"}`,
      );
      powerButton.textContent = ready
        ? "POWER ◆"
        : "POWER " + Math.floor(this.fighters[0].energy);
      wrapper.querySelector("[data-time]").textContent = String(
        Math.ceil(this.timer),
      ).padStart(2, "0");
      onHud?.({
        player: this.fighters[0].hp,
        opponent: this.fighters[1].hp,
        time: Math.ceil(this.timer),
      });
    }
    ai(dt) {
      this.aiClock -= dt;
      if (this.aiClock > 0) return this.aiAction;
      const ai = this.fighters[1],
        p = this.fighters[0],
        distance = Math.abs(ai.x - p.x);
      const hard = difficulty === "hard",
        easy = difficulty === "easy";
      this.aiClock = easy ? 0.29 : hard ? 0.11 : 0.19;
      const a = {};
      if (distance > 125) {
        a[ai.x > p.x ? "left" : "right"] = true;
        if (Math.random() < 0.045) a.jump = true;
      } else {
        if (p.attack && Math.random() < (hard ? 0.8 : easy ? 0.23 : 0.48))
          a.block = true;
        else if (Math.random() < 0.75) {
          a[
            ai.energy >= 35 && Math.random() < 0.25
              ? "special"
              : MOVES[Math.floor(Math.random() * 6)].type
          ] = true;
        }
        if (distance < 65 && Math.random() < 0.15)
          a[ai.x > p.x ? "right" : "left"] = true;
        if (Math.random() < 0.025) a.jump = true;
      }
      this.aiAction = a;
      return a;
    }
    attack(f, type) {
      const m = createAttack(f, type);
      if (!m) return false;
      f.attack = m;
      f.lastMove = type;
      f.guard = false;
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
      f.energy = Math.min(100, f.energy + dt * 5);
      if (!f.attack && f.stun <= 0) f.face = enemy.x >= f.x ? 1 : -1;
      f.guard = !!a.block && f.y >= 449 && !f.attack && f.stun <= 0;
      f.crouch = !!a.crouch && f.y >= 449 && !f.attack;
      const speed = 185 + Math.min(10, Number(f.c.speed) || 5) * 9;
      if (!f.attack && f.stun <= 0 && !f.guard && !f.crouch) {
        f.x += ((a.right ? 1 : 0) - (a.left ? 1 : 0)) * speed * dt;
        if (a.jump && f.y >= 449) {
          f.vy = -540;
          beep(260, 0.08, "sine", 0.02);
        }
      }
      if (f.stun <= 0 && !f.guard) {
        const human = index === 0 || mode === "local";
        const strike = human
          ? buffers[index]?.type
          : [...MOVES].reverse().find((m) => a[m.type])?.type;
        if (strike && this.attack(f, strike) && human) buffers[index] = null;
      }
      f.vy += 1450 * dt;
      f.y += f.vy * dt;
      if (f.y >= 450) {
        f.y = 450;
        f.vy = 0;
      }
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
          if (inMeleeRange(f, enemy, m)) {
            m.hit = true;
            this.pendingHits.push([f, enemy, { ...m, face: f.face }, index]);
          }
        }
        if (m.t >= m.duration) {
          f.attack = null;
          f.cooldown = 0.07;
        }
      }
      this.renderFighter(f, a, dt, index);
    }
    renderFighter(f, a, dt, index, forcedState) {
      const moving =
        !f.attack &&
        !f.guard &&
        !f.crouch &&
        f.stun <= 0 &&
        (a.left || a.right);
      const state =
        forcedState ||
        (f.attack
          ? "attack"
          : f.stun > 0
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
        .setScale(f.scale);
      f.shadow.setPosition(f.x, 452).setScale(1 - (450 - f.y) / 600);
      if (f.stun > 0 && f.visualTime < 0.05) f.sprite.setTint(0xffc6b4);
      else f.sprite.clearTint();
    }

    hit(f, e, m, index) {
      const outcome = hitOutcome(f, e, m);
      const { blocking, damage } = outcome;
      e.hp = outcome.health;
      e.x = Phaser.Math.Clamp(
        e.x + (m.face ?? f.face) * outcome.knockback,
        65,
        895,
      );
      e.stun = outcome.stun;
      if (!blocking) e.attack = null;
      f.energy = outcome.energy;
      this.hitstop = blocking ? 0.025 : 0.055;
      if (index === 0) {
        stats.damageDealt += damage;
        if (!blocking) {
          stats.hits++;
          f.combo = this.elapsed - f.lastHit < 1.3 ? f.combo + 1 : 1;
          f.lastHit = this.elapsed;
          stats.maxCombo = Math.max(stats.maxCombo, f.combo);
        }
      } else {
        stats.damageTaken += damage;
        if (blocking) stats.blocked++;
      }
      this.sparks.push({
        x: (f.x + e.x) / 2,
        y: Math.min(f.y, e.y) - 90,
        life: 0.22,
        block: blocking,
        special: m.type === "special",
      });
      if (!settings.reducedMotion && !blocking)
        this.cameras.main.shake(
          m.type === "special" ? 100 : 45,
          m.type === "special" ? 0.007 : 0.003,
        );
      beep(
        blocking ? 600 : m.type === "heavy" ? 90 : 130,
        0.1,
        blocking ? "triangle" : "square",
        0.045,
      );
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
          (win === p ? "YOU WIN" : "RIVAL WINS")
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
          attack: null,
          stun: 0,
          cooldown: 0,
          guard: false,
          crouch: false,
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
        if (type && this.phase === "fight") buffers[i] = { type, life: 0.16 };
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
      const activePlayer = this.fighters[0];
      wrapper.querySelector(".mvm-combo").textContent =
        this.elapsed - activePlayer.lastHit < 1.3 && activePlayer.combo > 1
          ? `${activePlayer.combo} HIT CHAIN`
          : "";
      if (mode === "training")
        wrapper.querySelector(".mvm-training-readout").textContent =
          `${moveName(activePlayer.c, activePlayer.lastMove)} · ${movePhase(activePlayer.attack)} / ${Math.round(stats.damageDealt)} DAMAGE · ${stats.hits} HITS`;
      this.sparks = this.sparks.filter((s) => (s.life -= dt) > 0);
      for (const s of this.sparks) {
        this.fx.lineStyle(
          s.special ? 5 : 3,
          s.block ? 0x91dcff : 0xffe49e,
          s.life / 0.22,
        );
        for (let j = 0; j < 8; j++) {
          let a = (j * Math.PI) / 4;
          let r = (1 - s.life / 0.22) * 60;
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
        return;
      }
      this.timer = mode === "training" ? 60 : Math.max(0, this.timer - dt);
      const p2 =
        mode === "training"
          ? { block: trainingGuard }
          : mode === "local"
            ? mergeInput(inputs[1], pads[1])
            : this.ai(dt);
      for (const shot of this.projectiles) {
        shot.life -= dt;
        shot.x += shot.face * (shot.move.projectileSpeed || 580) * dt;
        const color = parseInt(shot.owner.c.color.slice(1), 16);
        this.fx.fillStyle(color, 0.18);
        this.fx.fillEllipse(shot.x - shot.face * 20, shot.y, 86, 36);
        this.fx.lineStyle(3, color, 0.9);
        this.fx.strokeCircle(shot.x, shot.y, 21);
        this.fx.fillStyle(color, 0.8);
        this.fx.fillCircle(shot.x, shot.y, 15);
        this.fx.fillStyle(0xffffff, 0.9);
        this.fx.fillRect(shot.x - 8, shot.y - 5, 16, 10);
        if (
          Math.abs(shot.x - shot.target.x) < 45 &&
          Math.abs(shot.y - (shot.target.y - 95)) < 65
        ) {
          this.pendingHits.push([
            shot.owner,
            shot.target,
            { ...shot.move, face: shot.face },
            shot.index,
          ]);
          shot.life = 0;
        }
      }
      this.projectiles = this.projectiles.filter(
        (p) => p.life > 0 && p.x > 0 && p.x < 960,
      );
      this.tickFighter(
        this.fighters[0],
        this.fighters[1],
        mergeInput(inputs[0], pads[0]),
        dt,
        0,
      );
      this.tickFighter(this.fighters[1], this.fighters[0], p2, dt, 1);
      for (const hit of this.pendingHits) this.hit(...hit);
      this.pendingHits = [];
      const [p, o] = this.fighters;
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
