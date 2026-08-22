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



LABEL_BEARING = {"prev_label", "prev_conf", "prev_reasoning", "current_vote",
                 "cover", "label", "alternative", "voted_label"}


def _class_names(hierarchy: Path) -> set:
    """Every dotted path and leaf name in the AOI hierarchy."""
    names, stack = set(), [("", json.loads(hierarchy.read_text()))]
    while stack:
        prefix, node = stack.pop()
        if not isinstance(node, dict):
            continue
        for k, v in node.items():
            if k.startswith("_"):
                continue
            path = f"{prefix}.{k}" if prefix else k
            names.add(path)
            names.add(k)
            stack.append((path, v))
    return names


def blind_leak(cards, hierarchy, blind: bool) -> bool:
    """Does anything on these cards state a previous verdict?

    The check this replaces was `"prev_label" in json.dumps(cards)` -- one
    spelling of the failure. It passed round 4's cards, which carry
    `nbr_pair_verdict[].cover` (a full dotted class), its `confidence`, and a
    `note` arguing the call, on 33 of 120 cells. A reader reported it, unprompted,
    on 2026-08-22; the round had asserted it was blind.

    `old_map` is deliberately exempt: a prior-map distribution IS the sanctioned
    positional evidence and is keyed by class name by design. Everything else is
    walked, and a label-shaped string anywhere in it counts.
    """
    if not blind:
        return False
    if hierarchy is None:
        # Third state, not a pass: say the check could not run.
        print("blind check: NOT CHECKED — no --hierarchy given, so a previous "
              "label on these cards would pass unnoticed. This is not a clean "
              "result; it is an unchecked one.")
        return False
    known = _class_names(hierarchy)
    # A set, not a list: the key rule and the value rule both fire on the same
    # `cover`/`label` string, and a doubled count would overstate the leak.
    hits = set()

    def walk(node, path, cluster):
        if isinstance(node, dict):
            for k, v in node.items():
                if k == "old_map":
                    continue          # sanctioned prior-map evidence
                if k in LABEL_BEARING and isinstance(v, str) and v:
                    hits.add((cluster, f"{path}.{k}", v))
                walk(v, f"{path}.{k}", cluster)
        elif isinstance(node, list):
            for i, v in enumerate(node):
                walk(v, f"{path}[{i}]", cluster)
        elif isinstance(node, str) and node in known and "." in node:
            hits.add((cluster, path, node))

    for c in cards:
        walk(c, "", c.get("cluster"))
    if hits:
        cells = sorted({h[0] for h in hits})
        print(f"BLIND LEAK: {len(hits)} previous-label value(s) on "
              f"{len(cells)} of {len(cards)} cards — the round is NOT blind.")
        for cl, where, val in sorted(hits, key=lambda h: (h[0] or 0, h[1]))[:6]:
            print(f"    c{cl}{where} = {val!r}")
        if len(hits) > 6:
            print(f"    ... and {len(hits) - 6} more")
        print(f"    cells: {cells}")
    return bool(hits)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=Path)
    ap.add_argument("--out", default="cards.json")
    ap.add_argument("--baseline", default="baseline.json")
    ap.add_argument("--initial", default="judgments.json")
    ap.add_argument("--prev-verdicts", default="rejudge_batch_*.json")
    ap.add_argument("--blind", action=argparse.BooleanOptionalAction, default=True)
    ap.add_argument("--hierarchy", type=Path,
                    help="AOI land-cover.json; without it the blind check reports "
                         "NOT CHECKED instead of passing")
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

    pm_path = a.run_dir / "patch_metrics.json"
    patch_metrics = json.loads(pm_path.read_text()) if pm_path.exists() else {}
    if not patch_metrics:
        # Said out loud: cards without these are cards whose reader cannot tell a
        # 2-pixel cell from a 2000-pixel one, and that is the misread T75 is about.
        print(f"NO PATCH METRICS at {pm_path.name} -- exemplars will carry no "
              f"share/seg_px/native_px. Run gen_patch_crops.py first.")

    cards, skipped = [], []
    for cid in sorted(by_cell):
        if cid in frozen:
            skipped.append(cid)
            continue
        exemplars = []
        for ex in sorted(by_cell[cid]):
            b = base[(cid, ex)]
            e: dict = {"e": ex}
            # What the patch crop actually is, measured when it was rendered.
            # These ride in the card rather than being burned into the JPEG: a
            # reader needs them to calibrate confidence on a small cell, and text
            # in the image costs area, fights the frame width, and cannot be
            # corrected without re-rendering. Absent if the crops predate it.
            e |= patch_metrics.get(f"c{cid}e{ex}", {})
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
        # A cell whose own cross-tab is mostly unmapped code has no positional
        # evidence, and the reader is told to fall back to the prior map's
        # neighbours. Carry that fallback: without it the instruction named an
        # input the card did not supply. Present ONLY for those cells -- the
        # surroundings must not become a default where the cell speaks for itself.
        pr_rec = prior.get(str(cid), {})
        if "old_dist_ring" in pr_rec:
            card["old_map_ring"] = pr_rec["old_dist_ring"]
            card["old_map_note"] = (
                f"this cell's own prior-map cross-tab is {pr_rec['own_dist_uninformative']:.0%} "
                f"unmapped code, i.e. no positional evidence for the cell itself; "
                f"old_map_ring is the prior map in a ring around it "
                f"({pr_rec['ring_px']} px). Weigh it below what you can see in the "
                f"crops, and do not treat it as this cell's label.")

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
    leaked = blind_leak(cards, a.hierarchy, a.blind)
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
