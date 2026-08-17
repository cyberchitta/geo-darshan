#!/usr/bin/env python3
"""Diff a round's verdicts against the baseline it was judged blind against.

This is the measurement a blind round exists to produce: **does a corrected
class contract change the reading?** It is not a quality score for either round.
A high disagreement rate says the contract moved the answer, which is an argument
for not spending adjudication on the older round; a low one says the older
round's output is still worth ruling on.

Read the two rates apart, because they mean opposite things:

  concurrence   — same label, independently reached. This is the signal
                  `convergence-loop.md` prescribes in place of mean confidence,
                  which fails 101/102 clusters and does not discriminate. It only
                  counts if the round was blind; `--blind-check` refuses to
                  report it otherwise.
  nested drift  — the two labels differ only in depth (`orchards` vs
                  `orchards.cashew`). That is a refinement, not a contradiction,
                  and must not be counted as the contract having changed the call.
  real change   — non-nested. The two rounds name incompatible covers.

Usage:
  compare_rounds.py RUN_DIR --verdicts 'r4_batch_*.json' --baseline r4_baseline.json
"""
from __future__ import annotations

import argparse
import glob
import json
from collections import Counter, defaultdict
from pathlib import Path


def nested(a: str, b: str) -> bool:
    return a == b or a.startswith(b + ".") or b.startswith(a + ".")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=Path)
    ap.add_argument("--verdicts", default="r4_batch_*.json")
    ap.add_argument("--baseline", default="r4_baseline.json")
    ap.add_argument("--out", default="round_comparison.json")
    ap.add_argument("--blind-check", action=argparse.BooleanOptionalAction, default=True)
    a = ap.parse_args()
    run = a.run_dir

    bl = json.loads((run / a.baseline).read_text())
    if a.blind_check and not bl.get("blind", False):
        raise SystemExit(
            f"{a.baseline} was not generated blind. Concurrence is not "
            "interpretable from a primed round — rerun with --no-blind-check "
            "to get the raw diff only.")
    base = {(r["cluster"], r["exemplar"]): r["label"] for r in bl["records"]}

    new: dict[tuple[int, int], dict] = {}
    for p in sorted(glob.glob(str(run / a.verdicts))):
        blob = json.loads(Path(p).read_text())
        rows = blob if isinstance(blob, list) else blob.get("verdicts", [])
        for r in rows:
            if isinstance(r, dict) and "cluster" in r:
                new[(r["cluster"], r["exemplar"])] = r
    if not new:
        raise SystemExit(f"no verdicts matched {a.verdicts} in {run}")

    both = sorted(set(base) & set(new))
    only_new = sorted(set(new) - set(base))
    missing = sorted(set(base) - set(new))

    tal = Counter()
    changes, by_pair = [], Counter()
    per_cell: dict[int, Counter] = defaultdict(Counter)
    channels = Counter()
    for k in both:
        old_l, rec = base[k], new[k]
        nl = rec.get("label", "")
        if nl == old_l:
            tal["identical"] += 1
            per_cell[k[0]]["same"] += 1
        elif nested(nl, old_l):
            tal["nested_drift"] += 1
            per_cell[k[0]]["nested"] += 1
        else:
            tal["real_change"] += 1
            per_cell[k[0]]["changed"] += 1
            by_pair[(old_l, nl)] += 1
            changes.append({"cluster": k[0], "exemplar": k[1], "from": old_l,
                            "to": nl, "confidence": rec.get("confidence"),
                            "reasoning": rec.get("reasoning", "")})
    for rec in new.values():
        if rec.get("no_class_fits"):
            channels["no_class_fits"] += 1
        if rec.get("mixed"):
            channels["mixed"] += 1
        if rec.get("label") == "uncertain":
            channels["uncertain"] += 1

    n = len(both)
    conc = tal["identical"] / n if n else 0
    print(f"compared {n} exemplars present in both rounds")
    if only_new:
        print(f"  {len(only_new)} judged this round with no baseline (new coverage)")
    if missing:
        print(f"  WARNING: {len(missing)} baseline exemplars NOT judged this round: "
              f"{missing[:10]}{'...' if len(missing) > 10 else ''}")
    print()
    print(f"  identical      {tal['identical']:4d}  {100*tal['identical']/n:5.1f}%   <- independent concurrence")
    print(f"  nested drift   {tal['nested_drift']:4d}  {100*tal['nested_drift']/n:5.1f}%   (refinement, not contradiction)")
    print(f"  real change    {tal['real_change']:4d}  {100*tal['real_change']/n:5.1f}%   <- the contract moved the call")
    print()
    print(f"channels fired: {dict(channels) or 'none'}")

    if by_pair:
        print("\ntop label movements (non-nested):")
        for (o, nn), c in by_pair.most_common(12):
            print(f"  {c:3d}  {o} -> {nn}")

    unstable = sorted(((c, v) for c, v in per_cell.items() if v["changed"]),
                      key=lambda kv: -kv[1]["changed"])
    print(f"\ncells with >=1 real change: {len(unstable)} of {len(per_cell)}")
    for c, v in unstable[:12]:
        tot = sum(v.values())
        print(f"  c{c:<4d} {v['changed']}/{tot} exemplars changed")

    (run / a.out).write_text(json.dumps({
        "run": run.name, "baseline": a.baseline, "verdicts": a.verdicts,
        "blind": bl.get("blind"),
        "n_compared": n, "concurrence": round(conc, 4),
        "tally": dict(tal), "channels": dict(channels),
        "n_new_coverage": len(only_new), "n_missing": len(missing),
        "missing": missing,
        "label_movements": [{"from": o, "to": nn, "n": c}
                            for (o, nn), c in by_pair.most_common()],
        "changes": changes}, indent=2))
    print(f"\nwrote {run / a.out}")
    print("\nNOTE: concurrence is evidence only if this round was blind and the "
          "verifier did not read the baseline. Both are enforced upstream, not here.")


if __name__ == "__main__":
    main()
