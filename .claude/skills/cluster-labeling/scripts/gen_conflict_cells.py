#!/usr/bin/env python3
"""Rank cells by how much PRIOR-MAP area the current label overrules.

Why this exists: session 14 computed a "41 cells / 80,812 px / 14.57% of the old
map's labelled area" set, sized the next adjudication pass from it, and did not
persist the derivation. Session 15 could not reproduce it, and in particular
could not reproduce "32 of the 41 already have crops, only 9 need rendering" —
every reconstruction puts the disagreement in the UNCARDED cells, which are the
big ones. The definition lives here now, and the output is a file.

DEFINITION (change it here, not in prose):
  - prior-map class per cell = argmax of `prior_labels.json` `old_dist` after
    dropping --nodata-class, which claims nothing and must not count as a
    contradiction.
  - current label per cell, in precedence order:
        ledger.json > this run's cluster_to_label.json > --fallback-labels
  - a cell CONFLICTS when the two are NON-NESTED: neither dotted path is a
    prefix of the other. Parent/child is a refinement, not a contradiction.
  - conflict_px = n_px(cell) * share(dominant prior class) — the prior-map
    pixels actually contradicted, not the whole cell.

Ranking by conflict_px is the point: a maintainer works down the list and can
stop anywhere knowing what fraction of the disagreement is resolved.

Usage:
  gen_conflict_cells.py RUN_DIR [--fallback-labels ../vlm_label_k88/cluster_to_label.json]
                                [--mapping ../clusters/k88xk22_s42_mapping.json]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import statistics
from pathlib import Path


def read_json(p: Path, default):
    return json.loads(p.read_text()) if p and p.exists() else default


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=Path)
    ap.add_argument("--fallback-labels", type=Path,
                    help="cluster_to_label.json of an earlier round, for cells this run never judged")
    ap.add_argument("--mapping", type=Path, help="intersection mapping JSON, to mark split children")
    ap.add_argument("--nodata-class", default="code255")
    ap.add_argument("--out", default="conflict_cells.json")
    a = ap.parse_args()
    run = a.run_dir

    prior = read_json(run / "prior_labels.json", {})
    ledger = read_json(run / "ledger.json", {}).get("clusters", {})
    cur = read_json(run / "cluster_to_label.json", {})
    fallback = read_json(a.fallback_labels, {}) if a.fallback_labels else {}
    split = set(map(int, read_json(a.mapping, {}).get("cells", {}))) if a.mapping else set()
    carded = set(map(int, ledger))

    have_crops = set()
    cd = run / "crops"
    if cd.is_dir():
        have_crops = {int(m.group(1)) for f in os.listdir(cd)
                      if (m := re.match(r"c(\d+)_e\d+_raw\.jpg$", f))}

    def best(cid: str):
        if cid in ledger and ledger[cid].get("label"):
            return ledger[cid]["label"], "ledger"
        if cid in cur:
            return cur[cid]["label"], "current"
        if cid in fallback:
            return fallback[cid]["label"], "fallback"
        return None, None

    aoi_px = sum(v["n_px"] for v in prior.values())
    labelled_px = sum(v["n_px"] * s for v in prior.values()
                      for c, s in v["old_dist"].items() if c != a.nodata_class)

    rows = []
    for cid in sorted(int(k) for k in prior):
        p = prior[str(cid)]
        dist = {c: s for c, s in p["old_dist"].items() if c != a.nodata_class}
        if not dist:
            continue
        old, share = max(dist.items(), key=lambda kv: kv[1])
        new, src = best(str(cid))
        if not new:
            continue
        if new == old or new.startswith(old + ".") or old.startswith(new + "."):
            continue
        rows.append({"cell": cid, "cell_px": p["n_px"],
                     "conflict_px": round(p["n_px"] * share),
                     "old_label": old, "old_purity": share, "new_label": new,
                     "label_source": src, "carded": cid in carded,
                     "has_crops": cid in have_crops, "split_child": cid in split})

    rows.sort(key=lambda r: -r["conflict_px"])
    total = sum(r["conflict_px"] for r in rows)
    cum = 0
    for r in rows:
        cum += r["conflict_px"]
        r["cum_share_of_disagreement"] = round(cum / total, 4) if total else 0

    need = [r["cell"] for r in rows if not r["has_crops"]]
    (run / a.out).write_text(json.dumps({
        "run": run.name,
        "defs_version": read_json(run / "ledger.json", {}).get("defs_version"),
        "definition": "non-nested disagreement vs argmax(old_dist minus "
                      f"{a.nodata_class}); conflict_px = cell_px * old_purity",
        "aoi_px": aoi_px, "prior_labelled_px": round(labelled_px),
        "n_conflict_cells": len(rows), "total_conflict_px": total,
        "conflict_share_of_labelled": round(total / labelled_px, 4) if labelled_px else 0,
        "cells_needing_crops": need, "cells": rows}, indent=2))

    print(f"AOI {aoi_px:,} px | prior-map labelled {labelled_px:,.0f} px "
          f"({100*labelled_px/aoi_px:.2f}%)")
    print(f"{len(rows)} conflicting cells | {total:,} px overruled = "
          f"{100*total/labelled_px:.2f}% of the prior map's labelled area")
    for tag, sel in (("carded", [r for r in rows if r["carded"]]),
                     ("uncarded", [r for r in rows if not r["carded"]])):
        print(f"  {tag:9s} {len(sel):3d} cells -> "
              f"{100*sum(r['conflict_px'] for r in sel)/labelled_px:5.2f}% of labelled")
    print(f"  cells with NO crops on disk: {len(need)} -> {need}")
    print("\nconcentration curve:")
    for n in (5, 10, 20, 30, 41, 50, len(rows)):
        if n <= len(rows):
            print(f"  top {n:3d}: {100*rows[n-1]['cum_share_of_disagreement']:5.1f}% of the "
                  f"disagreement, {sum(1 for r in rows[:n] if not r['has_crops'])} need crops")
    if len(rows) >= 41:
        print(f"\nmedian prior purity over top 41: "
              f"{100*statistics.median(r['old_purity'] for r in rows[:41]):.1f}%")
    print(f"wrote {run / a.out}")


if __name__ == "__main__":
    main()
