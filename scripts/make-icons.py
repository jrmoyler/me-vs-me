#!/usr/bin/env python3
"""Draw the install icons in public/icons from Hataalii's portrait.

The original faces his mirrored reflection on the title screen's red sun square. The maskable
icon keeps both figures inside the central 80% safe zone.

  pip install pillow numpy
  python3 scripts/make-icons.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public/icons"
BG, SUN = (16, 19, 25, 255), (214, 84, 57, 255)


def figure():
    im = Image.open(ROOT / "public/assets/characters/hataalii-portrait.png").convert("RGBA")
    a = np.array(im)[:, :, 3] > 8
    ys, xs = np.where(a)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def icon(size, safe=1.0):
    base = 512
    canvas = Image.new("RGBA", (base, base), BG)
    draw = ImageDraw.Draw(canvas)
    inset = round(base * (1 - safe) / 2)
    span = base - 2 * inset
    # The sun square from the title screen, a little off centre.
    s0 = inset + round(span * 0.16)
    draw.rectangle((s0, s0 - round(span * 0.04), s0 + round(span * 0.6), s0 + round(span * 0.56)), fill=SUN)
    fig = figure()
    h = round(span * 0.8)
    w = round(fig.width * h / fig.height)
    lead = fig.resize((w, h), Image.NEAREST)
    # The reflection: mirrored, darker, standing behind.
    back = lead.transpose(Image.FLIP_LEFT_RIGHT)
    dim = np.array(back)
    dim[:, :, :3] = (dim[:, :, :3] * 0.38).astype(np.uint8)
    back = Image.fromarray(dim)
    floor = inset + round(span * 0.93)
    canvas.alpha_composite(back, (inset + round(span * 0.52) - w // 2, floor - h - round(span * 0.03)))
    canvas.alpha_composite(lead, (inset + round(span * 0.36) - w // 2, floor - h))
    return canvas.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    icon(192).save(OUT / "icon-192.png", optimize=True)
    icon(512).save(OUT / "icon-512.png", optimize=True)
    icon(512, safe=0.8).save(OUT / "maskable-512.png", optimize=True)
    icon(180).convert("RGB").save(OUT / "apple-touch-icon.png", optimize=True)
    icon(32).save(OUT / "favicon-32.png", optimize=True)


if __name__ == "__main__":
    main()
