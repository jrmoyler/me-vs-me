/** Original arcade intermission: break your reflection, then resume the ladder. */
export const BONUS_DURATION = 20;
export const BONUS_STRIKES = Object.freeze({j: 5, k: 8, l: 12, u: 6, i: 9, o: 13});
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function startBonus({container, character, arena, onEnd, settings = {}}) {
  let remaining = BONUS_DURATION, integrity = 240, score = 0, finished = false, last = performance.now(), nextHit = 0;
  const root = document.createElement('section');
  root.setAttribute('aria-label', 'Bonus stage: break the reflection');
  root.innerHTML = `<style>
  .mvm-bonus{min-height:100dvh;background:#10111f;color:#fff4cf;padding:clamp(12px,3vw,32px);font-family:monospace;display:grid;align-content:center;gap:14px;text-align:center}
  .mvm-bonus h1{font:900 clamp(24px,5vw,48px)/1 monospace;margin:0;color:#ffd257;text-shadow:3px 3px #b83c31}.mvm-bonus p{margin:0;line-height:1.5}
  .mvm-bonus-stage{position:relative;height:clamp(190px,45vh,450px);overflow:hidden;background-position:center;background-size:cover;border:4px solid #ffd257;box-shadow:inset 0 0 80px #0009}
  .mvm-bonus-fighter{position:absolute;height:88%;max-width:43%;object-fit:contain;bottom:0;left:7%;image-rendering:pixelated}
  .mvm-bonus-target{position:absolute;width:clamp(84px,17vw,190px);height:75%;right:18%;bottom:6%;background:linear-gradient(120deg,#f6ffff,#55d6e8 38%,#214c80 39%,#84edf5 65%,#164675 66%);clip-path:polygon(50% 0,95% 20%,100% 77%,50% 100%,0 77%,5% 20%);filter:drop-shadow(0 0 12px #72f4ff);display:grid;place-content:center;font-size:clamp(22px,4vw,42px);font-weight:bold;color:#09203f}
  .mvm-bonus-target[data-damaged=true]{background:repeating-linear-gradient(130deg,transparent 0 35px,#10111f 36px 41px),linear-gradient(110deg,#f6ffff,#55d6e8,#214c80)}
  .mvm-bonus-target[data-broken=true]{opacity:.2;transform:scale(.45) rotate(35deg)}
  .mvm-bonus-hud{display:flex;justify-content:space-between;gap:12px;font-weight:bold;font-size:clamp(14px,3vw,22px)}
  .mvm-bonus meter{width:100%;height:20px;accent-color:#5ee4e9}
  .mvm-bonus-controls{display:grid;grid-template-columns:repeat(3,minmax(65px,130px));gap:8px;justify-content:center}.mvm-bonus button{font:700 14px monospace;min-height:44px;border:2px solid #ffd257;background:#242439;color:#fff4cf;touch-action:manipulation;cursor:pointer}.mvm-bonus button:focus-visible{outline:3px solid white;outline-offset:3px}.mvm-bonus button:active{background:#9e4236}.mvm-bonus-exit{justify-self:center;padding:8px 24px}.mvm-bonus-feedback{min-height:24px;color:#ffd257;font-weight:bold}
  @media(max-height:480px){.mvm-bonus{gap:5px;padding:8px}.mvm-bonus-stage{height:38vh;min-height:125px}.mvm-bonus h1{font-size:22px}.mvm-bonus-controls{grid-template-columns:repeat(6,minmax(60px,100px));gap:4px}.mvm-bonus button{min-height:36px}}
  </style><div class="mvm-bonus"><h1>BONUS STAGE</h1><p>BREAK THE REFLECTION · Strike the crystal before time runs out.</p><div class="mvm-bonus-hud"><span>SCORE <b data-score>00000</b></span><span>TIME <b data-time>20</b></span></div><div class="mvm-bonus-stage"><img class="mvm-bonus-fighter" src="${esc(character.portrait)}" alt="${esc(character.name)}"><div class="mvm-bonus-target" role="img" aria-label="Reflection crystal">ME</div></div><meter min="0" max="1" value="1" aria-label="Crystal integrity"></meter><div class="mvm-bonus-feedback" role="status" aria-live="polite">READY? STRIKE!</div><div class="mvm-bonus-controls">${[['j','LIGHT P'],['k','MEDIUM P'],['l','HEAVY P'],['u','LIGHT K'],['i','MEDIUM K'],['o','HEAVY K']].map(([key,label])=>`<button data-strike="${key}" aria-label="${label} (${key.toUpperCase()})">${label} · ${key.toUpperCase()}</button>`).join('')}</div><button class="mvm-bonus-exit">SKIP BONUS →</button></div>`;
  container.replaceChildren(root);
  const stage = root.querySelector('.mvm-bonus-stage');
  if (arena?.background) stage.style.backgroundImage = `url("${String(arena.background).replace(/["\\\n\r]/g,'')}")`;
  const target = root.querySelector('.mvm-bonus-target'), feedback = root.querySelector('[role=status]'), meter = root.querySelector('meter');
  meter.max = 1; meter.min = 0; meter.value = 1;
  const buttons = [...root.querySelectorAll('[data-strike]')];
  let interval, finishTimer;
  function cleanup() { clearInterval(interval); clearTimeout(finishTimer); document.removeEventListener('keydown', keydown); document.removeEventListener('visibilitychange', visibility); }
  function finish(skipped = false) { if (finished) return; finished = true; cleanup(); onEnd?.({score, destroyed: integrity <= 0, skipped}); }
  function strike(key) {
    const now = performance.now();
    if (finished || integrity <= 0 || remaining <= 0 || document.hidden || now < nextHit || !BONUS_STRIKES[key]) return;
    const damage = BONUS_STRIKES[key]; nextHit = now + 130 + damage * 9;
    integrity = Math.max(0, integrity - damage); score += damage * 25; meter.value = integrity / 240;
    target.dataset.damaged = String(integrity < 160);
    feedback.textContent = `${key === 'l' || key === 'o' ? 'CRUSH!' : 'HIT!'} +${damage * 25}`;
    if (!settings.reducedMotion && target.animate) target.animate([{translate:'-5px 0',filter:'brightness(2)'},{translate:'5px 0'},{translate:'0 0',filter:'brightness(1)'}],{duration:140});
    if (integrity === 0) { score += Math.ceil(remaining) * 100; target.dataset.broken = 'true'; feedback.textContent = 'PERFECT! REFLECTION SHATTERED'; buttons.forEach(b=>b.disabled=true); finishTimer = setTimeout(()=>finish(),1200); }
    root.querySelector('[data-score]').textContent = String(score).padStart(5,'0');
  }
  function keydown(event) { if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return; const key = event.key.toLowerCase(); if (BONUS_STRIKES[key]) { event.preventDefault(); strike(key); } }
  function visibility() { last = performance.now(); }
  document.addEventListener('keydown', keydown); document.addEventListener('visibilitychange', visibility);
  buttons.forEach(button=>button.addEventListener('click',()=>strike(button.dataset.strike)));
  root.querySelector('.mvm-bonus-exit').addEventListener('click',()=>finish(true));
  interval = setInterval(()=>{ const now=performance.now(), elapsed=(now-last)/1000; last=now; if(finished || document.hidden || integrity<=0) return; remaining=Math.max(0,remaining-elapsed); root.querySelector('[data-time]').textContent=String(Math.ceil(remaining)).padStart(2,'0'); if(remaining<=0){feedback.textContent='TIME UP!'; buttons.forEach(b=>b.disabled=true);clearInterval(interval);finishTimer=setTimeout(()=>finish(),900);} },100);
  buttons[0].focus();
  return { destroy() { finished=true; cleanup(); root.remove(); } };
}
