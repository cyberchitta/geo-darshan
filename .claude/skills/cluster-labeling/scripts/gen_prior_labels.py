#!/usr/bin/env python3
"""Cross-tab each cluster cell against a prior label raster.

The prior map is an INDEPENDENT observation, usually made at a different time
from the basemap imagery. That is the whole value: it can know things the photo
cannot show. The motivating case is seasonal water — a tank that is a dry pale
bed on the imagery date is still a tank, and the prior map has it as water.
A reader looking only at the photo calls it fallow or barren.

Three distinct uses for the output, in decreasing authority:

  1. FREEZE — for classes the prior map is known to get right (name them with
     --authoritative), a dominant share means inherit, do not re-judge.
  2. EVIDENCE — for everything else, show the distribution to the reader as real
     positional evidence: below what they can see in the crops, above any coarse
     textual geography prior (which is usually this same map, eyeballed down to a
     compass sector). Authority stays per-class, never blanket, or "the old map
     says X" becomes the next default.
  3b. SURROUNDINGS — where a cell's own cross-tab is mostly unmapped raster codes
     there is no positional evidence for it, and the reader is told to fall back
     to the prior map's neighbours. That fallback needs an input: `old_dist_ring`
     is the same cross-tab over a ring of pixels *around* the cell. Emitted only
     when the cell's own distribution is uninformative, because the surroundings
     must not become a default for cells that have evidence of their own.
  3. SPLIT SIGNAL — a cell straddling two prior classes (e.g. 30% water / 70%
     plantation) is impure along a real boundary such as a shoreline, and wants a
     carve-out rather than one label.

CELL SCALE IS LEAD, NOT AN IMPLEMENTATION DETAIL. Do not add a mode that
aggregates over a window around an exemplar, or looks the prior label up at a
single exemplar's footprint. What makes this cross-tab trustworthy is that a
cell's pixels are scattered across the AOI, so it samples the old map at many
near-independent locations and one bad polygon barely moves the distribution. A
local window sits inside one or two polygons, and coarse-map error is spatially
correlated — so a single mapping mistake comes back as a confident "local: 70% X"
and reads as independent evidence. That converts the map's weakest property into
its most persuasive output.

Usage:
  python gen_prior_labels.py RUN_DIR --seg SEG.tif --old OLD.tif \\
      --mapping pixel-mapping.json [--authoritative water --freeze-share 0.5]
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np
from scipy import ndimage
import rasterio
from rasterio.enums import Resampling


RAW_CODE = re.compile(r"code\d+")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=Path)
    ap.add_argument("--seg", type=Path, required=True)
    ap.add_argument("--old", type=Path, required=True)
    ap.add_argument("--mapping", type=Path, required=True)
    ap.add_argument("--authoritative", nargs="*", default=[],
                    help="prior classes trusted enough to freeze (dotted path prefix)")
    ap.add_argument("--freeze-share", type=float, default=0.5)
    ap.add_argument("--top", type=int, default=4)
    ap.add_argument("--nodata-share", type=float, default=0.5,
                    help="a cell whose old_dist is at least this much unmapped raw "
                         "code carries no positional evidence of its own; it gets "
                         "old_dist_ring, the prior map's distribution around it")
    ap.add_argument("--ring-px", type=int, default=3,
                    help="width in cluster pixels of the ring cross-tabbed for "
                         "old_dist_ring")
    args = ap.parse_args()

    mapping = {int(k): v for k, v in json.loads(args.mapping.read_text()).items()}

    with rasterio.open(args.seg) as seg:
        seg_arr = seg.read(1)
        with rasterio.open(args.old) as old:
            # Nearest onto the cluster grid: labels, never interpolate.
            old_arr = old.read(1, out_shape=seg_arr.shape, resampling=Resampling.nearest)

    out = {}
    frozen = {}
    n_ring = 0
    for cid in np.unique(seg_arr[seg_arr >= 0]):
        mask = seg_arr == cid
        vals, cnt = np.unique(old_arr[mask], return_counts=True)
        total = int(cnt.sum())
        pairs = sorted(zip(vals, cnt), key=lambda t: -t[1])
        dist = {mapping.get(int(v), f"code{int(v)}"): round(float(c) / total, 3)
                for v, c in pairs}
        rec = {"n_px": total, "old_dist": dict(list(dist.items())[: args.top])}

        # No positional evidence of its own -> cross-tab the ring around it. The
        # instruction ("fall back to the prior map's neighbours") named no input
        # and the card carried none, so a reader that hit a nodata cell was told
        # to consult something that was not there. Measured on k88xk22: 13 of 191
        # cells are >50% unmapped code, six of them over 98%.
        raw_share = sum(sc for lbl, sc in dist.items() if RAW_CODE.fullmatch(lbl))
        if raw_share >= args.nodata_share:
            ring = ndimage.binary_dilation(mask, iterations=args.ring_px) & ~mask
            rvals, rcnt = np.unique(old_arr[ring], return_counts=True)
            rtot = int(rcnt.sum())
            if rtot:
                rpairs = sorted(zip(rvals, rcnt), key=lambda t: -t[1])
                rdist = {mapping.get(int(v), f"code{int(v)}"): round(float(c) / rtot, 3)
                         for v, c in rpairs}
                rec["old_dist_ring"] = dict(list(rdist.items())[: args.top])
                rec["ring_px"] = rtot
                rec["own_dist_uninformative"] = round(raw_share, 3)
                n_ring += 1

        for cls in args.authoritative:
            share = sum(s for lbl, s in dist.items()
                        if lbl == cls or lbl.startswith(cls + "."))
            if share >= args.freeze_share:
                rec["freeze"] = {"label": cls, "share": round(share, 3)}
                frozen[int(cid)] = rec["freeze"]
                break
        out[int(cid)] = rec

    dest = args.run_dir / "prior_labels.json"
    dest.write_text(json.dumps(out, indent=1))
    print(f"wrote {dest} for {len(out)} cells")
    print(f"no positional evidence of their own (>={args.nodata_share:.0%} unmapped "
          f"code): {n_ring} cells, each given old_dist_ring over a "
          f"{args.ring_px}px ring")
    if args.authoritative:
        print(f"freeze candidates (>= {args.freeze_share} of an authoritative class): {len(frozen)}")
        for cid, f in sorted(frozen.items(), key=lambda t: -t[1]["share"]):
            print(f"  c{cid}: {f['label']} {f['share']:.2f}")


if __name__ == "__main__":
    main()
