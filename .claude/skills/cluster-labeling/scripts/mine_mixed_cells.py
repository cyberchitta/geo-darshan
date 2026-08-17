#!/usr/bin/env python3
"""Mine the impure-cell signal from a judged run.

Generic engine script (cluster-labeling skill). Sibling to
mine_missing_classes.py, and deliberately shaped the same way -- including its
CHANNEL ABSENT behaviour, for the same reason.

The gap this closes. The gate can only infer spatial impurity from exemplars
disagreeing WITH EACH OTHER (state SPLIT). It structurally cannot see a single
crop that is itself half orchard and half scrub: the reader was told to "give
the dominant class and note it", so the observation went into free-text
`reasoning` where nothing mechanical reads it. On k88xk22's 108 flips, 11 matched
a mixing-language regex; reading them, **4 clearly describe one crop holding two
covers with no common ancestor** (c78e2 laterite/scrub, c132e0 footpath/regrowth,
c153e0 straddling a shoreline, c188e2 plantation/cashew ecotone), 5 are marginal,
and 2 are false positives that matched contract language rather than an
observation. The regex is why the count needs a channel: prose cannot be counted.
One of the four -- c153e0 -- wrote "a carve-out candidate" unprompted, which is a
reader asking for a split with no field to put it in.

Three failures, kept apart (the prompt states them in the same order):

  uncertain        a limit of the IMAGERY     -- cannot see well enough
  no_class_fits    a limit of the CLASS LIST  -- nothing describes it
  mixed            a limit of the CELL        -- it holds two or more covers

What it reports

  A  declared mixes     every `mixed` record, with its parts and dominant share
  B  part pairs         which class pairs co-occur, ranked -- a pair that recurs
                        is a segmentation boundary the clustering missed, not a
                        labelling problem
  C  cluster rollup     clusters by count of mixed exemplars. A cluster whose
                        exemplars are MOSTLY mixed is a k-value finding: it
                        wants splitting, and no amount of re-judging fixes it
  D  vs the gate        cross-tab against ledger state. A cell the gate calls
                        SETTLED or OPEN while its exemplars report `mixed` is
                        the interesting disagreement -- the gate saw unanimity
                        because every reader picked the same DOMINANT class

CHANNEL ABSENT. If no verdict carries the `mixed` key, a zero count says the
readers had no way to report impurity -- it is evidence about the schema, not
about the ground. Reported explicitly so a future pass cannot misread silence,
which is the misreading that made the missing-class sweep prospective.

Usage
  mine_mixed_cells.py RUN_DIR
      [--verdicts 'rejudge_batch_*.json'] [--flips rejudge_flips.json]
      [--ledger ledger.json] [--json OUT]

Read-only: writes nothing into RUN_DIR unless --json names a path.
"""
import argparse
import glob
import json
from collections import Counter, defaultdict
from pathlib import Path


def load_verdicts(run_dir, verdicts_glob, flips_path):
    """-> [ {cluster, exemplar, label, mixed, ...}, ... ] from whichever exists."""
    out = []
    for path in sorted(glob.glob(str(run_dir / verdicts_glob))):
        blob = json.loads(Path(path).read_text())
        rows = blob if isinstance(blob, list) else blob.get("verdicts", [])
        for r in rows:
            if isinstance(r, dict) and "cluster" in r:
                out.append(r)
    if out:
        return out
    fp = run_dir / flips_path
    if fp.exists():
        blob = json.loads(fp.read_text())
        return blob.get("flips", []) if isinstance(blob, dict) else blob
    return out


def load_ledger(path):
    if not path.exists():
        return {}
    cl = json.loads(path.read_text()).get("clusters", [])
    rows = cl.values() if isinstance(cl, dict) else cl
    return {r["cluster"]: r for r in rows if isinstance(r, dict)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=Path)
    ap.add_argument("--verdicts", default="rejudge_batch_*.json")
    ap.add_argument("--flips", default="rejudge_flips.json")
    ap.add_argument("--ledger", default="ledger.json")
    ap.add_argument("--json", type=Path)
    a = ap.parse_args()

    verdicts = load_verdicts(a.run_dir, a.verdicts, a.flips)
    ledger = load_ledger(a.run_dir / a.ledger)
    report = {"n_verdicts": len(verdicts)}

    print(f"mine_mixed_cells: {len(verdicts)} verdicts from {a.run_dir}")

    # ---- the channel, and whether it was ever offered
    offered = any("mixed" in v for v in verdicts)
    declared = [
        {
            "cluster": v.get("cluster"),
            "exemplar": v.get("exemplar"),
            "label": v.get("label"),
            **{k: v["mixed"].get(k) for k in ("describes", "parts", "dominant_share")},
        }
        for v in verdicts
        if isinstance(v.get("mixed"), dict)
    ]

    print("\n" + "-" * 74)
    if not offered:
        print("  mixed: CHANNEL ABSENT from these verdicts.")
        print("  A zero count below is therefore evidence about the schema, not")
        print("  about the ground -- readers had no way to report an impure cell.")
        print("  Do not read it as the cells being pure. The gate's SPLIT state is")
        print("  NOT a substitute: it sees exemplars disagreeing with each other,")
        print("  never a single crop that is half one thing and half another.")
        report["mixed"] = {"channel_offered": False, "declared": []}
        if a.json:
            a.json.write_text(json.dumps(report, indent=2))
        return

    print(f"  mixed: channel present; {len(declared)} of {len(verdicts)} "
          f"verdicts reported an impure cell")

    # ---- A. the declarations
    print("\nA  declared mixes")
    for d in declared[:25]:
        share = d.get("dominant_share")
        share = f"{share:.0%}" if isinstance(share, (int, float)) else "?"
        print(f"    c{d['cluster']}e{d['exemplar']} [{d.get('label')}] "
              f"dominant={share}  {str(d.get('describes'))[:60]}")
    if len(declared) > 25:
        print(f"    ... and {len(declared) - 25} more (all in --json)")

    # ---- B. which class pairs co-occur
    pairs = Counter()
    for d in declared:
        ps = [p for p in (d.get("parts") or []) if p]
        for i in range(len(ps)):
            for j in range(i + 1, len(ps)):
                pairs[tuple(sorted((ps[i], ps[j])))] += 1
    print("\nB  co-occurring part pairs -- a recurring pair is a segmentation")
    print("   boundary the clustering missed, not a labelling problem")
    for (x, y), n in pairs.most_common(12):
        print(f"    {n:3d}  {x}  +  {y}")
    if not pairs:
        print("    (no `parts` populated on any declaration)")

    # ---- C. per-cluster rollup
    by_cluster = defaultdict(list)
    for d in declared:
        by_cluster[d["cluster"]].append(d)
    totals = Counter(v.get("cluster") for v in verdicts)
    print("\nC  clusters by mixed share -- a mostly-mixed cluster is a k-value")
    print("   finding: it wants splitting, and re-judging cannot fix it")
    rows = sorted(by_cluster.items(),
                  key=lambda kv: -(len(kv[1]) / max(totals.get(kv[0], 1), 1)))
    for c, ds in rows[:15]:
        tot = totals.get(c, 0)
        print(f"    c{c}: {len(ds)}/{tot} exemplars mixed"
              + (f"   ledger={ledger[c]['state']}" if c in ledger else ""))

    # ---- D. against the gate
    if ledger:
        print("\nD  vs the gate -- a cell the gate calls SETTLED or OPEN while its")
        print("   exemplars report `mixed` is the interesting disagreement: the")
        print("   gate saw unanimity because every reader picked the same dominant")
        tab = Counter(ledger[c]["state"] for c in by_cluster if c in ledger)
        for state, n in tab.most_common():
            flag = "  <-- look here" if state in ("SETTLED", "OPEN") else ""
            print(f"    {n:3d}  {state}{flag}")
        report["vs_gate"] = dict(tab)

    report["mixed"] = {"channel_offered": True, "declared": declared}
    report["part_pairs"] = [{"parts": list(k), "n": v} for k, v in pairs.most_common()]
    if a.json:
        a.json.write_text(json.dumps(report, indent=2))
        print(f"\nwrote {a.json}")


if __name__ == "__main__":
    main()
