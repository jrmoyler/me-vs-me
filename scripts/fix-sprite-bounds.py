#!/usr/bin/env python3
"""Rebuild the fourteen- and eight-fighter atlases so no pose is cut off or sunk into the floor.

Those two packs were exported from their source grids with small crop boxes on a drifting row
pitch. Poses ran past their crop box: kicks lost their feet at the box side, POWER effects
stopped at a hard vertical line, heads lost their tops, and some rows lost everything below the
shins, so after grounding the fighter stood knee-deep in the floor (the guard, crouch and
uppercut poses were the worst). Neighbouring poses left slivers behind.

This script starts from the exported atlases in git history (the source zips are not in the
repo), because they still hold every pixel the export kept:

 1. Marks every crop-box cut in the export: a long solid run along a cell's outermost column or
    top row (natural silhouettes touch their extreme column with a few pixels, not a wall).
    The mark rides in the blue channel's lowest bit, invisible and untouched by stitching.
 2. Stitches split poses back together with scripts/repair-cut-cells.py (without its feather).
 3. Per cell: drops slivers of neighbouring cells (small pieces carrying a cut, or pieces the
    pose was standing on), grafts lost lower legs and feet from the fighter's own complete poses
    (matched on the leg band at the cut), rounds every remaining cut edge off with a short
    mirrored cap so a fist, foot or effect ends instead of stopping at a straight line, fits the
    pose inside the cell with margin (scaling down from the feet only when it has to), and puts
    the lowest visible pixel on the ground line.
 4. Rebuilds the low kick of fighters that lost that row (the fixed sidekick dropped into a crouch)
    and the ready sheet from the manifest's timeline.

The other 27 fighters were never cut by an export; they are only re-grounded (see
reground_fighter). A short hand-checked table (ERASE / COPY / NO_GRAFT / NO_CAP) covers the
few cells no rule can decide; they were found on the contact sheets from audit-sprites.py.

  python3 scripts/fix-sprite-bounds.py              # all 49 fighters, writes public/assets/characters
  python3 scripts/fix-sprite-bounds.py pharaoh      # one fighter
  python3 scripts/fix-sprite-bounds.py --out DIR    # write somewhere else
Pillow, NumPy and SciPy are needed only to rebuild the art.
"""
import argparse
import importlib.util
import io
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage, signal

ROOT = Path(__file__).resolve().parent.parent
CHARS = ROOT / "public/assets/characters"
C, COLS = 320, 4
FLOOR = 295            # lowest visible row of every pose (feet on y=296 in the engine's anchor)
VIS, SOLID = 8, 200
CAP_PAD = 30           # room cap_cuts() leaves beside and above a pose
FAINT = 64             # a cut's last column can be a faint seam; it is still the outside
MARGIN = 6             # clear pixels kept between a pose and its cell border
DUMP = None

FOURTEEN = "pharaoh roman viking medieval renaissance colonial victorian jazz raven blood merman operative coast jungle".split()
EIGHT = "patchrunner starscribe sovereign circuitbreaker ironchef eventhorizon crimsonoracle dunevoyager".split()
EXPORT_COMMIT = {**{f: "bf6bd21" for f in FOURTEEN}, **{f: "82d5ca9" for f in EIGHT}}

spec = importlib.util.spec_from_file_location("repair", ROOT / "scripts/repair-cut-cells.py")
repair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)


# ---------------------------------------------------------------- export + cut marks

def export_atlas(fid, kind):
    data = subprocess.run(["git", "show", f"{EXPORT_COMMIT[fid]}:public/assets/characters/{fid}-{kind}.png"],
                          cwd=ROOT, capture_output=True, check=True).stdout
    return np.array(Image.open(io.BytesIO(data)).convert("RGBA"))


def runs(v, minrun):
    out = np.zeros_like(v)
    lab, n = ndimage.label(v)
    for i in range(1, n + 1):
        m = lab == i
        if m.sum() >= minrun:
            out |= m
    return out


def mark_cuts(img):
    img = img.copy()
    img[:, :, 1:3] &= 0xFE
    for r in range(img.shape[0] // C):
        for c in range(COLS):
            cell = img[r * C:(r + 1) * C, c * C:(c + 1) * C]
            a = cell[:, :, 3]
            vis, solid = a > VIS, a >= SOLID
            if not vis.any():
                continue
            ys, xs = np.where(vis)
            flag = np.zeros(a.shape, bool)
            # Each piece is checked on its own: two poses in one cell had two crop boxes.
            for m in components(cell) + [vis]:
                pys, pxs = np.where(m)
                pm = solid & m
                for x in (pxs.min(), pxs.max()):
                    if runs(pm[:, x], 12).any():
                        flag[:, x] |= runs(pm[:, x], 3)
                t = pys.min()
                if runs(pm[t], 12).any():
                    flag[t] |= runs(pm[t], 3)
            # A crop line inside the silhouette (a notch where two crop boxes met): a column or row
            # whose silhouette edge runs dead straight for 26px or more in total.
            for side in straight_walls(a):
                flag |= side
            cell[:, :, 2][flag] |= 1
            # The export grounded every cell, so its floor row is either real feet or a cut
            # through the legs; which one is decided later against the fighter's own poses.
            b = ys.max()
            cell[b, :, 1][vis[b]] |= 1
    return img


def straight_walls(a, minrun=6, total=26):
    """Silhouette edge pixels (solid, clear beside or above) on columns/rows where the edge runs
    straight for `total` pixels or more, in runs of at least `minrun`. Drawn outlines stay under ~24."""
    solid = np.pad(a >= SOLID, 1)
    clear = np.pad(a < FAINT, 1, constant_values=True)
    edges = [solid[1:-1, 1:-1] & clear[1:-1, 2:], solid[1:-1, 1:-1] & clear[1:-1, :-2], solid[1:-1, 1:-1] & clear[:-2, 1:-1]]
    out = []
    for k, e in enumerate(edges):
        m = e if k < 2 else e.T
        keep = np.zeros_like(m)
        for x in np.where(m.sum(0) >= total)[0]:
            r = runs(m[:, x], minrun)
            if r.sum() >= total:
                keep[:, x] = r
        out.append(keep if k < 2 else keep.T)
    return out


def render_marked(group, cells):
    """repair.render, keeping the cut marks when a pose too tall for its cell is scaled down."""
    canvas = np.zeros((C * 4, C * 3, 4), np.uint8)
    ox, oy = C, C
    for p, dx, dy in group:
        cell = cells[p["r"]][p["c"]]
        ys, xs = np.where(p["mask"])
        cy, cx = ys + dy + oy, xs + dx + ox
        ok = (cy >= 0) & (cy < canvas.shape[0]) & (cx >= 0) & (cx < canvas.shape[1])
        canvas[cy[ok], cx[ok]] = cell[ys[ok], xs[ok]]
    canvas = repair.drop_dust(canvas)
    a = canvas[:, :, 3] > repair.ALPHA
    ys, xs = np.where(a)
    top, bottom_, left, right = ys.min(), ys.max(), xs.min(), xs.max()
    crop = canvas[top:bottom_ + 1, left:right + 1]
    h, w = crop.shape[:2]
    s = min(1.0, (repair.G + 1 - repair.TOP_ROOM) / h, (C - 8) / w)
    im = Image.fromarray(crop)
    if s < 1:
        size = (max(1, round(w * s)), max(1, round(h * s)))
        marks = [Image.fromarray(((crop[:, :, ch] & 1) * 255).astype(np.uint8)).resize(size, Image.NEAREST) for ch in (1, 2)]
        im = np.array(im.resize(size, Image.LANCZOS))
        im[:, :, 1:3] &= 0xFE
        for ch, m in zip((1, 2), marks):
            im[:, :, ch] |= (np.array(m) > 127).astype(np.uint8)
        im = Image.fromarray(im)
    x0 = round(ox + (left - ox) * s) - ox if s < 1 else left - ox
    x0 = int(min(max(x0, 4), C - 4 - im.width))
    frame = np.zeros((C, C, 4), np.uint8)
    frame[repair.G + 1 - im.height:repair.G + 1, x0:x0 + im.width] = np.array(im)
    return frame


def stitch(img, rows):
    saved = repair.feather, repair.render
    repair.feather = lambda f, **k: f
    repair.render = render_marked
    try:
        out, counts, order = repair.repair(img, rows, rows)
    finally:
        repair.feather, repair.render = saved
    return out, order


# ---------------------------------------------------------------- cell helpers

def cells(img, rows):
    return [[img[r * C:(r + 1) * C, c * C:(c + 1) * C].copy() for c in range(COLS)] for r in range(rows)]


def components(cell, grow=2):
    vis = cell[:, :, 3] > VIS
    lab, n = ndimage.label(ndimage.binary_dilation(vis, iterations=grow), structure=np.ones((3, 3)))
    comps = []
    for i in range(1, n + 1):
        m = (lab == i) & vis
        if m.any():
            comps.append(m)
    comps.sort(key=lambda m: -m.sum())
    return comps


def cut_pixels(cell):
    """Marked cut pixels that are still on the silhouette, with the direction that is clear."""
    a = cell[:, :, 3]
    flag = ((cell[:, :, 2] & 1) == 1) & (a >= SOLID)
    clear = np.pad(a < FAINT, 1, constant_values=True)
    return {
        "left": flag & clear[1:-1, :-2],
        "right": flag & clear[1:-1, 2:],
        "up": flag & clear[:-2, 1:-1],
    }


def bottom(cell):
    ys = np.where((cell[:, :, 3] > VIS).any(1))[0]
    return int(ys.max()) if len(ys) else -1


def ground(cell):
    b = bottom(cell)
    if b < 0:
        return cell
    return shift(cell, 0, FLOOR - b)


def shift(cell, dx, dy):
    out = np.zeros_like(cell)
    h, w = cell.shape[:2]
    ys, xs = slice(max(0, dy), min(h, h + dy)), slice(max(0, dx), min(w, w + dx))
    yd, xd = slice(max(0, -dy), min(h, h - dy)), slice(max(0, -dx), min(w, w - dx))
    out[ys, xs] = cell[yd, xd]
    return out


# ---------------------------------------------------------------- slivers

def drop_slivers(cell, notes):
    comps = components(cell)
    if len(comps) < 2:
        return cell
    main = comps[0]
    cuts = cut_pixels(cell)
    anycut = cuts["left"] | cuts["right"] | cuts["up"]
    floor = ((cell[:, :, 1] & 1) == 1) & (cell[:, :, 3] >= SOLID)
    b_main = np.where(main.any(1))[0].max()
    b_all = bottom(cell)
    out = cell.copy()
    for m in comps[1:]:
        area = m.sum()
        mb = np.where(m.any(1))[0].max()
        cut = (anycut & m).sum() >= 3
        # A detached piece carrying a crop cut is a sliver of a neighbouring pose; one the pose
        # stands on (it reaches the floor while the pose does not) is left over from the row below.
        prop = mb >= b_all - 2 and b_main < b_all - 5 and area < 0.6 * main.sum()
        # a small piece cut off by the export's floor line is the top of the pose below
        floor_cut = (floor & m).sum() >= 5 and area < 0.3 * main.sum()
        if area < 40 or (cut and area < 0.3 * main.sum()) or prop or floor_cut:
            out[m] = 0
            notes.append(f"sliver {area}px")
    return split_neighbours(out, notes)


def split_neighbours(cell, notes, depth=3):
    """Remove a neighbouring pose's limb that only touches this pose through a thin overlap.

    Thin bridges vanish when the silhouette is eroded; each part left over claims the pixels
    nearest to it. A small part that carries crop cuts and stands on the floor is the neighbour."""
    vis = cell[:, :, 3] > VIS
    core = ndimage.binary_erosion(vis, iterations=depth)
    lab, n = ndimage.label(core, structure=np.ones((3, 3)))
    if n < 2:
        return cell
    sizes = ndimage.sum(core, lab, range(1, n + 1))
    main = int(np.argmax(sizes)) + 1
    _, (iy, ix) = ndimage.distance_transform_edt(lab == 0, return_indices=True)
    owner = lab[iy, ix] * vis
    cuts = cut_pixels(cell)
    anycut = cuts["left"] | cuts["right"] | cuts["up"]
    total = (owner == main).sum()
    out = cell.copy()
    for i in range(1, n + 1):
        if i == main:
            continue
        region = owner == i
        area = region.sum()
        # it stands on the floor beside the pose; a cut effect (a sun, a slash) floats
        floor = np.where(region.any(1))[0].max() >= bottom(cell) - 3
        # the glowing top of the next row's effect, cut off by the export's floor line
        glow = cell[region][:, :3].astype(int).mean() > 150
        floor_cut = (((cell[:, :, 1] & 1) == 1) & region).sum() >= 3 and glow and area < 0.1 * total
        if ((anycut & region).sum() >= 5 and area < 0.3 * total and floor) or floor_cut:
            out[region] = 0
            notes.append(f"neighbour limb {area}px")
    return out


# ---------------------------------------------------------------- leg grafts

BAND = 12


def leg_ends(cell):
    """Silhouette bottoms that were the export's floor row: (row, x0, x1, on_floor).

    Each is either a real foot or a leg the export cut through. One that ended up above the
    pose's floor after stitching is always a cut (a real foot would still be on the floor)."""
    a = cell[:, :, 3]
    flag = ((cell[:, :, 1] & 1) == 1) & (a >= SOLID)
    clear_below = np.pad(a <= VIS, ((0, 1), (0, 0)), constant_values=True)[1:]
    ends = flag & clear_below
    b = bottom(cell)
    out = []
    for y in np.where(ends.any(1))[0]:
        lab, n = ndimage.label(ndimage.binary_closing(ends[y], iterations=1) | ends[y])
        for i in range(1, n + 1):
            xs = np.where(lab == i)[0]
            if xs[-1] - xs[0] >= 5:
                out.append((int(y), int(xs[0]), int(xs[-1]), y >= b - 2))
    return out


def match(template, donors):
    """Candidates (score, donor, y, x) placing template (h×w RGBA) over each donor, by masked SSD."""
    h, w = template.shape[:2]
    t = template.astype(np.float32) / 255
    wmask = (t[:, :, 3] > 0.5).astype(np.float32)
    best = []
    for di, d in enumerate(donors):
        D = d.astype(np.float32) / 255
        score = np.zeros((D.shape[0] - h + 1, D.shape[1] - w + 1), np.float32)
        for ch in range(4):
            wt = wmask if ch < 3 else np.ones_like(wmask)
            dc = D[:, :, ch] * (D[:, :, 3] if ch < 3 else 1)
            tc = t[:, :, ch] * (t[:, :, 3] if ch < 3 else 1)
            s = (signal.correlate(dc * dc, wt, mode="valid", method="fft")
                 - 2 * signal.correlate(dc, wt * tc, mode="valid", method="fft")
                 + (wt * tc * tc).sum())
            score += s * (3.0 if ch == 3 else 1.0)
        score /= wmask.sum() + 1
        for k in np.argsort(score, axis=None)[:60]:
            y, x = np.unravel_index(k, score.shape)
            best.append((float(score[y, x]), di, int(y), int(x)))
    best.sort()
    return best


def continuation(donor, y0, x0, x1):
    """Donor pixels below row y0 connected to the leg that spans columns x0..x1 on that row."""
    vis = donor[:, :, 3] > VIS
    below = vis.copy()
    below[:y0 + 1] = False
    lab, n = ndimage.label(below, structure=np.ones((3, 3)))
    seeds = set(lab[min(C - 1, y0 + 1), max(0, x0):x1 + 1].tolist()) - {0}
    if not seeds:
        return None
    m = np.isin(lab, list(seeds))
    # stay with this leg: no further than a foot's length beside the matched band
    m[:, :max(0, x0 - 30)] = False
    m[:, x1 + 31:] = False
    # a leg ends in a foot on the donor's floor; anything else matched an effect or a sleeve
    if not m.any() or np.where(m.any(1))[0].max() < bottom(donor) - 3:
        return None
    return m


def leg_candidates(cell, end, donors):
    y, x0, x1, _ = end
    lo, hi = max(0, x0 - 3), min(C, x1 + 4)
    tmpl = cell[max(0, y - BAND + 1):y + 1, lo:hi]
    out = []
    for score, di, ty, tx in match(tmpl, donors):
        yb = ty + tmpl.shape[0] - 1        # donor row matching the leg's last row
        dx = tx - lo                       # donor column = pose column + dx
        cont = continuation(donors[di], yb, x0 + dx, x1 + dx)
        length = 0 if cont is None else int(np.where(cont.any(1))[0].max() - yb)
        out.append((score, di, yb, dx, length, cont))
    return out


def graft_legs(cell, donors, notes, only=None):
    """Give legs the export cut through the rest of their length from the fighter's own poses.

    A leg end above the pose's floor is always a cut. One on the floor is grafted only when its
    last rows match the middle of a donor leg clearly better than any donor's foot."""
    ends = leg_ends(cell)
    fits = []
    for end in ends:
        cands = leg_candidates(cell, end, donors)
        # a lost shin and foot is at most ~40px; a leg above the floor may have lost more
        grow = [c for c in cands if 8 <= c[4] <= (40 if end[3] else 70)]
        stop = [c for c in cands if c[4] <= 3]
        st = stop[0][0] if stop else 9.0
        cut = bool(grow) and (not end[3] or (grow[0][0] <= 0.12 and grow[0][0] < 0.6 * st))
        if only is not None:
            cut = only(end)
        fits.append((end, grow, cut))
    # Ends on one row were cut by the same crop line: when one of them is a cut, all of them are.
    cut_rows = {end[0] for end, grow, cut in fits if cut}
    plans = [(end, grow) for end, grow, cut in fits if end[0] in cut_rows and grow and grow[0][0] <= 0.4]
    if not plans:
        return cell, False
    # Legs cut on one row stand on one floor. A body has two legs: the two ends that fit best
    # are grafted as a pair whose lengths agree; a third end (a hem, a hand on the floor) is not.
    chosen = {}
    rows = {}
    for end, grow in plans:
        rows.setdefault(end[0], []).append((end, grow))
    for y, group in rows.items():
        group = sorted(group, key=lambda g: g[1][0][0])[:2]
        if len(group) == 1:
            chosen[group[0][0]] = group[0][1][0]
            continue
        (e1, g1), (e2, g2) = group
        pairs = [(a[0] + b[0] + 0.004 * abs(a[4] - b[4]), a, b) for a in g1[:20] for b in g2[:20]
                 if a[0] <= 0.25 and b[0] <= 0.25 and abs(a[4] - b[4]) <= 8]
        if pairs:
            _, a, b = min(pairs, key=lambda t: t[0])
            chosen[e1], chosen[e2] = a, b
        else:
            chosen[e1] = g1[0]
    out = cell.copy()
    for (y, x0, x1, _), (score, di, yb, dx, length, cont) in chosen.items():
        ys, xs = np.where(cont)
        ty, tx = ys - yb + y, xs - dx
        ok = (ty >= 0) & (ty < C) & (tx >= 0) & (tx < C)
        ty, tx, ys, xs = ty[ok], tx[ok], ys[ok], xs[ok]
        free = out[ty, tx, 3] <= VIS
        out[ty[free], tx[free]] = donors[di][ys[free], xs[free]]
        notes.append(f"leg {x0}-{x1}@{y} +{length}px (fit {score:.3f})")
    out[:, :, 1] &= 0xFE
    return out, True


# ---------------------------------------------------------------- rounding cuts

def cap_cuts(cell, notes):
    """Round every remaining cut edge off with a short mirrored cap instead of a straight wall.

    Works on a canvas padded on the sides and top, so a pose cut at its cell border gets its cap
    too; fit() brings the result back into the cell."""
    P = CAP_PAD
    cell = np.pad(cell, ((P, 0), (P, P), (0, 0)))
    H, W = cell.shape[:2]
    cuts = cut_pixels(cell)
    # straight walls left where two stitched pieces had different crop boxes
    walls = straight_walls(cell[:, :, 3], total=28)
    for side, w in zip(("right", "left", "up"), walls):
        cuts[side] = cuts[side] | w
    out = cell.copy()
    for side, m in cuts.items():
        if not m.any():
            continue
        if side == "up":
            lines = [(y, np.where(m[y])[0]) for y in np.where(m.any(1))[0]]
        else:
            lines = [(x, np.where(m[:, x])[0]) for x in np.where(m.any(0))[0]]
        for pos, idx in lines:
            for seg in np.split(idx, np.where(np.diff(idx) > 2)[0] + 1):
                if len(seg) < 3:
                    continue
                s0, s1 = seg[0], seg[-1]
                L = s1 - s0 + 1
                E = int(np.clip(round(0.5 * L), 2, 24))
                if side == "up":
                    px = cell[pos, s0:s1 + 1, :3].astype(float)
                else:
                    px = cell[s0:s1 + 1, pos, :3].astype(float)
                glow = px.mean() > 165
                for i in range(s0, s1 + 1):
                    t = (i - s0 + 0.5) / L * 2 - 1
                    e = int(round(E * max(0.0, 1 - t * t)))  # pointed, so the tip is not a new flat wall
                    for k in range(1, e + 1):
                        if side == "up":
                            ty, tx, sy, sx = pos - k, i, min(H - 1, pos + k - 1), i
                        else:
                            d = -1 if side == "left" else 1
                            ty, tx, sy, sx = i, pos + d * k, i, int(np.clip(pos - d * (k - 1), 0, W - 1))
                        if not (0 <= ty < H and 0 <= tx < W) or out[ty, tx, 3] >= FAINT:
                            continue
                        src = cell[sy, sx].astype(float)
                        if src[3] <= VIS:
                            src = cell[i, pos].astype(float) if side != "up" else cell[pos, i].astype(float)
                        f = k / (e + 0.5)
                        if glow:
                            src[3] *= 1 - 0.85 * f
                        elif k == e:
                            src[:3] *= 0.62   # a dark outline pixel at the tip, like the drawn silhouette
                        out[ty, tx] = np.clip(src, 0, 255).astype(np.uint8)
                notes.append(f"cap {side} {L}px")
    out[:, :, 1:3] &= 0xFE
    return out


# ---------------------------------------------------------------- fit + ground

def fit(cell, notes, ox=0):
    a = cell[:, :, 3] > VIS
    if not a.any():
        return cell
    ys, xs = np.where(a)
    top, bot, left, right = ys.min(), ys.max(), xs.min(), xs.max()
    h, w = bot - top + 1, right - left + 1
    s = min(1.0, (FLOOR + 1 - MARGIN) / h, (C - 2 * MARGIN) / w)
    crop = Image.fromarray(cell[top:bot + 1, left:right + 1])
    if s < 1:
        crop = crop.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
        notes.append(f"scaled {s:.2f}")
    # keep the pose where it stood, pulled in only as far as the margin needs
    cx = left + (right - left) / 2 - ox
    nx = int(round(cx - crop.width / 2))
    nx = int(np.clip(nx, MARGIN, C - MARGIN - crop.width))
    out = Image.new("RGBA", (C, C))
    out.alpha_composite(crop, (nx, FLOOR + 1 - crop.height))
    return np.array(out)


# ---------------------------------------------------------------- scale

def body_area(cell):
    """Opaque body pixels, leaving out bright effect glow: grows with the square of the drawing scale."""
    a = cell[:, :, 3] >= 250
    lum = cell[:, :, :3].astype(int).mean(2)
    return int((a & (lum < 185)).sum())


def rescale(cell, k, notes):
    """Redraw a pose at 1/k of its size, feet fixed on the floor, centre column kept."""
    a = cell[:, :, 3] > VIS
    ys, xs = np.where(a)
    top, bot, left, right = ys.min(), ys.max(), xs.min(), xs.max()
    crop = Image.fromarray(cell[top:bot + 1, left:right + 1])
    w, h = crop.size
    crop = crop.resize((max(1, round(w / k)), max(1, round(h / k))), Image.LANCZOS if k > 1 else Image.NEAREST)
    cx = (left + right) / 2
    out = Image.new("RGBA", (C, C))
    x = int(np.clip(round(cx - crop.width / 2), 0, C - crop.width))
    out.alpha_composite(crop, (x, bot + 1 - crop.height))
    notes.append(f"rescaled 1/{k:.2f}")
    return np.array(out)


def row_scale(grid, r, ref):
    """How much larger than the ready pose a row of poses was drawn, or 1 when it matches."""
    ks = [np.sqrt(body_area(c) / ref) for c in grid[r] if body_area(c)]
    if len(ks) < 4:
        return 1.0
    med = float(np.median(ks))
    agree = sum(abs(k - med) < 0.1 for k in ks)
    if agree >= 3 and (med > 1.15 or med < 0.87):
        return med
    return 1.0


# ---------------------------------------------------------------- hand-checked leftovers

# Pieces of a neighbouring pose that touch this one, so no rule can tell them apart. Found on the
# contact sheets and erased by polygon, in the stitched cell's coordinates (before grounding).
ERASE = {
    ("colonial", "combat", 6, 1): [[(205, 178), (262, 178), (262, 300), (197, 300), (197, 282), (188, 262), (204, 250)]],
    ("colonial", "combat", 1, 2): [[(155, 279), (196, 279), (196, 300), (155, 300)]],
    ("circuitbreaker", "combat", 1, 2): [[(132, 238), (172, 238), (172, 266), (216, 266), (216, 300), (132, 300)]],
    ("circuitbreaker", "combat", 6, 1): [[(212, 222), (262, 222), (262, 274), (212, 274)]],
    ("operative", "combat", 6, 1): [[(205, 180), (262, 180), (262, 300), (200, 300), (200, 250), (205, 250)]],
    ("viking", "combat", 6, 0): [[(254, 140), (270, 140), (270, 300), (254, 300)]],
    ("viking", "combat", 6, 1): [[(236, 222), (266, 222), (266, 300), (210, 300), (210, 262)]],
    ("roman", "combat", 6, 0): [[(70, 96), (212, 96), (212, 128), (200, 131), (185, 131), (165, 132), (152, 135), (144, 141),
                                 (134, 150), (120, 164), (112, 184), (106, 206), (70, 206)]],
    ("ironchef", "combat", 6, 1): [[(213, 128), (270, 128), (270, 300), (213, 300)], [(245, 92), (270, 92), (270, 128), (245, 128)]],
    ("ironchef", "combat", 1, 2): [[(118, 262), (218, 262), (218, 300), (118, 300)]],
    ("ironchef", "combat", 5, 3): [[(80, 234), (128, 234), (128, 300), (80, 300)]],
    ("victorian", "combat", 1, 2): [[(150, 254), (182, 254), (182, 268), (199, 268), (199, 300), (150, 300)]],
    ("victorian", "combat", 5, 2): [[(0, 263), (320, 263), (320, 300), (0, 300)], [(0, 250), (140, 250), (140, 263), (0, 263)],
                                    [(180, 250), (320, 250), (320, 263), (180, 263)]],
    ("starscribe", "combat", 1, 2): [[(128, 277), (200, 277), (200, 300), (128, 300)]],
    ("starscribe", "combat", 4, 2): [[(200, 283), (300, 283), (300, 300), (200, 300)]],
    ("eventhorizon", "combat", 6, 1): [[(243, 158), (270, 158), (270, 300), (198, 300), (198, 250), (243, 250)]],
    ("eventhorizon", "combat", 1, 2): [[(178, 287), (232, 287), (232, 300), (178, 300)]],
    ("dunevoyager", "combat", 5, 2): [[(0, 255), (320, 255), (320, 300), (0, 300)]],
    ("crimsonoracle", "combat", 1, 2): [[(143, 280), (191, 280), (191, 300), (143, 300)]],
}
# Poses the export lost below the hips, with no other drawing of them: the nearest whole pose of
# the same move stands in. Roman's landing crouch takes his take-off crouch.
# Cells where the export's floor line crossed an effect, not a leg: never graft legs there.
NO_GRAFT = {("blood", "combat", 6, 2)}
# Cells whose only straight edge is where an erase met real hair: nothing to round off there.
NO_CAP = {("roman", "combat", 6, 0)}
COPY = {
    ("roman", "motion", 1, 3): (1, 0),
}


def erase(cell, polys):
    from PIL import ImageDraw
    mask = Image.new("L", (C, C), 0)
    for poly in polys:
        ImageDraw.Draw(mask).polygon(poly, fill=255)
    out = cell.copy()
    out[np.array(mask) > 0] = 0
    return out


# ---------------------------------------------------------------- per fighter

def fix_fighter(fid, out_dir, report):
    manifest = repair.manifest_for(fid)
    fixed = {}
    for kind, rows in (("combat", 7), ("motion", 6)):
        exp = mark_cuts(export_atlas(fid, kind))
        stitched, order = stitch(exp, rows)
        if DUMP:
            Image.fromarray(stitched).save(DUMP / f"{fid}-{kind}.png")
        fixed[kind] = (cells(stitched, rows), order)
    # donors: the fighter's own complete standing poses (ready stance, jab, walk)
    donor_cells = [c for c in fixed["combat"][0][0]] + [c for c in fixed["motion"][0][0]]
    donors = [ground(drop_slivers(c, [])) for c in donor_cells]
    for d in donors:
        d[:, :, 1:3] &= 0xFE
    for kind, rows in (("combat", 7), ("motion", 6)):
        grid, order = fixed[kind]
        lost_kick = kind == "combat" and all(o[3] == o[4] for o in order)
        for r in range(rows):
            for c in range(COLS):
                if lost_kick and r == 3:
                    continue  # rebuilt from the fixed sidekick below
                notes = []
                cell = grid[r][c]
                if (fid, kind, r, c) in ERASE:
                    cell = erase(cell, ERASE[(fid, kind, r, c)])
                    notes.append("erased a neighbour's piece")
                cell = ground(drop_slivers(cell, notes))
                lying = kind == "motion" and r == 4 and c >= 1
                if not lying and (fid, kind, r, c) not in NO_GRAFT:
                    own = [d for d in donors if not np.array_equal(d[:, :, 3], cell[:, :, 3])]
                    cell, grafted = graft_legs(cell, own, notes)
                    if grafted:
                        cell = ground(cell)
                if (fid, kind, r, c) not in NO_CAP:
                    cell = cap_cuts(cell, notes)
                    cell = ground(fit(cell, notes, ox=CAP_PAD))
                else:
                    cell = ground(fit(cell, notes))
                grid[r][c] = cell
                if notes:
                    report.append(f"{fid} {kind}[{r}][{c}]: " + "; ".join(notes))
        for (f, k, r, c), (sr, sc) in COPY.items():
            if f == fid and k == kind:
                grid[r][c] = grid[sr][sc].copy()
                report.append(f"{fid} {kind}[{r}][{c}]: lost below the hips; uses [{sr}][{sc}]")
        if kind == "combat":
            # Some export rows were drawn larger than the rest (the eight pack's low kicks, at
            # about 1.3x): bring the whole row back to the ready pose's scale.
            ref = body_area(grid[0][0])
            for r in range(1, 6):
                if lost_kick and r == 3:
                    continue
                k = row_scale(grid, r, ref)
                if k != 1.0:
                    for c in range(COLS):
                        notes = []
                        grid[r][c] = ground(rescale(grid[r][c], k, notes))
                        report.append(f"{fid} {kind}[{r}][{c}]: " + "; ".join(notes))
        if lost_kick:
            for c in range(COLS):
                grid[3][c] = ground(repair.crouch(grid[4][c]))
        img = np.zeros((rows * C, COLS * C, 4), np.uint8)
        for r in range(rows):
            for c in range(COLS):
                img[r * C:(r + 1) * C, c * C:(c + 1) * C] = grid[r][c]
        img[:, :, 1:3] &= 0xFE
        img = clear_faint(img)
        Image.fromarray(img).save(out_dir / f"{fid}-{kind}.png", optimize=True)
        if kind == "combat":
            timeline = {"readyTimelineCombatIndices": manifest.get("readyTimelineCombatIndices") or READY_TIMELINE}
            Image.fromarray(repair.rebuild_sheet(img, timeline)).save(out_dir / f"{fid}-sheet.png", optimize=True)


# Every exported ready sheet is this POWER timeline over the combat atlas (ready, POWER 1-4, ready).
READY_TIMELINE = [0, 0, 24, 24, 25, 25, 26, 26, 26, 26, 27, 27, 27, 0, 0, 0]


def clear_faint(img):
    """Pixels at alpha 8 or less cannot be seen, but they decided where a pose's floor was: some
    poses stood on a haze of them and floated up to 50px over the ground line."""
    img = img.copy()
    img[img[:, :, 3] <= VIS] = 0
    return img


def reground_fighter(fid, out_dir, report):
    """Atlases that were never cut by an export only need their floor fixed: drop the invisible
    haze, keep a clear margin inside the cell, and put the lowest visible pixel on the ground line."""
    for kind in ("sheet", "combat", "motion"):
        path = CHARS / f"{fid}-{kind}.png"
        img = clear_faint(np.array(Image.open(path).convert("RGBA")))
        rows, cols = img.shape[0] // C, img.shape[1] // C
        changed = 0
        for r in range(rows):
            for c in range(cols):
                cell = img[r * C:(r + 1) * C, c * C:(c + 1) * C]
                if not (cell[:, :, 3] > 0).any():
                    continue
                notes = []
                new = ground(fit(cell, notes))
                if not np.array_equal(new, cell):
                    changed += 1
                    if notes:
                        report.append(f"{fid} {kind}[{r}][{c}]: " + "; ".join(notes))
                img[r * C:(r + 1) * C, c * C:(c + 1) * C] = new
        Image.fromarray(img).save(out_dir / f"{fid}-{kind}.png", optimize=True)
        report.append(f"{fid} {kind}: {changed} cells re-grounded")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--out", default=str(CHARS))
    ap.add_argument("--dump", help="also save the stitched, cut-marked atlases here (debugging)")
    args = ap.parse_args()
    global DUMP
    DUMP = Path(args.dump) if args.dump else None
    if DUMP:
        DUMP.mkdir(parents=True, exist_ok=True)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    report = []
    roster = re.findall(r'id: "(\w+)"', (ROOT / "src/characters.js").read_text())
    for fid in args.ids or roster:
        if fid in EXPORT_COMMIT:
            fix_fighter(fid, out, report)
        else:
            reground_fighter(fid, out, report)
        print(fid, "done", flush=True)
    print("\n".join(report))


if __name__ == "__main__":
    main()
