#!/usr/bin/env python3
"""Ledger + settle gate for the cluster-labeling convergence loop.

Generic engine script (cluster-labeling skill). Decides, per cluster, whether the
current evidence is strong enough to RETIRE the label, or what to do instead.

The gate is deliberately conjunctive: a cluster settles only if EVERY criterion
holds. Unanimity alone is not evidence — three readers sharing one field guide
make correlated errors, and exemplars sample only the largest patches.

States
  SETTLED   all criteria pass; label is retired at this defs_version
  RESAMPLE  too few exemplars to judge unanimity (needs more looks, not a split)
  RETREAT   exemplars disagree WITHIN a subtree -> use the common ancestor
  SPLIT     exemplars disagree ACROSS families -> real spatial impurity
  OPEN      unanimous but one or more gate criteria failed (reasons listed)

Disagreement triage
  If one disputed label is an ancestor of all others   -> RETREAT to it
  elif longest common prefix is >= --retreat-min-depth -> RETREAT to the prefix
  else                                                 -> SPLIT
  ("eroded_land vs degraded_barren" retreats; "fallow vs cashew" splits.)

Usage
  gate.py RUN_DIR --judgments judgments.json --hierarchy land-cover.json
          [--verify FILE ...] [--apply-verified]
          [--prior prior_labels.json] [--nbr nbr_flags.json]
          [--restrict cards.json] [--defs FILE ...]

Writes RUN_DIR/ledger.json and prints a summary. Reads nothing it can mutate;
--apply-verified folds upheld flips and maintainer rulings in MEMORY only,
leaving judgments.json alone.
"""
import argparse
import collections
import glob
import hashlib
import json
import statistics as st
import sys
from pathlib import Path

# ---------------------------------------------------------------- label paths


def parts(label):
    return [p for p in (label or "").split(".") if p]


def is_ancestor(a, b):
    """True if a is a strict ancestor of b ('x.y' of 'x.y.z')."""
    pa, pb = parts(a), parts(b)
    return len(pa) < len(pb) and pb[: len(pa)] == pa


def common_prefix(labels):
    ps = [parts(l) for l in labels]
    out = []
    for i in range(min(len(p) for p in ps)):
        col = {p[i] for p in ps}
        if len(col) != 1:
            break
        out.append(col.pop())
    return ".".join(out)


def family(label):
    p = parts(label)
    return p[0] if p else ""


def triage(labels, retreat_min_depth):
    """-> (state, target_label)."""
    uniq = sorted(set(labels))
    for cand in uniq:
        if all(c == cand or is_ancestor(cand, c) for c in uniq):
            return "RETREAT", cand
    lcp = common_prefix(uniq)
    if lcp and len(parts(lcp)) >= retreat_min_depth:
        return "RETREAT", lcp
    return "SPLIT", ""


# ---------------------------------------------------------------- inputs


# The key holding a verdict differs by producer, and BOTH are contract-legal:
#   `verdict`  the VERIFY RESULT record (verdict-record.md, "The verify result")
#              -- what round_workflow.js's Verify phase writes, one file per batch
#   `verify`   a flips file with verdicts merged back in -- round 3's shape, and
#              the stamp the adjudication surface puts on a maintainer ruling
# Read both, and NEVER default a missing one to "unverified". Round 4's 321
# verify records carry `verdict`; this function read `verify` alone, so every one
# of them became unverified in silence. Measured 2026-08-21 on the real round-4
# artifacts: 0/320 verified, criterion 3 -- the binding one -- blocking all 120
# clusters, nothing SETTLED. That reads as "the gate is too strict" and is
# actually "the gate cannot read its evidence".
VERDICT_KEYS = ("verdict", "verify")


def verify_files(paths):
    """Expand --verify into real files. round_workflow.js writes one per batch
    (`${PREFIX}_verify_${i}.json`), so a single-path --verify forced somebody to
    hand-merge them first -- which is how round 4's verify pass came to exist only
    as a hand-assembled file. A shell glob expands before argparse sees it; a
    quoted one is expanded here."""
    out = []
    for p in paths or []:
        p = str(p)
        hits = sorted(glob.glob(p))
        if not hits:
            sys.exit(f"--verify {p}: no such file")
        out.extend(hits)
    return out


def load_verify(paths):
    """-> {(cluster, exemplar): {verdict, label, prev_label, better_label}},
    merged across every --verify file."""
    files = verify_files(paths)
    if not files:
        return {}
    out, unkeyed = {}, []
    for path in files:
        d = json.loads(Path(path).read_text())
        rows = d
        if isinstance(d, dict):
            # `flips` (round-3 shape) or `results` (what the round workflow
            # returns, and how round 4's verify pass was saved).
            for k in ("flips", "results"):
                if k in d:
                    rows = d[k]
                    break
            else:
                sys.exit(f"--verify {path}: dict with no `flips` or `results` "
                         f"array. A maintainer export (`exemplar_rulings`) does "
                         f"not load here yet -- that is worklist T62.")
        for r in rows:
            verdict = next((r[k] for k in VERDICT_KEYS if k in r), None)
            if verdict is None:
                unkeyed.append(f"{Path(path).name} c{r.get('cluster')}e{r.get('exemplar')}")
                continue
            out[(r["cluster"], r["exemplar"])] = {
                "verdict": verdict,
                "label": r.get("label"),
                "prev_label": r.get("prev_label"),
                "better_label": r.get("better_label", ""),
            }
    if unkeyed:
        sys.exit(f"--verify: {len(unkeyed)} record(s) carry neither "
                 f"{' nor '.join('`%s`' % k for k in VERDICT_KEYS)}, e.g. "
                 f"{', '.join(unkeyed[:3])}.\n"
                 f"Refusing to read them as unverified: a gate that silently "
                 f"downgrades evidence it cannot parse reports a stricter result "
                 f"and looks like a working gate.")
    return out


def defs_version(paths):
    h = hashlib.sha256()
    for p in sorted(paths):
        h.update(Path(p).read_bytes())
    return h.hexdigest()[:12]


def valid_label(label, hierarchy):
    """Is this a path the hierarchy contains? Deliberately NOT "may a reader emit
    it": a `_status: not-assignable` node is a real class and stays valid here.

    Enforcing the flag at this seam was considered 2026-08-21 and rejected. The
    gate runs over verdicts already on disk, so rejecting here would silently
    move existing clusters' ledger states -- changing what a past round concluded
    rather than stopping a bad verdict being written. Enforcement belongs at the
    contract check, which reads records before anything consumes them:
    `check_verdict_contract.py --hierarchy`. Leave this one structural.
    """
    node = hierarchy
    for p in parts(label):
        if not isinstance(node, dict) or p not in node:
            return False
        node = node[p]
    return bool(parts(label))


# ---------------------------------------------------------------- gate

# Verdict tokens, partitioned. "human" is the review page's stamp on a
# maintainer ruling; it is provenance, not an outcome — the ruling's own
# decision/label carries that.
VERIFIED = ("upheld", "human")
CONTESTED = ("refuted", "unclear")
# Verdicts whose own label supersedes the reader's under --apply-verified. NOT
# `refuted`: a refutation naming a better_label is *contested*, and the intent
# doc makes that a person's call, not an automatic substitution.
APPLIED = ("upheld", "human")


def gate_cluster(c, exs, ctx, a):
    """exs: list of per-exemplar dicts. -> ledger record."""
    labels = [e["label"] for e in exs]
    confs = [float(e.get("confidence") or 0.0) for e in exs]
    n = len(exs)
    total_px = ctx["cluster_px"].get(c)
    seen_px = sum(int(e.get("size_px") or 0) for e in exs)
    coverage = (seen_px / total_px) if total_px else None

    # "human" is a maintainer ruling. It counts as verified by definition:
    # verified is an adversarial check *or* a maintainer ruling, nothing else.
    verified = [e for e in exs if e["verify"] in VERIFIED]
    contested = [e for e in exs if e["verify"] in CONTESTED]
    # Complement, not an equality test against "unverified": an unrecognised
    # verdict has to land somewhere, or n_verified + n_contested + n_unexamined
    # silently stops summing to n_exemplars.
    unexamined = [e for e in exs if e["verify"] not in VERIFIED + CONTESTED]

    rec = {
        "cluster": c,
        "n_exemplars": n,
        "labels": labels,
        "unanimous": len(set(labels)) == 1,
        "label": labels[0] if len(set(labels)) == 1 else None,
        "mean_confidence": round(st.mean(confs), 3) if confs else 0.0,
        "cluster_px": total_px,
        "exemplar_px": seen_px,
        "coverage": round(coverage, 3) if coverage is not None else None,
        "n_verified": len(verified),
        "n_contested": len(contested),
        "n_unexamined": len(unexamined),
        "defs_version": ctx["defs_version"],
    }

    fails = []
    # 1 enough looks
    if n < a.min_exemplars:
        fails.append(f"n_exemplars {n} < {a.min_exemplars}")
    # 2 unanimity
    if not rec["unanimous"]:
        fails.append("exemplars disagree")
    # 3 every exemplar adversarially verified
    if len(verified) < n:
        fails.append(f"only {len(verified)}/{n} exemplars verified")
    # 4 confidence floor
    if rec["mean_confidence"] < a.min_confidence:
        fails.append(f"mean_conf {rec['mean_confidence']:.2f} < {a.min_confidence}")
    # 5 coverage floor (waived for clusters too small to sample further)
    small = total_px is not None and total_px < a.small_px
    if coverage is not None and coverage < a.min_coverage and not small:
        fails.append(f"coverage {coverage:.0%} < {a.min_coverage:.0%}")
    # 6 prior map contradiction, cross-family only
    prior = ctx["prior"].get(str(c), {}).get("old_dist", {})
    if rec["label"]:
        bad = {
            k: v
            for k, v in prior.items()
            if v >= a.prior_threshold and k not in ("code255",) and family(k) != family(rec["label"])
        }
        if bad:
            k, v = max(bad.items(), key=lambda t: t[1])
            fails.append(f"prior map {v:.0%} {k}")
            rec["prior_conflict"] = {"label": k, "share": v}
    # 7 neighbour contradiction -- against CURRENT labels, not the flag file's
    # snapshot. nbr_flags.json is generated once per round and its nbr_label goes
    # stale the moment any judgment changes; comparing to it blocks clusters whose
    # neighbour has since converged onto the same label.
    nf = ctx["nbr"].get(c)
    if nf and rec["label"]:
        nbr_now = ctx["cur_label"].get(nf["nbr"], nf["nbr_label"])
        related = (
            nbr_now == rec["label"]
            or family(nbr_now) == family(rec["label"])
            or is_ancestor(nbr_now, rec["label"])
            or is_ancestor(rec["label"], nbr_now)
        )
        if not related:
            fails.append(f"neighbour c{nf['nbr']} {nbr_now} share {nf['share']:.0%}")
            rec["nbr_conflict"] = {**nf, "nbr_label_now": nbr_now}
    # 8 label still exists in the hierarchy
    if rec["label"] and ctx["hierarchy"] and not valid_label(rec["label"], ctx["hierarchy"]):
        fails.append(f"label not in hierarchy: {rec['label']}")

    rec["fails"] = fails

    if not fails:
        rec["state"] = "SETTLED"
    elif not rec["unanimous"]:
        state, target = triage(labels, a.retreat_min_depth)
        rec["state"] = state
        if target:
            rec["retreat_to"] = target
    elif n < a.min_exemplars:
        rec["state"] = "RESAMPLE"
    else:
        rec["state"] = "OPEN"
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=Path)
    ap.add_argument("--judgments", type=Path, required=True)
    ap.add_argument("--hierarchy", type=Path)
    ap.add_argument("--verify", type=Path, nargs="*", default=[],
                    help="verify files: flips-shaped or verify-result-shaped, "
                         "one per reader batch; globs accepted")
    ap.add_argument("--apply-verified", action="store_true",
                    help="fold an upheld flip's or a maintainer ruling's label into "
                         "the labels in memory (judgments.json untouched)")
    ap.add_argument("--prior", type=Path)
    ap.add_argument("--nbr", type=Path)
    ap.add_argument("--restrict", type=Path,
                    help="JSON list of clusters, or a cards file with a 'cluster' key each")
    ap.add_argument("--defs", type=Path, nargs="*", default=[],
                    help="files whose hash defines defs_version")
    ap.add_argument("--min-exemplars", type=int, default=3)
    ap.add_argument("--min-confidence", type=float, default=0.65)
    ap.add_argument("--min-coverage", type=float, default=0.30)
    ap.add_argument("--small-px", type=int, default=25)
    ap.add_argument("--prior-threshold", type=float, default=0.60)
    ap.add_argument("--retreat-min-depth", type=int, default=2)
    ap.add_argument("--out", default="ledger.json")
    a = ap.parse_args()

    judgments = json.loads(a.judgments.read_text())
    verify = load_verify(a.verify)
    hierarchy = json.loads(a.hierarchy.read_text()) if a.hierarchy else None
    prior = json.loads(a.prior.read_text()) if a.prior else {}
    nbr = {}
    if a.nbr:
        for f in json.loads(a.nbr.read_text()):
            if f["share"] >= 0.25 and (f["cluster"] not in nbr or f["share"] > nbr[f["cluster"]]["share"]):
                nbr[f["cluster"]] = f

    # exemplar pixel sizes + cluster totals
    size = {}
    rows = a.run_dir / "results.jsonl"
    if rows.exists():
        for l in rows.read_text().splitlines():
            if l.strip():
                r = json.loads(l)
                size[(r["cluster"], r["exemplar"])] = r.get("size_px")
    cluster_px = {int(k): v.get("n_px") for k, v in prior.items()} if prior else {}

    restrict = None
    if a.restrict:
        d = json.loads(a.restrict.read_text())
        restrict = set(d) if d and isinstance(d[0], int) else {x["cluster"] for x in d}

    by = collections.defaultdict(list)
    for j in judgments:
        c, e = j["cluster"], j["exemplar"]
        if restrict is not None and c not in restrict:
            continue
        v = verify.get((c, e))
        label, conf = j["label"], j.get("confidence")
        verdict = "unverified"
        if v:
            verdict = v["verdict"]
            # A maintainer ruling carries the label the gate must judge, not just
            # a vote: counting `human` toward criterion 3 while still gating the
            # READER's label is worse than not counting it -- the cluster settles
            # on a label the maintainer rejected. `upheld` on a flip likewise
            # carries the flip's new label.
            #
            # The `v["label"] and` guard is load-bearing. A verify-RESULT record
            # has no `label` field at all (only `better_label`), so an unguarded
            # assignment wrote None over every upheld label, and criterion 8 then
            # failed the cluster for a label that is not in the hierarchy --
            # blaming the reader for the gate's own overwrite.
            # The LABEL moves; the confidence does not. main() used to read
            # `v.get("confidence", conf)`, which looked like it took the verify
            # record's own confidence and never could -- load_verify did not carry
            # the field, so the fallback fired every time. Carrying it moves
            # `mean_confidence` on 41 of round 3's 102 clusters (measured
            # 2026-08-21), i.e. it changes criterion 4. Whether the verifier's
            # confidence should feed that criterion is criterion 4's own question
            # and it is already slated for replacement by concurrence (T52) --
            # so this stays a label-only fold, and the decoy expression is gone.
            if a.apply_verified and verdict in APPLIED and v["label"]:
                label = v["label"]
        by[c].append({
            "exemplar": e, "label": label, "confidence": conf,
            "size_px": size.get((c, e)), "verify": verdict,
        })

    cur_label = {
        c: collections.Counter(e["label"] for e in exs).most_common(1)[0][0]
        for c, exs in by.items()
    }
    ctx = {
        "prior": prior, "nbr": nbr, "hierarchy": hierarchy, "cluster_px": cluster_px,
        "cur_label": cur_label,
        "defs_version": defs_version(a.defs) if a.defs else "unversioned",
    }
    ledger = {c: gate_cluster(c, sorted(exs, key=lambda x: x["exemplar"]), ctx, a)
              for c, exs in sorted(by.items())}

    out = a.run_dir / a.out
    out.write_text(json.dumps({
        "defs_version": ctx["defs_version"],
        # The paths the stamp was computed over, AS PASSED -- cwd-relative and in
        # argument order. Recorded so a ledger can say what it was stamped
        # against: defs_version() sorts these strings, so re-deriving the hash
        # needs the exact strings, not a resolved or tidied form. Round 3's stamp
        # went unreproducible precisely because this list lived only in a
        # gitignored handoff. Read back by check_defs_drift.py.
        "defs": [str(d) for d in a.defs],
        "thresholds": {
            "min_exemplars": a.min_exemplars, "min_confidence": a.min_confidence,
            "min_coverage": a.min_coverage, "small_px": a.small_px,
            "prior_threshold": a.prior_threshold, "retreat_min_depth": a.retreat_min_depth,
        },
        "clusters": ledger,
    }, indent=1))

    # ---- summary
    states = collections.Counter(r["state"] for r in ledger.values())
    print(f"ledger: {len(ledger)} clusters  defs_version={ctx['defs_version']}  -> {out}")
    for s in ("SETTLED", "OPEN", "RESAMPLE", "RETREAT", "SPLIT"):
        if states.get(s):
            print(f"  {s:9s} {states[s]:4d}")

    reasons = collections.Counter()
    for r in ledger.values():
        for f in r["fails"]:
            reasons[f.split(" ")[0] if f.split(" ")[0] in ("only", "coverage", "mean_conf", "prior", "neighbour", "exemplars", "n_exemplars", "label") else f] += 1
    print("\nbinding criteria (how many clusters each blocks):")
    tag = {
        "only": "3 not all exemplars verified", "mean_conf": "4 confidence floor",
        "coverage": "5 coverage floor", "prior": "6 prior-map conflict",
        "neighbour": "7 neighbour conflict", "n_exemplars": "1 too few exemplars",
        "exemplars": "2 exemplars disagree", "label": "8 label not in hierarchy",
    }
    for k, n in reasons.most_common():
        print(f"  {tag.get(k, k):32s} {n:4d}")
    return ledger


if __name__ == "__main__":
    main()
