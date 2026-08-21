#!/usr/bin/env python3
"""Select exemplar patches per cluster and render the judged crops.

Step 1 of the procedure: for each cluster, pick its largest spatially-distinct
patches (connected components) and crop a context window around each from the
basemap with the patch outlined, so a reader can judge what it is.

Provenance: `patch_exemplars()` and `render_crop()` are lifted unchanged from
`scripts/vlm_label_prototype.py`, which was deleted whole in `a20a78f` when the
Gemini path was retired — taking these two with it, though neither is Gemini
code. Only the selection + rendering came back. There is deliberately **no**
`build_prompt()`, no `prompt.txt`, and no API call: crops are judged in-harness
by a reader that reads the images directly, and `results.jsonl` is written with
an empty `result` for that reader to fill.

`gen_raw_crops.py` is NOT a substitute for this script — it re-renders geometry
from an existing `results.jsonl` and cannot select exemplars.

Known limitation (worklist T64): selection is largest-N components. A split
child therefore tends to be shown the same patch its parent was shown, and
nothing stratifies across the cluster's extent. Fixing that is a separate task;
this script keeps the historical behaviour so round-to-round crops stay
comparable.

Generic engine script (cluster-labeling skill). AOI-agnostic: all paths via args.

Usage:
  gen_exemplars.py RUN_DIR --seg SEG.tif --base BASE.tif \
      [--cluster-ids 3 7 9 | --clusters N] [--exemplars 3] [--window-m 200] \
      [--min-patch-px 4] [--max-img-px 768] [--results results.jsonl] [--force]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import List, Tuple

import numpy as np
import rasterio
from PIL import Image, ImageDraw
from rasterio.enums import Resampling
from rasterio.windows import from_bounds
from scipy import ndimage


def pick_clusters(cluster_arr: np.ndarray, ids: List[int] | None, n: int) -> List[int]:
    if ids:
        return ids
    uniq, counts = np.unique(cluster_arr[cluster_arr >= 0], return_counts=True)
    order = np.argsort(-counts)  # largest first
    return [int(uniq[i]) for i in order[:n]]


def patch_exemplars(
    mask: np.ndarray, n: int, min_px: int
) -> List[Tuple[int, Tuple[float, float]]]:
    """Largest connected components of a cluster mask -> (size, (row, col))."""
    labeled, n_comp = ndimage.label(mask)
    if n_comp == 0:
        return []
    sizes = ndimage.sum(np.ones_like(labeled), labeled, index=range(1, n_comp + 1))
    centroids = ndimage.center_of_mass(mask, labeled, index=range(1, n_comp + 1))
    comps = [
        (int(sizes[i]), centroids[i])
        for i in range(n_comp)
        if sizes[i] >= min_px
    ]
    comps.sort(key=lambda c: -c[0])
    return comps[:n]


def render_crop(
    esri: rasterio.DatasetReader,
    cluster_src: rasterio.DatasetReader,
    cluster_id: int,
    center_lonlat: Tuple[float, float],
    window_m: float,
    max_img_px: int,
) -> Tuple[Image.Image, Tuple[float, float, float, float]]:
    """Read a context window from the basemap, overlay the cluster's footprint."""
    lon, lat = center_lonlat
    half_deg = (window_m / 111_320.0) / 2.0  # ~m per degree at equator
    box = (lon - half_deg, lat - half_deg, lon + half_deg, lat + half_deg)

    win = from_bounds(*box, transform=esri.transform)
    h = int(round(win.height))
    w = int(round(win.width))
    scale = min(1.0, max_img_px / max(h, w))
    out_h, out_w = max(1, int(h * scale)), max(1, int(w * scale))

    rgb = esri.read(
        [1, 2, 3], window=win, out_shape=(3, out_h, out_w),
        resampling=Resampling.bilinear, boundless=True, fill_value=0,
    )
    rgb = np.transpose(rgb, (1, 2, 0)).astype(float)

    # Read the cluster raster onto the SAME geo window/grid (nearest), so the
    # overlay lines up with the imagery pixel-for-pixel.
    cwin = from_bounds(*box, transform=cluster_src.transform)
    clusters = cluster_src.read(
        1, window=cwin, out_shape=(out_h, out_w),
        resampling=Resampling.nearest, boundless=True, fill_value=-1,
    )
    patch = clusters == cluster_id
    edge = ndimage.binary_dilation(patch, iterations=2) & ~patch

    # Light tint only: a heavy fill flattens crown/canopy texture (it caused a
    # coconut->scrub misread). Lean on the magenta outline to mark the patch.
    rgb[patch] = rgb[patch] * 0.88 + np.array([255, 255, 0]) * 0.12
    rgb[edge] = np.array([255, 0, 255])
    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))

    draw = ImageDraw.Draw(img)
    draw.text((4, 4), f"cluster {cluster_id} | {window_m:.0f}m", fill=(255, 255, 255))
    return img, box


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("run_dir", type=Path, help="output run directory")
    ap.add_argument("--seg", type=Path, required=True, help="cluster raster")
    ap.add_argument("--base", type=Path, required=True, help="high-res RGB basemap")
    ap.add_argument("--cluster-ids", type=int, nargs="+",
                    help="specific cluster ids (default: --clusters largest)")
    ap.add_argument("--clusters", type=int, default=0,
                    help="render the N largest clusters (ignored with --cluster-ids)")
    ap.add_argument("--exemplars", type=int, default=3, help="exemplars per cluster")
    ap.add_argument("--window-m", type=float, default=200.0, help="crop window, metres")
    ap.add_argument("--min-patch-px", type=int, default=4,
                    help="ignore connected components smaller than this")
    ap.add_argument("--max-img-px", type=int, default=768, help="max crop edge, px")
    ap.add_argument("--results", default="results.jsonl",
                    help="results filename inside RUN_DIR")
    ap.add_argument("--force", action="store_true",
                    help="overwrite an existing results file")
    a = ap.parse_args()

    if not a.cluster_ids and not a.clusters:
        ap.error("give --cluster-ids or --clusters")

    crops_dir = a.run_dir / "crops"
    crops_dir.mkdir(parents=True, exist_ok=True)
    results_path = a.run_dir / a.results
    # A run's results.jsonl is what every downstream artifact is keyed to;
    # silently truncating it discards the round it describes.
    if results_path.exists() and not a.force:
        raise SystemExit(f"{results_path} exists -- pass --results NAME or --force")

    esri = rasterio.open(a.base)
    cluster_src = rasterio.open(a.seg)
    cluster_arr = cluster_src.read(1)

    targets = pick_clusters(cluster_arr, a.cluster_ids, a.clusters)
    print(f"clusters: {len(targets)}  ({a.exemplars} exemplars each, "
          f"{a.window_m:.0f} m window)")

    n_crops, skipped = 0, []
    with results_path.open("w") as log:
        for cid in targets:
            comps = patch_exemplars(cluster_arr == cid, a.exemplars, a.min_patch_px)
            if not comps:
                skipped.append(cid)
                print(f"  cluster {cid}: no patch >= {a.min_patch_px}px, skipping")
                continue
            for i, (size_px, (row, col)) in enumerate(comps):
                lon, lat = cluster_src.xy(row, col)
                img, box = render_crop(esri, cluster_src, cid, (lon, lat),
                                       a.window_m, a.max_img_px)
                crop_path = crops_dir / f"c{cid:03d}_e{i}.jpg"
                img.save(crop_path, quality=85)
                n_crops += 1
                log.write(json.dumps({
                    "cluster": cid, "exemplar": i, "size_px": size_px,
                    "center": [lon, lat], "crop": str(crop_path), "result": {},
                }) + "\n")
            print(f"  cluster {cid}: {len(comps)} exemplars, "
                  f"largest {comps[0][0]}px")

    print(f"\n{n_crops} crops -> {crops_dir}")
    print(f"results -> {results_path}  (result: {{}} -- judged in-harness)")
    if skipped:
        print(f"NO EXEMPLARS for {len(skipped)} clusters: {skipped}")


if __name__ == "__main__":
    main()
