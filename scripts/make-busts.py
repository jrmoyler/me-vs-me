#!/usr/bin/env python3
"""Build a high-resolution head-and-shoulders bust for every fighter.

    python3 scripts/make-busts.py [--sheet contact.png]

Cutscene close-ups (eye-lines, face-offs, bracket seats, ladder pips) used to blow the
full-body portrait up with CSS and guess where the face was. The 38 later fighters'
portraits are small full-body figures (~176px tall, head ~35px) so those crops were
soft and landed differently per fighter: tall headdresses, crowns, hats and hoods ran
off the top of the frame.

This script finds the head in each fighter's ready-pose portrait (the silhouette's top
within the column above the torso, so staffs, bows and fists raised to one side do not
move it), crops a square with headroom above the tallest point of the head, and scales
it up by a whole-number factor with nearest-neighbour sampling so the pixel art stays
crisp. Every bust is a 768x768 transparent PNG, head centred, shoulders on the bottom
edge, and no opaque pixel on the top rows, so CSS can frame all 49 the same way:
bottom-aligned, contain.

Writes public/assets/characters/<id>-bust.png and asset-sources/busts-manifest.json.
Needs Pillow, NumPy and SciPy only to rebuild the art; the game does not.
"""
import argparse
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
CHARS = ROOT / "public" / "assets" / "characters"
OUT = 768
# Fraction of the body height the crop spans, and the empty band kept above the head.
SPAN = 0.52
HEADROOM = 0.12
MIN_TOP_GAP = 8  # output pixels of transparency guaranteed above any opaque pixel

# Per-fighter framing nudges, in source pixels, for poses the detector cannot read alone.
# dx moves the crop right, dy moves it down; span scales the crop.
OVERRIDES: dict[str, dict] = {
    # The staff's orb rises right beside the hood: widen and shift right to frame both whole.
    "starscribe": {"span": 1.45, "dx": 16},
    # The ermine collar rises level with the face and pulls the estimate left of the crown.
    "sovereign": {"dx": 8},
    # The beret's plume sweeps out to the right: widen so the feather stays whole.
    "renaissance": {"span": 1.2, "dx": 6},
}


def roster_ids():
    src = (ROOT / "src" / "characters.js").read_text()
    return re.findall(r'fighter\(\{\s*id: "([^"]+)"', src)


def silhouette(rgba):
    mask = rgba[:, :, 3] > 24
    labels, n = ndimage.label(mask)
    if n:
        sizes = ndimage.sum(mask, labels, range(1, n + 1))
        keep = np.isin(labels, 1 + np.flatnonzero(sizes >= 24))
        mask &= keep
    return mask


def detect(mask):
    ys, xs = np.nonzero(mask)
    y0, y1 = ys.min(), ys.max()
    h = y1 - y0 + 1
    # Torso: the middle band of the body; its median column is where the head sits over.
    band = (ys >= y0 + 0.28 * h) & (ys <= y0 + 0.55 * h)
    cx = float(np.median(xs[band]))
    half = 0.17 * h
    cols = (xs >= cx - half) & (xs <= cx + half)
    head_top = int(ys[cols].min())
    head_rows = cols & (ys >= head_top) & (ys <= head_top + 0.12 * h)
    hx = float(np.mean(xs[head_rows]))
    return {"top": int(y0), "bottom": int(y1), "height": int(h), "torso_x": cx, "head_top": head_top, "head_x": hx}


def make_bust(fid):
    src_path = CHARS / f"{fid}-portrait.png"
    rgba = np.array(Image.open(src_path).convert("RGBA"))
    mask = silhouette(rgba)
    d = detect(mask)
    o = OVERRIDES.get(fid, {})
    span = SPAN * o.get("span", 1.0) * d["height"]
    # Nearest whole factor, so the crop stays within ~10% of the target span.
    k = max(1, int(round(OUT / span)))
    c = OUT // k  # crop side in source pixels
    left = int(round(d["head_x"] - c / 2)) + o.get("dx", 0)
    top = d["head_top"] - int(round(HEADROOM * c)) + o.get("dy", 0)
    # Anything else inside the crop's columns that reaches higher (a crown's spike, a
    # staff) raises the crop so the top rows stay empty.
    gap = max(-(-MIN_TOP_GAP // k), int(round(0.06 * c)))
    cols = mask[:, max(0, left): max(0, left + c)]
    rows = np.flatnonzero(cols.any(axis=1))
    if rows.size and rows.min() - gap < top:
        top = int(rows.min()) - gap
    # Pad the source so the crop may hang past any edge.
    pad = c
    padded = np.zeros((rgba.shape[0] + 2 * pad, rgba.shape[1] + 2 * pad, 4), np.uint8)
    padded[pad:-pad, pad:-pad] = rgba * mask[:, :, None]
    crop = padded[top + pad: top + pad + c, left + pad: left + pad + c]
    big = Image.fromarray(crop, "RGBA").resize((c * k, c * k), Image.NEAREST)
    canvas = Image.new("RGBA", (OUT, OUT), (0, 0, 0, 0))
    # Bottom-aligned and centred: any spare rows go above the head.
    canvas.paste(big, ((OUT - c * k) // 2, OUT - c * k))
    out = CHARS / f"{fid}-bust.png"
    canvas.save(out, optimize=True)
    alpha = np.array(canvas)[:, :, 3]
    oy = np.flatnonzero(alpha.any(axis=1))
    return {
        "id": fid,
        "source": src_path.name,
        "sourceSize": [int(rgba.shape[1]), int(rgba.shape[0])],
        "crop": [left, top, c, c],
        "scale": k,
        "headTop": d["head_top"],
        "headX": round(d["head_x"], 1),
        "opaqueTop": int(oy.min()),
        "bytes": out.stat().st_size,
    }


def contact(entries, path):
    cell, cols = 192, 10
    rows = -(-len(entries) // cols)
    sheet = Image.new("RGBA", (cols * cell, rows * (cell + 16)), (30, 32, 46, 255))
    for i, e in enumerate(entries):
        im = Image.open(CHARS / f"{e['id']}-bust.png").resize((cell, cell), Image.NEAREST)
        x, y = (i % cols) * cell, (i // cols) * (cell + 16)
        bg = Image.new("RGBA", (cell, cell), (58, 62, 84, 255))
        bg.alpha_composite(im)
        sheet.paste(bg, (x, y))
    sheet.convert("RGB").save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", help="also write a contact sheet of every bust here")
    args = ap.parse_args()
    entries = [make_bust(fid) for fid in roster_ids()]
    manifest = {
        "size": OUT,
        "note": "Head-and-shoulders crops of each ready-pose portrait, upscaled by a whole-number nearest-neighbour factor. Built by scripts/make-busts.py.",
        "fighters": entries,
    }
    (ROOT / "asset-sources" / "busts-manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    for e in entries:
        print(f"{e['id']:15} crop={e['crop']} x{e['scale']} top={e['opaqueTop']:3} {e['bytes'] // 1024}KB")
    if args.sheet:
        contact(entries, args.sheet)


if __name__ == "__main__":
    main()
