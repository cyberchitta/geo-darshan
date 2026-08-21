#!/usr/bin/env python3
"""Mine the standing missing-class signals from a judged run.

Generic engine script (cluster-labeling skill). Implements the signal-mining side
of "Coarse-scale hierarchy, fine-scale cells" in references/convergence-loop.md,
which was specified there and previously unbuilt.

A class that does not exist cannot be chosen, so the cell takes the nearest
catch-all and the forcing leaves no trace. These are the traces it does leave:

  A  share vs confidence   a class whose share grows while mean confidence falls
  B  non-nested disagree   readers disagreeing with NO common ancestor -- that is
                           a missing class, not the spatial impurity SPLIT assumes
  C  parent-level retreat  a verdict sitting on a non-leaf node is a reader
                           declining to commit to any child: the clearest single
                           trace of a missing leaf
  D  dead classes          nodes never chosen at all. A dead class is a hierarchy
                           defect too -- it costs every reader attention and
                           returns nothing discriminative

Signal B is specified in the loop doc as "non-nested AND uniformly low
confidence". Measured on k88xk22 the confidence leg did not discriminate: all 266
verdicts ran 0.30-0.75, median 0.45, so every disagreement was "low confidence".
--conf-max defaults to off for that reason; pass it only where confidence has
been shown to separate.

Usage
  mine_missing_classes.py RUN_DIR --hierarchy land-cover.json
      [--verdicts 'rejudge_batch_*.json'] [--flips rejudge_flips.json]
      [--ledger ledger.json] [--conf-max FLOAT] [--json OUT]

--flips supplies signal A's `before` labels and takes EITHER shape: a flips list
(records carrying `prev_label`) or a round baseline (`{"records": [...]}`, whose
`label` IS the prior). Pass the file belonging to the round you are mining --
`r4_baseline.json` for round 4, not the earlier pass's `rejudge_flips.json`,
which loads happily and covers a third of the verdicts. The header line reports
the coverage for exactly that reason.

Read-only: writes nothing into RUN_DIR unless --json names a path.
"""
import argparse
import glob
import json
import re
import statistics as st
from collections import Counter, defaultdict
from pathlib import Path

# ---------------------------------------------------------------- label paths


def parts(label):
    return [p for p in (label or "").split(".") if p]


def walk(node, prefix=""):
    """Yield every class path in the hierarchy, skipping _description keys."""
    if not isinstance(node, dict):
        return
    for k, v in node.items():
        if k.startswith("_"):
            continue
        path = f"{prefix}.{k}" if prefix else k
        yield path
        yield from walk(v, path)


def resolve(hierarchy, label):
    node = hierarchy
    for p in parts(label):
        if not isinstance(node, dict) or p not in node:
            return None
        node = node[p]
    return node


def is_leaf(hierarchy, label):
    node = resolve(hierarchy, label)
    if node is None:
        return None
    if not isinstance(node, dict):
        return True
    return not any(k for k in node if not k.startswith("_"))


def common_ancestor(labels):
    seqs = [parts(l) for l in labels]
    if not seqs:
        return []
    out = []
    for i in range(min(len(s) for s in seqs)):
        if len({s[i] for s in seqs}) != 1:
            break
        out.append(seqs[0][i])
    return out


# ---------------------------------------------------------------- forced-fit text

FORCED_FIT = {
    "no class fits": r"no (existing )?(class|label|category)|none of the (classes|labels)"
    r"|nothing (in the hierarchy|fits)",
    "nearest/closest": r"\b(nearest|closest)\b.{0,40}\b(class|label|fit|match)",
    "for lack of": r"for lack of|in the absence of|default(s|ed)? to|falls? back|catch-all",
    "neither/not really": r"\bneither\b|does not (really )?fit|doesn.t (really )?fit"
    r"|poor fit|awkward fit|imperfect fit",
    "least-bad": r"least[- ]bad|best available|only option|closest available",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=Path)
    ap.add_argument("--hierarchy", required=True, type=Path)
    ap.add_argument("--verdicts", default="rejudge_batch_*.json",
                    help="glob, relative to RUN_DIR")
    ap.add_argument("--flips", default="rejudge_flips.json")
    ap.add_argument("--ledger", default="ledger.json")
    ap.add_argument("--conf-max", type=float, default=None,
                    help="signal B: also require every exemplar below this. "
                         "Off by default -- see module docstring.")
    ap.add_argument("--json", type=Path, help="write the report as JSON too")
    a = ap.parse_args()

    hierarchy = json.loads(a.hierarchy.read_text())
    nodes = list(walk(hierarchy))

    verdicts = []
    for p in sorted(glob.glob(str(a.run_dir / a.verdicts))):
        verdicts.extend(json.loads(Path(p).read_text()))
    if not verdicts:
        raise SystemExit(f"no verdicts matched {a.run_dir / a.verdicts}")

    flips, priors_src = [], None
    fp = a.run_dir / a.flips
    if fp.exists():
        raw = json.loads(fp.read_text())
        if isinstance(raw, dict) and "records" in raw:
            # a per-round BASELINE: the label every exemplar carried ENTERING
            # the round, one record per exemplar. A flips file lists only the
            # exemplars that moved, so it leaves the rest with no prior and
            # signal A silently reads `before == after` for them.
            flips = [dict(r, prev_label=r.get("label")) for r in raw["records"]]
        else:
            flips = raw.get("flips", raw) if isinstance(raw, dict) else raw
        priors_src = fp.name

    # exemplar px, so share is by area rather than by count
    weight = {}
    lp = a.run_dir / a.ledger
    if lp.exists():
        for c, rec in json.loads(lp.read_text())["clusters"].items():
            n = rec.get("n_exemplars") or 0
            if n:
                weight[int(c)] = (rec.get("exemplar_px") or 0) / n

    # ------------------------------------------------------------ A
    prev_of = {(f["cluster"], f["exemplar"]): f["prev_label"] for f in flips}

    # Signal A is a BEFORE/AFTER comparison, so a verdict with no prior is not
    # neutral: it falls back to `before = after` and reads as "did not move".
    # A prior file from a DIFFERENT round exists, loads, and covers only part of
    # the verdict set -- silently flattening the deltas it is meant to measure.
    # State the coverage so that cannot pass unnoticed.
    covered = sum(1 for v in verdicts if (v["cluster"], v["exemplar"]) in prev_of)
    report = {"n_verdicts": len(verdicts), "n_flips": len(flips),
              "n_nodes": len(nodes), "priors_src": priors_src,
              "priors_covered": covered}
    print(f"verdicts {len(verdicts)}   flips {len(flips)}   "
          f"hierarchy nodes {len(nodes)}")
    if priors_src is None:
        print(f"  !! NO PRIOR LABELS ({a.flips} not found) -- signal A's `before`"
              f" column is a copy of `after` and every delta is 0")
    else:
        pct = 100.0 * covered / len(verdicts)
        flag = "" if covered == len(verdicts) else "   <== PARTIAL, deltas understated"
        print(f"  priors from {priors_src}: {covered}/{len(verdicts)} verdicts"
              f" have a prior ({pct:.0f}%){flag}")
        if covered == 0:
            print("  !! no verdict matched a prior -- wrong round's file?")
    before, after, confs = defaultdict(float), defaultdict(float), defaultdict(list)
    total = 0.0
    for v in verdicts:
        w = weight.get(v["cluster"], 1.0)
        cur = v["label"]
        before[prev_of.get((v["cluster"], v["exemplar"]), cur)] += w
        after[cur] += w
        confs[cur].append(float(v.get("confidence") or 0))
        total += w

    print("\n" + "=" * 74)
    print("A  share (by exemplar px) vs mean confidence")
    print("=" * 74)
    print(f"{'class':<44}{'before':>8}{'after':>8}{'delta':>8}{'conf':>7}{'n':>5}")
    rows = []
    for cls in set(before) | set(after):
        sb, sa = before[cls] / total * 100, after[cls] / total * 100
        cf = st.mean(confs[cls]) if confs[cls] else float("nan")
        rows.append({"class": cls, "before": round(sb, 2), "after": round(sa, 2),
                     "delta": round(sa - sb, 2),
                     "conf": round(cf, 3) if confs[cls] else None,
                     "n": len(confs[cls])})
    rows.sort(key=lambda r: -r["after"])
    for r in rows:
        cf = r["conf"]
        flag = ""
        if cf is not None and cf < 0.70:
            if r["delta"] > 0.5:
                flag = "  <== GROWING + LOW CONF"
            elif r["after"] > 8:
                flag = "  <== BIG + LOW CONF"
        cs = f"{cf:7.2f}" if cf is not None else "    n/a"
        print(f"{r['class']:<44}{r['before']:7.1f}%{r['after']:7.1f}%"
              f"{r['delta']:+7.1f}%{cs}{r['n']:5d}{flag}")
    report["signal_a"] = rows

    # ------------------------------------------------------------ B
    by_cluster = defaultdict(list)
    for v in verdicts:
        by_cluster[v["cluster"]].append(v)

    disagree, nonnested = [], []
    for c, vs in by_cluster.items():
        labels = [v["label"] for v in vs]
        if len(set(labels)) < 2:
            continue
        cs = [float(v.get("confidence") or 0) for v in vs]
        rec = {"cluster": c, "labels": labels, "confidences": cs,
               "common_ancestor": ".".join(common_ancestor(labels)),
               "mean_conf": round(st.mean(cs), 3), "max_conf": max(cs)}
        disagree.append(rec)
        if not rec["common_ancestor"]:
            nonnested.append(rec)

    if a.conf_max is not None:
        nonnested = [r for r in nonnested if r["max_conf"] < a.conf_max]

    print("\n" + "=" * 74)
    print("B  non-nested disagreement (no common ancestor)")
    print("=" * 74)
    print(f"clusters with any disagreement : {len(disagree)}")
    print(f"  non-nested                   : {len(nonnested)}"
          + (f"  (and every exemplar < {a.conf_max})" if a.conf_max else ""))
    if disagree:
        print(f"  -> {len(nonnested) / len(disagree):.0%} of disagreements point at "
              "the hierarchy, not at spatial impurity")
    for r in sorted(nonnested, key=lambda r: r["mean_conf"])[:20]:
        print(f"  c{r['cluster']:<5} mean {r['mean_conf']:.2f} "
              f"max {r['max_conf']:.2f}")
        for l, cf in zip(r["labels"], r["confidences"]):
            print(f"          {cf:.2f}  {l}")
    if len(nonnested) > 20:
        print(f"  ... {len(nonnested) - 20} more (full set in --json)")
    report["signal_b"] = nonnested

    # ------------------------------------------------------------ C
    parent_use, retreated, examples = Counter(), Counter(), defaultdict(list)
    unknown = Counter()
    for v in verdicts:
        leaf = is_leaf(hierarchy, v["label"])
        if leaf is None:
            unknown[v["label"]] += 1
            continue
        if leaf:
            continue
        parent_use[v["label"]] += 1
        prev = prev_of.get((v["cluster"], v["exemplar"]))
        if prev and prev.startswith(v["label"] + "."):
            retreated[v["label"]] += 1
        examples[v["label"]].append(
            {"cluster": v["cluster"], "exemplar": v["exemplar"], "prev": prev,
             "confidence": v.get("confidence"), "reasoning": v.get("reasoning", "")})

    n_par = sum(parent_use.values())
    print("\n" + "=" * 74)
    print("C  parent-level retreat -- a reader declining to commit to any child")
    print("=" * 74)
    print(f"{n_par}/{len(verdicts)} = {n_par / len(verdicts):.0%} of verdicts sit "
          "on a non-leaf node")
    for cls, n in parent_use.most_common():
        print(f"  {cls:<44}{n:4d}   retreated from a child this pass: "
              f"{retreated[cls]}")
    if unknown:
        print(f"  !! labels absent from the hierarchy: {dict(unknown)}")
    report["signal_c"] = {"parent_use": dict(parent_use),
                          "retreated": dict(retreated),
                          "examples": dict(examples),
                          "not_in_hierarchy": dict(unknown)}

    # ------------------------------------------------------------ D
    used = Counter(v["label"] for v in verdicts)
    alts = Counter(v.get("alternative") for v in verdicts if v.get("alternative"))
    dead = [n for n in nodes if n not in used]
    print("\n" + "=" * 74)
    print("D  dead classes -- defined but never chosen")
    print("=" * 74)
    print(f"{len(used)}/{len(nodes)} nodes were used at least once; "
          f"{len(dead)} never")
    for n in dead:
        extra = f"   (offered as alternative {alts[n]}x)" if alts.get(n) else ""
        print(f"  {n}{extra}")
    thin = [(n, c) for n, c in used.items() if c <= 2]
    if thin:
        print("\n  used <= 2 times:")
        for n, c in sorted(thin, key=lambda t: t[1]):
            print(f"    {n:<44}{c}")
    report["signal_d"] = {"dead": dead, "used": dict(used),
                          "alternatives": {k: v for k, v in alts.items()}}

    # ------------------------------------------------------------ forced-fit text
    texts = []
    for v in verdicts:
        texts.append((v["cluster"], v["exemplar"], "reasoning", v.get("reasoning", "")))
    for f in flips:
        texts.append((f["cluster"], f["exemplar"], "change", f.get("change_reason", "")))
        texts.append((f["cluster"], f["exemplar"], "verify", f.get("verify_note", "")))

    hits = defaultdict(list)
    for c, e, kind, t in texts:
        low = (t or "").lower()
        for name, pat in FORCED_FIT.items():
            if re.search(pat, low):
                hits[name].append({"cluster": c, "exemplar": e, "field": kind,
                                   "text": t})
    print("\n" + "=" * 74)
    print("E  forced-fit language in reader text")
    print("=" * 74)
    print(f"{len(texts)} text fields scanned")
    for name in FORCED_FIT:
        print(f"  {name:<20}{len(hits.get(name, []))}")
    report["forced_fit"] = {k: v for k, v in hits.items()}

    # The structured channel. Prose inference above is a fallback for passes run
    # before the channel existed; this is the reader saying it outright.
    declared = [{"cluster": v["cluster"], "exemplar": v["exemplar"],
                 "label": v.get("label"), **v["no_class_fits"]}
                for v in verdicts if isinstance(v.get("no_class_fits"), dict)]
    offered = any("no_class_fits" in v for v in verdicts)
    print("\n" + "-" * 74)
    if not offered:
        print("  no_class_fits: CHANNEL ABSENT from these verdicts.")
        print("  A low forced-fit count above is therefore evidence about the")
        print("  schema, not about the hierarchy -- readers had no way to report")
        print("  a missing class. Do not read it as the hierarchy being adequate.")
    else:
        print(f"  no_class_fits: channel present; {len(declared)} of "
              f"{len(verdicts)} verdicts declared a gap")
        by_near = Counter(d.get("nearest") for d in declared)
        for near, n in by_near.most_common(10):
            print(f"    {n:3d}  nearest={near}")
        for d in declared[:15]:
            print(f"    c{d['cluster']}e{d['exemplar']} [{d.get('label')}] "
                  f"{str(d.get('describes'))[:70]}")
    report["no_class_fits"] = {"channel_offered": offered, "declared": declared}

    if a.json:
        a.json.write_text(json.dumps(report, indent=1))
        print(f"\nwrote {a.json}")


if __name__ == "__main__":
    main()
