#!/usr/bin/env python3
"""Enforce the single-source verdict-record contract.

Generic engine script (cluster-labeling skill). references/verdict-record.md is
the ONLY place the fields of a verdict record are enumerated. This checks that
nothing has quietly grown a second list, and that written records match the one
list.

Why. On 2026-08-17 rejudge_workflow.js's task prompt enumerated nine fields while
the round brief separately required two channel fields it omitted. No complete
list existed anywhere -- that absence was the defect. A reader working from the
enumeration would have dropped both channels, and the resulting zero would have
read as "nothing to report" rather than "nobody was asked". Discipline does not
keep two hand-maintained lists in agreement -- a checker does.

Two checks, independent:

  RECORDS   every written verdict record carries every field in the table,
            channel fields included and present-as-key even when null
  SOURCES   no consumer re-enumerates the field list. A file that names >=
            RESTATE_MIN of the fields in one place is quoting the contract
            instead of pointing at it, and will drift

Usage
  check_verdict_contract.py RUN_DIR [--contract PATH] [--verdicts GLOB]
                            [--sources FILE ...] [--strict]

Exit 1 if any check fails (with --strict, also on SOURCES warnings).
Read-only.
"""
import argparse
import glob
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_CONTRACT = HERE.parent / "references" / "verdict-record.md"

# A source naming this many of the contract's fields in one place is restating it.
RESTATE_MIN = 4


def parse_contract(path):
    """-> (record_fields, channel_fields, tables) from the markdown tables.

    tables maps a `kind` -> {"all": [...], "required": [...]}, so an executable
    schema's `required:` array can be matched against the right table.
    """
    rows = re.findall(r"^\|\s*`([a-z_]+)`\s*\|\s*(\w+)\s*\|\s*([^|]+?)\s*\|",
                      path.read_text(encoding="utf-8"), re.M)
    if not rows:
        sys.exit(f"contract has no parseable field table: {path}")
    tables = {}
    for name, req, kind in rows:
        k = kind.strip().strip("*").lower()
        t = tables.setdefault(k, {"all": [], "required": []})
        t["all"].append(name)
        if req.strip().lower() == "yes":
            t["required"].append(name)
    channels = tables.get("channel", {}).get("all", [])
    record = [n for n, _r, k in rows
              if k.strip().strip("*").lower() not in ("flip", "verify")]
    return record, channels, tables


# An array this small has no meaningful overlap with any table -- it is a
# wrapper object (`required: ['results']`), not a record contract.
MIN_OVERLAP = 2


def check_required_arrays(text, tables):
    """-> [(got, kind, extra, absent)] for every `required: [...]` worth checking."""
    out = []
    for m in re.finditer(r"required\s*:\s*\[([^\]]*)\]", text):
        got = set(re.findall(r"['\"]([a-z_]+)['\"]", m.group(1)))
        if not got:
            continue
        best, score = None, 0
        for kind, t in tables.items():
            overlap = len(got & set(t["all"]))
            if overlap > score:
                best, score = kind, overlap
        if score < MIN_OVERLAP:
            continue                       # not a record contract; ignore
        allowed = set(tables[best]["all"])
        needed = set(tables[best]["required"])
        out.append((got, best, got - allowed, needed - got))
    return out


def iter_records(run_dir, pattern):
    for p in sorted(glob.glob(str(run_dir / pattern))):
        blob = json.loads(Path(p).read_text())
        rows = blob if isinstance(blob, list) else blob.get("verdicts", [])
        for r in rows:
            if isinstance(r, dict) and "cluster" in r:
                yield Path(p).name, r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=Path)
    ap.add_argument("--contract", type=Path, default=DEFAULT_CONTRACT)
    ap.add_argument("--verdicts", default="rejudge_batch_*.json")
    ap.add_argument("--sources", nargs="*", default=[],
                    help="files that should POINT at the contract, never restate it")
    ap.add_argument("--strict", action="store_true",
                    help="fail on SOURCES warnings too, not only on RECORDS")
    a = ap.parse_args()

    fields, channels, tables = parse_contract(a.contract)
    print(f"contract: {a.contract}")
    print(f"  {len(fields)} fields, {len(channels)} channel(s): {', '.join(channels)}")
    failed = warned = False

    # ---- RECORDS
    print("\nRECORDS")
    missing = {}
    n = 0
    for fname, rec in iter_records(a.run_dir, a.verdicts):
        n += 1
        for f in fields:
            if f not in rec:
                missing.setdefault(f, []).append(f"{fname} c{rec['cluster']}e{rec.get('exemplar')}")
    if not n:
        print(f"  no records matched {a.verdicts} -- nothing to check")
    elif not missing:
        print(f"  OK: {n} records carry all {len(fields)} fields")
    else:
        failed = True
        print(f"  FAIL: {n} records checked")
        for f, where in sorted(missing.items(), key=lambda kv: -len(kv[1])):
            everywhere = len(where) == n
            if f in channels and everywhere:
                print(f"    `{f}` absent from ALL {n} records -- CHANNEL ABSENT.")
                print(f"        Expected if this pass predates the channel. It means a")
                print(f"        zero count is evidence about the schema, not the ground.")
                print(f"        NOT expected of a pass run after it: that is a real defect.")
            else:
                tag = "  <-- CHANNEL" if f in channels else ""
                print(f"    `{f}` missing from {len(where)}/{n}{tag}")
                for w in where[:3]:
                    print(f"        e.g. {w}")

    # ---- SOURCES
    print("\nSOURCES")
    if not a.sources:
        print("  (none given)")
    for src in a.sources:
        p = Path(src)
        if not p.exists():
            print(f"  SKIP {src} (not found)")
            continue
        text = p.read_text(encoding="utf-8", errors="replace")

        # (i) executable schemas MUST restate -- check them for agreement instead
        for got, kind, extra, absent in check_required_arrays(text, tables):
            if extra or absent:
                failed = True
                print(f"  FAIL {src}: `required:` array does not match the "
                      f"'{kind}' table")
                if extra:
                    print(f"       not in the contract: {sorted(extra)}")
                if absent:
                    print(f"       missing from the schema: {sorted(absent)}")
            else:
                print(f"  OK   {src}: `required:` array matches the "
                      f"'{kind}' table ({len(got)} fields)")

        # (ii) prose must NOT restate -- a second list is how drift happens.
        #      `required:` arrays are exempt: they are checked exactly above.
        text = re.sub(r"required\s*:\s*\[[^\]]*\]", " ", text)
        # a JSON-Schema `properties` block must name its fields; exempt it too
        text = re.sub(r"properties\s*:\s*\{", " ", text)
        text = re.sub(r"^\s*[a-z_]+\s*:\s*\{\s*type\s*:.*$", " ", text, flags=re.M)
        # ...and so is field ACCESS: `f.label`, `${f.cluster}`, `rec["label"]`.
        # Consuming a field is not declaring a contract. Only a bare list counts.
        text = re.sub(r"\$\{[^}]*\}", " ", text)
        text = re.sub(r"\.\s*[a-z_]+", " ", text)
        text = re.sub(r"\[[\'\"][a-z_]+[\'\"]\]", " ", text)
        worst, worst_line = 0, ""
        for line in text.splitlines():
            hits = sum(1 for f in fields if re.search(rf"\b{re.escape(f)}\b", line))
            if hits > worst:
                worst, worst_line = hits, line.strip()
        # a run of adjacent lines counts too -- prompts wrap
        joined = re.sub(r"\s+", " ", text)
        for m in re.finditer(r"[^.]{0,400}", joined):
            hits = sum(1 for f in fields if re.search(rf"\b{re.escape(f)}\b", m.group(0)))
            if hits > worst:
                worst, worst_line = hits, m.group(0).strip()[:120]
        if worst >= RESTATE_MIN:
            warned = True
            print(f"  WARN {src}: names {worst} contract fields together --")
            print(f"       looks like a second list. Point at the contract instead.")
            print(f"       {worst_line[:110]}")
        else:
            print(f"  OK   {src}: no restatement ({worst} field name(s) at most)")

    print()
    if failed or (warned and a.strict):
        print("FAILED")
        sys.exit(1)
    print("PASSED" + (" (with warnings)" if warned else ""))


if __name__ == "__main__":
    main()
