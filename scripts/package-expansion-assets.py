"""Deterministically pack authored RGBA poses and assemble animation holds.

Requires Pillow, numpy and scipy. No pose synthesis or background removal occurs. Outer near-transparent padding
is trimmed at alpha >16 bounds; alpha inside each resulting crop is preserved.
Sources: asset-sources/expansion/{id}-{combat,motion}.png (four columns).
Usage: python3 scripts/package-expansion-assets.py [--ids hybrid civic ...]
The 16 signature timeline cells reuse the ready pose and four authored power
key poses. They are deliberately documented as holds, not 16 unique poses.
"""
import argparse
from io import BytesIO
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
IDS = 'hybrid civic nexus glyph quilt binary aether gaia zenith'.split()
COMBAT = 'jab cross uppercut low-kick sidekick roundhouse power'.split()
MOTIONS = 'walk jump guard hurt ko victory'.split()
TIMELINE = [0, 0, 24, 24, 25, 25, 26, 26, 26, 26, 27, 27, 27, 0, 0, 0]


def extract(path, rows):
    source = Image.open(path)
    if 'A' not in source.getbands():
        raise ValueError(f'{path}: source must have authored alpha')
    rgba = np.array(source.convert('RGBA'))
    alpha = rgba[:, :, 3]
    if np.mean(alpha == 0) < .05:
        raise ValueError(f'{path}: transparent background missing; refusing background removal')
    h, w = alpha.shape
    labels, _ = ndimage.label(alpha > 16)
    components = []
    # Resolution-relative threshold replaces the old fixed 4000-pixel cutoff.
    threshold = max(8, round(w * h / (rows * 4) * .004))
    for number, bb in enumerate(ndimage.find_objects(labels), 1):
        if bb is None:
            continue
        yy, xx = bb
        mask = labels[bb] == number
        if np.count_nonzero(mask) < threshold:
            continue
        # Use alpha mass centroid so a long power effect does not move the body
        # into its neighboring frame. Touching adjacent poses require re-authoring.
        cy, cx = ndimage.center_of_mass(mask)
        row = min(rows - 1, int((yy.start + cy) / (h / rows)))
        col = min(3, int((xx.start + cx) / (w / 4)))
        if yy.stop - yy.start > h / rows * 1.7 or xx.stop - xx.start > w / 4 * 1.8:
            raise ValueError(f'{path}: connected artwork spans cells near {row},{col}')
        components.append((number, row * 4 + col, bb))
    assignment = np.full((h, w), -1, dtype=np.int16)
    for number, frame, bb in components:
        region = assignment[bb]
        region[labels[bb] == number] = frame
    found = set(assignment[assignment >= 0].tolist())
    missing = set(range(rows * 4)) - found
    if missing:
        raise ValueError(f'{path}: missing authored poses {sorted(missing)}')
    # Detached antialias pixels and tiny effects belong to nearest authored art.
    _, nearest = ndimage.distance_transform_edt(assignment < 0, return_indices=True)
    assignment = assignment[nearest[0], nearest[1]]
    poses = []
    for frame in range(rows * 4):
        data = rgba.copy()
        data[:, :, 3] = np.where(assignment == frame, alpha, 0)
        pose = Image.fromarray(data)
        bb = pose.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
        if not bb:
            raise ValueError(f'{path}: empty pose {frame}')
        poses.append((pose.crop(bb), bb[0] - (frame % 4 + .5) * w / 4))
    return poses


def pack(poses, scale, neutral_offset):
    frames = []
    for pose, offset in poses:
        size = tuple(max(1, round(n * scale)) for n in pose.size)
        if max(size) > 284:
            raise ValueError('Pose exceeds safe cell bounds')
        pose = pose.resize(size, Image.Resampling.NEAREST)
        frame = Image.new('RGBA', (320, 320))
        x = round(160 + (offset - neutral_offset) * scale)
        x = max(12, min(308 - pose.width, x))
        frame.alpha_composite(pose, (x, 296 - pose.height))
        frames.append(frame)
    return frames


def atlas(frames, columns):
    result = Image.new('RGBA', (320 * columns, 320 * ((len(frames) + columns - 1) // columns)))
    for i, frame in enumerate(frames):
        result.alpha_composite(frame, ((i % columns) * 320, (i // columns) * 320))
    return result


def save_png(image, path):
    # Write completed bytes in one operation; direct PIL streamed filesystem
    # writes can be interrupted in the shared workspace.
    encoded = BytesIO()
    image.save(encoded, format='PNG', optimize=True)
    data = encoded.getvalue()
    path.write_bytes(data)
    if path.read_bytes() != data:
        raise IOError(f'{path}: written PNG differs from encoded bytes')
    with Image.open(path) as decoded:
        decoded.load()


def gif(frames, path, duration=100):
    # GIF has binary transparency. PNG atlases retain the complete authored alpha.
    palette_frames = []
    for frame in frames:
        p = frame.convert('RGB').quantize(colors=255, method=Image.Quantize.MEDIANCUT)
        palette = p.getpalette()[:765] + [0, 0, 0]
        p.putpalette(palette)
        p.paste(255, mask=frame.getchannel('A').point(lambda a: 255 if a < 128 else 0))
        p.info['transparency'] = 255
        palette_frames.append(p)
    palette_frames[0].save(path, save_all=True, append_images=palette_frames[1:],
                           duration=duration, loop=0, disposal=2, transparency=255, optimize=False)


def process(identity, source, output, exports):
    paths = {kind: source / f'{identity}-{kind}.png' for kind in ('combat', 'motion')}
    authored = {kind: extract(path, 7 if kind == 'combat' else 6) for kind, path in paths.items()}
    # Consistent scale across both atlases. Oversized effects may reduce neutral
    # height, which is measured in the manifest rather than misreported as 176.
    neutral, neutral_left = authored['combat'][0]
    scales = {'combat': 176 / neutral.height}
    # Guard is standing and less affected by walk stride. Median reduces a
    # single crouched/block-impact pose's influence on the source size estimate.
    motion_height = float(np.median([p.height for p, _ in authored['motion'][8:12]]))
    scales['motion'] = 176 / motion_height
    shared_fit = min([1.0] + [284 / (max(max(p.size) for p, _ in poses) * scales[kind])
                              for kind, poses in authored.items()])
    scales = {kind: scale * shared_fit for kind, scale in scales.items()}
    roots = {'combat': neutral_left + neutral.width / 2}
    roots['motion'] = float(np.median([offset + p.width / 2 for p, offset in authored['motion'][8:12]]))
    frames = {kind: pack(poses, scales[kind], roots[kind]) for kind, poses in authored.items()}
    scale = scales['combat']
    output.mkdir(parents=True, exist_ok=True)
    target = exports / identity
    target.mkdir(parents=True, exist_ok=True)
    for kind in frames:
        image = atlas(frames[kind], 4)
        save_png(image, output / f'{identity}-{kind}.png')
        save_png(image, target / f'{identity}-{kind}.png')
        names = COMBAT if kind == 'combat' else MOTIONS
        for row, name in enumerate(names):
            gif(frames[kind][row * 4:row * 4 + 4], target / f'{identity}-{name}.gif')
    signature = [frames['combat'][i] for i in TIMELINE]
    save_png(atlas(signature, 16), output / f'{identity}-sheet.png')
    save_png(frames['combat'][0], output / f'{identity}-portrait.png')
    save_png(frames['combat'][0], target / f'{identity}-portrait.png')
    save_png(atlas(signature, 4), target / f'{identity}-signature-4x4.png')
    save_png(atlas(signature, 16), target / f'{identity}-sheet.png')
    gif(signature, target / f'{identity}-signature.gif', 70)
    manifest = {
        'id': identity, 'cellSize': 320, 'anchor': [160, 296],
        'bodyHeight': round(neutral.height * scale), 'scales': scales,
        'combatAuthoredPoses': 28, 'motionAuthoredPoses': 24,
        'combatRows': COMBAT, 'motionRows': MOTIONS,
        'signatureTimelineCombatIndices': TIMELINE, 'signatureFrameDurationMs': 65,
        'signatureGifTimelineFrameDurationMs': 70, 'signatureGifDurationMs': 1120,
        'gifTimingNote': 'GIF uses 10ms ticks; equal held poses may be stored as one frame with combined duration.',
        'signatureDescription': '16 timeline cells using ready plus four authored power key poses, with holds; not 16 unique poses.',
        'sources': {kind: {'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()} for kind, path in paths.items()},
        'alpha': 'Packing trims outer padding using alpha >16 bounds, preserving all authored RGBA inside each crop. PNG retains source alpha; GIF uses binary alpha at threshold128.'
    }
    (target / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'{identity}: packed 28 combat + 24 motion poses; neutral height {manifest["bodyHeight"]}', flush=True)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', nargs='+', choices=IDS, default=IDS)
    parser.add_argument('--source', type=Path, default=ROOT / 'asset-sources/expansion')
    parser.add_argument('--output', type=Path, default=ROOT / 'public/assets/characters')
    parser.add_argument('--exports', type=Path, default=ROOT / 'asset-exports/expansion')
    args = parser.parse_args()
    for identity in args.ids:
        process(identity, args.source, args.output, args.exports)


if __name__ == '__main__':
    main()
