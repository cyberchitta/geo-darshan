#!/usr/bin/env python3
"""Render boundary-straddling pair crops for neighbor-mismatch triage.

For each flagged (cluster, dominant-neighbor) pair from RUN_DIR/nbr_flags.json
(written by gen_review_html.py), render one RAW basemap crop centered on their
shared boundary: cluster outlined magenta, neighbor outlined cyan, no tint.
The VLM then judges "same cover on both sides?" — writes RUN_DIR/nbr_verdicts.json
(array of {cluster, nbr, same_cover, cover, confidence, note, img}), which
gen_review_html.py --nbr-verdicts folds back into the review page.

Generic engine script (cluster-labeling skill).

Usage:
  gen_nbr_pairs.py RUN_DIR --seg SEG.tif --base BASE.tif [--window-m 250] [--max-px 1100]
"""
import argparse
import json
from pathlib import Path

import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.windows import from_bounds
from scipy import ndimage
from PIL import Image


def edges(mask):
    e = mask & ~(np.roll(mask, 1, 0) & np.roll(mask, -1, 0)
                 & np.roll(mask, 1, 1) & np.roll(mask, -1, 1))
    for ax in (0, 1):
        for sh in (1, -1):
            e |= np.roll(e, sh, ax) & mask
    return e


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=Path)
    ap.add_argument("--seg", type=Path, required=True)
    ap.add_argument("--base", type=Path, required=True)
    ap.add_argument("--window-m", type=float, default=250)
    ap.add_argument("--max-px", type=int, default=1100)
    a = ap.parse_args()

    pairs = json.loads((a.run_dir / "nbr_flags.json").read_text())
    seg = rasterio.open(a.seg)
    base = rasterio.open(a.base)
    ids = seg.read(1)
    out = []
    for p in pairs:
        cid, nid = p["cluster"], p["nbr"]
        m, n = ids == cid, ids == nid
        touch = m & (np.roll(n, 1, 0) | np.roll(n, -1, 0) | np.roll(n, 1, 1) | np.roll(n, -1, 1))
        # dispersed cells: center on the largest connected patch of the cell
        # that actually touches this neighbor, not the (meaningless) global centroid
        comp, ncomp = ndimage.label(m, structure=np.ones((3, 3)))
        best, best_touch = 0, -1
        for c in range(1, ncomp + 1):
            t = int(touch[comp == c].sum())
            if t > best_touch:
                best, best_touch = c, t
        sel = (comp == best) & touch if best_touch > 0 else (comp == best)
        rr, cc = np.nonzero(sel)
        clon, clat = seg.xy(int(np.mean(rr)), int(np.mean(cc)))
        p = {**p, "patches": ncomp}
        half = a.window_m / 2 / 111_320
        bounds = (clon - half / np.cos(np.radians(clat)), clat - half,
                  clon + half / np.cos(np.radians(clat)), clat + half)
        w = from_bounds(*bounds, base.transform).round_offsets().round_lengths()
        rgb = base.read([1, 2, 3], window=w, boundless=True, fill_value=0)
        wt = base.window_transform(w)
        hi = np.zeros(rgb.shape[1:], np.int16)
        reproject(ids, hi, src_transform=seg.transform, src_crs=seg.crs,
                  dst_transform=wt, dst_crs=base.crs, resampling=Resampling.nearest,
                  src_nodata=-1, dst_nodata=-1)
        img = np.moveaxis(rgb, 0, -1).copy()
        img[edges(hi == cid)] = (255, 0, 255)
        img[edges(hi == nid)] = (0, 255, 255)
        im = Image.fromarray(img.astype(np.uint8))
        if max(im.size) > a.max_px:
            s = a.max_px / max(im.size)
            im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        name = f"c{cid:03d}_nbr{nid:03d}.jpg"
        im.save(a.run_dir / "crops" / name, quality=88)
        out.append({**p, "img": f"crops/{name}"})
        print(f"c{cid} vs c{nid}: {name}  ({p['label']} vs {p['nbr_label']})")
    (a.run_dir / "nbr_pairs.json").write_text(json.dumps(out, indent=1))
    print(f"{len(out)} pair crops → {a.run_dir / 'crops'}; manifest nbr_pairs.json")


if __name__ == "__main__":
    main()
