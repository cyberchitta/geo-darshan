#!/usr/bin/env python3
"""Per-cluster locator maps: a downsampled RGB basemap with the whole cluster
highlighted (cyan), exemplar centroids numbered (magenta), and an optional AOI
center marker. Shows WHERE a cluster's exemplars come from and how the cluster
is distributed over the scene — essential for judging dispersed clusters.

Generic engine script (cluster-labeling skill). AOI-agnostic: all paths via args.

Usage:
  gen_locator.py RUN_DIR --seg SEG.tif --base BASEMAP.tif \
                 [--center LON LAT] [--base-width 900] [CLUSTER_ID ...]

RUN_DIR must contain results.jsonl (from vlm_label_prototype.py --dry-run) and a
crops/ subdir; locator images are written to crops/cNNN_locator.jpg.
"""
import argparse
import json
from collections import defaultdict
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from PIL import Image, ImageDraw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=Path)
    ap.add_argument("--seg", type=Path, required=True, help="cluster raster")
    ap.add_argument("--base", type=Path, required=True, help="RGB basemap COG")
    ap.add_argument("--center", type=float, nargs=2, metavar=("LON", "LAT"),
                    help="AOI center marker (e.g. a landmark)")
    ap.add_argument("--base-width", type=int, default=900)
    ap.add_argument("ids", type=int, nargs="*", help="cluster ids (default: all)")
    a = ap.parse_args()

    crops = a.run_dir / "crops"
    crops.mkdir(parents=True, exist_ok=True)

    esri = rasterio.open(a.base)
    k = rasterio.open(a.seg)
    b = esri.bounds
    W = a.base_width
    H = int(esri.height * (W / esri.width))
    base = esri.read([1, 2, 3], out_shape=(3, H, W), resampling=Resampling.bilinear)
    base = np.ascontiguousarray(base.transpose(1, 2, 0)).astype(np.uint8)
    karr = k.read(1, out_shape=(H, W), resampling=Resampling.nearest)

    rows = [json.loads(l) for l in (a.run_dir / "results.jsonl").read_text().splitlines() if l.strip()]
    ex = defaultdict(list)
    for r in rows:
        ex[r["cluster"]].append((r["exemplar"], r["center"]))

    def to_px(lon, lat):
        return ((lon - b.left) / (b.right - b.left) * W,
                (b.top - lat) / (b.top - b.bottom) * H)

    for cid in (a.ids or sorted(ex)):
        img = base.copy()
        m = karr == cid
        img[m] = (img[m] * 0.45 + np.array([0, 220, 255]) * 0.55).astype(np.uint8)
        im = Image.fromarray(img)
        d = ImageDraw.Draw(im)
        if a.center:
            cx, cy = to_px(*a.center)
            d.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], outline=(255, 255, 255), width=2)
            d.text((cx + 7, cy - 6), "center", fill=(255, 255, 255))
        for i, (lon, lat) in sorted(ex[cid]):
            x, y = to_px(lon, lat)
            d.ellipse([x - 9, y - 9, x + 9, y + 9], outline=(255, 0, 255), width=3)
            d.text((x - 3, y - 6), str(i), fill=(255, 0, 255))
        d.text((6, 6), f"cluster {cid} — full extent (cyan) + exemplars", fill=(255, 255, 0))
        out = crops / f"c{cid:03d}_locator.jpg"
        im.save(out, quality=88)
        print(out.name, f"({int(m.sum())} px in cluster)")


if __name__ == "__main__":
    main()
