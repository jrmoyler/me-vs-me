// Typography layer: a 1920×1080 canvas composited inside the final grade pass,
// so titles share the film grain, vignette and fades with the picture.
import { clamp, smooth, easeOut, expoOut } from './core.js';

export const W = 1920, H = 1080;

// Alpha for a caption visible from a to b with soft edges.
export const win = (t, a, b, fin = 0.35, fout = 0.35) => Math.min(smooth(a, a + fin, t), 1 - smooth(b - fout, b, t));

export function text(ctx, str, x, y, o = {}) {
  const {
    font = 'Oswald', weight = 500, size = 40, color = '#ffffff', alpha = 1, tracking = 0, align = 'center',
    blur = 0, glow = null, glowBlur = 30, scale = 1, baseline = 'middle',
  } = o;
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = clamp(alpha);
  ctx.translate(x, y);
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.font = `${weight} ${size}px "${font}"`;
  ctx.letterSpacing = `${tracking}px`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  // letterSpacing pads the right edge too; shift centred text back by half a space.
  const dx = align === 'center' ? tracking / 2 : align === 'right' ? tracking : 0;
  if (blur > 0.2) ctx.filter = `blur(${blur}px)`;
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = glowBlur;
  }
  ctx.fillStyle = color;
  ctx.fillText(str, dx, 0);
  ctx.restore();
}

// Cinematic caption: fades and focuses in while the tracking slowly opens.
export function cine(ctx, str, t, a, b, o = {}) {
  const alpha = win(t, a, b, o.fin ?? 0.5, o.fout ?? 0.45);
  if (alpha <= 0) return;
  const k = clamp((t - a) / (b - a));
  const t0 = o.track0 ?? 6, t1 = o.track1 ?? 14;
  text(ctx, str, o.x ?? W / 2, o.y ?? 860, {
    ...o, alpha: alpha * (o.alpha ?? 1),
    tracking: t0 + (t1 - t0) * easeOut(k),
    blur: (1 - smooth(a, a + 0.45, t)) * 10 + smooth(b - 0.4, b, t) * 6,
  });
}

// Word that slams in (scale overshoot) at a moment.
export function slam(ctx, str, t, at, dur, o = {}) {
  const age = t - at;
  if (age < 0 || age > dur) return;
  const s = age < 0.08 ? 1.6 - 0.6 * expoOut(age / 0.08) : 1 + 0.04 * (age / dur);
  const alpha = Math.min(1, age / 0.04) * (1 - smooth(dur - 0.25, dur, age));
  text(ctx, str, o.x ?? W / 2, o.y ?? H / 2, { font: 'Anton', weight: 400, size: 96, ...o, scale: s * (o.scale ?? 1), alpha });
}

export function rule(ctx, x, y, w, alpha, color = '#ffffff', h = 2) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2, y, w, h);
  ctx.restore();
}
