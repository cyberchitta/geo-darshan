#!/usr/bin/env python3
"""Mid-scale context crops — the zoom level between exemplar and locator.

The exemplar crop (~200 m) shows one field; the locator shows the whole AOI at
low detail. Neither answers "what is the SURROUNDING land cover?", and several
class definitions turn on exactly that:

  - fallow must be distinguished from a harvested casuarina block amid other
    casuarina, and from an opening inside a canopy matrix (a forest blank);
  - planted_forest requires a forest/scrub matrix around the patch;
  - built subtypes are decided by what fills the space BETWEEN the roofs;
  - tree_lines requires seeing the linear host feature run past the patch.

This renders a wider window at the SAME centre as each exemplar, reading the
centres from the run's results.jsonl so the crops line up one-to-one with the
exemplars already judged (no re-selection, indices preserved).

The cell's own pixels stay magenta-outlined, but at this scale every OTHER cell
of the same cluster in view is outlined too (thin cyan) — that shows whether the
cluster recurs through the neighbourhood or the patch is a one-off, which is
itself evidence.

Usage:
  python gen_context.py RUN_DIR --seg SEG.tif --base BASE.tif [--window-m 800]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image, ImageDraw
from rasterio.enums import Resampling
from rasterio.windows import from_bounds
from scipy import ndimage


def render(esri, seg, cluster_id, center, window_m, max_px):
    lon, lat = center
    half = (window_m / 111_320.0) / 2.0
    box = (lon - half, lat - half, lon + half, lat + half)

    win = from_bounds(*box, transform=esri.transform)
    h, w = int(round(win.height)), int(round(win.width))
    scale = min(1.0, max_px / max(h, w))
    out_h, out_w = max(1, int(h * scale)), max(1, int(w * scale))

    rgb = esri.read(
        [1, 2, 3], window=win, out_shape=(3, out_h, out_w),
        resampling=Resampling.bilinear, boundless=True, fill_value=0,
    )
    rgb = np.transpose(rgb, (1, 2, 0)).astype(float)

    swin = from_bounds(*box, transform=seg.transform)
    clusters = seg.read(
        1, window=swin, out_shape=(out_h, out_w),
        resampling=Resampling.nearest, boundless=True, fill_value=-1,
    )

    patch = clusters == cluster_id
    # Outline only — no tint at this scale. The point of the view is the
    # surrounding cover's texture, and a tint over a wide window dulls it.
    edge = ndimage.binary_dilation(patch, iterations=1) & ~patch
    rgb[edge] = np.array([255, 0, 255])

    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    draw = ImageDraw.Draw(img)
    # Scale bar: 100 m, so the reader can size features without arithmetic.
    bar = int(round(out_w * 100.0 / window_m))
    y = out_h - 12
    draw.rectangle([8, y, 8 + bar, y + 3], fill=(255, 255, 255))
    draw.text((8, y - 12), "100 m", fill=(255, 255, 255))
    draw.text((4, 4), f"cluster {cluster_id} | CONTEXT {window_m:.0f}m", fill=(255, 255, 255))
    return img


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=Path)
    ap.add_argument("--seg", type=Path, required=True)
    ap.add_argument("--base", type=Path, required=True)
    ap.add_argument("--window-m", type=float, default=800.0)
    ap.add_argument("--max-img-px", type=int, default=640)
    ap.add_argument("--cluster-ids", type=int, nargs="*")
    args = ap.parse_args()

    results = args.run_dir / "results.jsonl"
    if not results.exists():
        raise SystemExit(f"no results.jsonl in {args.run_dir} — run the renderer first")

    crops = args.run_dir / "crops"
    crops.mkdir(exist_ok=True)
    wanted = set(args.cluster_ids) if args.cluster_ids else None

    n = 0
    with rasterio.open(args.base) as esri, rasterio.open(args.seg) as seg:
        for line in results.read_text().splitlines():
            if not line.strip():
                continue
            rec = json.loads(line)
            cid, ei = int(rec["cluster"]), int(rec["exemplar"])
            if wanted is not None and cid not in wanted:
                continue
            img = render(esri, seg, cid, rec["center"], args.window_m, args.max_img_px)
            out = crops / f"c{cid:03d}_e{ei}_ctx.jpg"
            img.save(out, quality=88)
            n += 1

    print(f"wrote {n} context crops at {args.window_m:.0f} m into {crops}")


if __name__ == "__main__":
    main()
