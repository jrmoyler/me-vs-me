// Bounded, deterministic environmental animation: no emitter allocation per tick.
export function paintAtmosphere(g, arena, time, reducedMotion) {
  g.clear();
  const t = reducedMotion ? 0 : time;
  if (arena.id === "neon-avenue") {
    g.lineStyle(1, 0x9dc9df, 0.19);
    for (let i = 0; i < 44; i++) {
      const x = ((i * 137 + t * 55) % 1000) - 20;
      const y = (i * 79 + t * 360) % 540;
      g.lineBetween(x, y, x - 5, y + 17);
    }
    g.fillStyle(0x4ef3ee, 0.035 + Math.sin(t * 2) * 0.012);
    g.fillEllipse(220, 464, 250, 18);
  } else if (arena.id === "mirror-garden") {
    for (let i = 0; i < 18; i++) {
      const x = ((i * 139 + t * 27) % 1000) - 20;
      const y = (i * 59 + t * 17) % 450;
      g.fillStyle(i % 2 ? 0xf5b6d1 : 0xffe0e4, 0.55);
      g.fillEllipse(x + Math.sin(t + i) * 14, y, 5, 2);
    }
  } else if (arena.id === "the-foundry") {
    g.fillStyle(0xff7f27, 0.05 + Math.sin(t * 4) * 0.018);
    g.fillRect(0, 230, 960, 260);
    for (let i = 0; i < 18; i++) {
      g.fillStyle(0xffc775, 0.5);
      g.fillRect(80 + ((i * 43) % 800), 360 - ((t * 70 + i * 29) % 270), 2, 3);
    }
  } else if (arena.id === "sunset-court") {
    g.fillStyle(0xffbd82, 0.045);
    g.fillTriangle(0, 90, 390, 490, 540, 490);
    g.fillTriangle(100, 90, 610, 490, 640, 490);
  } else {
    g.lineStyle(1, 0xafc9ff, 0.12 + Math.sin(t) * 0.04);
    for (let i = 0; i < 6; i++)
      g.lineBetween(85 + i * 150, 469, 160 + i * 150, 469);
  }
}

export function paintPower(g, f, time, reducedMotion) {
  const m = f.attack;
  if (!m || m.type !== "special") return;
  const color = parseInt(f.c.color.slice(1), 16);
  const progress = m.t / m.duration;
  const strength = Math.sin(progress * Math.PI);
  const x = f.x,
    y = f.y - 80,
    face = f.face;
  g.lineStyle(3, color, strength * 0.8);
  if (m.t < m.start) {
    g.strokeEllipse(x, f.y - 3, 50 + progress * 150, 15 + progress * 35);
    return;
  }
  const r = 40 + (m.t - m.start) * 180;
  switch (m.style) {
    case "crown":
      g.beginPath();
      g.moveTo(x - 65, y);
      g.lineTo(x - 65, y - 50);
      g.lineTo(x - 25, y - 23);
      g.lineTo(x, y - 85);
      g.lineTo(x + 25, y - 23);
      g.lineTo(x + 65, y - 50);
      g.lineTo(x + 65, y);
      g.closePath();
      g.strokePath();
      break;
    case "shatter":
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9;
        g.strokeTriangle(
          x + Math.cos(a) * r,
          y + Math.sin(a) * r,
          x + Math.cos(a + 0.1) * (r + 23),
          y + Math.sin(a + 0.1) * (r + 23),
          x + Math.cos(a + 0.3) * r,
          y + Math.sin(a + 0.3) * r,
        );
      }
      break;
    case "star":
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5;
        g.lineBetween(
          x + face * 70 + Math.cos(a) * 15,
          y + Math.sin(a) * 15,
          x + face * 70 + Math.cos(a) * r,
          y + Math.sin(a) * r,
        );
      }
      break;
    case "vector":
      for (let i = 0; i < 3; i++) {
        const xx = x + face * (45 + i * 24);
        g.lineBetween(xx - face * 18, y - 34, xx, y);
        g.lineBetween(xx, y, xx - face * 18, y + 34);
      }
      break;
    case "shock":
      g.strokeEllipse(x + face * 60, f.y - 8, r * 2, r * 0.5);
      break;
    case "counter":
      g.strokeRoundedRect(x + face * 45 - 25, y - 42, 50, 84, 12);
      break;
    case "sweep":
      g.beginPath();
      g.arc(x, f.y - 10, r, Math.PI, Math.PI * 2);
      g.strokePath();
      break;
    default:
      g.beginPath();
      g.arc(x + face * 35, y, r, -1.4, 1.4, false);
      g.strokePath();
  }
  if (!reducedMotion && m.t < m.start + m.active) {
    g.lineStyle(2, 0xffffff, strength * 0.5);
    g.lineBetween(x - face * 100, y + 15, x - face * 35, y + 15);
  }
}
