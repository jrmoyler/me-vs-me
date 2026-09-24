// On-screen fighting controls: a slide d-pad, a six-button arcade cluster and
// POWER / GUARD bars. Pure DOM + pointer events; no game logic lives here.
export const DIRECTIONS = ["left", "right", "jump", "crouch"];
export const ATTACKS = [
  ["light", "LP", "Light punch"],
  ["medium", "MP", "Medium punch"],
  ["heavy", "HP", "Heavy punch"],
  ["kick", "LK", "Light kick"],
  ["mediumKick", "MK", "Medium kick"],
  ["heavyKick", "HK", "Heavy kick"],
];

export const CONTROLLER_CSS = `
.mvm-touch{position:absolute;left:0;right:0;bottom:0;z-index:3;display:flex;justify-content:space-between;align-items:flex-end;gap:12px;padding:0 max(14px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left));pointer-events:none;touch-action:none;user-select:none;-webkit-user-select:none;font-family:"Space Mono",ui-monospace,monospace;--btn:clamp(46px,13vmin,76px);--pad:calc(var(--btn)*2.6);--face:#252a30;--edge:#eee9d93b;--edge-deep:#eee9d94d;--gold:#ffd257;--cream:#eee9d9;--red:#ee5943}
.mvm-combat[data-touch="false"] .mvm-touch{display:none}
.mvm-pad{pointer-events:auto;display:flex;flex-direction:column;align-items:center;gap:10px}
.mvm-dpad{position:relative;width:var(--pad);height:var(--pad);border-radius:50%;background:radial-gradient(circle at 50% 42%,#2c3139,#171b22 72%);border:1px solid var(--edge);border-bottom:4px solid var(--edge-deep);box-shadow:0 4px 0 #06080c,inset 0 1px #ffffff14;touch-action:none}
.mvm-dpad:before,.mvm-dpad:after{content:"";position:absolute;left:50%;top:50%;translate:-50% -50%;background:#1d2128;border:1px solid #ffffff10;border-radius:4px}
.mvm-dpad:before{width:34%;height:84%}.mvm-dpad:after{width:84%;height:34%}
.mvm-dpad span{position:absolute;z-index:1;font-size:calc(var(--pad)*.11);line-height:1;color:#8a8f97;pointer-events:none;transition:color .08s}
.mvm-dpad [data-arrow="jump"]{top:6%;left:50%;translate:-50% 0}.mvm-dpad [data-arrow="crouch"]{bottom:6%;left:50%;translate:-50% 0}
.mvm-dpad [data-arrow="left"]{left:7%;top:50%;translate:0 -50%}.mvm-dpad [data-arrow="right"]{right:7%;top:50%;translate:0 -50%}
.mvm-dpad[data-dir~="jump"] [data-arrow="jump"],.mvm-dpad[data-dir~="crouch"] [data-arrow="crouch"],.mvm-dpad[data-dir~="left"] [data-arrow="left"],.mvm-dpad[data-dir~="right"] [data-arrow="right"]{color:var(--gold);text-shadow:0 0 8px #ffd25788}
.mvm-dpad-nub{position:absolute;z-index:2;left:50%;top:50%;width:30%;height:30%;border-radius:50%;background:#3a4049;border:1px solid var(--edge);box-shadow:0 2px 0 #06080c;translate:calc(-50% + var(--nx,0px)) calc(-50% + var(--ny,0px));transition:translate .04s linear,background .08s}
.mvm-dpad[data-active="true"] .mvm-dpad-nub{background:var(--gold)}
.mvm-cluster{display:grid;grid-template-columns:repeat(7,calc(var(--btn)/2));grid-auto-rows:var(--btn);gap:7px calc(var(--btn)*.06)}
.mvm-cluster button:nth-child(1){grid-column:1/3}.mvm-cluster button:nth-child(2){grid-column:3/5}.mvm-cluster button:nth-child(3){grid-column:5/7}
.mvm-cluster button:nth-child(4){grid-column:2/4}.mvm-cluster button:nth-child(5){grid-column:4/6}.mvm-cluster button:nth-child(6){grid-column:6/8}
.mvm-touch button{margin:0;padding:0;height:var(--btn);border-radius:50%;background:var(--face);border:1px solid var(--edge);border-bottom:4px solid var(--edge-deep);box-shadow:0 4px 0 #06080c,inset 0 1px #ffffff14;color:var(--cream);font:700 clamp(10px,2.6vmin,13px) "Space Mono",ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer;transition:transform .05s,background .05s}
.mvm-touch button:hover{filter:none}
.mvm-touch button.held{transform:translateY(3px);border-bottom-width:1px;background:var(--gold);color:#101319;box-shadow:0 1px 0 #06080c}
.mvm-touch button:focus-visible{outline:2px solid #ffe877;outline-offset:3px}
.mvm-touch button[data-control="light"]{position:relative}
.mvm-touch[data-guard="true"] button[data-control="light"]:after{content:"THROW";position:absolute;left:50%;bottom:12%;translate:-50% 0;font-size:.62em;letter-spacing:.06em;color:var(--gold);pointer-events:none}
.mvm-macro{display:flex;gap:8px;width:100%}
.mvm-macro button{flex:1;height:max(46px,calc(var(--btn)*.78));border-radius:6px;letter-spacing:.14em}
.mvm-power[data-ready="true"]{background:var(--red);color:#101319;border-color:#ff9c8c;box-shadow:0 4px 0 #06080c,0 0 18px #ee594366;animation:mvm-power-glow 1.2s ease-in-out infinite alternate}
.mvm-power[data-ready="false"]{opacity:.72}
@keyframes mvm-power-glow{from{box-shadow:0 4px 0 #06080c,0 0 6px #ee594333}to{box-shadow:0 4px 0 #06080c,0 0 22px #ee5943aa}}
@media(prefers-reduced-motion:reduce){.mvm-power{animation:none!important}.mvm-dpad-nub,.mvm-touch button{transition:none}}
@media(orientation:portrait){.mvm-combat[data-touch="true"] .mvm-touch{--btn:clamp(44px,13.5vmin,80px);top:calc(18% + 56.25vw + 8px);align-items:flex-end;padding-bottom:calc(max(20px,env(safe-area-inset-bottom)) + min(6vh,48px))}}
@media(orientation:landscape) and (max-height:520px){.mvm-touch{--btn:clamp(46px,11.5vmin,60px);padding-bottom:max(10px,env(safe-area-inset-bottom))}.mvm-pad{background:#10131980;border-radius:18px;padding:8px}.mvm-pad[data-side="right"]{flex-direction:row;align-items:flex-end;gap:8px}.mvm-macro{flex-direction:column;width:auto}.mvm-macro button{flex:none;width:calc(var(--btn)*1.5);height:max(44px,calc(var(--btn)*.9))}}
@media(min-width:900px) and (pointer:coarse){.mvm-touch{--btn:clamp(64px,7vmin,84px)}.mvm-macro button{height:max(64px,calc(var(--btn)*.85))}}
`;

// Eight-sector direction from a pointer offset; screen y grows downward.
export function padDirection(dx, dy, radius, deadZone = 0.22) {
  const out = { left: false, right: false, jump: false, crouch: false };
  const distance = Math.hypot(dx, dy);
  if (!radius || distance < radius * deadZone) return out;
  const sector =
    ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  // 0 right, 1 down-right, 2 down, 3 down-left, 4 left, 5 up-left, 6 up, 7 up-right
  out.right = sector === 7 || sector === 0 || sector === 1;
  out.crouch = sector === 1 || sector === 2 || sector === 3;
  out.left = sector === 3 || sector === 4 || sector === 5;
  out.jump = sector === 5 || sector === 6 || sector === 7;
  return out;
}

export function createTouchController({
  mount,
  onChange,
  onPress,
  haptics = true,
} = {}) {
  if (!mount) throw new Error("Touch controller needs a mount element");
  const doc = mount.ownerDocument || globalThis.document;
  const root = doc.createElement("div");
  root.className = "mvm-touch";
  root.innerHTML = `<style>${CONTROLLER_CSS}</style><div class="mvm-pad" data-side="left"><div class="mvm-dpad" role="group" aria-label="Move: slide to walk, jump or crouch" data-active="false"><span data-arrow="jump" aria-hidden="true">▲</span><span data-arrow="left" aria-hidden="true">◀</span><span data-arrow="right" aria-hidden="true">▶</span><span data-arrow="crouch" aria-hidden="true">▼</span><i class="mvm-dpad-nub"></i></div></div><div class="mvm-pad" data-side="right"><div class="mvm-cluster">${ATTACKS.map(
    ([control, label, name]) =>
      `<button type="button" data-control="${control}" aria-label="${name}">${label}</button>`,
  ).join(
    "",
  )}</div><div class="mvm-macro"><button type="button" data-control="special" class="mvm-power" data-ready="false" aria-label="Signature power">POWER</button><button type="button" data-control="block" class="mvm-guard" aria-label="Guard (hold)">GUARD</button></div></div>`;
  mount.append(root);
  const dpad = root.querySelector(".mvm-dpad");
  const nub = root.querySelector(".mvm-dpad-nub");
  const rightPad = root.querySelector('[data-side="right"]');
  const power = root.querySelector(".mvm-power");
  const listeners = [];
  const bind = (target, event, callback) => {
    target.addEventListener(event, callback);
    listeners.push(() => target.removeEventListener(event, callback));
  };
  const holds = {};
  // GUARD held + LP tap is the throw chord; the LP key labels it while guarding.
  const lightButton = root.querySelector('[data-control="light"]');
  function chord(guarding) {
    root.dataset.guard = String(guarding);
    lightButton.setAttribute("aria-label", guarding ? "Throw (guard held)" : "Light punch");
  }
  function emit(control, down) {
    holds[control] = (holds[control] || 0) + (down ? 1 : -1);
    if (control === "block") chord(holds.block > 0);
    if (down && holds[control] === 1) {
      onChange?.(control, true);
      onPress?.(control);
    } else if (!down && holds[control] <= 0) {
      holds[control] = 0;
      onChange?.(control, false);
    }
  }

  // Slide d-pad: one pointer, direction recomputed on every move.
  let padPointer = null;
  let padDir = padDirection(0, 0, 1);
  function padGeometry() {
    const r = dpad.getBoundingClientRect?.();
    if (!r || !r.width) return { cx: 0, cy: 0, radius: 70 };
    return {
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      radius: r.width / 2,
    };
  }
  function applyPad(next, dx = 0, dy = 0, radius = 1) {
    for (const key of DIRECTIONS)
      if (next[key] !== padDir[key]) emit(key, next[key]);
    padDir = next;
    const active = DIRECTIONS.filter((key) => next[key]);
    dpad.dataset.dir = active.join(" ");
    dpad.dataset.active = String(active.length > 0);
    const limit = radius * 0.32;
    const length = Math.hypot(dx, dy) || 1;
    const clampTo = Math.min(length, limit) / length;
    nub.style.setProperty("--nx", `${(dx * clampTo).toFixed(1)}px`);
    nub.style.setProperty("--ny", `${(dy * clampTo).toFixed(1)}px`);
  }
  function padUpdate(e) {
    const { cx, cy, radius } = padGeometry();
    const dx = (e.clientX ?? 0) - cx,
      dy = (e.clientY ?? 0) - cy;
    applyPad(padDirection(dx, dy, radius), dx, dy, radius);
  }
  function padRelease() {
    padPointer = null;
    applyPad(padDirection(0, 0, 1));
  }
  bind(dpad, "pointerdown", (e) => {
    e.preventDefault();
    if (padPointer !== null) return;
    padPointer = e.pointerId ?? 0;
    try {
      dpad.setPointerCapture?.(padPointer);
    } catch {}
    padUpdate(e);
  });
  bind(dpad, "pointermove", (e) => {
    if (padPointer === (e.pointerId ?? 0)) padUpdate(e);
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    bind(dpad, event, (e) => {
      if (padPointer === (e.pointerId ?? 0)) padRelease();
    });

  // Attack cluster: each pointer owns one button; taps are edges, GUARD is a hold.
  const active = new Map();
  function releaseButton(pointerId) {
    const button = active.get(pointerId);
    if (!button) return;
    active.delete(pointerId);
    button.classList.remove("held");
    emit(button.dataset.control, false);
  }
  bind(rightPad, "pointerdown", (e) => {
    const button = e.target?.closest?.("[data-control]");
    if (!button || !rightPad.contains(button)) return;
    e.preventDefault();
    const id = e.pointerId ?? 0;
    if (active.has(id)) releaseButton(id);
    try {
      rightPad.setPointerCapture?.(id);
    } catch {}
    active.set(id, button);
    button.classList.add("held");
    emit(button.dataset.control, true);
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    bind(rightPad, event, (e) => releaseButton(e.pointerId ?? 0));
  bind(root, "contextmenu", (e) => e.preventDefault());

  function release() {
    if (padPointer !== null) padRelease();
    for (const id of [...active.keys()]) releaseButton(id);
    for (const control of Object.keys(holds))
      if (holds[control] > 0) {
        holds[control] = 0;
        onChange?.(control, false);
      }
    chord(false);
  }
  return {
    element: root,
    release,
    setPowerReady(ready, energy = 0, label) {
      power.dataset.ready = String(Boolean(ready));
      power.textContent = ready ? "POWER ◆" : `POWER ${Math.floor(energy)}`;
      if (label) power.setAttribute("aria-label", label);
    },
    vibrate(ms) {
      if (!haptics || typeof navigator === "undefined") return;
      try {
        navigator.vibrate?.(ms);
      } catch {}
    },
    destroy() {
      release();
      listeners.forEach((fn) => fn());
      listeners.length = 0;
      root.remove();
    },
  };
}
