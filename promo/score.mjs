// Synthesises the trailer score and sound design from the shared timeline. No samples: every sound is maths.
// Writes out/score.wav (48 kHz, stereo, 16-bit).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOTS, DURATION, cues, shotStart } from './scene/timeline.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SR = 48000;
const N = Math.ceil(DURATION * SR);
const L = new Float32Array(N), R = new Float32Array(N);
const RL = new Float32Array(N), RR = new Float32Array(N); // reverb send

let seed = 12345;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rand() * 2 - 1;
const TAU = Math.PI * 2;
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function put(i, l, r, send = 0) {
  if (i < 0 || i >= N) return;
  L[i] += l; R[i] += r; RL[i] += l * send; RR[i] += r * send;
}
// Generic voice: fn(tLocal) -> sample; pan -1..1.
function voice(t0, dur, fn, { gain = 1, pan = 0, send = 0.2 } = {}) {
  const i0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let k = 0; k < n; k++) { const s = fn(k / SR, k); put(i0 + k, s * gl, s * gr, send); }
}
class LP { constructor(fc) { this.set(fc); this.y = 0; } set(fc) { this.a = 1 - Math.exp(-TAU * fc / SR); } run(x) { this.y += this.a * (x - this.y); return this.y; } }
class BP { // state-variable filter
  constructor(fc, q = 1) { this.low = 0; this.band = 0; this.set(fc, q); }
  set(fc, q) { this.f = 2 * Math.sin(Math.PI * Math.min(fc, SR / 6) / SR); this.q = 1 / q; }
  run(x) { this.low += this.f * this.band; const high = x - this.low - this.q * this.band; this.band += this.f * high; return { low: this.low, band: this.band, high }; }
}
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));

// ---------- instruments ----------
function kick(t0, v = 1) {
  let ph = 0;
  voice(t0, 0.6, (t) => { const f = 45 + 110 * Math.exp(-t * 30); ph += TAU * f / SR; return Math.sin(ph) * env(t, 0.002, 0.22) + noise() * Math.exp(-t * 300) * 0.3; }, { gain: 0.9 * v, send: 0.05 });
}
function taiko(t0, v = 1, pan = 0) {
  let ph = 0; const lp = new LP(900);
  voice(t0, 1.2, (t) => { const f = 58 + 60 * Math.exp(-t * 18); ph += TAU * f / SR; return Math.sin(ph) * env(t, 0.003, 0.35) + lp.run(noise()) * Math.exp(-t * 25) * 0.9; }, { gain: 0.8 * v, pan, send: 0.35 });
}
function snare(t0, v = 1) {
  const bp = new BP(1800, 0.8); let ph = 0;
  voice(t0, 0.4, (t) => { ph += TAU * 190 / SR; return bp.run(noise()).band * Math.exp(-t * 16) * 1.4 + Math.sin(ph) * Math.exp(-t * 30) * 0.5; }, { gain: 0.45 * v, send: 0.3 });
}
function hat(t0, v = 1, pan = 0.2) {
  const bp = new BP(9000, 1.5);
  voice(t0, 0.08, (t) => bp.run(noise()).high * Math.exp(-t * 70), { gain: 0.12 * v, pan, send: 0.05 });
}
function boom(t0, v = 1, len = 3) {
  let ph = 0; const lp = new LP(400);
  voice(t0, len, (t) => { const f = 30 + 40 * Math.exp(-t * 6); ph += TAU * f / SR; return Math.sin(ph) * env(t, 0.005, len * 0.3) * 1.2 + lp.run(noise()) * env(t, 0.004, 0.5) * 1.5; }, { gain: 0.9 * v, send: 0.5 });
}
function whoosh(t0, v = 1, len = 0.9) {
  const bp = new BP(400, 2.5);
  voice(t0 - len * 0.6, len, (t) => { const k = t / len; bp.set(300 + 5000 * Math.sin(k * Math.PI) ** 2, 2.5); return bp.run(noise()).band * Math.sin(k * Math.PI) ** 2; }, { gain: 0.5 * v, pan: 0, send: 0.3 });
}
function punch(t0, kind) {
  const tier = { light: 0.6, medium: 0.8, heavy: 1.1, throw: 1.0, power: 1.5, block: 0.5 }[kind] ?? 0.8;
  if (kind === 'block') {
    let a = 0, b = 0;
    voice(t0, 0.5, (t) => { a += TAU * 1250 / SR; b += TAU * 2710 / SR; return (Math.sin(a) * 0.6 + Math.sin(b) * 0.4) * Math.exp(-t * 14) + noise() * Math.exp(-t * 90) * 0.6; }, { gain: 0.45, send: 0.35, pan: -0.2 });
    return;
  }
  let ph = 0; const lp = new LP(2500 * tier);
  voice(t0, 0.7, (t) => { const f = 55 + 140 * Math.exp(-t * 35); ph += TAU * f / SR;
    return Math.sin(ph) * env(t, 0.001, 0.12 * tier) * 1.1 + lp.run(noise()) * Math.exp(-t * 45) * 1.2 + noise() * Math.exp(-t * 400) * 0.5; }, { gain: 0.75 * tier, send: 0.25, pan: 0.15 });
  if (kind === 'throw') whoosh(t0 + 0.15, 0.6, 0.5);
  if (kind === 'power') { boom(t0, 1.1, 3.5); crackle(t0, 1.2); }
}
function crackle(t0, len) {
  const hp = new BP(3000, 1);
  voice(t0, len, (t) => (rand() < 0.004 * Math.exp(-t * 2) * 30 ? noise() * 3 : 0) * Math.exp(-t * 2.5) + hp.run(noise()).high * 0.06 * Math.exp(-t * 3), { gain: 0.5, send: 0.4, pan: 0.1 });
}
function swing(t0, v) { whoosh(t0 + 0.06, v * 0.7, 0.18); }
function bell(t0) {
  const ps = [1, 2.76, 5.4, 8.93].map(() => 0);
  voice(t0, 3, (t) => { let s = 0; [1, 2.76, 5.4, 8.93].forEach((m, i) => { ps[i] += TAU * 520 * m / SR; s += Math.sin(ps[i]) * Math.exp(-t * (1.2 + i * 1.5)) / (1 + i); }); return s; }, { gain: 0.35, send: 0.5 });
}
function glass(t0, len, density, gain) {
  for (let i = 0; i < density; i++) {
    const at = t0 + Math.pow(rand(), 1.8) * len;
    const f = 2000 + rand() * 6500; let ph = 0; const d = 0.05 + rand() * 0.25;
    voice(at, d * 5, (t) => { ph += TAU * f / SR; return Math.sin(ph) * Math.exp(-t / d) + noise() * Math.exp(-t * 600) * 0.5; }, { gain: gain * (0.3 + rand() * 0.7), pan: rand() * 1.6 - 0.8, send: 0.45 });
  }
}
function glitch(t0, len) {
  voice(t0, len, (t) => { const step = Math.floor(t * 30); const f = 200 + ((step * 7919) % 13) * 140; return (Math.sign(Math.sin(TAU * f * t)) * 0.5) * (step % 3 === 0 ? 1 : 0.3) * (Math.floor(t * SR / 8) % 2 ? 1 : 0.7); }, { gain: 0.12, send: 0.2 });
}
function lightOn(t0) {
  const lp = new LP(200);
  voice(t0, 0.9, (t) => lp.run(noise()) * env(t, 0.002, 0.12) * 3, { gain: 0.8, send: 0.5 });
  let ph = 0;
  voice(t0, 7, (t) => { ph += TAU * 50 / SR; const flick = t < 0.4 ? (Math.floor(t * 20) % 2 ? 1 : 0.2) : 1; return (Math.sin(ph) + Math.sin(ph * 3) * 0.3 + Math.sin(ph * 5) * 0.15) * flick * Math.exp(-t * 0.35); }, { gain: 0.05, send: 0.1 });
}
function charge(t0, len) {
  const bp = new BP(200, 3); let ph = 0;
  voice(t0, len + 0.2, (t) => { const k = Math.min(1, t / len); bp.set(150 + 3000 * k * k, 3); ph += TAU * (60 + 200 * k * k) / SR;
    return (bp.run(noise()).band * 1.5 + (Math.sin(ph) + Math.sin(ph * 1.01)) * 0.3) * k * (t > len ? Math.exp(-(t - len) * 20) : 1); }, { gain: 0.5, send: 0.35 });
}
function riser(t0, t1, gain = 0.5) {
  const len = t1 - t0; const bp = new BP(200, 2); let p1 = 0, p2 = 0;
  voice(t0, len, (t) => { const k = t / len; bp.set(200 + 7000 * k ** 2, 2); const f = 110 * Math.pow(2, k * 2.5);
    p1 += TAU * f / SR; p2 += TAU * f * 1.007 / SR;
    return (bp.run(noise()).band + (saw(p1) + saw(p2)) * 0.15) * k ** 2; }, { gain, send: 0.4 });
}
const saw = (ph) => ((ph / TAU) % 1) * 2 - 1;
function titleHit(t0) {
  boom(t0, 1.2, 4);
  taiko(t0, 1.2);
  let a = 0, b = 0;
  voice(t0, 4, (t) => { a += TAU * 293.66 / SR; b += TAU * 440.9 / SR; return (Math.sin(a) + Math.sin(b) * 0.6 + Math.sin(a * 2.01) * 0.3) * Math.exp(-t * 0.9); }, { gain: 0.18, send: 0.7 });
  // Reverse swell into the hit.
  const lp = new LP(3000);
  voice(t0 - 0.8, 0.8, (t) => lp.run(noise()) * Math.pow(t / 0.8, 3), { gain: 0.5, send: 0.4 });
}
function clash(t0) {
  boom(t0, 1.6, 5);
  const lp = new LP(5000);
  voice(t0, 2.5, (t) => lp.run(noise()) * env(t, 0.002, 0.5) * 1.3, { gain: 0.9, send: 0.6 });
  crackle(t0, 2);
  glass(t0, 1.2, 50, 0.12);
}

// ---------- music ----------
// Pad: detuned saws through a lowpass that opens with `bright`.
function pad(t0, t1, notes, { gain = 0.1, bright = 800, attack = 1.5, release = 1.5, pan = 0 } = {}) {
  const len = t1 - t0 + release;
  notes.forEach((n, j) => {
    const f = midi(n); const ph = [rand() * TAU, rand() * TAU, rand() * TAU]; const lp = new LP(bright);
    voice(t0, len, (t) => {
      ph[0] += TAU * f / SR; ph[1] += TAU * f * 1.004 / SR; ph[2] += TAU * f * 0.996 / SR;
      const a = Math.min(1, t / attack) * (t > t1 - t0 ? Math.max(0, 1 - (t - (t1 - t0)) / release) : 1);
      lp.set(bright * (0.7 + 0.3 * Math.sin(t * 0.4 + j)));
      return lp.run(saw(ph[0]) + saw(ph[1]) + saw(ph[2])) * a / 3;
    }, { gain, pan: pan + (j % 2 ? 0.3 : -0.3), send: 0.6 });
  });
}
function drone(t0, t1, note, gain) {
  const f = midi(note); let a = 0, b = 0; const lp = new LP(160);
  voice(t0, t1 - t0, (t) => { a += TAU * f / SR; b += TAU * f * 2.003 / SR; const e = Math.min(1, t / 2) * Math.min(1, (t1 - t0 - t) / 1.5);
    return (lp.run(saw(a)) * 1.2 + Math.sin(a) * 0.8 + Math.sin(b) * 0.1) * e; }, { gain, send: 0.3 });
}
function bassNote(t0, dur, note, gain = 0.3) {
  const f = midi(note); let a = 0; const lp = new LP(500);
  voice(t0, dur, (t) => { a += TAU * f / SR; lp.set(120 + 900 * Math.exp(-t * 12)); return (lp.run(saw(a)) + Math.sin(a) * 0.6) * Math.min(1, t / 0.005) * Math.exp(-t * 3) * Math.min(1, (dur - t) / 0.02); }, { gain, send: 0.05 });
}
function pluck(t0, note, gain = 0.08, pan = 0) {
  const f = midi(note); let a = 0;
  voice(t0, 1.2, (t) => { a += TAU * f / SR; return (Math.abs(((a / TAU) % 1) * 4 - 2) - 1) * Math.exp(-t * 5); }, { gain, pan, send: 0.55 });
}

// D minor. Chord roots per two-second bar: Dm, Bb, Gm, A.
const PROG = [[50, 53, 57, 62], [46, 50, 53, 58], [43, 50, 55, 58], [45, 49, 52, 57]];
const ROOT = [38, 34, 31, 33];

// Act one: drone and swelling pad through the mirror.
drone(0, 13.9, 26, 0.35);
pad(0.8, 7.5, [50, 57, 62], { gain: 0.07, bright: 500, attack: 3 });
pad(7.5, 13.6, [50, 53, 57, 60], { gain: 0.08, bright: 900, attack: 2 });
riser(10.6, 12.35, 0.35);
// Title: wide chord.
pad(13.6, 19.4, [38, 50, 57, 62, 65], { gain: 0.09, bright: 1400, attack: 0.3, release: 1 });
// Groove from the roster through the modes, 120 bpm.
const BEAT = 0.5;
const g0 = shotStart('roster'), gEnd = shotStart('clash') - 0.05;
for (let t = g0, i = 0; t < gEnd; t += BEAT, i++) {
  const bar = Math.floor(i / 4) % 4;
  const inFight = t >= shotStart('fight') && t < shotStart('modes');
  const inRoster = t < shotStart('fight');
  const beatInBar = i % 4;
  if (inRoster) {
    taiko(t, beatInBar === 0 ? 1 : 0.55, beatInBar % 2 ? 0.4 : -0.4);
    if (i > 8) hat(t + BEAT / 2, 0.8);
  } else {
    kick(t, inFight ? 0.9 : 0.6);
    if (beatInBar === 1 || beatInBar === 3) snare(t, inFight ? 1 : 0.6);
    for (let h = 0; h < 4; h++) hat(t + h * BEAT / 4, h === 2 ? 1 : 0.5, 0.3);
  }
  for (let e = 0; e < 2; e++) bassNote(t + e * BEAT / 2, BEAT / 2 - 0.01, ROOT[bar], inRoster ? 0.18 : 0.26);
  if (beatInBar === 0) pad(t, t + 2, PROG[bar], { gain: inRoster ? 0.05 : 0.045, bright: 1600, attack: 0.2, release: 0.5 });
  if (!inRoster && !inFight) PROG[bar].forEach((n, k) => pluck(t + k * BEAT / 4, n + 12, 0.06, k % 2 ? 0.5 : -0.5));
}
// The POWER slow-motion: drop the groove under a sustained hit (handled by cues) and a tone.
pad(shotStart('fight') + 7.9, shotStart('fight') + 10.2, [38, 45, 50], { gain: 0.07, bright: 600, attack: 0.2 });
// Clash: drone returns, riser into the hit.
const c0 = shotStart('clash');
drone(c0, c0 + 4.8, 26, 0.3);
pad(c0 + 0.2, c0 + 4.6, [50, 53, 58, 62], { gain: 0.07, bright: 1100, attack: 1.5, release: 0.2 });
riser(c0 + 1.9, c0 + 4.68, 0.5);
// End card: resolve on D with an open fifth.
const e0 = shotStart('end');
pad(e0 + 0.4, DURATION - 1.2, [38, 45, 50, 57, 62, 69], { gain: 0.08, bright: 1200, attack: 0.4, release: 1 });
drone(e0 + 0.4, DURATION - 0.3, 26, 0.3);
[0, 1.5, 3, 4.5].forEach((d, i) => pluck(e0 + 1.2 + d, [74, 69, 72, 69][i], 0.07));

// ---------- sound design from cues ----------
for (const c of cues()) {
  switch (c.type) {
    case 'lighton': lightOn(c.t); break;
    case 'whoosh': whoosh(c.t, c.v ?? 0.6, c.len ?? 0.9); break;
    case 'glitch': glitch(c.t, 0.8); break;
    case 'crack': glass(c.t, 0.45, 18, 0.12); break;
    case 'shatter': glass(c.t, 1.6, 140, 0.1); boom(c.t, 0.7, 2); { const lp = new LP(6000); voice(c.t, 1, (t) => lp.run(noise()) * env(t, 0.002, 0.25), { gain: 0.5, send: 0.5 }); } break;
    case 'titlehit': titleHit(c.t); break;
    case 'boom': boom(c.t, c.v ?? 0.8); break;
    case 'bell': bell(c.t); break;
    case 'swing': swing(c.t, c.v ?? 0.5); break;
    case 'hit': punch(c.t, c.kind); break;
    case 'charge': charge(c.t, c.len ?? 1); break;
    case 'ko': boom(c.t, 0.8, 3); break;
    case 'slab': taiko(c.t, 0.5); whoosh(c.t, 0.25, 0.6); break;
    case 'clash': clash(c.t); break;
  }
}

// ---------- reverb (Schroeder) ----------
function reverb(inp, out, delays, feedback = 0.8, damp = 0.35, wet = 0.35) {
  const combs = delays.map((d) => ({ buf: new Float32Array(Math.floor(d * SR / 1000)), i: 0, lp: 0 }));
  const aps = [5.0, 1.7].map((d) => ({ buf: new Float32Array(Math.floor(d * SR / 1000)), i: 0 }));
  for (let n = 0; n < N; n++) {
    const x = inp[n] * 0.2;
    let y = 0;
    for (const c of combs) { const o = c.buf[c.i]; c.lp = o * (1 - damp) + c.lp * damp; c.buf[c.i] = x + c.lp * feedback; c.i = (c.i + 1) % c.buf.length; y += o; }
    for (const a of aps) { const o = a.buf[a.i]; const v = y + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.buf.length; y = o - v * 0.5; }
    out[n] += y * wet;
  }
}
reverb(RL, L, [29.7, 37.1, 41.1, 43.7, 53.3, 61.1], 0.86);
reverb(RR, R, [31.3, 35.9, 42.7, 47.9, 51.7, 63.7], 0.86);

// ---------- master: gentle glue compression, soft clip, normalise ----------
let envl = 0;
for (let n = 0; n < N; n++) {
  const lvl = Math.max(Math.abs(L[n]), Math.abs(R[n]));
  envl = lvl > envl ? envl + (lvl - envl) * 0.01 : envl * 0.99995;
  const gain = envl > 0.6 ? 0.6 / envl + (1 - 0.6 / envl) * 0.35 : 1;
  L[n] = Math.tanh(L[n] * gain * 1.1); R[n] = Math.tanh(R[n] * gain * 1.1);
}
let peak = 0;
for (let n = 0; n < N; n++) peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
const norm = 0.89 / peak;
// Fade the last second.
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let n = 0; n < N; n++) {
  const f = Math.min(1, (N - n) / SR);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[n] * norm * f)) * 32767), 44 + n * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[n] * norm * f)) * 32767), 46 + n * 4);
}
fs.mkdirSync(path.join(here, 'out'), { recursive: true });
fs.writeFileSync(path.join(here, 'out', 'score.wav'), buf);
console.log(`score.wav: ${DURATION}s, peak before normalise ${peak.toFixed(2)}`);
