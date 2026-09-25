import "./style.css";
import { characters, bodyScale } from "./characters.js";
import { arenas } from "./arenas.js";
import { MOVES, SYSTEM_MOVES, BINDABLE, kitFor, bindingsFor, keyLabel } from "./moves.js";
import { startCombat } from "./combat.js";
import { startBonus } from "./bonus.js";
import { createTournament, recordPlayerResult, currentOpponent, isChampion, isEliminated, isFinalRound, roundName, playerFinish, ROUND_NAMES, ROUND_SHORT } from "./tournament.js";

const app = document.querySelector("#app");
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};
let settings = {
  sound: true,
  reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  difficulty: "normal",
  ...read("mvm-settings", {}),
};
let record = {
  wins: 0,
  matches: 0,
  streak: 0,
  best: 0,
  ...read("mvm-record", {}),
};
let state = {
  screen: "title",
  mode: "arcade",
  player: 0,
  opponent: 1,
  arena: 0,
  selecting: "player",
  ladder: [],
  stage: 0,
  tournament: null, // TOURNAMENT MODE bracket (src/tournament.js); null outside tournaments
};
let combat = null,
  transitionTimer = null,
  audioCtx;
let continueTimer = null,
  bonus = null;
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const pad2 = (n) => String(n).padStart(2, "0");
// Arcade: eight mixed-role reflections, then your own shadow. FULL CIRCLE faces every other identity.
const LADDER_SHORT = 8;
const quoteFor = (c) => c.quote || "The reflection never lies.";
const isLocal = () => state.mode === "local";
const isTournament = () => state.mode === "tournament";
const isFinal = () =>
  state.mode === "arcade" &&
  state.ladder.length > 0 &&
  state.stage === state.ladder.length - 1;
function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
// Deal the remaining identities round-robin by role so the ladder mixes styles.
function mixedOpponents(exclude = []) {
  const groups = {};
  for (const i of shuffle(characters.map((_, i) => i)))
    if (i !== state.player && !exclude.includes(i))
      (groups[kitFor(characters[i]).role] ||= []).push(i);
  const roles = shuffle(Object.keys(groups));
  const out = [];
  while (roles.some((r) => groups[r].length))
    for (const r of roles) if (groups[r].length) out.push(groups[r].shift());
  return out;
}
function buildLadder() {
  const cleared = state.ladder.slice(0, state.stage);
  const total = settings.fullCircle ? characters.length - 1 : LADDER_SHORT;
  const rest = mixedOpponents(cleared).slice(0, Math.max(0, total - cleared.length));
  state.ladder = [...cleared, ...rest, state.player];
  state.opponent = state.ladder[state.stage];
}
const COUNT_WORDS = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE"];
const countWord = (n) => COUNT_WORDS[n] ?? String(n);
const icon = (name) =>
  ({
    sound: "♫",
    muted: "♪",
    close: "×",
    arrow: "↗",
    back: "←",
    fullscreen: "⛶",
    gear: "⚙",
  })[name] || name;
const playClick = () => {
  if (!settings.sound) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume();
    const o = audioCtx.createOscillator(),
      g = audioCtx.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(440, audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(240, audioCtx.currentTime + 0.07);
    g.gain.setValueAtTime(0.025, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.09);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.1);
  } catch {}
};
function applySettings() {
  document.body.classList.toggle("reduced-motion", settings.reducedMotion);
  save("mvm-settings", settings);
}
applySettings();
function portrait(c, classes = "") {
  const scale = bodyScale(c);
  const scaled = scale === 1 ? "" : ` style="--body-scale:${scale}"`;
  return `<img class="fighter-art ${classes}${scaled ? " body-scaled" : ""}"${scaled} src="${esc(c.portrait)}" alt="${esc(c.name)}" draggable="false">`;
}
function chrome(label = "THE ONLY RIVAL IS YOU") {
  return `<header class="topbar"><button class="brand" data-action="home" aria-label="Me vs Me home">M<span>×</span>M<span class="brand-dot">™</span></button><div class="topbar-center"><span class="live-dot"></span>${label}</div><nav class="utility"><button class="icon-button" data-action="sound" aria-label="${settings.sound ? "Mute" : "Enable"} sound" title="Sound ${settings.sound ? "on" : "off"}">${icon(settings.sound ? "sound" : "muted")}<span class="sound-state">${settings.sound ? "ON" : "OFF"}</span></button><button class="icon-button fullscreen-button" data-action="fullscreen" aria-label="Toggle fullscreen">${icon("fullscreen")}</button><button class="icon-button" data-action="settings" aria-label="Settings">${icon("gear")}</button></nav></header>`;
}
function footer(text = `ONE MIND. ${characters.length} WAYS TO FIGHT.`) {
  return `<footer class="bottom-bar"><span>${text}</span><span>COLLECTIVE AI <span class="footer-cross">×</span> HATAALII</span><button data-action="help">HOW TO PLAY <span>?</span></button></footer>`;
}
function setScreen(screen) {
  clearTimeout(transitionTimer);
  clearTimeout(continueTimer);
  continueTimer = null;
  const changed = state.screen !== screen;
  state.screen = screen;
  document.body.dataset.screen = screen;
  if (changed) window.scrollTo(0, 0);
}
function title() {
  setScreen("title");
  const lead = characters[0],
    second = characters[Math.min(5, characters.length - 1)];
  app.innerHTML = `${chrome()}<main class="title-screen"><div class="title-copy"><div class="eyebrow"><span class="tiny-cross">✦</span> AN INNER CONFLICT. AN ARCADE CLASSIC.</div><h1 class="game-title"><span>ME<span class="title-stroke">.</span></span><em>VERSUS</em><span>ME<span class="title-stroke">.</span></span></h1><p class="hero-description">${characters.length} versions. One original.<br>Find out who you are when you fight yourself.</p><div class="title-actions"><button class="button primary start-button" data-action="start" data-mode="duel">CHOOSE YOUR MATCH <span>↗</span></button><div class="secondary-actions"><button data-action="start" data-mode="local">VERSUS / TWO PLAYERS <span>↗</span></button><button data-action="start" data-mode="arcade">ARCADE LADDER <span>↗</span></button><button data-action="start" data-mode="tournament">TOURNAMENT <span>↗</span></button><button data-action="start" data-mode="training">TRAINING <span>↗</span></button></div></div><div class="hero-meta"><span>${characters.length} <small>FIGHTERS</small></span><i></i><span>${pad2(arenas.length)} <small>STAGES</small></span><i></i><span>01 <small>YOU</small></span></div></div><div class="hero-stage"><div class="stage-word">KNOW<br>THYSELF.</div><div class="hero-sun"></div><div class="stage-grid"></div><div class="hero-character hero-character-back">${portrait(second)}</div><div class="hero-character hero-character-front">${portrait(lead)}</div><div class="stage-caption"><span class="live-dot"></span>PLAYER 01 <strong>HATAALII</strong><small>ALL ROADS LEAD BACK TO YOU</small></div><div class="edition-label">EST. 2026<br>ARCADE EDITION / 01</div></div></main><div class="title-ticker"><span>ONE PLAYER OR TWO / SAME CABINET</span><b>✦</b><span>FACE YOUR OTHER SIDE</span><b>✦</b><span>BEST OF THREE</span><b>✦</b><span>${countWord(arenas.length)} PLACES TO SETTLE IT</span><b>✦</b></div>${footer()}`;
  bind();
}
function begin(mode) {
  state.mode = mode;
  state.selecting = "player";
  state.stage = 0;
  state.ladder = [];
  if (!read("mvm-onboarded", false)) {
    showHelp(() => {
      save("mvm-onboarded", true);
      selection();
    });
  } else selection();
}
function kitLine(c) {
  const kit = kitFor(c);
  return `<div class="kit-line"><span class="role-tag" data-role="${kit.role}">${kit.label}</span><span>${esc(kit.job)}</span><small>POWER CLASS · ${esc(kit.powerClass)}${kit.style ? ` / ${esc(kit.style)}` : ""}</small></div>`;
}
function fighterPreview(c, side) {
  return `<section class="selection-fighter ${side}" style="--fighter-color:${esc(c.color || "#eb533d")}"><div class="fighter-index">${side === "left" ? (isLocal() ? "01 / PLAYER ONE" : "01 / YOU") : isLocal() ? "02 / PLAYER TWO" : "02 / YOUR OTHER SIDE"}</div><div class="preview-watermark">${side === "left" ? "PLAYER" : isLocal() ? "P2" : "RIVAL"}</div><div class="fighter-floor"></div>${portrait(c)}<div class="fighter-bio"><span class="eyebrow">${esc(c.title || "ANOTHER SIDE OF YOU")}</span><h2>${esc(c.name)}</h2><p>${esc(c.description || "A different version. The same fighting spirit.")}</p><div class="fighter-stats">${[
    ["POWER", c.power],
    ["SPEED", c.speed],
    ["REACH", c.reach],
  ]
    .map(
      ([n, v]) =>
        `<div><span>${n}</span><div class="stat-track"><i style="width:${Math.max(20, Math.min(100, Number(v || 6) <= 10 ? Number(v || 6) * 10 : Number(v)))}%"></i></div></div>`,
    )
    .join(
      "",
    )}</div><div class="signature"><span>SIGNATURE</span><strong>${esc(c.move || "Inner conflict")}</strong></div>${kitLine(c)}</div></section>`;
}
function selection() {
  setScreen("selection");
  const p = characters[state.player],
    o = characters[state.opponent];
  const local = isLocal();
  const second = local ? "P2" : "CPU";
  const eyebrow =
    state.mode === "arcade"
      ? "ARCADE / FIGHT YOUR WAY THROUGH THE ROSTER"
      : isTournament()
        ? "TOURNAMENT / EIGHT ENTER. ONE IS CROWNED."
      : state.mode === "training"
        ? "TRAINING / NO PRESSURE. FIND YOUR RHYTHM."
        : local
          ? "VERSUS / TWO PLAYERS · SAME CABINET"
          : "QUICK DUEL / SETTLE IT IN THREE ROUNDS";
  const heading =
    state.selecting === "player"
      ? "CHOOSE YOUR <em>SELF.</em>"
      : local
        ? "PLAYER <em>TWO.</em>"
        : "CHOOSE YOUR <em>RIVAL.</em>";
  const caption =
    state.selecting === "player"
      ? local
        ? "PLAYER ONE SELECT YOUR FIGHTER"
        : "SELECT YOUR FIGHTER"
      : local
        ? "PLAYER TWO SELECT YOUR FIGHTER"
        : "SELECT YOUR OPPONENT";
  const confirm =
    state.selecting === "player"
      ? state.mode === "arcade"
        ? "START ARCADE LADDER"
        : isTournament()
          ? "ENTER THE TOURNAMENT"
        : local
          ? "NEXT: PLAYER TWO"
          : "NEXT: CHOOSE OPPONENT"
      : local
        ? "CONFIRM PLAYER TWO & CHOOSE STAGE"
        : "CONFIRM RIVAL & CHOOSE STAGE";
  app.innerHTML = `${chrome(local ? "TWO PLAYERS. ONE CABINET." : "CHOOSE YOUR SIDE")}<main class="selection-screen"><div class="screen-heading"><button class="text-button" data-action="home">← BACK</button><div><span class="eyebrow">${eyebrow}</span><h1>${heading}</h1></div><span class="step-counter">01 <small>/ 03</small></span></div><div class="selection-stage">${fighterPreview(p, "left")}<div class="selection-vs"><span>VS</span><small>SAME SOUL.<br>DIFFERENT FIGHT.</small></div>${fighterPreview(o, "right")}</div><div class="roster-section">${state.mode !== "arcade" && !isTournament() ?`<div class="selection-tabs" aria-label="Choose which fighter to edit"><button data-action="select-player" aria-pressed="${state.selecting === "player"}">${local ? "1 · PLAYER ONE" : "1 · YOUR FIGHTER"}</button><button data-action="select-opponent" aria-pressed="${state.selecting === "opponent"}">${local ? "2 · PLAYER TWO" : "2 · YOUR OPPONENT"}</button></div>` : ""}<div class="roster-caption"><span><b>${state.selecting === "player" ? "P1" : second}</b> ${caption}</span><span>ALL ${characters.length} VERSIONS UNLOCKED</span></div><div class="roster">${characters.map((c, i) => `<button class="roster-fighter ${state[state.selecting] === i ? "selected" : ""} ${state.player === i ? "p1-chosen" : ""}" data-action="fighter" data-index="${i}" style="--fighter-color:${esc(c.color || "#e95541")}" aria-label="Select ${esc(c.name)}, ${esc(kitFor(c).label.toLowerCase())}" aria-pressed="${state[state.selecting] === i}"><span class="roster-num">${String(i + 1).padStart(2, "0")}</span>${portrait(c)}<strong>${esc(c.name)}</strong><small class="role-tag" data-role="${kitFor(c).role}">${kitFor(c).label}</small>${state[state.selecting] === i ? `<span class="selected-marker">${state.selecting === "player" ? "P1" : second}</span>` : ""}</button>`).join("")}</div><div class="selection-bottom"><div class="selection-hint"><span class="keycap">←</span><span class="keycap">→</span> CHOOSE <span class="keycap">↵</span> CONFIRM</div><div class="selection-actions"><button class="button outline" data-action="moves">MOVE LIST</button>${state.selecting === "opponent" ? `<button class="button outline" data-action="mirror">MIRROR MATCH</button><button class="text-button" data-action="select-player">CHANGE P1</button>` : ""}<button class="button primary" data-action="confirm-fighter">${confirm} <span>→</span></button></div></div></div></main>${footer(local ? "PLAYER TWO: ARROWS + NUMPAD, OR A SECOND PAD." : "EVERY VERSION HAS SOMETHING TO PROVE.")}`;
  bind();
}
function confirmFighter() {
  if (state.selecting === "player") {
    if (state.mode === "arcade") {
      state.stage = 0;
      state.ladder = [];
      buildLadder();
      arenaSelection();
    } else if (isTournament()) {
      startTournament();
    } else {
      state.selecting = "opponent";
      if (state.opponent === state.player)
        state.opponent = (state.player + 1) % characters.length;
      selection();
    }
  } else arenaSelection();
}
function arenaSelection() {
  setScreen("arena");
  const a = arenas[state.arena];
  app.innerHTML = `${chrome("PICK YOUR BATTLEGROUND")}<main class="arena-screen"><div class="screen-heading"><button class="text-button" data-action="back-fighters">← FIGHTERS</button><div><span class="eyebrow">${countWord(arenas.length)} STAGES. NO PLACE TO HIDE.</span><h1>WHERE IT <em>GOES DOWN.</em></h1></div><span class="step-counter">02 <small>/ 03</small></span></div><div class="arena-showcase" style="--arena-color:${esc(a.color || "#f05d46")};background-image:url('${esc(a.background)}')"><div class="arena-vignette"></div><span class="arena-coordinate">STAGE ${pad2(state.arena + 1)} / ${pad2(arenas.length)}<br>PRIVATE BATTLEGROUNDS</span><div class="arena-showcase-copy"><span class="eyebrow">${esc(a.subtitle || "THE NEXT CHAPTER")}</span><h2>${esc(a.name)}</h2></div><div class="arena-fighters">${portrait(characters[state.player])}<b>VS</b>${portrait(characters[state.opponent], "flipped")}</div></div><div class="arena-strip">${arenas.map((ar, i) => `<button class="arena-option ${i === state.arena ? "selected" : ""}" data-action="arena" data-index="${i}" style="background-image:url('${esc(ar.background)}')" aria-pressed="${i === state.arena}"><span>${pad2(i + 1)}</span><strong>${esc(ar.name)}</strong>${i === state.arena ? "<i>SELECTED</i>" : ""}</button>`).join("")}</div><div class="selection-bottom"><span class="mode-info">${state.mode === "arcade" ? `ARCADE · STAGE ${state.stage + 1} OF ${state.ladder.length}` : isLocal() ? "VERSUS" : state.mode.toUpperCase()} <b> / </b>${isLocal() ? "TWO PLAYERS · SAME CABINET" : `${settings.difficulty.toUpperCase()} CPU`}</span>${state.mode === "arcade" && state.stage === 0 ? fullCircleToggle() : ""}<button class="button primary" data-action="fight">LET'S SETTLE THIS <span>→</span></button></div></main>${footer("YOU CAN CHANGE THE SCENERY. NOT YOUR OPPONENT.")}`;
  bind();
  // The phone strip scrolls sideways; keep the chosen stage in view after each render.
  app
    .querySelector(".arena-option.selected")
    ?.scrollIntoView?.({ inline: "center", block: "nearest" });
}
function fullCircleToggle() {
  return `<button class="toggle full-circle ${settings.fullCircle ? "active" : ""}" data-action="full-circle" aria-pressed="${Boolean(settings.fullCircle)}">FULL CIRCLE · ${settings.fullCircle ? `ALL ${characters.length - 1}` : `${LADDER_SHORT} + SHADOW`}</button>`;
}
function nextChallenger() {
  const completed = state.stage + 1;
  state.stage++;
  state.opponent = state.ladder[state.stage];
  state.arena = (state.arena + 1) % arenas.length;
  // A destruction bonus follows every third win before the shadow final.
  if (completed % 3 !== 0) {
    arcadeRoute();
    return;
  }
  setScreen("bonus");
  app.innerHTML = '<main id="bonus-host" aria-label="Bonus challenge"></main>';
  bonus = startBonus({
    container: document.querySelector("#bonus-host"),
    character: characters[state.player],
    arena: arenas[state.arena],
    settings: { ...settings },
    onEnd: () => {
      bonus?.destroy();
      bonus = null;
      arcadeRoute();
    },
  });
}
function beginContinueCountdown() {
  let remaining = 10;
  const tick = () => {
    if (state.screen !== "result") return;
    if (document.querySelector(".modal-layer")) {
      continueTimer = setTimeout(tick, 1000);
      return;
    }
    remaining--;
    const display = document.querySelector(".continue-seconds");
    if (display) display.textContent = remaining;
    if (remaining <= 0) {
      title();
      return;
    }
    continueTimer = setTimeout(tick, 1000);
  };
  continueTimer = setTimeout(tick, 1000);
}
function arcadeRoute() {
  setScreen("route");
  app.innerHTML = `${chrome("THE ROAD TO SELF MASTERY")}<main class="route-screen"><span class="eyebrow">ARCADE JOURNEY · CHALLENGER ${state.stage + 1} OF ${state.ladder.length}${isFinal() ? " · FINAL" : ""}</span><h1>${isFinal() ? "YOUR<br><em>SHADOW.</em>" : "THE NEXT<br><em>REFLECTION.</em>"}</h1>${fullCircleToggle()}<div class="route-locations">${arenas.map((arena, index) => `<div class="route-location ${index === state.arena ? "current" : ""}" style="background-image:url('${esc(arena.background)}')"><span>${pad2(index + 1)}</span><strong>${esc(arena.name)}</strong>${index === state.arena ? "<b>NEXT DESTINATION</b>" : ""}</div>`).join("")}</div><ol class="route-roster">${state.ladder.map((id, index) => `<li class="${index < state.stage ? "cleared" : index === state.stage ? "current" : ""}${index === state.ladder.length - 1 ? " shadow" : ""}">${portrait(characters[id])}<span>${index === state.ladder.length - 1 ? "SHADOW " : ""}${esc(characters[id].name)}</span><b>${index < state.stage ? "DEFEATED" : index === state.stage ? "NEXT" : "WAITING"}</b></li>`).join("")}</ol><button class="button primary" data-action="fight">FACE ${isFinal() ? "YOUR SHADOW" : esc(characters[state.opponent].name)} <span>→</span></button></main>${footer(`${state.ladder.length - 1} REFLECTIONS. ONE SHADOW. ONE CHAMPION.`)}`;
  bind();
}
async function fight() {
  setScreen("versus");
  const p = characters[state.player],
    o = characters[state.opponent],
    a = arenas[state.arena];
  const local = isLocal(),
    shadow = isFinal();
  const top = shadow ? "YOUR SHADOW" : `ME VS ME / ${local ? "VERSUS" : state.mode.toUpperCase()}`;
  const rivalLabel = local ? "PLAYER TWO" : shadow ? "YOUR SHADOW" : "YOUR OTHER SIDE";
  app.innerHTML = `<main class="versus-screen${shadow ? " shadow-final" : ""}"><div class="versus-top"><span>${top}</span><span>${esc(a.name)}</span></div><div class="versus-panels"><div class="versus-player" style="--fighter-color:${esc(p.color)}">${portrait(p)}<div><small>PLAYER ONE</small><h2>${esc(p.name)}</h2></div></div><strong class="versus-mark">VS</strong><div class="versus-player rival" style="--fighter-color:${esc(o.color)}">${portrait(o, shadow ? "shadow-art" : "")}<div><small>${rivalLabel}</small><h2>${shadow ? "SHADOW " : ""}${esc(o.name)}</h2></div></div></div><div class="versus-bottom"><span>BEST OF THREE</span><span class="blink">${shadow ? "THE LAST REFLECTION IS YOU" : "GET READY TO MEET YOURSELF"}</span><span>${local ? "SAME CABINET" : settings.difficulty.toUpperCase()}</span></div></main>`;
  transitionTimer = setTimeout(
    launchCombat,
    settings.reducedMotion ? 250 : 1900,
  );
}
async function launchCombat() {
  setScreen("combat");
  app.innerHTML =
    '<main class="combat-host" id="combat-host" aria-label="Battle arena"></main>';
  try {
    combat = await startCombat({
      container: document.querySelector("#combat-host"),
      player: characters[state.player],
      opponent: isFinal()
        ? {
            ...characters[state.opponent],
            name: `SHADOW ${characters[state.opponent].name}`,
            shadow: true,
          }
        : characters[state.opponent],
      arena: arenas[state.arena],
      difficulty: settings.difficulty,
      mode: state.mode,
      settings: { ...settings },
      onMoves: () => showMoves(characters[state.player]),
      onEnd: result,
      onExit: () => {
        combat?.destroy();
        combat = null;
        title();
      },
    });
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="error-screen"><h1>ROUND INTERRUPTED</h1><p>The arena could not start. Please try again.</p><button class="button primary" data-action="back-arena">RETURN TO STAGE SELECT</button></div>`;
    bind();
  }
}
function result(data) {
  combat?.destroy();
  combat = null;
  const won = data.winner === "player";
  const local = isLocal();
  if (state.mode !== "training" && !local) {
    record.matches++;
    record.wins += won ? 1 : 0;
    record.streak = won ? record.streak + 1 : 0;
    record.best = Math.max(record.best, record.streak);
    save("mvm-record", record);
  }
  // Tournament matches take their own result flow (see TOURNAMENT MODE below).
  if (isTournament() && state.tournament) {
    tournamentResult(data, won);
    return;
  }
  setScreen("result");
  const complete =
    state.mode === "arcade" && won && state.stage >= state.ladder.length - 1;
  const reflections = state.ladder.length - 1;
  const winner = characters[won ? state.player : state.opponent];
  const quote = `<p class="victory-quote">“${esc(quoteFor(winner))}” <span>— ${esc(winner.name)}</span></p>`;
  const eyebrow = complete
    ? `ARCADE COMPLETE · ${reflections} REFLECTIONS AND YOUR SHADOW`
    : state.mode === "training"
      ? "TRAINING COMPLETE"
      : local
        ? won
          ? "PLAYER ONE WINS."
          : "PLAYER TWO WINS."
        : won
          ? "YOU WON THE FIGHT."
          : "YOUR OTHER SIDE HAD THE EDGE.";
  const story = complete
    ? `${reflections} reflections faced, then your own shadow. Every version defeated. You have come full circle — the strongest self is the one that keeps growing.`
    : local
      ? "Same cabinet, same soul. Run it back or change sides."
      : won
        ? "One version stronger. The next version is waiting."
        : "Every loss is a lesson from yourself. Run it back.";
  app.innerHTML = `${chrome("THE REFLECTION NEVER LIES")}<main class="result-screen ${won ? "victory" : "defeat"}"><div class="result-art">${portrait(winner)}<div class="result-art-floor"></div></div><div class="result-copy"><span class="eyebrow">${eyebrow}</span><h1>${complete ? "KNOW<br>THYSELF." : won ? "SELF<br>MASTERY." : "MEET YOUR<br>MATCH."}</h1><div class="result-score"><b>${data.playerRounds ?? (won ? 2 : 0)}</b><span>ROUNDS</span><b>${data.opponentRounds ?? (won ? 0 : 2)}</b></div>${quote}<p>${story}</p>${complete ? `<div class="champion-seal">SELF MASTERED <span>${reflections} / ${reflections} REFLECTIONS · SHADOW DEFEATED</span></div>` : ""}${state.mode === "arcade" && !won ? '<div class="continue-prompt">CONTINUE? <b class="continue-seconds" role="timer">10</b><span>Run it back before time runs out.</span></div>' : ""}<div class="result-actions">${state.mode === "arcade" && won && !complete ? '<button class="button primary" data-action="next-stage">NEXT CHALLENGER <span>→</span></button>' : '<button class="button primary" data-action="rematch">RUN IT BACK <span>↻</span></button>'}<button class="button outline" data-action="change-fighters">CHANGE FIGHTERS</button><button class="text-button" data-action="home">BACK TO TITLE</button></div><div class="match-breakdown"><span><b>${data.stats?.hits ?? 0}</b> STRIKES LANDED</span><span><b>${data.stats?.specials ?? 0}</b> POWERS USED</span><span><b>${data.stats?.damageDealt ?? 0}</b> DAMAGE DEALT</span><span><b>${data.stats?.maxCombo ?? 0}</b> BEST COMBO</span></div><div class="record-line"><span><b>${record.wins}</b> WINS</span><span><b>${record.matches}</b> FIGHTS</span><span><b>${record.best}</b> BEST STREAK</span></div></div></main>${footer("THE WORK ON YOURSELF IS NEVER FINISHED.")}`;
  bind();
  if (state.mode === "arcade" && !won) beginContinueCountdown();
}
// ─── TOURNAMENT MODE ──────────────────────────────────────────────────────────
// Eight-entrant single elimination. Pure bracket logic (random draw, seeding, CPU-vs-CPU
// simulation, advancement) lives in src/tournament.js; this block only renders and routes.
//
// Flow: title TOURNAMENT → selection (player only) → startTournament()
//   → showTournamentBracket() → fight() → result() → tournamentResult()
//       match won, bracket continues → showTournamentMatchWon() → VIEW BRACKET → showTournamentBracket() …
//       final won                    → onTournamentWon(data)  → showTournamentChampion(data)
//       any loss (eliminated)        → onTournamentLost(data) → showTournamentDefeat(data)
//
// CUTSCENE HOOK POINTS — insert the cutscene call where marked, then continue to the named screen:
//   "before tournament"   startTournament():        before showTournamentBracket()
//   "tournament victory"  onTournamentWon(data):    before showTournamentChampion(data)
//   "tournament defeat"   onTournamentLost(data):   before showTournamentDefeat(data)
// state.tournament holds the bracket (entrants, rounds, champion) for use by cutscenes.
function startTournament() {
  state.mode = "tournament";
  // Seven fresh random opponents on every start; never the player's own fighter.
  state.tournament = createTournament({ player: state.player, rosterSize: characters.length });
  prepareTournamentMatch(true);
  // HOOK "before tournament": play the intro cutscene here, then call showTournamentBracket().
  showTournamentBracket();
}
function onTournamentWon(data) {
  // HOOK "tournament victory": play the champion cutscene here, then call showTournamentChampion(data).
  showTournamentChampion(data);
}
function onTournamentLost(data) {
  // HOOK "tournament defeat": play the elimination cutscene here, then call showTournamentDefeat(data).
  showTournamentDefeat(data);
}
// Point state.opponent/state.arena at the player's pending match. Each match gets a random stage,
// never the same one twice in a row. Idempotent unless forced, so re-rendering keeps the stage.
function prepareTournamentMatch(force = false) {
  const next = currentOpponent(state.tournament);
  if (next == null || (!force && next === state.opponent)) return;
  state.opponent = next;
  const previous = state.arena;
  state.arena = Math.floor(Math.random() * arenas.length);
  if (arenas.length > 1 && state.arena === previous)
    state.arena = (state.arena + 1) % arenas.length;
}
function tournamentResult(data, won) {
  state.tournament = recordPlayerResult(
    state.tournament,
    { won, playerRounds: data.playerRounds, opponentRounds: data.opponentRounds },
    characters,
  );
  if (isChampion(state.tournament)) onTournamentWon(data);
  else if (isEliminated(state.tournament)) onTournamentLost(data);
  else showTournamentMatchWon(data);
}
function tournamentKnockedOut(t, id) {
  return t.rounds.some((r) => r.some((m) => (m.a === id || m.b === id) && m.winner != null && m.winner !== id));
}
function bracketSlot(t, id, match) {
  if (id == null) return `<div class="bracket-slot tbd"><i></i><span>TO BE DECIDED</span><b></b></div>`;
  const c = characters[id];
  const decided = match && match.winner != null;
  const cls = `${id === t.player ? " you" : ""}${decided ? (match.winner === id ? " won" : " lost") : ""}`;
  const score = decided && match.score ? match.score[match.a === id ? 0 : 1] : "";
  return `<div class="bracket-slot${cls}" style="--fighter-color:${esc(c.color || "#e95541")}">${portrait(c)}<span>${esc(c.name)}${id === t.player ? " <em>YOU</em>" : ""}</span><b>${score}</b></div>`;
}
function showTournamentBracket() {
  const t = state.tournament;
  if (!t) return title();
  setScreen("bracket");
  const active = t.status === "active";
  if (active) prepareTournamentMatch();
  const p = characters[state.player],
    o = characters[state.opponent],
    a = arenas[state.arena];
  const columns = ROUND_NAMES.map((name, r) => {
    const size = 4 >> r;
    const matches = t.rounds[r] ?? Array.from({ length: size }, () => null);
    return `<section class="bracket-round${active && r === t.round ? " current" : ""}" data-round="${r}"><h2>${esc(name)}</h2>${matches
      .map((m) => {
        const next = active && m && r === t.round && (m.a === t.player || m.b === t.player);
        return `<div class="bracket-match${next ? " next" : ""}${m?.winner != null ? " decided" : ""}">${bracketSlot(t, m?.a, m)}${bracketSlot(t, m?.b, m)}${next ? "<small>YOUR MATCH</small>" : ""}</div>`;
      })
      .join("")}</section>`;
  }).join("");
  const champ = t.champion != null ? characters[t.champion] : null;
  const crown = `<section class="bracket-round bracket-crown"><h2>CHAMPION</h2><div class="bracket-champion${t.champion === t.player ? " you" : ""}">${champ ? `${portrait(champ)}<strong>${esc(champ.name)}</strong>` : "<i>?</i><strong>ONE WILL RISE</strong>"}</div></section>`;
  const entrants = `<ol class="bracket-entrants" aria-label="Tournament entrants">${t.entrants
    .map((id, i) => {
      const status = t.champion === id ? "CHAMPION" : tournamentKnockedOut(t, id) ? "OUT" : id === t.player ? "YOU" : "IN";
      return `<li class="bracket-entrant${id === t.player ? " you" : ""}${status === "OUT" ? " out" : ""}${status === "CHAMPION" ? " champion" : ""}" data-index="${id}">${portrait(characters[id])}<span><small>SEED ${pad2(i + 1)}</small>${esc(characters[id].name)}</span><b>${status}</b></li>`;
    })
    .join("")}</ol>`;
  const eyebrow = active
    ? `TOURNAMENT · ${roundName(t.round)} · MATCH ${t.round + 1} OF ${ROUND_NAMES.length}`
    : isChampion(t)
      ? "TOURNAMENT COMPLETE · YOU TOOK THE CROWN"
      : `TOURNAMENT OVER · ${champ ? esc(champ.name) : "ANOTHER YOU"} TOOK THE CROWN`;
  const heading = active
    ? isFinalRound(t)
      ? "THE<br><em>FINAL.</em>"
      : "THE<br><em>BRACKET.</em>"
    : isChampion(t)
      ? "UNDISPUTED<br><em>SELF.</em>"
      : "BRACKET<br><em>CLOSED.</em>";
  const next = active
    ? `<div class="bracket-next route-location current" style="background-image:url('${esc(a.background)}')"><span>NEXT · ${ROUND_SHORT[t.round]} · ${esc(a.name)}</span><div class="bracket-next-fighters">${portrait(p)}<b>VS</b>${portrait(o, "flipped")}</div><strong>${esc(p.name)} <small>VS</small> ${esc(o.name)}</strong><b>${esc(a.subtitle || "NEXT DESTINATION")}</b></div><button class="button primary" data-action="fight">FACE ${esc(o.name)} <span>→</span></button>`
    : `<div class="result-actions bracket-actions"><button class="button primary" data-action="tournament-new">NEW TOURNAMENT <span>↻</span></button><button class="button outline" data-action="change-fighters">CHANGE FIGHTERS</button><button class="text-button" data-action="home">BACK TO TITLE</button></div>`;
  app.innerHTML = `${chrome("EIGHT ENTER. ONE IS CROWNED.")}<main class="route-screen bracket-screen"><span class="eyebrow">${eyebrow}</span><h1>${heading}</h1>${entrants}<div class="bracket-tree">${columns}${crown}</div>${next}</main>${footer("EIGHT ENTRANTS. THREE ROUNDS. ONE CHAMPION.")}`;
  bind();
}
function tournamentResultScreen(data, { won, eyebrow, heading, story, seal = "", actions }) {
  setScreen("result");
  const winner = characters[won ? state.player : state.opponent];
  const quote = `<p class="victory-quote">“${esc(quoteFor(winner))}” <span>— ${esc(winner.name)}</span></p>`;
  app.innerHTML = `${chrome("EIGHT ENTER. ONE IS CROWNED.")}<main class="result-screen tournament-result ${won ? "victory" : "defeat"}"><div class="result-art">${portrait(winner)}<div class="result-art-floor"></div></div><div class="result-copy"><span class="eyebrow">${eyebrow}</span><h1>${heading}</h1><div class="result-score"><b>${data.playerRounds ?? (won ? 2 : 0)}</b><span>ROUNDS</span><b>${data.opponentRounds ?? (won ? 0 : 2)}</b></div>${quote}<p>${story}</p>${seal}<div class="result-actions">${actions}</div><div class="match-breakdown"><span><b>${data.stats?.hits ?? 0}</b> STRIKES LANDED</span><span><b>${data.stats?.specials ?? 0}</b> POWERS USED</span><span><b>${data.stats?.damageDealt ?? 0}</b> DAMAGE DEALT</span><span><b>${data.stats?.maxCombo ?? 0}</b> BEST COMBO</span></div><div class="record-line"><span><b>${record.wins}</b> WINS</span><span><b>${record.matches}</b> FIGHTS</span><span><b>${record.best}</b> BEST STREAK</span></div></div></main>${footer("EIGHT ENTER. ONE IS CROWNED.")}`;
  bind();
}
const TOURNAMENT_QUIT = '<button class="button outline" data-action="change-fighters">CHANGE FIGHTERS</button><button class="text-button" data-action="home">BACK TO TITLE</button>';
function showTournamentMatchWon(data) {
  const t = state.tournament;
  const cleared = roundName(t.round - 1);
  tournamentResultScreen(data, {
    won: true,
    eyebrow: `${cleared} WON · ADVANCING TO THE ${roundName(t.round)}`,
    heading: isFinalRound(t) ? "ONE MORE<br>TO GO." : "STILL<br>STANDING.",
    story: `${esc(characters[state.opponent].name)} is out. ${isFinalRound(t) ? "One fight left between you and the crown." : "The rest of the round has been decided — check the bracket."}`,
    actions: `<button class="button primary" data-action="tournament-bracket">VIEW BRACKET <span>→</span></button>${TOURNAMENT_QUIT}`,
  });
}
function showTournamentChampion(data) {
  tournamentResultScreen(data, {
    won: true,
    eyebrow: "TOURNAMENT CHAMPION · THREE MATCHES · THREE WINS",
    heading: "UNDISPUTED<br>SELF.",
    story: "Eight versions entered. Only one walks out with the crown — and it's you.",
    seal: `<div class="champion-seal">TOURNAMENT CHAMPION <span>${ROUND_NAMES.length} / ${ROUND_NAMES.length} ROUNDS WON · BRACKET CLEARED</span></div>`,
    actions: `<button class="button primary" data-action="tournament-new">NEW TOURNAMENT <span>↻</span></button><button class="button outline" data-action="tournament-bracket">VIEW BRACKET</button>${TOURNAMENT_QUIT}`,
  });
}
function showTournamentDefeat(data) {
  const t = state.tournament;
  const champ = characters[t.champion];
  tournamentResultScreen(data, {
    won: false,
    eyebrow: `ELIMINATED IN THE ${roundName(playerFinish(t))}`,
    heading: "KNOCKED<br>OUT.",
    story: `${esc(champ.name)} went on to take the crown. A new bracket draws seven new rivals.`,
    actions: `<button class="button primary" data-action="tournament-new">NEW TOURNAMENT <span>↻</span></button><button class="button outline" data-action="tournament-bracket">VIEW BRACKET</button>${TOURNAMENT_QUIT}`,
  });
}
// ─── END TOURNAMENT MODE ──────────────────────────────────────────────────────
function modal(content, cls = "", onClose) {
  document.querySelector(".modal-layer")?.dismiss?.(false);
  const trigger = document.activeElement;
  const layer = document.createElement("div");
  layer.className = `modal-layer ${cls}`;
  layer.innerHTML = `<section class="arcade-modal" role="dialog" aria-modal="true" aria-labelledby="dialog-heading"><button class="modal-close icon-button" aria-label="Close dialog">×</button>${content}</section>`;
  layer.querySelector("h2")?.setAttribute("id", "dialog-heading");
  const siblings = [...app.children];
  siblings.forEach((el) => (el.inert = true));
  app.append(layer);
  document.body.classList.add("dialog-open");
  layer.dismiss = (notify = true) => {
    layer.remove();
    siblings.forEach((el) => (el.inert = false));
    document.body.classList.remove("dialog-open");
    if (trigger?.isConnected) trigger.focus();
    if (notify) onClose?.();
  };
  layer.querySelector(".modal-close").onclick = () => layer.dismiss();
  layer.addEventListener("click", (e) => {
    if (e.target === layer) layer.dismiss();
  });
  layer.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      layer.dismiss();
    }
    if (e.key === "Tab") {
      const items = [
        ...layer.querySelectorAll(
          'button:not([disabled]),a[href],input,select,textarea,[tabindex="0"]',
        ),
      ];
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  });
  layer.querySelector("button")?.focus();
  return layer;
}
function showMoves(character) {
  const layer = modal(
    `<span class="eyebrow">FIGHTER MANUAL / ${esc(character.name)}</span><h2>SEVEN WAYS<br><em>TO STRIKE.</em></h2>${kitLine(character)}<p class="modal-intro">Six normal attacks and ${esc(character.move)}. Tap once per strike. When a strike lands, chain into a stronger strike of the same family (LP→MP→HP, LK→MK→HK), a punch into a kick, or any hit into your power.</p><div class="move-gallery">${MOVES.map((m) => `<article class="move-card" style="--move-row:${(m.row / 6) * 100}%;--move-sheet:url('${esc(character.combatSheet)}');--fighter-color:${esc(character.color)}"><div class="move-sprite" role="img" aria-label="${esc(m.type === "special" ? character.move : m.label)} animation"></div><div><kbd>${m.key}</kbd><small>${m.button}</small><h3>${esc(m.type === "special" ? character.move : m.label)}</h3><p>${esc(m.hint)}</p></div></article>`).join("")}</div><div class="system-moves" aria-label="Defensive system">${SYSTEM_MOVES.map((m) => `<div class="system-move"><b class="role-tag">${m.tag}</b><strong>${esc(m.label)}</strong><kbd>${esc(m.key)}</kbd><small>${esc(m.button)}</small><p>${esc(m.hint)}</p></div>`).join("")}</div><p class="help-tip">POWER: Q / right trigger / touch POWER. Costs 35 meter. Training keeps your meter full.</p><button class="button primary modal-done">BACK TO FIGHTER <span>→</span></button>`,
    "moves-modal",
  );
  layer.querySelector(".modal-done").onclick = () => layer.dismiss();
}
function showHelp(onDone) {
  const layer = modal(
    `<span class="eyebrow">BEFORE YOU FACE YOURSELF</span><h2>LEARN THE<br><em>HARD WAY.</em></h2><p class="modal-intro">Two rounds to win. One rival: another you. Move in, find your opening, and make it count.</p><div class="control-grid"><div><span class="keycap">A</span><span class="keycap">D</span><p>MOVE <small>left / right</small></p></div><div><span class="keycap">W</span><p>JUMP <small>air movement</small></p></div><div><span class="keycap">S</span><p>CROUCH <small>stay low</small></p></div><div><span class="keycap">J K L</span><p>PUNCHES <small>light / medium / heavy</small></p></div><div><span class="keycap">U I O</span><p>KICKS <small>light / medium / heavy</small></p></div><div><span class="keycap">Q</span><p>POWER <small>35 meter · signature move</small></p></div><div><span class="keycap">SHIFT</span><p>BLOCK <small>hold to defend · with S to block low</small></p></div><div><span class="keycap">SHIFT+J</span><p>THROW <small>GUARD + LP · beats any guard</small></p></div><div><span class="keycap">ESC</span><p>PAUSE <small>take a breath</small></p></div></div><div class="help-tip"><b>COMBOS.</b> Land LP→MP→HP or LK→MK→HK back to back and cancel any landed hit into POWER. A heavy inside a combo launches; POWER knocks down. Guard holds through the whole string.</div><div class="help-tip throw-tip"><b>THROW.</b> Shift+J (GUARD+LP on touch, left trigger + A on a pad) grabs a guarding rival up close. It beats standing and crouching guard, loses to a jump, a backstep or a faster jab, and a whiff is punishable.</div><div class="help-tip"><b>HIGH / LOW.</b> Crouching LK (S+U) is a low: block it crouching. The roundhouse and every jumping attack are overheads: block them standing.</div><div class="help-tip"><b>AIR &amp; WAKEUP.</b> Jump and press LP, MP or LK for an air attack; landing ends it. When knocked down, the last moment before you rise accepts GUARD, a jump, or a reversal (LP, LK, THROW, POWER).</div><div class="help-tip"><b>VERSUS.</b> Two players share one cabinet: player two uses the arrows, numpad 1–6, numpad 0 for POWER and Space to guard, or a second pad. The on-screen pad is always player one.</div><div class="help-tip"><b>ON YOUR PHONE?</b> Slide the left pad to walk, jump and crouch. Tap the six strike keys, hold GUARD, and hit POWER when it glows. Works in portrait and landscape.</div><button class="button primary modal-done">${onDone ? "I’M READY. LET’S FIGHT." : "GOT IT."} <span>→</span></button>`,
    "help-modal",
    onDone,
  );
  layer.querySelector(".modal-done").onclick = () => {
    playClick();
    layer.dismiss();
  };
}
function showSettings() {
  const layer = modal(
    `<span class="eyebrow">MAKE YOURSELF COMFORTABLE</span><h2>YOUR<br><em>RULES.</em></h2><div class="setting-row"><div><strong>SOUND EFFECTS</strong><small>Arcade feedback & battle sounds</small></div><button class="toggle ${settings.sound ? "active" : ""}" data-setting="sound" aria-pressed="${settings.sound}">${settings.sound ? "ON" : "OFF"}</button></div><div class="setting-row"><div><strong>REDUCED MOTION</strong><small>Fewer flashes & shorter transitions</small></div><button class="toggle ${settings.reducedMotion ? "active" : ""}" data-setting="reducedMotion" aria-pressed="${settings.reducedMotion}">${settings.reducedMotion ? "ON" : "OFF"}</button></div><div class="difficulty-setting"><strong>CPU DIFFICULTY</strong><div class="difficulty-options">${["easy", "normal", "hard"].map((d) => `<button class="${settings.difficulty === d ? "active" : ""}" data-difficulty="${d}" aria-pressed="${settings.difficulty === d}">${d}</button>`).join("")}</div><small>Applies to your next fight.</small></div>${inputPanel()}<div class="record-line"><span><b>${record.wins}</b> WINS</span><span><b>${record.matches}</b> MATCHES</span><span><b>${record.best}</b> BEST STREAK</span></div><button class="button primary modal-done">BACK TO IT <span>→</span></button>`,
    "",
    refresh,
  );
  bindInputPanel(layer);
  layer.querySelectorAll("[data-setting]").forEach(
    (b) =>
      (b.onclick = () => {
        const k = b.dataset.setting;
        settings[k] = !settings[k];
        applySettings();
        updateSettingsModal(layer);
      }),
  );
  layer.querySelectorAll("[data-difficulty]").forEach(
    (b) =>
      (b.onclick = () => {
        settings.difficulty = b.dataset.difficulty;
        applySettings();
        updateSettingsModal(layer);
      }),
  );
  layer.querySelector(".modal-done").onclick = () => {
    layer.dismiss();
  };
}
function padStatus() {
  let pads = [];
  try {
    pads = [...(window.navigator.getGamepads?.() || [])];
  } catch {}
  return [0, 1]
    .map((i) => `PAD ${i + 1} ${pads[i] ? "READY" : "—"}`)
    .join(" · ");
}
function inputPanel() {
  const keys = bindingsFor(settings.keys);
  return `<div class="input-panel"><strong>INPUT</strong><small>Click a key, then press the new one. Esc cancels. Stored on this device.</small><table class="input-table"><thead><tr><th>ACTION</th><th>PLAYER 1</th><th>PLAYER 2</th></tr></thead><tbody>${BINDABLE.map(([control, label]) => `<tr><th>${label}</th>${["p1", "p2"].map((side) => `<td><button class="keycap" data-bind="${side}:${control}" aria-label="${side === "p1" ? "Player one" : "Player two"} ${label}: ${keyLabel(keys[side][control])}">${keyLabel(keys[side][control])}</button></td>`).join("")}</tr>`).join("")}</tbody></table><div class="input-meta"><span class="pad-status">${padStatus()}</span><button class="text-button" data-reset-keys>RESET KEYS</button></div><small>Pads: A/B/X/Y and bumpers strike, left trigger guards (plus A to throw), right trigger is POWER, Start pauses.</small></div>`;
}
function bindInputPanel(layer) {
  let listening = null;
  const redraw = () => {
    const keys = bindingsFor(settings.keys);
    layer.querySelectorAll("[data-bind]").forEach((b) => {
      const [side, control] = b.dataset.bind.split(":");
      b.textContent = keyLabel(keys[side][control]);
      b.classList.toggle("listening", b.dataset.bind === listening);
      if (b.dataset.bind === listening) b.textContent = "PRESS A KEY";
    });
    const status = layer.querySelector(".pad-status");
    if (status) status.textContent = padStatus();
  };
  layer.querySelectorAll("[data-bind]").forEach(
    (b) =>
      (b.onclick = () => {
        listening = listening === b.dataset.bind ? null : b.dataset.bind;
        redraw();
      }),
  );
  layer.querySelector("[data-reset-keys]").onclick = () => {
    delete settings.keys;
    listening = null;
    applySettings();
    redraw();
  };
  layer.addEventListener(
    "keydown",
    (e) => {
      if (!listening || e.key === "Tab") return;
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== "Escape" && e.key !== "Escape" && e.code) {
        const [side, control] = listening.split(":");
        const keys = bindingsFor(settings.keys);
        const previous = keys[side][control];
        // A key belongs to one action: the old owner takes over the replaced key.
        for (const s of ["p1", "p2"])
          for (const [c, code] of Object.entries(keys[s]))
            if (code === e.code) keys[s][c] = previous;
        keys[side][control] = e.code;
        settings.keys = keys;
        applySettings();
      }
      listening = null;
      redraw();
    },
    true,
  );
}
function updateSettingsModal(layer) {
  layer.querySelectorAll("[data-setting]").forEach((b) => {
    const active = settings[b.dataset.setting];
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", active);
    b.textContent = active ? "ON" : "OFF";
  });
  layer.querySelectorAll("[data-difficulty]").forEach((b) => {
    const active = settings.difficulty === b.dataset.difficulty;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", active);
  });
  const sound = app.querySelector('[data-action="sound"]');
  if (sound) {
    sound.setAttribute(
      "aria-label",
      settings.sound ? "Mute sound" : "Enable sound",
    );
    sound.innerHTML =
      icon(settings.sound ? "sound" : "muted") +
      `<span class="sound-state">${settings.sound ? "ON" : "OFF"}</span>`;
  }
}
function refresh() {
  if (state.screen === "title") title();
  else if (state.screen === "selection") selection();
  else if (state.screen === "arena") arenaSelection();
  else if (state.screen === "route") arcadeRoute();
  else if (state.screen === "bracket") showTournamentBracket();
}
function bind() {
  app.querySelectorAll("[data-action]").forEach((el) =>
    el.addEventListener("click", async () => {
      playClick();
      const a = el.dataset.action;
      switch (a) {
        case "home":
          title();
          break;
        case "start":
          begin(el.dataset.mode);
          break;
        case "moves":
          showMoves(characters[state.screen === "selection" ? state[state.selecting] : state.player]);
          break;
        case "help":
          showHelp();
          break;
        case "settings":
          showSettings();
          break;
        case "sound":
          settings.sound = !settings.sound;
          applySettings();
          el.setAttribute(
            "aria-label",
            settings.sound ? "Mute sound" : "Enable sound",
          );
          el.innerHTML =
            icon(settings.sound ? "sound" : "muted") +
            `<span class="sound-state">${settings.sound ? "ON" : "OFF"}</span>`;
          refresh();
          break;
        case "fullscreen":
          try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen();
          } catch {}
          break;
        case "fighter":
          state[state.selecting] = Number(el.dataset.index);
          selection();
          app
            .querySelector(
              `.roster-fighter[data-index="${state[state.selecting]}"]`,
            )
            ?.focus({ preventScroll: true });
          break;
        case "confirm-fighter":
          confirmFighter();
          break;
        case "select-player":
        case "select-opponent":
          state.selecting = a === "select-player" ? "player" : "opponent";
          selection();
          break;
        case "mirror":
          state.opponent = state.player;
          selection();
          break;
        case "back-fighters":
          state.selecting = state.mode === "arcade" || isTournament() ? "player" : "opponent";
          selection();
          break;
        case "arena":
          state.arena = Number(el.dataset.index);
          arenaSelection();
          app
            .querySelector(`.arena-option[data-index="${state.arena}"]`)
            ?.focus({ preventScroll: true });
          break;
        case "fight":
        case "rematch":
          fight();
          break;
        case "back-arena":
          arenaSelection();
          break;
        case "change-fighters":
          state.selecting = "player";
          selection();
          break;
        case "next-stage":
          nextChallenger();
          break;
        case "tournament-bracket":
          showTournamentBracket();
          break;
        case "tournament-new":
          startTournament();
          break;
        case "full-circle":
          settings.fullCircle = !settings.fullCircle;
          applySettings();
          buildLadder();
          if (state.screen === "route") arcadeRoute();
          else arenaSelection();
          break;
      }
    }),
  );
}
document.addEventListener("keydown", (e) => {
  if (document.querySelector(".modal-layer")) {
    if (e.key === "Escape") document.querySelector(".modal-layer").dismiss();
    return;
  }
  if (
    e.target?.closest?.("button:not(.roster-fighter):not(.arena-option)") &&
    e.key === "Enter"
  )
    return;
  if (state.screen === "selection") {
    if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      state[state.selecting] =
        (state[state.selecting] +
          (e.key === "ArrowRight" ? 1 : -1) +
          characters.length) %
        characters.length;
      playClick();
      selection();
      app
        .querySelector(".roster-fighter.selected")
        ?.focus({ preventScroll: true });
    }
    if (e.key === "Enter") {
      e.preventDefault();
      confirmFighter();
    }
  } else if (state.screen === "arena") {
    if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      state.arena =
        (state.arena + (e.key === "ArrowRight" ? 1 : -1) + arenas.length) %
        arenas.length;
      arenaSelection();
      app
        .querySelector(".arena-option.selected")
        ?.focus({ preventScroll: true });
    }
    if (e.key === "Enter") {
      e.preventDefault();
      fight();
    }
  } else if (state.screen === "route" && e.key === "Enter") {
    e.preventDefault();
    fight();
  } else if (state.screen === "bracket" && e.key === "Enter") {
    e.preventDefault();
    if (state.tournament?.status === "active") fight();
    else startTournament();
  } else if (state.screen === "title" && e.key === "Enter") {
    e.preventDefault();
    begin("duel");
  }
});
title();
