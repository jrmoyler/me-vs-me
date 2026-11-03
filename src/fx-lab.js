// FX LAB: every one of the 244 pixel effects the game uses, by category, played on a stage.
// Effects with a character are acted out (wind-up, freeze on contact, the target taking it);
// a "WHERE IN THE GAME" line says where each one appears in a fight or a menu.
import { createFrame, clearFrame, createAct, composite } from "./vendor/pixelfx/core/index.js";
import { categories } from "./vendor/pixelfx/fx/categories.js";
import { FX_IDS, loadFx, rampFrom, PIXEL_W, PIXEL_H } from "./pixelfx.js";
import { POWER_FX, SMEAR_FX, HIT_FX, GUARD_FX, MATCH_FX, ARENA_FX, SCREEN_FX, BONUS_FX } from "./fx-map.js";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const label = (id) => id.split("/")[1].replace(/-/g, " ").toUpperCase();

/** Where an effect appears in the game, as short phrases. */
export function usesOf(id, { characters = [], arenas = [] } = {}) {
  const out = [];
  const name = (list, key) => list.find((x) => x.id === key)?.name ?? key.toUpperCase();
  for (const [fighter, kit] of Object.entries(POWER_FX))
    for (const [part, v] of Object.entries(kit))
      if (v === id) out.push(`${name(characters, fighter)} POWER ${part === "ko" ? "K.O." : part.toUpperCase()}`);
  for (const [k, v] of Object.entries(SMEAR_FX)) if (v === id) out.push(`${k.toUpperCase()} SWING`);
  for (const [k, v] of Object.entries(HIT_FX)) if (v === id) out.push(`HIT · ${k.toUpperCase()}`);
  for (const [k, v] of Object.entries(GUARD_FX)) if (v === id) out.push(`${k.toUpperCase()} GUARD`);
  for (const [k, v] of Object.entries(MATCH_FX)) if (v === id) out.push(`MATCH · ${k.replace(/[A-Z]/g, (c) => ` ${c}`).toUpperCase()}`);
  for (const [arena, a] of Object.entries(ARENA_FX)) {
    if (a.weather.includes(id)) out.push(`${name(arenas, arena)} WEATHER`);
    if ([...a.critters, ...a.props].some((c) => c.id === id) || a.landing === id) out.push(`${name(arenas, arena)} SCENERY`);
  }
  for (const [k, v] of Object.entries(SCREEN_FX.transitions)) if (v === id) out.push(`${k.toUpperCase()} SCREEN TRANSITION`);
  for (const [k, v] of Object.entries(SCREEN_FX)) if (k !== "transitions" && [v].flat().includes(id)) out.push(`RESULTS · ${k.toUpperCase()}`);
  for (const [k, v] of Object.entries(BONUS_FX)) if (v === id) out.push(`BONUS STAGE · ${k.toUpperCase()}`);
  return [...new Set(out)];
}

const CSS = `
.fx-lab{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(260px,1fr);gap:clamp(12px,2vw,28px);padding:clamp(12px,2.5vw,32px);align-items:start}
.fx-lab-stage{position:relative;aspect-ratio:16/9;background:#090a17 center/cover;border:3px solid var(--lab-color,#ffd257);box-shadow:0 0 0 1px #000,0 18px 50px #0008;overflow:hidden}
.fx-lab-stage::after{content:"";position:absolute;inset:0;background:linear-gradient(#0000 55%,#0009);pointer-events:none}
.fx-lab-stage canvas{position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;z-index:1}
.fx-lab-info{margin-top:12px;font:12px/1.5 monospace;color:#e9dcc0}.fx-lab-info h2{font:900 clamp(20px,3vw,34px)/1 inherit;margin:0 0 6px;color:#ffd257;letter-spacing:.04em}
.fx-lab-info small{display:block;color:#9fe7e0;letter-spacing:1px;margin-top:6px;text-transform:uppercase}
.fx-lab-tools{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.fx-lab-tools button,.fx-lab-cats button,.fx-lab-list button{font:700 11px monospace;letter-spacing:1px;border:1px solid #ffffff33;background:#151629;color:#f4e9cf;padding:8px 10px;cursor:pointer;text-transform:uppercase}
.fx-lab-tools button[aria-pressed=true],.fx-lab-cats button[aria-pressed=true],.fx-lab-list button[aria-pressed=true]{background:#ffd257;color:#14121e;border-color:#ffd257}
.fx-lab-tools button:focus-visible,.fx-lab-cats button:focus-visible,.fx-lab-list button:focus-visible{outline:2px solid #fff;outline-offset:2px}
.fx-lab-cats{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}.fx-lab-cats b{font-weight:400;opacity:.6;margin-left:4px}
.fx-lab-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:6px;max-height:min(56vh,560px);overflow:auto;padding-right:4px}
.fx-lab-count{font:11px monospace;color:#ffffff99;letter-spacing:1px;margin:0 0 8px}
@media(max-width:820px){.fx-lab{grid-template-columns:1fr}.fx-lab-list{max-height:none}}
`;

/**
 * Mount the lab in container. o: { characters, arenas, fighter, arena, reducedMotion, onExit }.
 * Returns { destroy }.
 */
export function mountFxLab(container, { characters = [], arenas = [], fighter, arena, reducedMotion = false } = {}) {
  const byCat = Object.fromEntries(categories.map((c) => [c.id, FX_IDS.filter((id) => id.startsWith(`${c.id}/`))]));
  let cat = categories[0].id,
    current = byCat[cat][0],
    mirrored = false,
    tinted = false,
    act = null,
    raf = 0,
    last = 0,
    destroyed = false,
    loop = false;
  container.innerHTML = `<style>${CSS}</style><div class="fx-lab" style="--lab-color:${esc(fighter?.color || "#ffd257")}"><div><div class="fx-lab-stage" style="background-image:url('${esc(arena?.background || "")}')"><canvas width="${PIXEL_W}" height="${PIXEL_H}" aria-label="Effect preview"></canvas></div><div class="fx-lab-info" aria-live="polite"></div><div class="fx-lab-tools"><button data-lab="replay">↻ REPLAY</button><button data-lab="mirror" aria-pressed="false">⇄ MIRROR</button><button data-lab="tint" aria-pressed="false">◐ ${esc(fighter?.name || "FIGHTER")} COLOURS</button><button data-lab="next">NEXT →</button></div></div><div><p class="fx-lab-count">${FX_IDS.length} EFFECTS · ${categories.length} CATEGORIES · ALL IN THE GAME</p><div class="fx-lab-cats" role="tablist">${categories.map((c) => `<button data-cat="${c.id}" role="tab" aria-pressed="${c.id === cat}">${esc(c.name)}<b>${byCat[c.id].length}</b></button>`).join("")}</div><div class="fx-lab-list"></div></div></div>`;
  const canvas = container.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(PIXEL_W, PIXEL_H);
  const frame = createFrame(PIXEL_W, PIXEL_H);
  const info = container.querySelector(".fx-lab-info");
  const list = container.querySelector(".fx-lab-list");

  function renderList() {
    list.innerHTML = byCat[cat].map((id) => `<button data-fx="${id}" aria-pressed="${id === current}">${esc(label(id))}</button>`).join("");
    list.querySelectorAll("[data-fx]").forEach((b) => (b.onclick = () => play(b.dataset.fx)));
  }
  async function play(id) {
    current = id;
    list.querySelectorAll("[data-fx]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.fx === id)));
    const mod = await loadFx(id);
    if (destroyed || current !== id || !mod) return;
    const m = mod.meta ?? {};
    // full-frame effects are placed by their origin; the rest stand on the floor, centred on the act
    const full = m.size?.[0] >= PIXEL_W && m.size?.[1] >= PIXEL_H;
    const target = mod.act?.target?.x ?? mod.act?.targets?.[0]?.x ?? 0;
    const x = full ? m.origin?.[0] ?? 160 : 160 - (mirrored ? -1 : 1) * target * 0.5;
    const y = full ? m.origin?.[1] ?? 90 : m.actor || mod.act ? 150 : Math.min(150, 90 + (m.origin?.[1] ?? 0) - (m.size?.[1] ?? 0) / 2);
    act = createAct(mod, { x, y, flip: mirrored, ...(tinted && fighter ? { palette: rampFrom(fighter.color, m.options?.palette?.length || 8) } : {}) });
    loop = Boolean(m.loop);
    const uses = usesOf(id, { characters, arenas });
    info.innerHTML = `<h2>${esc(m.name || label(id))}</h2>${esc(m.desc || "")}<small>${esc(id)} · ${m.loop ? "LOOP" : "ONE-SHOT"} ${m.duration ?? ""}s${uses.length ? ` · ${esc(uses.slice(0, 4).join(" · "))}${uses.length > 4 ? ` +${uses.length - 4} MORE` : ""}` : ""}</small>`;
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }
  function tick(now) {
    if (destroyed) return;
    const dt = reducedMotion ? 1 / 30 : Math.min(0.05, (now - last) / 1000);
    last = now;
    if (act) {
      act.update(dt);
      clearFrame(frame);
      act.draw(frame);
      composite(frame, img.data, null);
      ctx.putImageData(img, 0, 0);
      const [sx, sy] = reducedMotion ? [0, 0] : act.shake;
      canvas.style.transform = sx || sy ? `translate(${(sx / PIXEL_W) * 100}%,${(sy / PIXEL_H) * 100}%)` : "";
      // one-shots replay after a pause, so the lab never goes still
      if (!loop && act.done?.()) setTimeout(() => !destroyed && current && play(current), 600), (act = null);
    }
    raf = requestAnimationFrame(tick);
  }
  container.querySelectorAll("[data-cat]").forEach(
    (b) =>
      (b.onclick = () => {
        cat = b.dataset.cat;
        container.querySelectorAll("[data-cat]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        renderList();
        play(byCat[cat][0]);
      }),
  );
  container.querySelector('[data-lab="replay"]').onclick = () => play(current);
  container.querySelector('[data-lab="next"]').onclick = () => {
    const i = FX_IDS.indexOf(current);
    const id = FX_IDS[(i + 1) % FX_IDS.length];
    const c = id.split("/")[0];
    if (c !== cat) {
      cat = c;
      container.querySelectorAll("[data-cat]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.cat === c)));
      renderList();
    }
    play(id);
  };
  for (const [key, set] of [
    ["mirror", (v) => (mirrored = v)],
    ["tint", (v) => (tinted = v)],
  ])
    container.querySelector(`[data-lab="${key}"]`).onclick = (e) => {
      const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
      e.currentTarget.setAttribute("aria-pressed", String(on));
      set(on);
      play(current);
    };
  renderList();
  play(current);
  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
    },
  };
}
