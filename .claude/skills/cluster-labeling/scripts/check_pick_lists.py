#!/usr/bin/env python
"""Assert that no reader-facing pick-list offers a not-assignable class.

The hierarchy may carry classes that are real on the ground but cannot be
assigned with current methodology (`_status: not-assignable`). Those must appear
in glossaries and coverage analyses but must NEVER appear in a surface a reader
picks from. This checks the generated artifacts, not the generators -- the
observed failure mode is a correctly-generated artifact going stale, which no
amount of correct generator code prevents.

**One generated surface is left, not two.** `RUN_DIR/prompt.txt` was the other;
its generator went with the Gemini path in `a20a78f` and the file is retired, so
the arm that read it could never fire again and was removed rather than left to
report SKIP forever. What replaced it is NOT a generated artifact: the
`cluster-reader` agent reads the AOI pack's `class-definitions.md` directly. That
document is the glossary, which by the rule above must show every class including
the blocked ones -- so it cannot be checked here, and a blocked class is now kept
out of a reader's hands by how the definition is written, not by a filter this
script can assert. That gap is real and is not this script's to close.

  check_pick_lists.py --hierarchy land-cover.json RUN_DIR

Exit 1 on any violation.
"""
import argparse
import json
import re
import sys
from pathlib import Path


def walk(node, pre="", inherit=None):
    """Yield (dotted_path, status); a child inherits its parent's status."""
    for k, v in node.items():
        if k.startswith("_"):
            continue
        path = f"{pre}.{k}" if pre else k
        status = v.get("_status") or inherit
        yield path, status
        yield from walk(v, path, status)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=Path)
    ap.add_argument("--hierarchy", type=Path, required=True)
    a = ap.parse_args()

    hier = json.loads(a.hierarchy.read_text())
    blocked = {p for p, s in walk(hier) if s == "not-assignable"}
    if not blocked:
        print("no not-assignable classes in the hierarchy; nothing to check")
        return 0

    print(f"{len(blocked)} not-assignable class(es): {', '.join(sorted(blocked))}\n")

    # Each surface: (label, path, regex extracting every offered class path).
    surfaces = [
        # The review page's radio VALUES are role tokens (prior/verifier/...),
        # not class paths. Its actual pick-list is the <datalist id="labels">
        # backing the "Other" and class-contract inputs, built from LABELS.
        ("review_decisions.html datalist", a.run_dir / "review_decisions.html",
         re.compile(r'<option value="([a-z_]+(?:\.[a-z_]+)*)"')),
    ]

    violations = 0
    checked = 0
    for name, path, pat in surfaces:
        if not path.exists():
            print(f"SKIP  {name} -- not present")
            continue
        checked += 1
        offered = set(pat.findall(path.read_text(errors="replace")))
        bad = sorted(offered & blocked)
        if bad:
            violations += len(bad)
            print(f"FAIL  {name}: offers {len(bad)} not-assignable class(es)")
            for b in bad:
                print(f"        {b}")
        else:
            print(f"ok    {name}: {len(offered)} classes offered, none blocked")

    if violations:
        print(f"\n{violations} violation(s). Regenerate the surface from the "
              f"current hierarchy.")
        return 1
    if not checked:
        # A green that checked nothing is the failure this whole script exists
        # to prevent. Never report clean on an empty run.
        print(f"\nNO SURFACE CHECKED -- is {a.run_dir} the right run directory?")
        return 1
    print(f"\nall pick-lists clean ({checked} surface(s) checked)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
