#!/usr/bin/env python3
"""Measure per-cell exemplar coverage against the gate's `min_coverage` floor.

Answers "how many exemplars would it take to settle these cells?" before a pass
is rendered, so the budget question is decided on numbers rather than after
10,000 crops exist.

An exemplar is a fixed-size window centred on one of the cell's own pixels. This
takes, per cell, the MEDIAN over all such centres of how many of that cell's
pixels the window sees, and reports coverage(N) = N x median / px.

**Calibrate before believing it.** The window convention is the whole result: on
the Auroville k88 clusters, tiling the AOI with a 20x20 grid gives a median
intersection of 14 while centring on cluster pixels gives 82 -- a 6x swing in the
answer, from the same raster and the same window size. Centring is right because
it is what the renderer does. Run this against a set whose figures are already on
record and check it reproduces them before quoting a new number.

**What it was built to settle (geo-darshan, 2026-08-21):** whether splitting
large cells makes the floor cheaper to reach. It does not. `min_coverage` is a
per-cell threshold, so the quota is paid once per cell, and splitting multiplies
cells faster than it shrinks each cell's bill -- 66 clusters cost 1,685
exemplars, the same area split 316 ways costs 3,813. Splitting fixes impurity,
not coverage.

Generic engine script (cluster-labeling skill). AOI-agnostic: all paths via args.

Usage:
  measure_coverage.py SEG.tif [--ids 0 1 2 ...] [--window-px 20] [--floor 0.30]
                      [--exemplars 3 5 6 8] [--json OUT.json]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import rasterio


def measure(a: np.ndarray, cid: int, window_px: int, floor: float) -> dict:
    H, W = a.shape
    m = (a == cid).astype(np.int32)
    px = int(m.sum())
    # Integral image -> count of cell pixels in a window centred on each pixel.
    ii = np.pad(m, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    half = window_px // 2
    ys, xs = np.nonzero(m)
    y0, y1 = np.clip(ys - half, 0, H), np.clip(ys - half + window_px, 0, H)
    x0, x1 = np.clip(xs - half, 0, W), np.clip(xs - half + window_px, 0, W)
    counts = ii[y1, x1] - ii[y0, x1] - ii[y1, x0] + ii[y0, x0]
    med = float(np.median(counts))
    return {"cid": int(cid), "px": px, "median_window": med,
            "need_floor": int(np.ceil(floor * px / med)) if med else None}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("seg", type=Path, help="cluster raster")
    ap.add_argument("--ids", type=int, nargs="+", help="cells to measure (default: all)")
    ap.add_argument("--window-px", type=int, default=20,
                    help="exemplar window edge in pixels (default 20)")
    ap.add_argument("--floor", type=float, default=0.30,
                    help="the gate's min_coverage (default 0.30)")
    ap.add_argument("--exemplars", type=int, nargs="+", default=[3, 5, 6, 8],
                    help="budgets per cell to tabulate")
    ap.add_argument("--json", type=Path, help="write the per-cell rows here")
    a = ap.parse_args()

    src = rasterio.open(a.seg)
    arr = src.read(1)
    uniq = np.unique(arr)
    uniq = uniq[uniq >= 0]
    if a.ids:
        want = set(a.ids)
        missing = want - {int(u) for u in uniq}
        if missing:
            # Silently measuring fewer cells than asked would understate the bill.
            raise SystemExit(f"not present in {a.seg}: {sorted(missing)}")
        uniq = np.array(sorted(want))

    rows = [measure(arr, cid, a.window_px, a.floor) for cid in uniq]
    total_px = sum(r["px"] for r in rows)
    aoi_px = int((arr >= 0).sum())

    print(f"{a.seg}  {len(rows)} cells  {total_px:,} px "
          f"= {total_px / aoi_px * 100:.2f}% of the {aoi_px:,} px AOI")
    print(f"window {a.window_px}x{a.window_px} px centred on a cell pixel; "
          f"floor {a.floor}\n")
    for k in ("px", "median_window"):
        v = np.array([r[k] for r in rows], dtype=float)
        print(f"  {k:<14} min={v.min():.6g} median={np.median(v):.6g} max={v.max():.6g}")
    print()
    for e in a.exemplars:
        cov = np.array([e * r["median_window"] / r["px"] for r in rows])
        ok = cov >= a.floor
        print(f"  {e:>3} exemplars/cell -> median coverage {np.median(cov) * 100:5.1f}%   "
              f"cells at/over floor: {ok.sum():>4}/{len(rows)}   "
              f"px {sum(r['px'] for r, o in zip(rows, ok) if o) / total_px * 100:5.1f}%")
    need = np.array([r["need_floor"] for r in rows])
    print(f"\n  to put EVERY cell at the floor: {need.sum():,} exemplars "
          f"(median {np.median(need):.0f}/cell, max {need.max()})")

    if a.json:
        a.json.write_text(json.dumps(rows, indent=1))
        print(f"\n  per-cell rows -> {a.json}")


if __name__ == "__main__":
    main()
