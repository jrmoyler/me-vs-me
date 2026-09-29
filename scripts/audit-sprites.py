#!/usr/bin/env python3
"""Audit every fighter atlas cell for truncation, grounding and scale problems.

Checks each 320x320 cell of every ready sheet (16), combat atlas (4x7) and motion atlas (4x6):

  empty     the cell has (almost) nothing in it
  edge      visible pixels within 2px of a cell border: the pose runs out of its cell
  cut       a solid wall along the pose's outermost column or top row, or a dead-straight
            silhouette edge anywhere. A drawn silhouette touches its extreme column with a few
            pixels (a fingertip, a toe, the crown of the head) and its outlines wander; a crop
            cut is a straight run (a head, fist, foot or effect sliced off)
  below     visible pixels under the ground line (y > 295): the pose sinks into the floor
  float     the lowest visible pixel is above the ground line: the pose hovers
  haze      invisible pixels (alpha 1-8) that sit below the pose and would decide its floor
  scale     a combat row drawn much larger or smaller than the ready pose (body area), or a
            motion atlas whose on-screen scale disagrees with the combat atlas once the
            runtime's bodyHeight / motionBodyHeight are applied
  speck     tiny detached specks far from the pose (reported with other problems only:
            sparks and embers are specks too)

Lost feet (legs cut straight across and grounded, so the fighter stands knee-deep in the floor)
cannot be told from real feet by geometry alone; the contact sheets are for that. Look at them.

Usage:
  python3 scripts/audit-sprites.py                    # every fighter; exit 1 when anything fails
  python3 scripts/audit-sprites.py pharaoh roman      # some fighters
  python3 scripts/audit-sprites.py --dir some/folder  # atlases in another folder
  python3 scripts/audit-sprites.py --sheets out/      # also render contact sheets to out/<id>.jpg:
                                                      # ground line in red, flagged cells outlined
"""
import argparse
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
C, FLOOR = 320, 295          # lowest visible row of a grounded pose (feet on the engine's y=296)
VIS, SOLID = 8, 200
CUT_RUN = 16                 # solid run along a pose's extreme column/row that counts as a cut
WALL = 40                    # straight silhouette edge (in runs of 6+) on one column/row: a crop line
COMBAT = ["jab", "cross", "uppercut", "low-kick", "sidekick", "roundhouse", "power"]
MOTION = ["walk", "jump", "guard", "hurt", "ko", "victory"]


def roster():
    src = (ROOT / "src/characters.js").read_text()
    out = []
    for m in re.finditer(r'id: "(\w+)"', src):
        block = src[m.end():m.end() + 900].split("fighter(")[0]
        bh = re.search(r"(?<!motion)bodyHeight: (\d+)", block)
        mbh = re.search(r"motionBodyHeight: (\d+)", block)
        b = int(bh.group(1)) if bh else 176
        out.append((m.group(1), b, int(mbh.group(1)) if mbh else b))
    return out


def longest_run(v):
    best = run = 0
    for f in v:
        run = run + 1 if f else 0
        best = max(best, run)
    return best


def straight_wall(a):
    """Longest total of straight silhouette edge (runs of 6+) on any one column or row."""
    solid = np.pad(a >= SOLID, 1)
    clear = np.pad(a < 64, 1, constant_values=True)
    best = 0
    for k, e in enumerate((solid[1:-1, 1:-1] & clear[1:-1, 2:], solid[1:-1, 1:-1] & clear[1:-1, :-2], solid[1:-1, 1:-1] & clear[:-2, 1:-1])):
        m = e if k < 2 else e.T
        for x in np.where(m.sum(0) >= 12)[0]:
            lab, n = ndimage.label(m[:, x])
            sizes = ndimage.sum(m[:, x], lab, range(1, n + 1))
            best = max(best, int(sizes[sizes >= 6].sum()))
    return best


def body_area(cell):
    a = cell[:, :, 3] >= 250
    return int((a & (cell[:, :, :3].astype(int).mean(2) < 185)).sum())


def check_cell(cell, cut_check=True):
    a = cell[:, :, 3]
    vis, solid = a > VIS, a >= SOLID
    issues = []
    if vis.sum() < 400:
        return ["empty"]
    ys, xs = np.where(vis)
    top, bot, left, right = ys.min(), ys.max(), xs.min(), xs.max()
    near = [n for n, hit in (("top", top < 2), ("bottom", bot > C - 3), ("left", left < 2), ("right", right > C - 3)) if hit]
    if near:
        issues.append("edge:" + "/".join(near))
    cuts = [(n, r) for n, r in (("left", longest_run(solid[:, left])), ("right", longest_run(solid[:, right])),
                                ("top", longest_run(solid[top]))) if r >= CUT_RUN]
    wall = straight_wall(a)
    if wall >= WALL:
        cuts.append(("wall", wall))
    if cuts and cut_check:
        issues.append("cut:" + ",".join(f"{n}{r}px" for n, r in cuts))
    if bot > FLOOR:
        issues.append(f"below:{bot - FLOOR}px")
    elif bot < FLOOR:
        issues.append(f"float:{FLOOR - bot}px")
    haze = (a > 0) & (a <= VIS)
    if haze[bot + 1:].any():
        issues.append("haze")
    lab, n = ndimage.label(ndimage.binary_dilation(vis, iterations=2), structure=np.ones((3, 3)))
    if n > 1:
        sizes = ndimage.sum(vis, lab, range(1, n + 1))
        main = ndimage.binary_dilation(lab == 1 + int(np.argmax(sizes)), iterations=24)
        specks = [i for i in range(1, n + 1) if sizes[i - 1] < 20 and not (main & (lab == i)).any()]
        if specks:
            issues.append(f"speck:{len(specks)}")  # informational: sparks and embers are specks too
    return issues


def audit_fighter(fid, body, motion_body, folder, new):
    sheet = np.array(Image.open(folder / f"{fid}-sheet.png").convert("RGBA"))
    combat = np.array(Image.open(folder / f"{fid}-combat.png").convert("RGBA"))
    motion = np.array(Image.open(folder / f"{fid}-motion.png").convert("RGBA"))
    atlases = {
        "sheet": [(f"ready[{k}]", 0, k, sheet[:, k * C:(k + 1) * C]) for k in range(16)],
        "combat": [(f"{COMBAT[r]}[{k}]", r, k, combat[r * C:(r + 1) * C, k * C:(k + 1) * C]) for r in range(7) for k in range(4)],
        "motion": [(f"{MOTION[r]}[{k}]", r, k, motion[r * C:(r + 1) * C, k * C:(k + 1) * C]) for r in range(6) for k in range(4)],
    }
    problems, flagged = [], {}
    for atlas, cells in atlases.items():
        for name, r, k, cell in cells:
            # The original eleven's ready sheets are GIF frames doubled with nearest-neighbour
            # sampling, so their flat hat brims read as long runs; they were never cropped.
            issues = check_cell(cell, cut_check=new or atlas != "sheet")
            if issues and not all(i.startswith("speck") for i in issues):
                problems.append((atlas, name, issues))
                flagged[(atlas, r, k)] = issues
    if new:
        # Scale: rows drawn at another size than the ready pose. POWER rows carry large effects
        # and knockdown poses lie flat, so those are left to the contact sheets.
        ref = body_area(atlases["combat"][0][3])
        for r in range(1, 6):
            ks = [np.sqrt(body_area(atlases["combat"][r * 4 + k][3]) / ref) for k in range(4)]
            med = float(np.median(ks))
            if not 0.85 <= med <= 1.18:
                problems.append(("combat", f"{COMBAT[r]} row", [f"scale:{med:.2f}x ready"]))
        # Motion atlas on screen: its own body scale times the runtime's height correction.
        ks = [np.sqrt(body_area(atlases["motion"][r * 4 + k][3]) / ref) for r in (0, 2, 5) for k in range(4)]
        onscreen = float(np.median(ks)) * body / motion_body
        if not 0.85 <= onscreen <= 1.18:
            problems.append(("motion", "atlas", [f"scale:{onscreen:.2f}x ready on screen (motionBodyHeight {motion_body})"]))
    return problems, flagged, atlases


def contact(fid, atlases, flagged, out):
    c = C // 2
    img = Image.new("RGB", (9 * c, 9 * c), (40, 42, 54))
    d = ImageDraw.Draw(img)

    def put(atlas, r, k, cell, x, y):
        bg = Image.new("RGBA", (C, C), (74, 78, 98, 255))
        bg.alpha_composite(Image.fromarray(cell))
        ImageDraw.Draw(bg).line([(0, FLOOR + 1), (C, FLOOR + 1)], fill=(255, 70, 70, 255), width=2)
        img.paste(bg.resize((c, c), Image.LANCZOS).convert("RGB"), (x, y))
        bad = (atlas, r, k) in flagged
        d.rectangle([x, y, x + c - 1, y + c - 1], outline=(255, 220, 0) if bad else (20, 20, 28), width=3 if bad else 1)

    for _, r, k, cell in atlases["combat"]:
        put("combat", r, k, cell, k * c, r * c)
    for _, r, k, cell in atlases["motion"]:
        put("motion", r, k, cell, (5 + k) * c, r * c)
    for _, r, k, cell in atlases["sheet"]:
        put("sheet", r, k, cell, (k % 8) * c, (7 + k // 8) * c)
    d.text((4 * c + 6, 6), f"{fid}\n\nleft: combat\njab / cross\nuppercut\nlow kick\nsidekick\nroundhouse\nPOWER\n\nright: motion\nwalk / jump\nguard / hurt\nko / victory\n\nbottom: ready\nsheet 0-15", fill=(240, 240, 240))
    img.save(out / f"{fid}.jpg", quality=82)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--dir", default=str(ROOT / "public/assets/characters"))
    ap.add_argument("--sheets")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()
    fighters = roster()
    original = {f for f, _, _ in fighters[:11]}
    if args.ids:
        fighters = [f for f in fighters if f[0] in args.ids]
    folder = Path(args.dir)
    total = 0
    for fid, body, motion_body in fighters:
        problems, flagged, atlases = audit_fighter(fid, body, motion_body, folder, fid not in original)
        total += len(problems)
        if problems and not args.quiet:
            print(f"{fid}: {len(problems)} problems")
            for atlas, name, issues in problems:
                print(f"   {atlas:6s} {name:16s} {' '.join(issues)}")
        if args.sheets:
            out = Path(args.sheets)
            out.mkdir(parents=True, exist_ok=True)
            contact(fid, atlases, flagged, out)
    print(f"{total} problems across {len(fighters)} fighters")
    sys.exit(1 if total else 0)


if __name__ == "__main__":
    main()
