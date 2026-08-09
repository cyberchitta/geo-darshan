# The convergence loop — settle, split, repeat

Multi-pass procedure for driving a labeling round to labels that survive scrutiny,
instead of stopping when the readers stop objecting. Load this when running pass
N+1, tuning the gate, or building the unbuilt pieces below.

Single-pass procedure and the methodology rules are in `SKILL.md`; this file is
only the loop that wraps it.

## The idea

Each pass, retire the clusters whose evidence is strong enough and subdivide the
rest. Repeat until nothing new settles.

The load-bearing word is *evidence*. The naive rule — "retire clusters whose
exemplars all agree" — certifies the clusters you examined **least**, because
agreement is cheapest where nobody looked hard. The gate exists to make
retirement expensive.

## Per-cluster state machine

    SETTLED   all criteria pass; label retired at this defs_version
    OPEN      unanimous but ≥1 criterion failed (reasons in `fails`)
    RESAMPLE  too few exemplars to judge unanimity — needs more looks, not a split
    RETREAT   exemplars disagree WITHIN a subtree → use the common ancestor
    SPLIT     exemplars disagree ACROSS families → real spatial impurity

`scripts/gate.py` computes this into `RUN_DIR/ledger.json`.

## The gate (conjunctive — every criterion must pass)

| # | criterion | default | notes |
|---|---|---|---|
| 1 | `n_exemplars >= N` | 3 | unanimity of one is an artifact, not evidence |
| 2 | unanimous label | — | |
| 3 | every exemplar independently verified | — | **usually the binding one** |
| 4 | mean confidence ≥ | 0.65 | **see "confidence is not a criterion"** |
| 5 | coverage ≥, or cluster below px floor | 0.30 / 25 px | **exemplars see ~a fifth of a cluster** — see below |
| 6 | no prior-map class ≥ threshold in a different family | 0.60 | |
| 7 | no unrelated dominant neighbour ≥ share | 0.25 | compares *current* labels |
| 8 | label exists in the hierarchy | — | catches `uncertain`, stale classes |

Criterion 7 must resolve the neighbour's **current** label. `nbr_flags.json` is a
once-per-round snapshot whose `nbr_label` goes stale the moment any judgment
changes; comparing against it blocked 27 clusters where only 5 were real.

## Disagreement triage

    one disputed label is an ancestor of all others  → RETREAT to it
    longest common prefix depth >= retreat_min_depth → RETREAT to the prefix
    otherwise                                        → SPLIT

`eroded_land` vs `degraded_barren` retreats; `cashew` vs `coconut` retreats to
`orchards`; `fallow` vs `cashew` splits. **Splitting only fixes disagreement
caused by the cluster covering two different things.** Definitional ambiguity
produces children that still straddle the same boundary — that is a contract
problem, fix the class definition. Resolution limits want a parent-level label.

## Exemplars see about a fifth of a cluster

Measured over 125 clusters (k88∩k22): exemplar pixels as a fraction of cluster
pixels ran **median 20.8%**, mean 27.2%, and 45 clusters were under 15%.

The default picks the N *largest* patches, so coverage is biased toward the
dominant cover and the minority cover sits in the unseen tail — which is exactly
what impurity is. Unanimity across three views of a fifth of a cluster is weak
evidence about the other four fifths. This is why criterion 5 exists, and why
"all exemplars agreed" cannot stand alone as a retirement rule.

## Confidence is not a criterion

Measured over 102 clusters (k88∩k22, 2026-08-09): mean-confidence **max 0.65**,
median 0.41, exactly one cluster at the 0.65 floor. Separately, confidence does
not discriminate — upheld flips averaged 0.43, refuted 0.41.

Both unreachable and uninformative. **Do not lower the threshold** — that admits
noise more cheaply. Replace it with **independent concurrence**: k readers judging
the same exemplar and agreeing. The reader/verifier pair already is a two-vote
check; criterion 3 half-measures it. Keep confidence as advisory metadata.

## Verify agreement, not just change

The first re-judge sent only *changed* verdicts to the adversarial pass, so 158 of
266 exemplars were never challenged and agreement was unexamined by construction.
Under the naive rule that would have retired 39 clusters, 20 of them never
verified at all.

**Every exemplar goes to verification, changed or not.** This is the single
biggest unblocker: with only 28% of exemplars verified, nothing can settle
regardless of the other thresholds.

## Re-sampling must show new ground

The renderer's default picks the N *largest* patches, so a split child gets handed
the same patch its parent already showed. On re-entry, exclude previously judged
patch centroids and stratify across prior-label strata and spatial sub-regions.
(SKILL.md, "Stratified exemplar selection".)

## Human verdicts

Maintainer verdicts are ground truth, not evidence to be weighed — a human look
*is* the verification for that exemplar. But they serve two conflicting roles:

- **input** — settle the exemplar directly, bypassing criteria 2–4
- **held-out calibration** — score whether the gate's thresholds are right

Feeding every verdict in as input leaves nothing to measure with. **Reserve a
held-out set** that never enters the loop. Each pass, sample ~10 freshly SETTLED
clusters and put them to the maintainer blind; if precision drops below ~0.9 the
gate is too loose. Without this the loop is models checking models, and a
correlated blind spot survives every pass by construction.

## Contract revisions invalidate retirements

`ledger.json` stamps `defs_version` (sha of the AOI pack's class-definitions +
hierarchy). When a class definition changes, every SETTLED cluster whose label
touches that class returns to OPEN. The 2026-08-09 definition rewrite moved 41% of
verdicts — retirements made under superseded definitions are not safe.

## Termination

Cluster px floor 25 (~0.25 ha at 10 m pixels); max 4 passes; stop when a pass
settles < 5% of remaining. A cluster at the px floor that still disagrees takes
the retreat label rather than splitting further.

## Built vs not

**Built:** `gate.py` (ledger + gate + triage) · `gen_intersection.py` (finer-k
split) · `gen_prior_labels.py` (cross-tab) · `gen_review_html.py` (neighbour
flags) · `aggregate.py` (vote).

**Not built:** verify-all-exemplars in the re-judge workflow · concurrence
criterion replacing confidence · stratified/novel re-sampling · connected-
component carve (the non-finer-k split path) · human-verdict input with authority
levels · held-out calibration + precision scoring · re-opening SETTLED on
`defs_version` change · the pass N→N+1 driver.

## Open decisions

- How many concurring readers for criterion 4's replacement — 2, 3, majority?
- Coverage floor 0.30 blocks 60 of 102. Should low coverage *block*, or instead
  trigger RESAMPLE (more exemplars) rather than fail the gate?
- `retreat_min_depth = 2` sends `forest.planted_forest` vs `forest.natural_forest`
  to SPLIT. Defensible (a real spatial distinction) but worth revisiting.
- How many exemplars does RESAMPLE add, and drawn from where?
- Do split children inherit their parent's verification state, or reset to zero?

## Verifying the gate

A green gate proves nothing until watched going red. Inject faults at the
**verify** layer, not into `judgments.json` — `--apply-verified` overwrites
judgment labels, so injecting there is a silent no-op that reports SETTLED on
data you believe you corrupted. Cover: cross-family disagreement, sibling
disagreement, a non-hierarchy label, and a demoted verification.
