#!/usr/bin/env python3
"""Build reader cards for a round, and the baseline the round is diffed against.

Why this exists: a run's cards used to be built ad hoc, with the derivation kept
nowhere, so a later round could not be set up without reverse-engineering the
card shape out of the data. Cards are *data* — which cells, which exemplars,
`old_map`, `geo`, neighbour flags — so generating them is right. Generating
*contract text* is not, and this script deliberately does not: the class
definitions reach readers by being read, never by being copied into a prompt.

TWO OUTPUTS, and keeping them apart is the point:

  cards    (--out)      what the readers see.
  baseline (--baseline) what their verdicts get diffed against, NOT shown to
                        readers when --blind.

`--blind` (the default) omits `prev_label` / `prev_conf` / `prev_reasoning` and
the previous cluster vote. Two reasons:

  * anchoring. A pass told what the last pass said, and asked whether it still
    holds, measures agreement-with-the-previous-answer. "Has the corrected
    contract changed the reading?" is precisely the question a visible previous
    label biases toward "no".
  * `convergence-loop.md` prescribes **independent concurrence** — k readers
    judging the same exemplar and agreeing — as the replacement for the mean
    confidence criterion, which fails 101/102 clusters and does not discriminate.
    A blind read IS that independent second vote. A primed one is not.

Baseline label per exemplar, in precedence order:
    re-judge verdicts (--prev-verdicts glob) > initial judgments.

Usage:
  gen_round_cards.py RUN_DIR --out r4_cards.json --baseline r4_baseline.json
  gen_round_cards.py RUN_DIR --no-blind ...        # keep prev_* on the cards
"""
from __future__ import annotations

import argparse
import glob
import json
import re
from collections import defaultdict
from pathlib import Path


def load_geo(run: Path) -> dict[int, str]:
    geo: dict[int, str] = {}
    p = run / "geo.txt"
    if not p.exists():
        return geo
    for line in p.read_text().splitlines():
        m = re.match(r"c(\d+)\s", line)
        if m:
            geo[int(m.group(1))] = line.strip()
    return geo


def load_baseline(run: Path, initial: str, prev_glob: str) -> dict[tuple[int, int], dict]:
    """(cluster, exemplar) -> the label it carries entering this round."""
    base: dict[tuple[int, int], dict] = {}
    ip = run / initial
    if ip.exists():
        for rec in json.loads(ip.read_text()):
            base[(rec["cluster"], rec["exemplar"])] = {
                "label": rec["label"], "confidence": rec.get("confidence"),
                "reasoning": rec.get("reasoning", ""), "source": initial}
    for p in sorted(glob.glob(str(run / prev_glob))):
        blob = json.loads(Path(p).read_text())
        rows = blob if isinstance(blob, list) else blob.get("verdicts", [])
        for rec in rows:
            if not isinstance(rec, dict) or "cluster" not in rec:
                continue
            base[(rec["cluster"], rec["exemplar"])] = {
                "label": rec["label"], "confidence": rec.get("confidence"),
                "reasoning": rec.get("reasoning", ""), "source": Path(p).name}
    return base


def read_json(p: Path, default):
    return json.loads(p.read_text()) if p.exists() else default


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=Path)
    ap.add_argument("--out", default="cards.json")
    ap.add_argument("--baseline", default="baseline.json")
    ap.add_argument("--initial", default="judgments.json")
    ap.add_argument("--prev-verdicts", default="rejudge_batch_*.json")
    ap.add_argument("--blind", action=argparse.BooleanOptionalAction, default=True)
    ap.add_argument("--batches", default="",
                    help="semicolon-separated batches of comma-separated cluster ids, "
                         "e.g. '2,78,103;35,90,109' -> also writes cards_b0.json, cards_b1.json")
    a = ap.parse_args()
    run = a.run_dir

    prior = read_json(run / "prior_labels.json", {})
    c2l = read_json(run / "cluster_to_label.json", {})
    frozen = {r["cluster"] for r in read_json(run / "frozen_water.json", [])}
    nbr_flags = {r["cluster"]: r for r in read_json(run / "nbr_flags.json", [])}
    nbr_verd: dict[int, list] = defaultdict(list)
    for r in read_json(run / "nbr_verdicts.json", []):
        nbr_verd[r["cluster"]].append(r)

    geo = load_geo(run)
    base = load_baseline(run, a.initial, a.prev_verdicts)

    by_cell: dict[int, list[int]] = defaultdict(list)
    for (cid, ex) in base:
        by_cell[cid].append(ex)

    cards, skipped = [], []
    for cid in sorted(by_cell):
        if cid in frozen:
            skipped.append(cid)
            continue
        exemplars = []
        for ex in sorted(by_cell[cid]):
            b = base[(cid, ex)]
            e: dict = {"e": ex}
            if not a.blind:
                e |= {"prev_label": b["label"], "prev_conf": b["confidence"],
                      "prev_reasoning": b["reasoning"]}
            exemplars.append(e)
        card = {
            "cluster": cid,
            "px": prior.get(str(cid), {}).get("n_px"),
            "geo": geo.get(cid, ""),
            "exemplars": exemplars,
            "old_map": prior.get(str(cid), {}).get("old_dist", {}),
        }
        if not a.blind:
            v = c2l.get(str(cid), {})
            card |= {"current_vote": v.get("label"), "agreement": v.get("agreement"),
                     "conf": v.get("confidence")}
        if cid in nbr_flags:
            card["nbr_flag"] = nbr_flags[cid]
        if cid in nbr_verd:
            card["nbr_pair_verdict"] = nbr_verd[cid]
        cards.append(card)

    (run / a.out).write_text(json.dumps(cards, indent=1))

    # Per-batch card files: hand each reader ITS cards, not all of them.
    # A reader given the whole file has to narrow it down itself, and the readers
    # who did that spent tool calls re-deriving a slice the orchestrator already
    # knew -- 10 of 39 non-image shell calls in the 2026-08-22 swarm. It also
    # loads every reader's context with every other reader's cells, which scales
    # with the round rather than with the batch, and transcript size is what puts
    # a reader beyond reach for a debrief. Same principle as the patch crop:
    # render the right input once, rather than shipping the tools to make it.
    batch_out = []
    for i, spec in enumerate(b for b in a.batches.split(";") if b.strip()):
        ids = {int(x) for x in spec.split(",") if x.strip()}
        sub = [c for c in cards if c["cluster"] in ids]
        missing = ids - {c["cluster"] for c in sub}
        name = f"{Path(a.out).stem}_b{i}.json"
        (run / name).write_text(json.dumps(sub, indent=1))
        batch_out.append((name, len(sub), sum(len(c["exemplars"]) for c in sub), sorted(missing)))
    (run / a.baseline).write_text(json.dumps(
        {"run": run.name, "blind": a.blind,
         "note": "label per exemplar entering this round; what the round is diffed against",
         "records": [{"cluster": c, "exemplar": e, **v} for (c, e), v in sorted(base.items())]},
        indent=1))

    src: dict[str, int] = defaultdict(int)
    for v in base.values():
        src[v["source"]] += 1
    n_ex = sum(len(c["exemplars"]) for c in cards)
    leaked = "prev_label" in json.dumps(cards)
    print(f"blind={a.blind}")
    print(f"cards:    {len(cards)} cells, {n_ex} exemplars -> {a.out}")
    print(f"baseline: {len(base)} exemplar labels -> {a.baseline}")
    print(f"  by source: {dict(src)}")
    print(f"frozen cells skipped: {len(skipped)} {skipped}")
    for name, n_cells, n_exs, missing in batch_out:
        # A requested id with no card is reported, never dropped quietly: it means
        # that cell is frozen or absent, and the reader would otherwise be blamed
        # for not covering it.
        warn = f"  MISSING (frozen or absent): {missing}" if missing else ""
        print(f"batch:    {n_cells} cells, {n_exs} exemplars -> {name}{warn}")
    print(f"prev_label present on cards: {'YES -- NOT BLIND' if leaked else 'no'}")
    if a.blind and leaked:
        raise SystemExit("BLIND VIOLATED: prev_label leaked onto the cards")


if __name__ == "__main__":
    main()
