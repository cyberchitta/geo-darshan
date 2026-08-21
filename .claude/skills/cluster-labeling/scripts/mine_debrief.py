#!/usr/bin/env python3
"""Mine the reader debriefs: what bit several readers independently?

Sibling to `mine_missing_classes.py`, and it carries that script's **CHANNEL
ABSENT** behaviour for the same reason. A low friction count means one of two
opposite things:

  key absent from every debrief -> the readers were never asked. Evidence about
                                   the schema. A zero here says nothing about
                                   the process.
  key absent from SOME debriefs -> a dropped key. Every count for that channel is
                                   over the readers that carry it, and the
                                   frequency filter is that much weaker.
  key present, always null      -> they were asked and had nothing. Evidence
                                   about the process.

Partial absence is the state this script used to lose: it printed "present on
1/2 ... asked and had nothing", which says "asked" about a reader that was not,
and divided firing counts by all readers rather than by the ones that carry the
key. That is the same collapse it refuses at the all-or-nothing extreme.

Collapsing those is exactly the misreading that made the missing-class sweep
prospective instead of reactive, so this script refuses to print a tally without
saying which case it is in.

**Frequency across readers is the filter.** One reader raising something is
noise; most of them raising it independently is a defect. Counts here are
*readers*, never items — a reader listing the same friction four times is still
one reader.

Reader self-report is the weakest evidence class in this project (intent doc:
models agreeing with each other is not verification). Output is signal to
adjudicate, never findings to adopt.

Usage:
  mine_debrief.py RUN_DIR --debriefs 'debrief_*.json'
"""
from __future__ import annotations

import argparse
import glob
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

DEFAULT_CONTRACT = (Path(__file__).resolve().parents[1]
                    / "references" / "reader-debrief.md")


def contract_channels(contract: Path) -> list[str]:
    rows = re.findall(r"^\|\s*`([a-z_]+)`\s*\|\s*(\w+)\s*\|\s*([^|]+?)\s*\|",
                      contract.read_text(encoding="utf-8"), re.M)
    return [n for n, _req, kind in rows if kind.strip().strip("*").lower() == "channel"]


def norm(s: str) -> str:
    """Loose key for grouping the same complaint worded differently."""
    return " ".join(sorted(set(re.findall(r"[a-z]{4,}", (s or "").lower()))))[:120]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=Path)
    ap.add_argument("--debriefs", default="debrief_*.json")
    ap.add_argument("--contract", type=Path, default=DEFAULT_CONTRACT)
    ap.add_argument("--min-readers", type=int, default=2,
                    help="report items raised independently by at least this many readers")
    ap.add_argument("--json", type=Path)
    ap.add_argument("--strict", action="store_true",
                    help="exit 1 if any channel is missing from any debrief")
    a = ap.parse_args()

    channels = contract_channels(a.contract)
    files = sorted(glob.glob(str(a.run_dir / a.debriefs)))
    if not files:
        raise SystemExit(f"no debriefs matched {a.debriefs} in {a.run_dir}")

    debriefs = []
    for p in files:
        blob = json.loads(Path(p).read_text())
        recs = blob if isinstance(blob, list) else blob.get("debriefs", [blob])
        for r in recs:
            if isinstance(r, dict):
                r.setdefault("batch", Path(p).stem)
                debriefs.append(r)
    n_readers = len(debriefs)
    print(f"{n_readers} reader debrief(s) from {len(files)} file(s)\n")

    report = {}
    any_absence = False
    for ch in channels:
        present = [d for d in debriefs if ch in d]
        missing = sorted(str(d.get("batch")) for d in debriefs if ch not in d)
        if not present:
            any_absence = True
            print(f"{ch}: CHANNEL ABSENT from all {n_readers} debriefs.")
            print("    The readers were never asked. A zero here is evidence about")
            print("    the schema, NOT about the process. Do not read it as 'fine'.")
            report[ch] = {"status": "absent", "n_absent": n_readers,
                          "absent_batches": missing}
            print()
            continue
        if missing:
            # Partial absence used to print as "present on 1/2 ... asked and had
            # nothing", which is the same collapse this script refuses at the
            # all-or-nothing extreme: it says "asked" about readers who were not.
            any_absence = True
            print(f"{ch}: CHANNEL ABSENT from {len(missing)}/{n_readers} debriefs "
                  f"(batch {', '.join(missing)}) — DEFECT, not a quiet zero.")
            print(f"    Those readers dropped the key or were never asked. Everything")
            print(f"    below is over the {len(present)} debrief(s) that carry it, NOT")
            print(f"    over all {n_readers} — and the frequency filter is that much weaker.")
        fired = [d for d in present if d.get(ch)]
        if not fired:
            print(f"{ch}: present on {len(present)}/{n_readers}, fired 0 times "
                  f"across those {len(present)}.")
            print("    Asked and had nothing — evidence about the process.")
            report[ch] = {"status": "null", "n_present": len(present),
                          "n_absent": len(missing), "absent_batches": missing}
            print()
            continue

        # count READERS per distinct item, not items
        by_item: dict[str, set] = defaultdict(set)
        examples: dict[str, str] = {}
        anchors: dict[str, Counter] = defaultdict(Counter)
        for d in fired:
            items = d[ch] if isinstance(d[ch], list) else [d[ch]]
            for it in items:
                if not isinstance(it, dict):
                    continue
                text = it.get("describes") or it.get("why") or json.dumps(it)
                k = norm(text) or json.dumps(it)[:80]
                by_item[k].add(str(d.get("batch")))
                examples.setdefault(k, text)
                for e in (it.get("exemplars") or []):
                    anchors[k][e] += 1
        ranked = sorted(by_item.items(), key=lambda kv: -len(kv[1]))
        # Denominator is readers that CARRY the key, never all readers: dividing
        # by n_readers lets a dropped key deflate the frequency filter silently.
        print(f"{ch}: fired by {len(fired)}/{len(present)} readers that carry the "
              f"key, {len(by_item)} distinct item(s)")
        for k, readers in ranked:
            mark = "  <-- RAISED INDEPENDENTLY" if len(readers) >= a.min_readers else ""
            print(f"  [{len(readers)}/{len(present)} readers]{mark}")
            print(f"      {examples[k][:200]}")
            if anchors[k]:
                print(f"      anchored: {', '.join(e for e, _ in anchors[k].most_common(6))}")
        report[ch] = {
            "status": "fired", "n_fired": len(fired), "n_present": len(present),
            "n_absent": len(missing), "absent_batches": missing,
            "items": [{"describes": examples[k], "n_readers": len(readers),
                       "readers": sorted(readers),
                       "anchors": [e for e, _ in anchors[k].most_common()]}
                      for k, readers in ranked]}
        print()

    unanchored = sum(
        1 for d in debriefs for ch in channels
        for it in (d.get(ch) if isinstance(d.get(ch), list) else [d.get(ch)] if d.get(ch) else [])
        if isinstance(it, dict) and not it.get("exemplars"))
    if unanchored:
        print(f"NOTE: {unanchored} item(s) carry no exemplar anchor. Unanchored "
              "reports cannot be checked and rank below anchored ones.")

    if a.json:
        a.json.write_text(json.dumps(
            {"run": a.run_dir.name, "n_readers": n_readers, "channels": report}, indent=2))
        print(f"\nwrote {a.json}")

    if any_absence:
        print("\nAt least one channel is missing from at least one debrief. Every "
              "tally above is over the readers that carry the key.")
        if a.strict:
            raise SystemExit(1)


if __name__ == "__main__":
    main()
