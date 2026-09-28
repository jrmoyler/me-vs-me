// One timeline drives both picture and sound. Times are seconds from the start of the film.
export const FPS = 30;

export const SHOTS = [
  { id: 'open', start: 0, end: 7.5 },
  { id: 'mirror', start: 7.5, end: 13.6 },
  { id: 'title', start: 13.6, end: 19.6 },
  { id: 'roster', start: 19.6, end: 28.2 },
  { id: 'fight', start: 28.2, end: 42.4 },
  { id: 'modes', start: 42.4, end: 50.8 },
  { id: 'clash', start: 50.8, end: 57.4 },
  { id: 'end', start: 57.4, end: 66 },
];
export const DURATION = SHOTS[SHOTS.length - 1].end;
export const shotStart = (id) => SHOTS.find((s) => s.id === id).start;

// Fight choreography in shot-local seconds. Each move lists hold times for its four frames;
// the impact lands at t + f[0] + f[1] and the third frame holds through the hitstop.
export const FIGHT = {
  p1: 'hataalii',
  p2: 'cyborg',
  moves: [
    { who: 'p1', name: 'JAB', row: 0, t: 1.5, f: [0.06, 0.05, 0.16, 0.1], hit: 'light' },
    { who: 'p1', name: 'CROSS', row: 1, t: 1.88, f: [0.06, 0.05, 0.17, 0.08], hit: 'medium' },
    { who: 'p1', name: 'UPPERCUT', row: 2, t: 2.25, f: [0.07, 0.06, 0.24, 0.16], hit: 'heavy', launch: true },
    { who: 'p2', name: 'BLOCK HIGH', row: 4, t: 4.2, f: [0.08, 0.06, 0.14, 0.12], hit: 'block' },
    { who: 'p2', name: 'BLOCK LOW', row: 3, t: 4.75, f: [0.07, 0.05, 0.14, 0.1], hit: 'block', low: true },
    { who: 'p1', name: 'THROW', row: 0, t: 5.35, f: [0.06, 0.08, 0.22, 0.12], hit: 'throw', throw: true },
    { who: 'p1', name: 'ROUNDHOUSE', row: 5, t: 7.25, f: [0.08, 0.07, 0.18, 0.0], hit: 'heavy' },
    { who: 'p1', name: 'POWER', row: 6, t: 7.58, f: [0.5, 0.3, 1.55, 0.3], hit: 'power', power: true },
  ],
  ko: 9.5,
  win: 10.3,
};
export const impactTime = (m) => m.t + m.f[0] + m.f[1];

// Sound cues in absolute seconds, read by the score synthesiser.
export function cues() {
  const f0 = shotStart('fight');
  const list = [
    { t: 0.85, type: 'lighton' },
    { t: 1.7, type: 'whoosh', v: 0.35 },
    { t: 4.1, type: 'whoosh', v: 0.35 },
    { t: 9.4, type: 'glitch' },
    { t: 11.9, type: 'crack' },
    { t: 12.4, type: 'shatter' },
    { t: 14.35, type: 'titlehit' },
    { t: 19.6, type: 'boom', v: 0.8 },
    { t: 23.4, type: 'whoosh', v: 0.8, len: 1.6 },
    { t: 25.3, type: 'boom', v: 0.6 },
    { t: f0 + 0.5, type: 'bell' },
  ];
  for (const m of FIGHT.moves) {
    list.push({ t: f0 + m.t, type: 'swing', v: m.power ? 0.3 : 0.5 });
    list.push({ t: f0 + impactTime(m), type: 'hit', kind: m.hit });
  }
  list.push({ t: f0 + 7.58, type: 'charge', len: 0.8 });
  list.push({ t: f0 + FIGHT.ko, type: 'ko' });
  const m0 = shotStart('modes');
  [0.5, 2.4, 4.3, 6.2].forEach((d) => list.push({ t: m0 + d, type: 'slab' }));
  const c0 = shotStart('clash');
  list.push({ t: c0 + 1.9, type: 'charge', len: 2.4 });
  list.push({ t: c0 + 4.2, type: 'whoosh', v: 1, len: 0.5 });
  list.push({ t: c0 + 4.7, type: 'clash' });
  list.push({ t: shotStart('end') + 0.6, type: 'titlehit' });
  return list;
}
