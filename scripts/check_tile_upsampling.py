#!/usr/bin/env python3
"""Is a z(N) tile pull real imagery, or z(N-1) silently upsampled?

Tile servers serve *something* for a zoom they do not really hold: usually the
parent tile, resampled, with no marking. A mosaic that is genuinely 0.29 m/px in
most places and upsampled in patches is **worse than a uniform coarser one** —
readers cannot tell which they are looking at and will over-read the fake
detail, and every label resting on that detail is a false claim about ground.

Method: each sampled child tile is compared against the quadrant of its parent
covering the same ground, upscaled 2x.

  mae         low  => the child IS the parent, resampled
  detail ratio ~1  => child holds no finer detail than an interpolated parent
                >3  => genuine high-frequency content the parent cannot have

Detail ratio (Laplacian variance, child / upscaled parent) is the gating
measure: it asks the physical question directly. MAE is reported alongside
because it fails differently — a flat, featureless tile (water, bare sand) has
low detail energy whatever its true resolution.

**Threshold calibration, do not tighten casually.** Measured 2026-08-16 on the
Auroville z19 pull by fabricating the failure — 12 tiles replaced with their own
upscaled parents. Fabricated tiles score <= 1.23; real z19 scores >= 5.25 across
199 tiles. An earlier bar of 1.15 **missed all 12 fakes** (JPEG re-encode noise
lifts a fabricated tile to ~1.20) and reported the pull as real. 3.0 sits in the
gap. If you change this, re-run the injection test — a checker that has only
ever been green proves nothing.

Usage:
    uv run --no-project --with numpy,pillow python check_tile_upsampling.py \
        <tile_dir> [--zoom 19] [--samples 200] [--threshold 3.0]

Expects tiles named `tile_<zoom>_<x>_<y>.<png|jpg>` in one flat directory, with
the parent zoom present in the same directory (that is what it compares against).
"""
import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

TS = 256

ap = argparse.ArgumentParser()
ap.add_argument("tile_dir", type=Path)
ap.add_argument("--zoom", type=int, default=19, help="child zoom to audit")
ap.add_argument("--samples", type=int, default=200)
ap.add_argument("--threshold", type=float, default=3.0,
                help="detail ratio below which a tile reads as upsampled")
a = ap.parse_args()


def find(zoom, x, y):
    """Tiles arrive as .jpg or .png depending on what the server served."""
    for ext in ("png", "jpg"):
        p = a.tile_dir / f"tile_{zoom}_{x}_{y}.{ext}"
        if p.exists():
            return p
    return None


children = [p for ext in ("png", "jpg") for p in a.tile_dir.glob(f"tile_{a.zoom}_*.{ext}")]
if not children:
    sys.exit(f"no z{a.zoom} tiles in {a.tile_dir}")

# even spread across the area, not a clump: sort by (x, y) and stride
coords = sorted(tuple(int(v) for v in p.stem.split("_")[2:]) for p in children)
step = max(1, len(coords) // a.samples)
sample = coords[::step][:a.samples]


def lap_var(arr):
    """Variance of a 4-neighbour Laplacian = fine-detail energy."""
    f = arr.astype(np.float32)
    lap = (4 * f[1:-1, 1:-1] - f[:-2, 1:-1] - f[2:, 1:-1]
           - f[1:-1, :-2] - f[1:-1, 2:])
    return float(lap.var())


rows, missing = [], 0
for x, y in sample:
    child, parent = find(a.zoom, x, y), find(a.zoom - 1, x // 2, y // 2)
    if child is None or parent is None:
        missing += 1
        continue
    c = np.array(Image.open(child).convert("RGB"))
    p = np.array(Image.open(parent).convert("RGB"))
    qx, qy = (x % 2) * (TS // 2), (y % 2) * (TS // 2)
    quad = Image.fromarray(p[qy:qy + TS // 2, qx:qx + TS // 2]).resize((TS, TS), Image.BICUBIC)
    mae = float(np.abs(c.astype(np.int16) - np.array(quad).astype(np.int16)).mean())
    lv_c = lap_var(np.array(Image.open(child).convert("L")))
    lv_q = lap_var(np.array(quad.convert("L")))
    rows.append((x, y, mae, lv_c, lv_q, lv_c / lv_q if lv_q > 0 else float("inf")))

if not rows:
    sys.exit(f"no comparable pairs (parents missing for all {missing} sampled tiles)")

mae = np.array([r[2] for r in rows])
ratio = np.array([r[5] for r in rows])
print(f"compared {len(rows)} z{a.zoom} tiles against their z{a.zoom-1} parents "
      f"({missing} skipped, no parent on disk)\n")
print(f"  MAE vs upscaled parent   min {mae.min():6.2f}  median {np.median(mae):6.2f}  max {mae.max():6.2f}")
print(f"  fine-detail ratio        min {ratio.min():6.2f}  median {np.median(ratio):6.2f}  max {ratio.max():6.2f}")

susp = [r for r in rows if r[5] < a.threshold]
print(f"\n  tiles indistinguishable from upsampled z{a.zoom-1}: {len(susp)} of {len(rows)}")
for x, y, m, _, _, rt in susp[:12]:
    print(f"    tile_{a.zoom}_{x}_{y}  mae={m:.2f} detail_ratio={rt:.2f}")

print("\nweakest 5 by detail ratio (closest to interpolated):")
for r in sorted(rows, key=lambda r: r[5])[:5]:
    print(f"    tile_{a.zoom}_{r[0]}_{r[1]}  mae={r[2]:6.2f}  "
          f"lap child={r[3]:8.1f} parent={r[4]:8.1f}  ratio={r[5]:.2f}")

bad = len(susp) > len(rows) * 0.05
print(f"\nVERDICT: {'UPSAMPLED (or mixed) - do not use' if bad else f'REAL z{a.zoom} across the sample'}")
sys.exit(1 if bad else 0)
