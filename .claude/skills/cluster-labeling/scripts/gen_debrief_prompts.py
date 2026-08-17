#!/usr/bin/env python3
"""Fill the reader-debrief question template, once per reader, mechanically.

The template and the field list live in
`.claude/skills/cluster-labeling/references/reader-debrief.md` and are READ from
it here, never restated. That is the same single-source rule `verdict-record.md`
enforces, and this script would otherwise be the second copy that drifts.

What varies per reader is only what can be computed from that reader's own
verdict file: how many cards and exemplars it judged, which exemplars it left
`uncertain`, how often each channel fired. Nothing is hand-worded, and nothing is
adjusted after reading their verdicts — frequency across readers is the filter,
and it only measures the process if every reader was asked the same question.

Usage:
  gen_debrief_prompts.py RUN_DIR --verdicts 'r4_batch_*.json' --out-prefix debrief
"""
from __future__ import annotations

import argparse
import glob
import json
import re
from pathlib import Path

DEFAULT_CONTRACT = (Path(__file__).resolve().parents[1]
                    / "references" / "reader-debrief.md")


def load_template(contract: Path) -> str:
    """The last fenced ```text block in the contract is the question template."""
    blocks = re.findall(r"```text\n(.*?)```", contract.read_text(encoding="utf-8"), re.S)
    if not blocks:
        raise SystemExit(f"no ```text template block found in {contract}")
    return blocks[-1].rstrip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=Path)
    ap.add_argument("--verdicts", default="r4_batch_*.json")
    ap.add_argument("--contract", type=Path, default=DEFAULT_CONTRACT)
    ap.add_argument("--out-prefix", default="debrief")
    ap.add_argument("--json", type=Path, help="also write the filled prompts as JSON")
    a = ap.parse_args()

    tmpl = load_template(a.contract)
    prompts = []
    for p in sorted(glob.glob(str(a.run_dir / a.verdicts))):
        blob = json.loads(Path(p).read_text())
        rows = blob if isinstance(blob, list) else blob.get("verdicts", [])
        rows = [r for r in rows if isinstance(r, dict) and "cluster" in r]
        if not rows:
            continue
        m = re.search(r"_(\d+)\.json$", Path(p).name)
        batch = int(m.group(1)) if m else len(prompts)
        unc = [f"c{r['cluster']}e{r['exemplar']}" for r in rows
               if r.get("label") == "uncertain"]
        slots = {
            "batch_file": Path(p).name,
            "n_cards": len({r["cluster"] for r in rows}),
            "n_exemplars": len(rows),
            "n_uncertain": len(unc),
            "uncertain_ids": ", ".join(unc) if unc else "none",
            "n_no_class_fits": sum(1 for r in rows if r.get("no_class_fits")),
            "n_mixed": sum(1 for r in rows if r.get("mixed")),
            "out_file": f"{a.out_prefix}_{batch}.json",
        }
        prompts.append({"batch": batch, "batch_file": Path(p).name,
                        "out_file": slots["out_file"], "slots": slots,
                        "prompt": tmpl.format(**slots)})

    if not prompts:
        raise SystemExit(f"no verdict files matched {a.verdicts} in {a.run_dir}")

    # Uniformity is the whole basis of the frequency filter, so prove it rather
    # than trust it: substitute each prompt's OWN slot values back out by name
    # and confirm what remains is byte-identical across readers. Guessing the
    # slots with a regex instead reports a false difference the moment two
    # readers' values differ in shape (`none` vs `c61e0, c62e1`).
    # Build a matcher from the template itself: escape everything, then turn each
    # {slot} into a wildcard. A prompt that does not fullmatch has prose the
    # template did not put there — hand-wording, or a per-reader adjustment.
    # (Substituting slot VALUES back out instead does not work: a slot whose
    # value is `0` or `2` also matches digits elsewhere in the text and corrupts
    # readers differently, which reads as non-uniformity that is not there.)
    pat = re.sub(r"\\\{[a-z_]+\\\}", ".*?", re.escape(tmpl), flags=re.S)
    odd = [pr["batch"] for pr in prompts
           if not re.fullmatch(pat, pr["prompt"], re.S)]
    if odd:
        raise SystemExit(f"TEMPLATE NOT UNIFORM: batches {odd} do not match the "
                         "template — the frequency tally would measure who was "
                         "asked what, not what readers independently hit")

    if a.json:
        a.json.write_text(json.dumps(prompts, indent=2))
    for pr in prompts:
        print(f"===== batch {pr['batch']}  ({pr['batch_file']} -> {pr['out_file']})")
        print(pr["prompt"])
        print()
    print(f"{len(prompts)} prompts; all {len(prompts)} fullmatch the template — "
          "only mechanical slots differ")


if __name__ == "__main__":
    main()
