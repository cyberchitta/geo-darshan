#!/usr/bin/env python3
"""Split impure clusters by intersecting with other k-level rasters (kA ∩ kB).

For each flagged cluster of the primary segmentation, partition its pixels by
their id in a partner raster (coarser or finer k over the same grid). k-levels
don't nest, so a mixed kA cluster typically straddles several kB clusters —
the intersection yields more, more-uniform cells. Cells smaller than --min-px
are slivers and get folded into the cluster's largest surviving cell. If the
first partner leaves a flagged cluster unsplit (a single non-sliver cell), the
next partner is tried; if none splits it, it is kept intact and reported.

Unflagged clusters pass through with their original ids. Within a split
cluster, the largest cell KEEPS the parent id (so prior judgments partially
carry over); minority cells get new sequential ids starting after the primary
raster's max id. The mapping JSON records parentage for every new/kept cell.

Generic engine script (cluster-labeling skill). AOI-agnostic: all paths via args.

Usage:
  gen_intersection.py OUT.tif --seg k88.tif --with k22.tif [k44.tif ...] \
                      --ids 2 6 12 ... [--min-px 10] [--mapping OUT_mapping.json]
"""
import argparse
import json
from collections import Counter
from pathlib import Path

import numpy as np
import rasterio


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path, help="output cluster raster (.tif)")
    ap.add_argument("--seg", type=Path, required=True, help="primary cluster raster")
    ap.add_argument("--with", dest="partners", type=Path, nargs="+", required=True,
                    help="partner rasters, tried in order until a cluster splits")
    ap.add_argument("--ids", type=int, nargs="+", required=True,
                    help="flagged (impure) cluster ids to split")
    ap.add_argument("--min-px", type=int, default=10,
                    help="cells smaller than this are slivers, folded into the "
                         "cluster's largest cell (default 10)")
    ap.add_argument("--mapping", type=Path,
                    help="mapping JSON path (default: OUT stem + _mapping.json)")
    a = ap.parse_args()
    mapping_path = a.mapping or a.out.with_name(a.out.stem + "_mapping.json")

    src = rasterio.open(a.seg)
    seg = src.read(1)
    partners = []
    for p in a.partners:
        r = rasterio.open(p)
        assert r.shape == src.shape, f"{p} grid differs from {a.seg}"
        partners.append((p.stem, r.read(1)))

    out = seg.copy()
    next_id = int(seg.max()) + 1
    cells, unsplit, notes = {}, [], []

    for cid in sorted(set(a.ids)):
        mask = seg == cid
        if not mask.any():
            notes.append(f"c{cid}: not present in seg, skipped")
            continue
        chosen = None
        for pname, parr in partners:
            counts = Counter(parr[mask].tolist())
            keep = {pid: n for pid, n in counts.items() if n >= a.min_px}
            if len(keep) >= 2:
                chosen = (pname, parr, counts, keep)
                break
        if chosen is None:
            unsplit.append(cid)
            continue
        pname, parr, counts, keep = chosen
        # largest cell keeps the parent id; others get new ids
        order = sorted(keep, key=keep.get, reverse=True)
        sliver_px = sum(n for pid, n in counts.items() if pid not in keep)
        for rank, pid in enumerate(order):
            new = cid if rank == 0 else next_id
            if rank > 0:
                out[mask & (parr == pid)] = new
                next_id += 1
            px = keep[pid] + (sliver_px if rank == 0 else 0)
            cells[new] = {"parent": cid, "partner": pname, "partner_id": int(pid),
                          "px": int(px)}
        # slivers → largest cell (which kept the parent id: already has it in out)
        if sliver_px:
            sliver_ids = [pid for pid in counts if pid not in keep]
            sl = mask & np.isin(parr, sliver_ids)
            out[sl] = cid
            cells[cid]["sliver_px_absorbed"] = int(sliver_px)

    profile = src.profile
    a.out.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(a.out, "w", **profile) as dst:
        dst.write(out.astype(profile["dtype"]), 1)

    meta = {
        "seg": str(a.seg), "partners": [str(p) for p in a.partners],
        "flagged_ids": sorted(set(a.ids)), "min_px": a.min_px,
        "n_clusters_out": int(len(np.unique(out[out >= 0]))),
        "unsplit": unsplit, "notes": notes,
        "cells": {str(k): v for k, v in sorted(cells.items())},
    }
    mapping_path.write_text(json.dumps(meta, indent=2))

    # summary
    by_parent = Counter(v["parent"] for v in cells.values())
    print(f"wrote {a.out}  ({meta['n_clusters_out']} clusters, next free id {next_id})")
    print(f"mapping: {mapping_path}")
    for cid in sorted(by_parent):
        parts = {k: v for k, v in cells.items() if v["parent"] == cid}
        det = ", ".join(f"{k}({v['px']}px←{v['partner']}:{v['partner_id']})"
                        for k, v in sorted(parts.items()))
        print(f"  c{cid} → {by_parent[cid]} cells: {det}")
    if unsplit:
        print(f"  UNSPLIT (single cell under all partners): {unsplit}")
    for n in notes:
        print(f"  note: {n}")


if __name__ == "__main__":
    main()
