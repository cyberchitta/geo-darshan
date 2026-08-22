#!/usr/bin/env python3
"""Write RUN_DIR/geo.txt — the per-cell geography line that rides on every card.

Why this exists: it did not. `gen_round_cards.py` reads `geo.txt`, and the
reader agent is told outright that "each exemplar comes with a compass direction
and distance from the AOI centre" — but nothing in this skill wrote the file.
The one on disk was cut on 2026-07-05 by the deleted `vlm_label_prototype.py`,
so the first round rendered into a fresh run directory would have carded 178
cells with `geo: ""` and a reader definition promising an input the card did not
carry. Found while setting up the 2026-08-22 round (worklist T90).

Format, kept byte-compatible with the file the prototype wrote, because
`gen_round_cards.py` stores the whole line verbatim as the card's `geo` string
and the reader reads it as prose:

    c2 (2640px, from k88 c2) | e0:W 1.0km 102px, e1:SE 0.6km 59px, e2:NE 1.1km 58px

  * `2640px` is the CELL's size on the cluster raster (10 m pixels), not the
    exemplar's.
  * `from k88 c2` is the parent cell when the segmentation is an intersection
    raster (`gen_intersection.py` writes the parentage); absent otherwise. It is
    the reason a bare `cNN` is ambiguous between a run and its parent, which is
    also why `corrections.md` has to name its segmentation.
  * `e0:W 1.0km 102px` is the exemplar's compass sector and distance from the
    AOI centre, then that exemplar's connected-component size in cluster pixels.

**Per exemplar, never per cluster centroid.** A k-means cell's pixels are
scattered across the whole AOI, so its centroid frequently lands in a cell of a
different class entirely; the AOI pack says this twice and it is the whole
reason the line enumerates exemplars instead of naming one direction.

Sector convention is the AOI pack's, unchanged: `brg = (90 - deg(atan2(dLat,
dLon))) % 360`, `idx = round(brg / 45) % 8` over [N, NE, E, SE, S, SW, W, NW].
That formula works in raw degrees, where a degree of longitude is ~2% shorter
than one of latitude at this latitude — far inside a 45 degree sector, so it is
kept as written rather than silently "corrected" into a different convention.
The *distance* is metric and does correct for it, because 2% of 3 km is not
noise you want in a number the reader reads as a measurement.

Usage:
  gen_geo.py RUN_DIR --center 79.8106 12.0058 \
    [--seg clusters/k88xk22_s42.tif] [--mapping clusters/k88xk22_s42_mapping.json]
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
KM_PER_DEG_LAT = 110.574


def sector(dlon: float, dlat: float) -> str:
    brg = (90 - math.degrees(math.atan2(dlat, dlon))) % 360
    return SECTORS[round(brg / 45) % 8]


def km(dlon: float, dlat: float, lat: float) -> float:
    x = dlon * 111.320 * math.cos(math.radians(lat))
    y = dlat * KM_PER_DEG_LAT
    return math.hypot(x, y)


def cell_px(mapping: dict, seg_counts: dict, cid: int) -> int | None:
    rec = mapping.get(str(cid))
    if rec and rec.get("px") is not None:
        return int(rec["px"])
    return seg_counts.get(cid)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("run_dir", type=Path)
    ap.add_argument("--center", type=float, nargs=2, required=True,
                    metavar=("LON", "LAT"), help="AOI centre, from the AOI pack")
    ap.add_argument("--results", default="results.jsonl")
    ap.add_argument("--seg", type=Path,
                    help="cluster raster — used for cell size when there is no "
                         "intersection mapping, or the mapping omits a cell")
    ap.add_argument("--mapping", type=Path,
                    help="gen_intersection.py's parentage JSON, if the "
                         "segmentation is an intersection raster")
    ap.add_argument("--out", default="geo.txt")
    a = ap.parse_args()

    clon, clat = a.center

    rows: dict[int, list[tuple[int, float, float, int]]] = {}
    with (a.run_dir / a.results).open() as fh:
        for line in fh:
            if not line.strip():
                continue
            r = json.loads(line)
            lon, lat = r["center"]
            rows.setdefault(r["cluster"], []).append(
                (r["exemplar"], lon, lat, r.get("size_px")))

    mapping, parent_seg = {}, None
    if a.mapping:
        blob = json.loads(a.mapping.read_text())
        mapping = blob.get("cells", {})
        parent_seg = Path(blob.get("seg", "")).stem.replace("_s42", "") or None

    seg_counts: dict[int, int] = {}
    if a.seg:
        import numpy as np
        import rasterio
        with rasterio.open(a.seg) as src:
            arr = src.read(1)
        ids, counts = np.unique(arr[arr >= 0], return_counts=True)
        seg_counts = {int(i): int(c) for i, c in zip(ids, counts)}

    lines, no_px, no_parent = [], [], 0
    for cid in sorted(rows):
        px = cell_px(mapping, seg_counts, cid)
        head = f"c{cid}"
        bits = []
        if px is not None:
            bits.append(f"{px}px")
        else:
            no_px.append(cid)
        rec = mapping.get(str(cid))
        if rec and parent_seg and rec.get("parent") is not None:
            bits.append(f"from {parent_seg} c{rec['parent']}")
        else:
            no_parent += 1
        if bits:
            head += f" ({', '.join(bits)})"

        exs = []
        for ex, lon, lat, size_px in sorted(rows[cid]):
            d = km(lon - clon, lat - clat, lat)
            s = sector(lon - clon, lat - clat)
            tail = f" {size_px}px" if size_px is not None else ""
            exs.append(f"e{ex}:{s} {d:.1f}km{tail}")
        lines.append(f"{head} | {', '.join(exs)}")

    dest = a.run_dir / a.out
    dest.write_text("\n".join(lines) + "\n")
    n_ex = sum(len(v) for v in rows.values())
    print(f"wrote {dest}: {len(lines)} cells, {n_ex} exemplars")
    # Said out loud rather than left to inference: a card whose geo line is
    # missing a clause is a card the reader was promised something on and did
    # not get, and the reader cannot tell the difference from the line alone.
    if no_px:
        print(f"NO CELL SIZE for {len(no_px)} cells (no --mapping entry and no "
              f"--seg): {no_px[:10]}{' ...' if len(no_px) > 10 else ''}")
    if no_parent and mapping:
        # Not a defect: gen_intersection.py records an entry only for a cell it
        # actually split, so a parent that was never flagged keeps its id and
        # has no `cells` entry. Its line is right to omit the clause -- there is
        # no second raster its id could be confused with.
        print(f"no parentage clause for {no_parent} cells — cells the mapping "
              f"never split, which keep their own id")
    elif not mapping:
        print("no --mapping given: lines carry no parent cell")


if __name__ == "__main__":
    main()
