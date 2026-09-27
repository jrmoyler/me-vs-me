#!/usr/bin/env python3
"""Repair atlas cells that were sliced off-grid in the supplied fighter exports.

Some exports were cut from their source grid on the wrong row boundaries, so a pose can
be split across two cells (a POWER's upper body in the roundhouse row, its legs in the
POWER row), and neighbouring poses leave slivers at the cell edges.

The script works only from the shipped atlases. In each column it finds pieces whose hard
cut edges continue each other (matching opaque profile and colour along the seam), stitches
them back into whole poses, drops the leftover slivers, and repacks the poses in their source
order onto the shared 320px grid with the lowest opaque pixel on y=296. When a column yields
fewer poses than rows (the export lost one), the nearest kick is reused so no row is left
holding a fragment. The ready sheet is rebuilt from the manifest's ready timeline.

  pip install pillow numpy scipy
  python3 scripts/repair-cut-cells.py pharaoh roman ...       # writes public/assets/characters
  python3 scripts/repair-cut-cells.py --report pharaoh        # prints what it would change
  python3 scripts/repair-cut-cells.py --light eventhorizon    # slivers and hard cuts only
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
CHARS = ROOT / "public/assets/characters"
MANIFESTS = [ROOT / "asset-sources/fourteen-fighters", ROOT / "asset-sources/eight-fighters", ROOT / "asset-sources/seven-fighters"]
C, G, COLS = 320, 296, 4
TOP_ROOM = 8  # the tallest repaired pose keeps this much clear space under the cell top
ALPHA = 8


def cells_of(img, rows):
    return [[img[r * C:(r + 1) * C, c * C:(c + 1) * C].copy() for c in range(COLS)] for r in range(rows)]


def pieces_of(cell, r, c):
    mask = cell[:, :, 3] > ALPHA
    if not mask.any():
        return []
    # Poses stacked by a drifting export sit in separate horizontal bands; label within each band.
    dil = ndimage.binary_dilation(mask, iterations=4)
    empty = ~mask.any(1)
    gaps = ndimage.binary_erosion(empty, iterations=1, border_value=1)
    dil[gaps, :] = False
    labels, n = ndimage.label(dil, structure=np.ones((3, 3)))
    out = []
    for i in range(1, n + 1):
        m = mask & (labels == i)
        area = int(m.sum())
        if area == 0:
            continue
        ys, xs = np.where(m)
        out.append(dict(r=r, c=c, mask=m, area=area, top=int(ys.min()), bottom=int(ys.max()), left=int(xs.min()), right=int(xs.max())))
    # Loose dust joins the biggest piece in its cell rather than becoming a pose of its own.
    out.sort(key=lambda p: -p["area"])
    big = out[0]
    keep = [big]
    for p in out[1:]:
        if p["area"] >= 60:
            keep.append(p)
        elif p["left"] > big["left"] - 24 and p["right"] < big["right"] + 24 and p["top"] > big["top"] - 24:
            big["mask"] = big["mask"] | p["mask"]
            big["area"] += p["area"]
        # Dust far from every pose is a sliver of a neighbouring cell; it is dropped.
    return keep


def seam_score(cell_a, a_mask, a_line, cell_b, b_mask, b_line, axis):
    """Compare the last opaque line of piece A with the first of piece B. axis 0 = rows."""
    if axis == 0:
        ma, mb = a_mask[a_line, :], b_mask[b_line, :]
        pa, pb = cell_a[a_line, :, :3], cell_b[b_line, :, :3]
    else:
        ma, mb = a_mask[:, a_line], b_mask[:, b_line]
        pa, pb = cell_a[:, a_line, :3], cell_b[:, b_line, :3]
    inter = ma & mb
    union = ma | mb
    if inter.sum() < 6:
        return 0.0, 999.0
    iou = inter.sum() / union.sum()
    diff = np.abs(pa[inter].astype(int) - pb[inter].astype(int)).mean()
    return float(iou), float(diff)


def cut_len(p, side, cell=None):
    """Opaque pixels on one bbox side. With the cell, 0 unless the edge is a hard cut:
    a natural edge is antialiased, a cut edge is as solid as the interior."""
    m = p["mask"]
    line = {"top": np.s_[p["top"], :], "bottom": np.s_[p["bottom"], :], "left": np.s_[:, p["left"]], "right": np.s_[:, p["right"]]}[side]
    n = int(m[line].sum())
    if cell is not None and n:
        alpha = cell[:, :, 3][line][m[line]]
        if (alpha >= 250).mean() < 0.4:
            return 0
    return n


def repair(img, rows, want, report=None):
    cells = cells_of(img, rows)
    pieces = [[pieces_of(cells[r][c], r, c) for c in range(COLS)] for r in range(rows)]
    flat = [p for row in pieces for col in row for p in col]
    for i, p in enumerate(flat):
        p["id"] = i
        p["parent"] = None  # (piece id, dx, dy) relative to the parent piece
    # Vertical seams: a piece grounded on the cell floor continues into a top-cut piece below it.
    # A seam counts when its profiles agree closely, or loosely when another column of the same
    # row pair has a close seam (the export drifted there, so the pose really was split).
    ref = np.median([G - max(pieces[0][c], key=lambda p: p["area"])["top"] for c in range(COLS) if pieces[0][c]])
    for r in range(rows - 1):
        cand = []
        for c in range(COLS):
            for b in pieces[r][c]:
                if b["bottom"] < G - 1 or cut_len(b, "bottom") < 10:
                    continue
                for t in pieces[r + 1][c]:
                    if cut_len(t, "top") < 10:
                        continue
                    iou, diff = seam_score(cells[r][c], b["mask"], b["bottom"], cells[r + 1][c], t["mask"], t["top"], 0)
                    solid = cut_len(b, "bottom", cells[r][c]) >= 10 and cut_len(t, "top", cells[r + 1][c]) >= 10
                    if iou >= 0.45 and diff <= 48:
                        cand.append((iou, diff, c, b, t, solid))
        strong = {c for iou, _, c, _, _, solid in cand if iou >= 0.7 and solid}
        used = set()
        for iou, diff, c, b, t, solid in sorted(cand, key=lambda x: -(x[0] - x[1] / 200)):
            others = strong - {c}
            # Soft (antialiased) cut edges only count where the same row pair split elsewhere.
            if not (solid and (iou >= 0.7 or others)) and not (others and iou >= 0.6):
                continue
            # A soft seam never stacks a whole second body onto a pose.
            if not solid and (b["bottom"] - b["top"]) + (t["bottom"] - t["top"]) > 1.45 * ref and t["bottom"] - t["top"] > 0.8 * ref:
                continue
            if b["id"] in used or t["id"] in used:
                continue
            used |= {b["id"], t["id"]}
            split_off(b, flat, pieces, t, ref)
            split_top(t, flat, pieces)
            t["parent"] = (b["id"], 0, b["bottom"] + 1 - t["top"])
    # Horizontal seams: small slivers at a cell side that continue the neighbouring cell's piece.
    for r in range(rows):
        for c in range(COLS):
            biggest = max((p["area"] for p in pieces[r][c]), default=0)
            for s in pieces[r][c]:
                if s["parent"] or s["area"] > 0.3 * biggest:
                    continue
                for side, nc in (("left", c - 1), ("right", c + 1)):
                    if not (0 <= nc < COLS) or cut_len(s, side, cells[r][c]) < 8:
                        continue
                    for p in pieces[r][nc]:
                        other = "right" if side == "left" else "left"
                        if cut_len(p, other, cells[r][nc]) < 8:
                            continue
                        a, b = (p, s) if side == "left" else (s, p)
                        ca, cb = cells[r][a["c"]], cells[r][b["c"]]
                        iou, diff = seam_score(ca, a["mask"], a["right"], cb, b["mask"], b["left"], 1)
                        if iou >= 0.45 and diff <= 48:
                            dx = p["right"] + 1 - s["left"] if side == "left" else p["left"] - 1 - s["right"]
                            s["parent"] = (p["id"], dx, 0)
                            break
                    if s["parent"]:
                        break

    def root(p):
        dx = dy = 0
        while p["parent"]:
            pid, ox, oy = p["parent"]
            dx, dy = dx + ox, dy + oy
            p = flat[pid]
        return p, dx, dy

    groups = {}
    for p in flat:
        rp, dx, dy = root(p)
        groups.setdefault(rp["id"], []).append((p, dx, dy))

    columns = []
    for c in range(COLS):
        poses = [(flat[k], g) for k, g in groups.items() if flat[k]["c"] == c]
        poses.sort(key=lambda x: (x[0]["r"], x[0]["top"]))
        columns.append([(rp, g, sum(p["area"] for p, _, _ in g)) for rp, g in poses])
    # A fragment the export duplicated or lost the rest of is not a pose. Sizes are judged
    # against the whole fighter, then every column keeps the pose count most columns agree on.
    med = float(np.median([a for col in columns for _, _, a in col]))
    columns = [[x for x in col if x[2] >= 0.35 * med] for col in columns]
    counts = [len(col) for col in columns]
    most = max(set(counts), key=lambda n: (counts.count(n), -n))
    for i, col in enumerate(columns):
        while len(col) > most:
            col.pop(min(range(len(col)), key=lambda i: col[i][2]))
        columns[i] = [(rp, g) for rp, g, _ in col]

    counts = [len(k) for k in columns]
    if report is not None:
        report.append(f"poses per column {counts}")
    grid = [[None] * COLS for _ in range(rows)]
    moved = []
    for c, kept in enumerate(columns):
        frames = [render(g, cells) for _, g in kept]
        order = assign(len(frames), want)
        for r in range(rows):
            grid[r][c] = frames[order[r]]
        moved.append(order)
    # When the export lost a kick row, the low kick is the surviving kick dropped into a crouch,
    # so all seven moves keep their own row.
    if want == 7:
        for c in range(COLS):
            if moved[c][3] == moved[c][4]:
                grid[3][c] = crouch(grid[3][c])
    # When the export lost the hurt row, the hurt row recoils from the knockdown's first
    # (stagger) pose instead of repeating the fall.
    if want == 6 and all(moved[c][3] == moved[c][4] for c in range(COLS)):
        stagger = grid[4][0]
        for c, dx in enumerate((0, -8, -14, -6)):
            grid[3][c] = np.roll(stagger, dx, axis=1)
    # A pose the export lost part of (a hard cut left on its top or through its body at the
    # floor) gives way to the nearest whole frame of the same move.
    swaps = []
    for r in range(rows):
        whole = [c for c in range(COLS) if not truncated(grid[r][c], ref)]
        for c in range(COLS):
            if c in whole or not whole:
                continue
            src = min(whole, key=lambda k: (abs(k - c), -k))
            grid[r][c] = grid[r][src].copy()
            swaps.append(f"{r * COLS + c}<-{r * COLS + src}")
    if report is not None and swaps:
        report.append("whole-frame swaps " + " ".join(swaps))
    out = np.zeros_like(img)
    for r in range(rows):
        for c in range(COLS):
            out[r * C:(r + 1) * C, c * C:(c + 1) * C] = feather(grid[r][c])
    return out, counts, moved


def split_off(b, flat, pieces, t, ref):
    """Keep only the part of a seam piece that reaches the cut; the rest is its own piece.
    A standing pose the export overlapped onto the head of the pose below is split away too;
    effects that wrap around the pose stay with it."""
    def reach(iterations):
        near = ndimage.binary_dilation(b["mask"], iterations=iterations)
        labels, _ = ndimage.label(near, structure=np.ones((3, 3)))
        ids = set(labels[b["bottom"], :][b["mask"][b["bottom"], :]].tolist()) - {0}
        return b["mask"] & np.isin(labels, list(ids))

    seam = reach(2)
    rest = b["mask"] & ~seam
    if rest.sum() < 1500:
        # The export can overlap a whole standing pose onto the head of the POWER pose below.
        # When the part above the narrowest row repeats the pose one row up, or barely touches
        # the part below (a pose resting on the top of the next pose's effect), cut it away.
        lo, hi = b["top"] + int(0.6 * ref), b["bottom"] - 8
        above = [p for p in pieces[b["r"] - 1][b["c"]]] if b["r"] else []
        stacked = (b["bottom"] - b["top"]) + (t["bottom"] - t["top"]) > 1.35 * ref and t["bottom"] - t["top"] >= 0.6 * ref
        if stacked and hi > lo and above:
            y = lo + int(np.argmin(seam.sum(1)[lo:hi]))
            ref_pose = max(above, key=lambda p: p["area"])
            upper = seam[b["top"]:y]
            shifted = ref_pose["mask"][ref_pose["top"]:ref_pose["top"] + upper.shape[0]]
            repeats = shifted.shape == upper.shape and (upper & shifted).sum() / max(1, (upper | shifted).sum()) > 0.7
            nearly_apart = seam[y].sum() <= 12
            if b["bottom"] - y <= 0.4 * ref and (repeats or nearly_apart):
                rest = seam.copy()
                rest[y:] = False
                seam = seam & ~rest
    if rest.sum() < 1500 or not seam.any():
        return
    for m, target in ((seam, b), (rest, dict(r=b["r"], c=b["c"], parent=None, id=len(flat)))):
        ys, xs = np.where(m)
        target.update(mask=m, area=int(m.sum()), top=int(ys.min()), bottom=int(ys.max()), left=int(xs.min()), right=int(xs.max()))
    flat.append(target)
    pieces[b["r"]][b["c"]].append(target)


def crouch(frame, squash=0.84):
    """Lower a standing pose into a crouch: compress it toward the floor line, feet fixed."""
    a = frame[:, :, 3] > ALPHA
    ys = np.where(a.any(1))[0]
    if not len(ys):
        return frame
    top = ys.min()
    im = Image.fromarray(frame[top:G + 1])
    h = max(1, round(im.height * squash))
    im = im.resize((im.width, h), Image.LANCZOS)
    out = Image.new("RGBA", (C, C))
    out.alpha_composite(im, (0, G + 1 - h))
    return np.array(out)


def split_top(t, flat, pieces):
    """The continuation below a seam is only what reaches the cut; a pose it touches stays apart."""
    near = ndimage.binary_dilation(t["mask"], iterations=2)
    labels, _ = ndimage.label(near, structure=np.ones((3, 3)))
    ids = set(labels[t["top"], :][t["mask"][t["top"], :]].tolist()) - {0}
    seam = t["mask"] & np.isin(labels, list(ids))
    counts = seam.sum(1)
    # A foot resting on the next pose: cut where the continuation nearly ends, or where a thin
    # continuation suddenly widens into a different pose.
    ys = np.where(counts > 0)[0]
    for y in range(t["top"] + 6, ys.max() - 20 if len(ys) else t["top"]):
        if counts[y] <= 3 or (counts[y - 3] <= 20 and counts[y] > 3 * max(counts[y - 3], 1)):
            seam = seam.copy()
            seam[y:] = False
            break
    rest = t["mask"] & ~seam
    if rest.sum() < 1500 or not seam.any():
        return
    for m, target in ((seam, t), (rest, dict(r=t["r"], c=t["c"], parent=None, id=len(flat)))):
        ys, xs = np.where(m)
        target.update(mask=m, area=int(m.sum()), top=int(ys.min()), bottom=int(ys.max()), left=int(xs.min()), right=int(xs.max()))
    flat.append(target)
    pieces[t["r"]][t["c"]].append(target)


def hard_edge(frame, side):
    """Rows or columns along one bbox side that end in a solid (cut) edge, or None."""
    a = frame[:, :, 3]
    m = a > ALPHA
    if not m.any():
        return None
    ys, xs = np.where(m)
    at = {"top": ys.min(), "bottom": ys.max(), "left": xs.min(), "right": xs.max()}[side]
    line = a[at, :] if side in ("top", "bottom") else a[:, at]
    solid = line >= 250
    if solid.sum() < 8 or solid.sum() < 0.4 * (line > ALPHA).sum():
        return None
    return at, solid


def truncated(frame, ref):
    top = hard_edge(frame, "top")
    ys = np.where((frame[:, :, 3] > ALPHA).any(1))[0]
    # Legs with the body lost above them. A tall pose with a solid top (a flat hat) is whole,
    # and a crouch has no cut along its top.
    short = len(ys) and ys.max() - ys.min() < 0.7 * ref
    return bool(short and top and top[1].sum() >= 20)


def feather(frame, width=14, run=8):
    """Fade hard cuts out over a few pixels so poses and effects end instead of stopping.
    A cut is a run of solid pixels with clear space directly above it or beside it; a drawn
    edge is antialiased and never forms one."""
    f = frame.copy()
    a = frame[:, :, 3].astype(int)
    alpha = a.astype(float)
    solid, clear = a >= 250, a <= ALPHA
    ramp = np.arange(1, width + 1) / width

    def runs(line):
        """Indices of every solid run of at least `run` pixels along a line, widened a little."""
        out = np.zeros_like(line)
        labels, n = ndimage.label(line)
        for i in range(1, n + 1):
            if (labels == i).sum() >= run:
                out |= labels == i
        return ndimage.binary_dilation(out, iterations=3) if out.any() else out

    # Top cuts fade downward, side cuts fade inward.
    for y in range(1, C):
        cols = runs(solid[y] & clear[y - 1])
        if cols.any():
            for i, k in enumerate(ramp):
                if y + i < C:
                    alpha[y + i, cols] = np.minimum(alpha[y + i, cols], a[y + i, cols] * k)
    for x in range(1, C - 1):
        for side, nx, step in (("left", x - 1, 1), ("right", x + 1, -1)):
            rows = runs(solid[:, x] & clear[:, nx])
            if rows.any():
                for i, k in enumerate(ramp):
                    px = x + i * step
                    if 0 <= px < C:
                        alpha[rows, px] = np.minimum(alpha[rows, px], a[rows, px] * k)
    f[:, :, 3] = np.clip(alpha, 0, 255).astype(np.uint8)
    return f


def drop_dust(frame):
    """Stray dust far below or beside a pose would otherwise decide where its floor is."""
    a = frame[:, :, 3] > ALPHA
    labels, n = ndimage.label(ndimage.binary_dilation(a, iterations=3), structure=np.ones((3, 3)))
    if n < 2:
        return frame
    frame = frame.copy()
    sizes = ndimage.sum(a, labels, range(1, n + 1))
    near = ndimage.binary_dilation(labels == 1 + int(np.argmax(sizes)), iterations=20)
    for i, size in enumerate(sizes, 1):
        if size < 150 and not (near & (labels == i)).any():
            frame[labels == i] = 0
    return frame


def tidy(img, rows):
    """Light repair for exports whose poses are whole: drop slivers of neighbouring cells and
    feather hard side cuts, leaving every pose where the export put it."""
    out = np.zeros_like(img)
    for r, row in enumerate(cells_of(img, rows)):
        for c, cell in enumerate(row):
            pieces = pieces_of(cell, r, c)
            if not pieces:
                continue
            biggest = max(p["area"] for p in pieces)
            keep = np.zeros(cell.shape[:2], bool)
            for p in pieces:
                edge = p["left"] <= 2 or p["right"] >= C - 3 or cut_len(p, "left", cell) >= 8 or cut_len(p, "right", cell) >= 8
                if p["area"] >= 0.3 * biggest or not edge:
                    keep |= p["mask"]
            cleaned = cell.copy()
            cleaned[~keep] = 0
            floor = np.where((cleaned[:, :, 3] > ALPHA).any(1))[0].max()
            cleaned = drop_dust(cleaned)
            ys = np.where((cleaned[:, :, 3] > ALPHA).any(1))[0]
            if len(ys) and ys.max() < floor:
                # The pose stood on the dust; put its own feet back on the floor.
                cleaned = np.roll(cleaned, floor - ys.max(), axis=0)
            out[r * C:(r + 1) * C, c * C:(c + 1) * C] = feather(cleaned)
    return out


def assign(n, want):
    """Map poses (in source order) onto atlas rows."""
    if n == want:
        return list(range(want))
    if want == 6 and n == 5:
        # walk, jump, guard, knockdown, victory: the hurt row takes the knockdown's start.
        return [0, 1, 2, 3, 3, 4]
    if want == 7 and n == 6:
        # jab, cross, uppercut, kick, kick, POWER: the lost row is a kick. The low kick and
        # sidekick share the first surviving kick; the roundhouse takes the higher one.
        return [0, 1, 2, 3, 3, 4, 5]
    if n > want:
        # Keep the first rows in order and the last pose for the last row (POWER / victory).
        return list(range(want - 1)) + [n - 1]
    # Anything thinner repeats the nearest pose.
    return [min(round(i * (n - 1) / max(1, want - 1)), n - 1) for i in range(want)]


def render(group, cells):
    canvas = np.zeros((C * 4, C * 3, 4), np.uint8)
    ox, oy = C, C
    for p, dx, dy in group:
        cell = cells[p["r"]][p["c"]]
        ys, xs = np.where(p["mask"])
        cy, cx = ys + dy + oy, xs + dx + ox
        ok = (cy >= 0) & (cy < canvas.shape[0]) & (cx >= 0) & (cx < canvas.shape[1])
        canvas[cy[ok], cx[ok]] = cell[ys[ok], xs[ok]]
    canvas = drop_dust(canvas)
    a = canvas[:, :, 3] > ALPHA
    ys, xs = np.where(a)
    top, bottom, left, right = ys.min(), ys.max(), xs.min(), xs.max()
    im = Image.fromarray(canvas[top:bottom + 1, left:right + 1])
    h, w = im.height, im.width
    s = min(1.0, (G + 1 - TOP_ROOM) / h, (C - 8) / w)
    if s < 1:
        im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    # Keep the fighter's horizontal position; the anchor column stays where the export put it.
    x0 = round(ox + (left - ox) * s) - ox if s < 1 else left - ox
    x0 = int(min(max(x0, 4), C - 4 - im.width))
    frame = Image.new("RGBA", (C, C))
    frame.alpha_composite(im, (x0, G + 1 - im.height))
    return np.array(frame)


def rebuild_sheet(combat, manifest):
    idx = manifest.get("readyTimelineCombatIndices")
    if not idx:
        return None
    sheet = np.zeros((C, C * len(idx), 4), np.uint8)
    for i, k in enumerate(idx):
        r, c = divmod(k, COLS)
        sheet[:, i * C:(i + 1) * C] = combat[r * C:(r + 1) * C, c * C:(c + 1) * C]
    return sheet


def manifest_for(fid):
    for d in MANIFESTS:
        f = d / f"{fid}-manifest.json"
        if f.exists():
            return json.loads(f.read_text())
    return {}


def main(argv):
    report_only = "--report" in argv
    light = "--light" in argv
    ids = [a for a in argv if not a.startswith("--")]
    for fid in ids:
        lines = []
        for kind, rows in (("combat", 7), ("motion", 6)):
            path = CHARS / f"{fid}-{kind}.png"
            img = np.array(Image.open(path).convert("RGBA"))
            if light:
                fixed = tidy(img, rows)
                lines.append(f"{kind}: tidied")
            else:
                fixed, counts, order = repair(img, rows, rows, lines)
                lines.append(f"{kind}: rows <- poses {order}")
            if not report_only:
                Image.fromarray(fixed).save(path, optimize=True)
                if kind == "combat":
                    sheet = rebuild_sheet(fixed, manifest_for(fid))
                    if sheet is not None:
                        Image.fromarray(sheet).save(CHARS / f"{fid}-sheet.png", optimize=True)
        print(fid, " | ".join(lines))


if __name__ == "__main__":
    main(sys.argv[1:])
