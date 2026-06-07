#!/usr/bin/env python3
"""Whole-area overview artifacts for a labeling round.

Produces two macro-scale views that per-cluster crops can't give:

  1. overview_basemap.jpg  — downsampled RGB of the whole basemap, so you can see
     large uniform regions and how cover types are arranged (the visual form of the
     AOI pack's geography priors).
  2. overview_labels.jpg   — the current per-cluster labels rendered as a whole-area
     choropleth + legend with area shares. This is a MACRO-QA surface: a real
     land-cover class clusters spatially (coherent belts = trustworthy); a default /
     uncertainty artifact sprays as confetti across the map (suspect).

Colors are deterministic from the label string: each top-level family gets a stable
hue, and leaves within a family vary in lightness — so families stay visually grouped
(what makes the choropleth readable) while remaining AOI-agnostic.

Usage:
  python gen_overview.py RUN_DIR --seg SEG.tif --base BASE.tif [--width 1500]
"""
import argparse
import colorsys
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image, ImageDraw
from rasterio.enums import Resampling


def _family(label: str) -> str:
    return label.split(".")[0] if label else "uncertain"


def _hue(name: str) -> float:
    h = hashlib.md5(name.encode()).hexdigest()
    return (int(h[:8], 16) % 1000) / 1000.0


def label_colors(labels):
    """Deterministic {label: (r,g,b)} — hue per family, lightness per leaf."""
    by_fam = defaultdict(list)
    for lab in sorted(set(labels)):
        by_fam[_family(lab)].append(lab)
    out = {}
    for fam, leaves in by_fam.items():
        hue = _hue(fam)
        n = len(leaves)
        for i, lab in enumerate(leaves):
            # spread lightness 0.45..0.75 across leaves; single-leaf families sit mid
            light = 0.6 if n == 1 else 0.45 + 0.30 * (i / (n - 1))
            r, g, b = colorsys.hls_to_rgb(hue, light, 0.65)
            out[lab] = (int(r * 255), int(g * 255), int(b * 255))
    return out


def basemap_overview(base_path: str, width: int) -> Image.Image:
    ds = rasterio.open(base_path)
    h = int(ds.height * width / ds.width)
    arr = ds.read([1, 2, 3], out_shape=(3, h, width), resampling=Resampling.average)
    return Image.fromarray(np.transpose(arr, (1, 2, 0)).astype("uint8"))


def label_choropleth(seg_path: str, cluster_to_label: dict, width: int):
    ds = rasterio.open(seg_path)
    h = int(ds.height * width / ds.width)
    cl = ds.read(1, out_shape=(h, width), resampling=Resampling.nearest)
    labels = [v["label"] for v in cluster_to_label.values()]
    colors = label_colors(labels)
    out = np.full((h, width, 3), 255, "uint8")  # nodata / unlabeled = white
    area = Counter()
    for cid_str, v in cluster_to_label.items():
        cid = int(cid_str)
        mask = cl == cid
        out[mask] = colors[v["label"]]
        area[v["label"]] += int(mask.sum())
    return Image.fromarray(out), colors, area


def with_legend(img: Image.Image, colors: dict, area: Counter) -> Image.Image:
    total = sum(area.values()) or 1
    rows = area.most_common()
    sw, lh, pad = 18, 20, 10
    legend_h = pad * 2 + lh * len(rows)
    canvas = Image.new("RGB", (img.width, img.height + legend_h), (255, 255, 255))
    canvas.paste(img, (0, 0))
    d = ImageDraw.Draw(canvas)
    y = img.height + pad
    for lab, n in rows:
        d.rectangle([pad, y, pad + sw, y + sw], fill=colors[lab])
        d.text((pad + sw + 8, y + 3), f"{100*n/total:5.1f}%  {lab}", fill=(0, 0, 0))
        y += lh
    return canvas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir")
    ap.add_argument("--seg", required=True, help="cluster raster (kNN_s42.tif)")
    ap.add_argument("--base", required=True, help="RGB basemap COG")
    ap.add_argument("--width", type=int, default=1500)
    a = ap.parse_args()
    run = Path(a.run_dir)

    bm = basemap_overview(a.base, a.width)
    bm_path = run / "overview_basemap.jpg"
    bm.save(bm_path, quality=88)
    print(f"wrote {bm_path}  ({bm.width}x{bm.height})")

    ctl_path = run / "cluster_to_label.json"
    if ctl_path.exists():
        ctl = json.load(open(ctl_path))
        chor, colors, area = label_choropleth(a.seg, ctl, a.width)
        chor = with_legend(chor, colors, area)
        lab_path = run / "overview_labels.jpg"
        chor.save(lab_path, quality=90)
        print(f"wrote {lab_path}  ({len(ctl)} clusters)")
    else:
        print(f"(no {ctl_path} yet — skipped label choropleth; run aggregate first)")


if __name__ == "__main__":
    main()
