#!/usr/bin/env python3
"""Turn a maintainer's review-page export into a file the gate can read.

Generic engine script (cluster-labeling skill). The adjudication surface exports
one JSON document -- a maintainer export, whose top level is a set of named
ruling arrays. `gate.py --verify` wants an array of per-exemplar rows. Nothing
bridged the two, so a maintainer's look at a crop never reached the ledger and
`corrections.md` stopped at the readers. `gate.py` refuses the export by name
and points here. Worklist T62.

Scope: EXEMPLAR rulings only. A cluster-wide ruling is a claim about a cluster's
exemplars (router rule, `_notes/router-and-ruling-scope.md`), but expanding it
is the router's job, not this script's -- the router is unbuilt and one of its
two governing decisions is still the maintainer's to make. So a cluster-wide
ruling is REPORTED, loudly and by id, and never silently folded in. A converter
that quietly dropped seven of them would look exactly like a converter that had
nothing to drop.

An opt-in `--expand-cluster-rulings` flag was considered and REJECTED, so that the
next reader of the loud REPORTED line does not re-derive it: the expansion rule is
decided (a cluster ruling claims that cluster's exemplars and stops), but the
router's other decision -- whether a `leaning` ruling is terminal -- chooses WHICH
rulings carry the stamp at all, upstream of any expansion. A flag here would be
half a router, in a second place, obeying one of its two rules. Build the router;
do not grow this.

Everything this refuses to convert is counted and named on stdout for the same
reason: the failure mode all over this run is a zero that reads as "nothing to
report" instead of "nobody was asked".

Usage
  human_verify.py EXPORT.json --out FILE [--judgments FILE] [--run NAME]
                  [--defs FILE ...] [--strict]

Exit 0 on a clean conversion, 1 if it refused to write, and 1 under --strict if
anything was reported. --strict is the switch for an automated caller: without
it a warning is advice, with it a warning stops the pipeline.
"""
import argparse
import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gate import defs_version  # noqa: E402  -- the real function, never a copy

# The stamp the review page puts on a ruling, and the token `gate.py` reads as
# "a person decided this". Not one of the adversarial verifier's tokens: a
# maintainer ruling is a different object with a different authority, and the
# intent doc makes the maintainer the ground-truth authority by construction.
HUMAN = "human"

# Ruling arrays in the export, and what happens to each here. Anything absent
# from this map is reported as unrecognised rather than ignored -- a key the
# page starts emitting must not vanish into a converter that never heard of it.
ROUTES = {
    "exemplar_rulings": "converted here",
    "cluster_rulings": "NOT converted -- the router expands these; see below",
    "class_rulings": "routes to the class definitions, not to the gate",
    "class_proposals": "routes to the hierarchy discussion, not to the gate",
    "reference_candidates": "routes to the AOI pack's reference crops, not to the gate",
}
META_KEYS = ("run", "defs_version", "at")


def load_export(path):
    d = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(d, dict):
        sys.exit(f"{path}: not a maintainer export (top level is "
                 f"{type(d).__name__}, expected an object)")
    if "exemplar_rulings" not in d:
        sys.exit(f"{path}: no `exemplar_rulings` array. This reads a review-page "
                 f"export; a verify file already in gate shape needs no conversion.")
    return d


def convert(rulings, warn):
    """-> rows the gate can read. One row per ruling, in export order."""
    rows, seen = [], {}
    for i, r in enumerate(rulings):
        for k in ("cluster", "exemplar"):
            if not isinstance(r.get(k), int):
                sys.exit(f"exemplar_rulings[{i}]: `{k}` is {r.get(k)!r}, not an "
                         f"integer. Refusing to guess which cell this rules on.")
        key = (r["cluster"], r["exemplar"])
        if key in seen:
            warn(f"duplicate ruling on c{key[0]}e{key[1]} "
                 f"(export index {seen[key]} and {i}); the later one wins, "
                 f"which is what the gate would do silently")
        seen[key] = i
        row = {
            "cluster": r["cluster"],
            "exemplar": r["exemplar"],
            "verify": r.get("verify") or HUMAN,
            "label": r.get("label") or "",
            "note": r.get("note") or "",
        }
        # Provenance the maintainer set on the card. Carried through so the
        # written file can be read back without the export beside it; the gate
        # ignores what it does not use.
        for k in ("decision", "flip_kind", "self_confidence",
                  "reference_example", "needs_ground_truth"):
            if k in r:
                row[k] = r[k]
        rows.append(row)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("export", type=Path, help="the review page's exported JSON")
    ap.add_argument("--out", type=Path, required=True,
                    help="where to write the gate-readable file")
    ap.add_argument("--judgments", type=Path,
                    help="the round's judgments file; every ruling is matched "
                         "against it, and an unmatched one is reported")
    ap.add_argument("--run", help="expected run id; refuses a mismatch")
    ap.add_argument("--defs", type=Path, nargs="*", default=[],
                    help="files whose hash defines the CURRENT contract stamp, "
                         "same list the gate is given; compared to the export's")
    ap.add_argument("--strict", action="store_true",
                    help="exit 1 if anything was reported, not only on refusal")
    a = ap.parse_args()

    d = load_export(a.export)
    reported = []

    def warn(msg):
        reported.append(msg)
        print(f"  REPORTED -- {msg}")

    print(f"export: {a.export}")
    for k in META_KEYS:
        print(f"  {k}: {d.get(k)!r}")

    # ---- run identity. Several runs coexist on disk and the rulings name theirs.
    print("\nRUN")
    if a.run and d.get("run") != a.run:
        sys.exit(f"REFUSED: export names run {d.get('run')!r}, --run says "
                 f"{a.run!r}. Rulings do not transfer between runs.")
    print(f"  OK: {d.get('run')!r}" + (" (matches --run)" if a.run else
                                       " (not checked -- no --run given)"))

    # ---- contract drift. A ruling made against an older contract is not wrong
    # about its own past; what moved is the world. Report, never re-stamp.
    print("\nDEFS")
    if not a.defs:
        warn("no --defs given, so whether these rulings were made against the "
             "contract now on disk was not checked at all")
    else:
        now = defs_version(a.defs)
        was = d.get("defs_version")
        if was == now:
            print(f"  OK: export stamp {was} matches the current {now}")
        else:
            warn(f"export was stamped {was}, the contract on disk now hashes to "
                 f"{now}. These rulings were made against an older contract "
                 f"(worklist T65 is the re-open rule; it is unbuilt)")

    # ---- what is being converted, and what is not
    print("\nROUTES")
    for k, what in ROUTES.items():
        n = len(d.get(k) or [])
        print(f"  {k:22s} {n:4d}  {what}")
    for k in d:
        if k not in ROUTES and k not in META_KEYS:
            warn(f"export carries `{k}`, which this converter does not know "
                 f"about; it was neither converted nor routed")

    cl = d.get("cluster_rulings") or []
    if cl:
        ids = ", ".join(f"c{r.get('cluster')}"
                        + ("" if r.get("kind") == "label" else f" ({r.get('kind')})")
                        for r in cl)
        warn(f"{len(cl)} cluster-wide ruling(s) NOT converted: {ids}. Each is a "
             f"claim about that cluster's exemplars and reaches the gate only "
             f"through the router, which is unbuilt (worklist T55)")

    # ---- convert
    print("\nEXEMPLAR RULINGS")
    rows = convert(d["exemplar_rulings"], warn)
    print(f"  {len(rows)} ruling(s) converted, stamped `{HUMAN}`")
    blank = [f"c{r['cluster']}e{r['exemplar']}" for r in rows if not r["label"]]
    if blank:
        warn(f"{len(blank)} ruling(s) name no class, so they satisfy the "
             f"all-exemplars-checked criterion without moving anything: "
             f"{', '.join(blank[:5])}")
    off = [r for r in rows if r["verify"] != HUMAN]
    if off:
        warn(f"{len(off)} ruling(s) arrived stamped something other than "
             f"`{HUMAN}`: {sorted({r['verify'] for r in off})}")

    # ---- does every ruling land on a real cell?
    print("\nMATCH")
    if not a.judgments:
        warn("no --judgments given, so a ruling on a cell the round never "
             "judged would pass unnoticed; the gate joins on that pair and "
             "drops the misses in silence")
    else:
        j = json.loads(a.judgments.read_text(encoding="utf-8"))
        have = {(x["cluster"], x["exemplar"]) for x in j}
        miss = [f"c{r['cluster']}e{r['exemplar']}" for r in rows
                if (r["cluster"], r["exemplar"]) not in have]
        if miss:
            warn(f"{len(miss)} of {len(rows)} ruling(s) name a cell absent from "
                 f"{a.judgments.name}: {', '.join(miss[:5])}. The gate will "
                 f"drop these without a word")
        else:
            print(f"  OK: all {len(rows)} land on a cell in {a.judgments.name}")

    # ---- write
    a.out.write_text(json.dumps({
        "source": str(a.export),
        "converted_by": "human_verify.py",
        "run": d.get("run"),
        "export_defs_version": d.get("defs_version"),
        "exported_at": d.get("at"),
        # Named here so a reader of this file alone can see that the export held
        # more than what was converted, and how much more.
        "not_converted": {k: len(d.get(k) or []) for k in ROUTES if k != "exemplar_rulings"},
        "results": rows,
    }, indent=1), encoding="utf-8")
    print(f"\nwrote {len(rows)} row(s) -> {a.out}")

    kinds = collections.Counter(r.get("decision") for r in rows)
    if any(kinds):
        print("  by decision: " + "  ".join(f"{k}={v}" for k, v in kinds.most_common()))

    if reported:
        print(f"\n{len(reported)} thing(s) REPORTED; the file was written anyway.")
        if a.strict:
            print("FAILED (--strict)")
            return 1
        print("PASSED -- with report; not a clean conversion")
        return 0
    print("\nPASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
