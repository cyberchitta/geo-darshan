#!/usr/bin/env python3
"""Does a ledger's stored defs_version still describe what is on disk?

The widened `--defs` detects that reader inputs moved. Nothing read the detector:
round 3's ledger was stamped at 19:37 on 2026-08-17, three commits then edited
files inside `--defs` without re-running the gate, and the drift was found weeks
later by recomputing the hash by hand. This is that recomputation, automated.

A DRIFTED ledger is not wrong about its own past -- it correctly records the
contract its verdicts were judged under. What drifted is the world. So this
reports, and never rewrites: re-stamping a ledger to silence it would assert the
verdicts had been judged against a contract that did not exist when they were
made, which is the failure `intent.md` names.

Usage
  check_defs_drift.py RUN_DIR [--ledger ledger.json]

Exit 0 MATCHES, 1 DRIFTED or unreadable, 2 NO DEFS RECORDED.

NO DEFS RECORDED is a distinct exit on purpose. A ledger written before gate.py
started recording `defs` cannot be checked at all -- absent is not the same as
clean, and collapsing them would report the unauditable as green.
"""
import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gate import defs_version  # noqa: E402  -- the real function, never a copy


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=Path)
    ap.add_argument("--ledger", default="ledger.json")
    a = ap.parse_args()

    path = a.run_dir / a.ledger
    if not path.exists():
        print(f"UNREADABLE: no ledger at {path}")
        return 1
    led = json.loads(path.read_text())

    stored = led.get("defs_version")
    defs = led.get("defs")
    if not defs:
        print(f"NO DEFS RECORDED: {path} stores defs_version={stored!r} but not the "
              f"paths it was computed over.")
        print("  Written before gate.py recorded them. It cannot be checked from "
              "itself; the list, if it survives, is in the run's handoff.")
        return 2

    # defs_version() sorts the path strings and reads each relative to the cwd,
    # so the check must run from the directory the gate ran in -- the run dir,
    # per the recorded invocation. Resolving or reordering them changes the hash.
    here = Path.cwd()
    try:
        os.chdir(a.run_dir)
        missing = [d for d in defs if not Path(d).exists()]
        if missing:
            print(f"DRIFTED: {len(missing)} of {len(defs)} --defs inputs no longer exist, "
                  f"so the stamp cannot be recomputed at all:")
            for m in missing:
                print(f"  gone  {m}")
            return 1
        now = defs_version(defs)
    finally:
        os.chdir(here)

    if now == stored:
        print(f"MATCHES: {path.name} defs_version={stored} still reproduces from its "
              f"{len(defs)} recorded inputs.")
        return 0

    print(f"DRIFTED: {path.name} stores defs_version={stored}, but its {len(defs)} "
          f"recorded inputs now hash to {now}.")
    print("  The verdicts in this ledger were judged under the stored contract; what")
    print("  moved is a file a reader reads. Do NOT re-stamp to silence this -- decide")
    print("  whether those verdicts are still comparable, and re-run the round if not.")
    for d in defs:
        print(f"  in --defs  {d}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
