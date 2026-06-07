#!/usr/bin/env python3
"""Merge per-exemplar judgments into the run outputs and vote a label per cluster.

Generic engine script (cluster-labeling skill). The judgments are produced by
whoever does the looking (Claude reading the crops in-harness, or an API model);
this script is the AOI-agnostic bookkeeping: attach judgments to the rendered
exemplars, then confidence-weighted vote → one label + agreement per cluster.

judgments.json: a JSON array of records, each at least
  {"cluster": int, "exemplar": int, "label": "dotted.path|uncertain",
   "confidence": 0-1, "level": "...", "alternative": "...|null", "reasoning": "..."}

Usage:
  aggregate.py RUN_DIR --judgments judgments.json [--model NAME]

Writes (in RUN_DIR): results.jsonl (with results filled in) and
cluster_to_label.json.
"""
import argparse
import json
from pathlib import Path


def aggregate(results):
    scores = {}
    valid = [r for r in results if r.get("label") not in (None, "error")]
    for r in valid:
        lbl = r.get("label", "uncertain")
        scores[lbl] = scores.get(lbl, 0.0) + float(r.get("confidence", 0.0))
    if not scores:
        return {"label": "uncertain", "confidence": 0.0, "agreement": 0.0, "n": len(results)}
    best = max(scores, key=scores.get)
    agree = sum(1 for r in valid if r.get("label") == best) / len(valid)
    confs = [float(r.get("confidence", 0.0)) for r in valid if r.get("label") == best]
    return {
        "label": best,
        "confidence": round(sum(confs) / len(confs), 3),
        "agreement": round(agree, 3),
        "n": len(valid),
        "votes": {k: round(v, 3) for k, v in scores.items()},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=Path)
    ap.add_argument("--judgments", type=Path, required=True)
    ap.add_argument("--model", default="claude (in-harness)")
    a = ap.parse_args()

    rows = [json.loads(l) for l in (a.run_dir / "results.jsonl").read_text().splitlines() if l.strip()]
    judgments = json.loads(a.judgments.read_text())
    by_key = {(j["cluster"], j["exemplar"]): j for j in judgments}

    missing = {(r["cluster"], r["exemplar"]) for r in rows} - set(by_key)
    extra = set(by_key) - {(r["cluster"], r["exemplar"]) for r in rows}
    if missing:
        print(f"⚠ {len(missing)} rendered exemplars have NO judgment: {sorted(missing)[:8]}...")
    if extra:
        print(f"⚠ {len(extra)} judgments have no matching crop: {sorted(extra)[:8]}...")

    by_cluster = {}
    with (a.run_dir / "results.jsonl").open("w") as f:
        for r in rows:
            j = by_key.get((r["cluster"], r["exemplar"]))
            if j:
                r["result"] = {k: j[k] for k in
                               ("label", "level", "confidence", "alternative", "reasoning")
                               if k in j}
                r["model"] = a.model
                by_cluster.setdefault(r["cluster"], []).append(r["result"])
            f.write(json.dumps(r) + "\n")

    labels = {str(c): aggregate(rs) for c, rs in sorted(by_cluster.items())}
    (a.run_dir / "cluster_to_label.json").write_text(json.dumps(labels, indent=2))
    for c, agg in labels.items():
        flag = "  ⚠ low agreement" if agg["agreement"] < 0.67 else ""
        print(f"cluster {c:>3}: {agg['label']:<42} conf {agg['confidence']:.2f} "
              f"agree {agg['agreement']:.2f}{flag}")


if __name__ == "__main__":
    main()
