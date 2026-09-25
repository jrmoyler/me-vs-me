// Bounded, deterministic environmental animation: no emitter allocation per tick.
const ATMOSPHERES = {
  "neon-avenue"(g, t) {
    g.lineStyle(1, 0x9dc9df, 0.19);
    for (let i = 0; i < 44; i++) {
      const x = ((i * 137 + t * 55) % 1000) - 20;
      const y = (i * 79 + t * 360) % 540;
      g.lineBetween(x, y, x - 5, y + 17);
    }
    g.fillStyle(0x4ef3ee, 0.035 + Math.sin(t * 2) * 0.012);
    g.fillEllipse(220, 464, 250, 18);
  },
  "mirror-garden"(g, t) {
    for (let i = 0; i < 18; i++) {
      const x = ((i * 139 + t * 27) % 1000) - 20;
      const y = (i * 59 + t * 17) % 450;
      g.fillStyle(i % 2 ? 0xf5b6d1 : 0xffe0e4, 0.55);
      g.fillEllipse(x + Math.sin(t + i) * 14, y, 5, 2);
    }
  },
  "the-foundry"(g, t) {
    g.fillStyle(0xff7f27, 0.05 + Math.sin(t * 4) * 0.018);
    g.fillRect(0, 230, 960, 260);
    for (let i = 0; i < 18; i++) {
      g.fillStyle(0xffc775, 0.5);
      g.fillRect(80 + ((i * 43) % 800), 360 - ((t * 70 + i * 29) % 270), 2, 3);
    }
  },
  "sunset-court"(g) {
    g.fillStyle(0xffbd82, 0.045);
    g.fillTriangle(0, 90, 390, 490, 540, 490);
    g.fillTriangle(100, 90, 610, 490, 640, 490);
  },
  "midnight-terrace"(g, t) {
    g.lineStyle(1, 0xafc9ff, 0.12 + Math.sin(t) * 0.04);
    for (let i = 0; i < 6; i++)
      g.lineBetween(85 + i * 150, 469, 160 + i * 150, 469);
  },
  // A train slides past behind the platform; the tubes flicker; steam drifts up.
  "terminal-nine"(g, t) {
    const sweep = ((t * 260) % 1500) - 300;
    g.fillStyle(0xfff1c2, 0.11);
    for (let i = 0; i < 6; i++) g.fillRect(sweep + i * 112, 262, 72, 40);
    g.fillStyle(0xbdfff0, Math.sin(t * 23) > 0.86 ? 0.11 : 0.05);
    g.fillRect(0, 58, 960, 5);
    g.fillStyle(0xd9fff2, 0.07);
    for (let i = 0; i < 5; i++)
      g.fillEllipse(
        120 + i * 190 + Math.sin(t * 0.6 + i) * 16,
        470 - ((t * 14 + i * 37) % 120),
        70,
        16,
      );
  },
  // Dawn shafts through the glass roof, pollen rising, mist along the floor.
  glasshouse(g, t) {
    g.fillStyle(0xfff3b8, 0.04 + Math.sin(t * 0.8) * 0.01);
    g.fillTriangle(300, 0, 560, 480, 700, 480);
    g.fillTriangle(560, 0, 760, 480, 860, 480);
    for (let i = 0; i < 30; i++) {
      const x = (i * 131 + Math.sin(t * 0.7 + i) * 20 + 1000) % 960;
      const y = 480 - ((t * 22 + i * 53) % 470);
      g.fillStyle(i % 3 ? 0xf3ffb0 : 0xffffff, 0.45);
      g.fillCircle(x, y, 1.6);
    }
    g.fillStyle(0xc9f7d8, 0.06);
    g.fillEllipse(480, 472, 900, 40);
  },
  // Camera flashes in the stands and confetti drifting over the sideline.
  "overtime-field"(g, t) {
    for (let i = 0; i < 5; i++) {
      const cycle = t * 1.7 + i * 1.31;
      const phase = cycle % 1;
      if (phase < 0.08) {
        const n = Math.floor(cycle);
        const x = (i * 191 + n * 97) % 960;
        const y = 90 + ((i * 67 + n * 41) % 180);
        g.fillStyle(0xffffff, (0.08 - phase) * 6);
        g.fillCircle(x, y, 6 + phase * 60);
      }
    }
    for (let i = 0; i < 24; i++) {
      const x = (i * 97 + t * 18 + Math.sin(t * 2 + i) * 10 + 1000) % 960;
      const y = (i * 71 + t * 55) % 470;
      g.fillStyle([0xff8fb1, 0xffffff, 0xffd257][i % 3], 0.7);
      g.fillRect(x, y, 3, 5);
    }
  },
  // Heat shimmer over the deck and headlights passing on the far lane.
  "redline-overpass"(g, t) {
    for (let i = 0; i < 14; i++) {
      const y = 300 + i * 9;
      g.lineStyle(1, 0xffb070, 0.05 + 0.03 * Math.sin(t * 3 + i));
      g.lineBetween(0, y + Math.sin(t * 2 + i) * 1.5, 960, y + Math.cos(t * 2 + i) * 1.5);
    }
    const car = ((t * 420) % 1500) - 300;
    g.fillStyle(0xfff0c0, 0.18);
    g.fillRect(car, 330, 120, 3);
    g.fillStyle(0xff5040, 0.14);
    g.fillRect(car - 160, 336, 60, 2);
    g.fillStyle(0xffd2a0, 0.35);
    for (let i = 0; i < 12; i++)
      g.fillRect((i * 83 + t * 40) % 960, 380 + ((i * 29) % 90), 2, 1);
  },
  // Rack status lights stepping through their columns under a slow scan.
  "null-vault"(g, t) {
    for (let col = 0; col < 8; col++)
      for (let row = 0; row < 6; row++) {
        const on = (Math.floor(t * 6) + col * 3 + row * 5) % 7 < 2;
        g.fillStyle(row % 2 ? 0xa98bff : 0x66c2ff, on ? 0.75 : 0.12);
        g.fillRect(90 + col * 110, 150 + row * 28, 4, 4);
      }
    g.fillStyle(0xa98bff, 0.05);
    g.fillRect(0, (t * 90) % 540, 960, 3);
    g.lineStyle(1, 0x8a7bff, 0.08 + Math.sin(t * 1.5) * 0.03);
    for (let i = 0; i < 7; i++) g.lineBetween(60 + i * 140, 470, 60 + i * 140, 540);
  },
};

export function atmosphereFor(id) {
  return ATMOSPHERES[id] || ATMOSPHERES["midnight-terrace"];
}

export function paintAtmosphere(g, arena, time, reducedMotion) {
  g.clear();
  atmosphereFor(arena?.id)(g, reducedMotion ? 0 : time);
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
    case "fusion": {
      const palm = x + face * 65;
      for (let i = 0; i < 3; i++) {
        const orbit = r * (0.65 + i * 0.25);
        g.strokeEllipse(palm, y, orbit * 2, orbit * (0.45 + i * 0.25));
        const angle = i * 2.1 + (reducedMotion ? 0 : time * 3);
        g.fillStyle(0xffcf71, strength);
        g.fillCircle(palm + Math.cos(angle) * orbit, y + Math.sin(angle) * orbit * 0.35, 4);
      }
      break;
    }
    case "accord": {
      const ward = x + face * 70;
      g.beginPath();
      g.moveTo(ward - face * 25, y - 55);
      g.lineTo(ward + face * 28, y - 43);
      g.lineTo(ward + face * 35, y + 10);
      g.lineTo(ward, y + 55);
      g.lineTo(ward - face * 25, y + 15);
      g.closePath();
      g.strokePath();
      g.lineBetween(ward - face * 10, y, ward + face * 15, y + 15);
      g.lineBetween(ward + face * 15, y + 15, ward + face * 23, y - 20);
      break;
    }
    case "relay":
      for (let i = 0; i < 4; i++) {
        const pulse = x + face * (55 + i * 25 + r * 0.3);
        g.strokeEllipse(pulse, y, 14 + i * 8, 32 + i * 19);
      }
      break;
    case "forge":
      for (let i = 0; i < 5; i++) {
        const trail = x + face * (25 + i * 11);
        g.beginPath();
        g.moveTo(trail - face * 23, y + 52);
        g.lineTo(trail, y - r * 0.4);
        g.lineTo(trail + face * 8, y - r - i * 5);
        g.strokePath();
        g.fillStyle(i % 2 ? 0xffd691 : 0xe63b4b, strength);
        g.fillTriangle(trail, y - r - 10, trail - 4, y - r + 4, trail + 4, y - r + 4);
      }
      break;
    case "cloudburst": {
      const tote = x + face * 66;
      g.strokeRoundedRect(tote - 24, y - 26, 48, 58, 5);
      g.strokeEllipse(tote, y - 28, 24, 22);
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        const dx = Math.cos(a), dy = Math.sin(a);
        g.lineBetween(tote + dx * 39, y + dy * 39, tote + dx * (r + 20), y + dy * (r + 20));
      }
      break;
    }
    case "null":
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(x - face * 45, f.y - 20 - i * 10);
        g.lineTo(x + face * 22, f.y - 38 - i * 8);
        g.lineTo(x + face * (r + 65), f.y - 25 - i * 13);
        g.lineTo(x + face * (r + 30), f.y - 12 - i * 9);
        g.strokePath();
      }
      break;
    case "solar":
      for (let i = 0; i < 4; i++) {
        const start = -2.4 + i * 0.2;
        const end = 0.8 + i * 0.3;
        g.beginPath();
        g.arc(x + face * 38, y + 10, r * (0.5 + i * 0.17), face < 0 ? Math.PI - start : start, face < 0 ? Math.PI - end : end, face < 0);
        g.strokePath();
      }
      g.strokeEllipse(x + face * 40, f.y - 8, r * 2.1, 18);
      break;
    case "root":
      for (let i = 0; i < 5; i++) {
        const root = x + face * (40 + i * 28);
        const top = f.y - 35 - (4 - Math.abs(2 - i)) * r * 0.45;
        g.beginPath();
        g.moveTo(root - face * 10, f.y);
        g.lineTo(root, f.y - 24);
        g.lineTo(root - face * 6, top + 18);
        g.lineTo(root + face * 9, top);
        g.strokePath();
        g.lineBetween(root - face * 4, top + 30, root - face * 18, top + 17);
      }
      break;
    case "apex": {
      const focus = x + face * (65 + r * 0.35);
      g.strokeEllipse(focus, y, 60 + r * 0.2, 23);
      g.strokeEllipse(focus, y, 23, 60 + r * 0.2);
      g.fillStyle(0xf1dbff, strength);
      g.fillCircle(focus, y, 6);
      g.lineBetween(x + face * 24, y, focus - face * 12, y);
      for (let i = -1; i <= 1; i += 2) {
        g.lineBetween(focus + face * 18, y + i * 16, focus + face * 35, y + i * 32);
      }
      break;
    }
    // Seven-fighter expansion.
    case "volley": {
      const bow = x + face * 58;
      for (let i = -2; i <= 2; i++) {
        const tip = bow + face * (r + 30 - Math.abs(i) * 12);
        const ty = y + i * 13;
        g.lineBetween(bow, y + i * 5, tip, ty);
        g.fillStyle(0xd8ff8a, strength);
        g.fillTriangle(tip + face * 9, ty, tip, ty - 4, tip, ty + 4);
      }
      break;
    }
    case "plasma": {
      const fist = x + face * 62;
      g.fillStyle(0x9ff4ff, strength * 0.35);
      g.fillEllipse(fist + face * r * 0.45, y, r * 1.1 + 30, 34);
      g.strokeCircle(fist, y, 16 + r * 0.08);
      g.fillStyle(0xe8fdff, strength);
      g.fillCircle(fist, y, 9);
      break;
    }
    case "hourglass": {
      const glass = x + face * (70 + r * 0.25);
      g.strokeTriangle(glass - 22, y - 42, glass + 22, y - 42, glass, y);
      g.strokeTriangle(glass - 22, y + 42, glass + 22, y + 42, glass, y);
      g.strokeEllipse(glass, y, 76 + r * 0.3, 96 + r * 0.3);
      g.lineBetween(x + face * 30, y, glass - face * 38, y);
      break;
    }
    case "verdict": {
      const shield = x + face * 66;
      g.beginPath();
      g.moveTo(shield - 26, y - 44);
      g.lineTo(shield + 26, y - 44);
      g.lineTo(shield + 26, y + 6);
      g.lineTo(shield, y + 46);
      g.lineTo(shield - 26, y + 6);
      g.closePath();
      g.strokePath();
      g.fillStyle(0xfff0b8, strength);
      g.fillCircle(shield, y - 8, 8);
      g.strokeRect(shield - face * 8 - 4, y - 32, 8, 50);
      break;
    }
    case "flare": {
      const core = x + face * (60 + r * 0.2);
      g.fillStyle(0xff8a1f, strength * 0.5);
      g.fillTriangle(core, y - 20, core, y + 20, core - face * (48 + r * 0.4), y);
      g.fillStyle(0xffc84a, strength * 0.8);
      g.fillCircle(core, y, 22);
      g.fillStyle(0xfff4c9, strength);
      g.fillCircle(core + face * 4, y - 3, 10);
      break;
    }
    case "graphite":
      for (let i = 0; i < 9; i++) {
        const hx = x + face * (50 + i * (r + 60) / 9);
        g.lineBetween(hx - face * 7, y + 18 - (i % 3) * 5, hx + face * 7, y - 18 + (i % 2) * 6);
      }
      g.lineBetween(x + face * 46, y, x + face * (r + 110), y);
      break;
    case "pages": {
      const book = x + face * 56;
      g.strokeRect(book - 14, y - 16, 28, 34);
      for (let i = 0; i < 6; i++) {
        const px = book + face * (22 + i * (r + 40) / 6);
        const py = y - 24 + ((i * 17) % 48);
        g.fillStyle(i % 2 ? 0xfff6dc : 0xffe29a, strength);
        g.fillRect(px - 6, py - 8, 12, 16);
      }
      break;
    }
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

// Projectile POWERs travel as their own shape; unknown styles keep the classic energy orb.
export function paintProjectile(g, shot, time = 0) {
  const color = parseInt(shot.owner.c.color.slice(1), 16);
  const { x, y, face } = shot;
  switch (shot.move?.style) {
    case "volley":
      g.lineStyle(2, color, 0.95);
      for (let i = -1; i <= 1; i++) {
        const ax = x - Math.abs(i) * face * 14;
        g.lineBetween(ax - face * 40, y + i * 12, ax, y + i * 12);
        g.fillStyle(0xe6ff9e, 0.95);
        g.fillTriangle(ax + face * 11, y + i * 12, ax, y + i * 12 - 5, ax, y + i * 12 + 5);
      }
      return;
    case "flare":
      g.fillStyle(0xff7a1a, 0.35);
      g.fillTriangle(x, y - 18, x, y + 18, x - face * 70, y);
      g.fillStyle(color, 0.9);
      g.fillCircle(x, y, 18);
      g.fillStyle(0xfff4c9, 0.95);
      g.fillCircle(x + face * 4, y - 2, 8);
      return;
    case "pages":
      for (let i = 0; i < 5; i++) {
        const px = x - face * i * 15;
        const py = y + Math.sin(time * 9 + i * 1.7) * 14;
        g.fillStyle(i % 2 ? 0xfff6dc : color, 0.9 - i * 0.12);
        g.fillRect(px - 7, py - 9, 14, 18);
      }
      return;
    case "ion":
      g.fillStyle(color, 0.2);
      g.fillEllipse(x - face * 26, y, 96, 30);
      g.lineStyle(3, 0xe9ffff, 0.9);
      g.strokeCircle(x, y, 19);
      g.fillStyle(color, 0.85);
      g.fillCircle(x, y, 13);
      return;
    case "shatter":
      g.lineStyle(2, color, 0.9);
      for (let i = 0; i < 4; i++) {
        const a = i * 1.57 + time * 6;
        g.strokeTriangle(
          x + Math.cos(a) * 20, y + Math.sin(a) * 20,
          x + Math.cos(a + 0.5) * 8, y + Math.sin(a + 0.5) * 8,
          x + Math.cos(a - 0.5) * 8, y + Math.sin(a - 0.5) * 8,
        );
      }
      g.fillStyle(0xffffff, 0.85);
      g.fillCircle(x, y, 6);
      return;
    case "relay":
      g.lineStyle(3, color, 0.85);
      for (let i = 0; i < 3; i++) g.strokeEllipse(x - face * i * 16, y, 12 + i * 6, 26 + i * 12);
      return;
    case "apex":
      g.lineStyle(2, color, 0.9);
      g.strokeEllipse(x, y, 44, 16);
      g.strokeEllipse(x, y, 16, 44);
      g.fillStyle(0xf1dbff, 0.95);
      g.fillCircle(x, y, 7);
      return;
    default:
      g.fillStyle(color, 0.18);
      g.fillEllipse(x - face * 20, y, 86, 36);
      g.lineStyle(3, color, 0.9);
      g.strokeCircle(x, y, 21);
      g.fillStyle(color, 0.8);
      g.fillCircle(x, y, 15);
      g.fillStyle(0xffffff, 0.9);
      g.fillRect(x - 8, y - 5, 16, 10);
  }
}
