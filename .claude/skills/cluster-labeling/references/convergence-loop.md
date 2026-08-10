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

## Readers need a confirmed-exemplar library, not just prose

Concurrence between readers who share a calibration blind spot is *correlated*
agreement — it reads as evidence and is not. Held-out human calibration (below)
catches this after the fact; a library of confirmed example crops prevents it,
by grounding each reader in maintainer-confirmed instances rather than in each
other. That makes it **upstream of verify-all-exemplars**: 2.5× the verify cost
against a miscalibrated eye buys less than fixing the eye first.

The AOI pack has the slot — a reference-crops table — and the corrections loop
routes learnings to it, but nothing promotes into it. The supply is already
being produced: a SETTLED cluster's verified exemplars *are* confirmed examples
of their class. Three failure modes in the hand-maintained form, all observed on
the Auroville pack (2026-08-10):

- **No promotion path.** Every row was hand-added in rounds 1–2; round 3
  contributed none, and the table's own "still needed" list went unfilled.
- **Crops live in the gitignored run dir.** A run-dir cleanup silently guts the
  calibration set, and a reader cannot distinguish a missing crop from one it
  forgot to read. Promoted crops belong *in the pack*, committed.
- **Per-class coverage is untracked** — 11 rows against a 44-node hierarchy, with
  no report of which classes have none. (Distinct from the cluster-pixel coverage
  of criterion 5; this is coverage of the *label space*.)

Promotion must be **human-confirmed only**, at least initially. Promoting on
gate-SETTLED alone feeds model-confirmed exemplars back into model calibration —
the correlated blind spot again, one level up.

Whatever manifest records the library belongs in `defs_version`'s hash: a
changed exemplar set shifts reader behaviour as much as a changed definition
does, and must re-open retirements the same way.

## Re-sampling must show new ground

The renderer's default picks the N *largest* patches, so a split child gets handed
the same patch its parent already showed. On re-entry, exclude previously judged
patch centroids and stratify across prior-label strata and spatial sub-regions.
(SKILL.md, "Stratified exemplar selection".)

## `refuted` is not one thing

A refuted flip means the verifier rejected the reader's *change*. It does not mean
the verifier endorsed the *prior* label — and when it names a `better_label`, the
two come apart. Measured on k88∩k22 (2026-08-10): of 18 refuted, **5 carried a
better_label differing from the prior**, so "drop the refuted flips" would have
reverted them to a label the verifier explicitly argued against. One verifier note
reads "fallow is correctly rejected" on an exemplar the revert sends back to
`fallow`.

Triage refuted into three, and route them differently:

    clean      no better_label -> revert to prior; safe to bulk-confirm
    contested  better_label != prior -> a maintainer choice, not a revert
    unclear    verifier could not decide -> a maintainer call

`clean` and `contested` are both `verify: refuted` in the flips file; nothing
downstream distinguishes them unless you compute it.

## The human adjudication step

The loop has a position for the maintainer — **after verify, before gate** — and
it needs a surface, not a prose request. What that surface must show, learned by
building one that didn't:

- **Cluster-centric, never per-flip.** A ruling on one exemplar is worth nothing
  without its siblings: the gate wants unanimity, so an exemplar's call only moves
  the cluster if the siblings already agree. On k88∩k22, of 15 unsettled
  exemplars only 4 sat in clusters where the call could produce unanimity; 5 were
  already decided by sibling disagreement and 6 sat in clusters that fail
  criterion 1 regardless. A per-flip page asks for 15 rulings and cashes 4.
- **State the stakes per card** — decisive / not decisive / blocked-regardless.
  Otherwise every row looks equally urgent.
- **Carry the contract inline.** The maintainer is a domain expert on the *place*,
  not on the class scheme. Definitions and confirmed reference crops belong on the
  card, not one file away.
- **Group by the question, not the instance.** Where one class definition drives
  several open decisions, ask it once as a class-contract question. On k88∩k22,
  `forest.tree_lines` accounted for 4 of 15 unsettled and 6 of 18 refuted.

Output is a `human_verdicts.json` carrying `verify: "human"`, per-exemplar
decision, self-rated confidence, and provenance. **These are the most durable
artifacts a round produces** — model verdicts are superseded by the next re-judge
and retirements re-open on a defs change, but a maintainer's look at a crop stays
true. They must not live in a gitignored run dir.

## Coarse-scale hierarchy, fine-scale cells

The label set gets drawn while looking at large regions; later passes judge much
smaller cells. A cover that was negligible at coarse k can be the whole story in a
40-pixel cell — and **a class that does not exist cannot be chosen**, so the cell
gets filed under the nearest catch-all and the forcing leaves no trace. The
symptom is a catch-all that grows without ever being argued for: on this AOI,
`fallow` reached 28.5% of judged pixels and sprayed across the map.

This has already been caught once by eye — `forest.tree_lines` was added because
roadside and tank-margin strips were defaulting to `fallow`. Once is luck. The
loop needs the channel:

- Every judging surface, model and human, needs a **"no class fits" output** with
  a free-text description, kept as data rather than prose.
- Two standing signals worth mining per pass: a class whose share grows while its
  mean confidence falls, and clusters where readers disagree *non-nested* (no
  common ancestor) at uniformly low confidence — that pattern is a missing class,
  not the spatial impurity SPLIT assumes.
- **Look up the published scheme before inventing a node** — NRSC/FAO/CORINE
  strata are finer than what gets instantiated, and `tree_lines` came straight
  from FSI Trees-Outside-Forests plus Copernicus Small Woody Features.
- A proposal must clear the **MMU test**: a feature narrower than one cluster cell
  has no cell to carry it, so it is a resolution artifact, not a class.
- Adding a class is a contract revision — it bumps `defs_version` and re-opens
  retirements. Batch proposals between passes; never mid-pass.

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

**Prototyped, not promoted** (round-3 run dir, `gen_decisions_review.py`): the
human adjudication surface — cluster cards, refuted triage, inline contract +
reference crops, `human_verdicts.json` export with reference-example and
missing-class channels. First use; graduates to `scripts/` if round 4 wants it.
The *contract* it emits (the `human` verdict value, the export schema, the
clean/contested/unclear triage) is AOI-agnostic and belongs here regardless.

**Not built:** verify-all-exemplars in the re-judge workflow · **exemplar
promotion into the AOI pack** (confirmed crops → pack, with provenance + per-class
coverage report) · concurrence criterion replacing confidence · stratified/novel
re-sampling · connected-component carve (the non-finer-k split path) ·
`gate.py` honouring `verify: "human"` (currently counts only `upheld`, so a
maintainer ruling cannot satisfy criterion 3) · missing-class signal mining ·
held-out calibration + precision scoring · re-opening SETTLED on `defs_version`
change · the pass N→N+1 driver.

## Open decisions

- How many concurring readers for criterion 4's replacement — 2, 3, majority?
- Coverage floor 0.30 blocks 60 of 102. Should low coverage *block*, or instead
  trigger RESAMPLE (more exemplars) rather than fail the gate?
- `retreat_min_depth = 2` sends `forest.planted_forest` vs `forest.natural_forest`
  to SPLIT. Defensible (a real spatial distinction) but worth revisiting.
- How many exemplars does RESAMPLE add, and drawn from where?
- Do split children inherit their parent's verification state, or reset to zero?
- Does the exemplar manifest enter `defs_version`? (Argued yes above — but it
  means every promotion re-opens retirements, so promotion has to batch.)
- Can gate-SETTLED ever promote an exemplar on its own, or is human confirmation
  permanently required?
- Where do `human_verdicts.json` and promoted crops live — the AOI pack, or notes?
  Both outlive the run dir; the pack is what readers already load.
- Does a maintainer's self-rated "guess" carry the same authority as "sure"? If
  not, a low-confidence human call is evidence, not ground truth — and the
  authority levels stop being binary.

## Verifying the gate

A green gate proves nothing until watched going red. Inject faults at the
**verify** layer, not into `judgments.json` — `--apply-verified` overwrites
judgment labels, so injecting there is a silent no-op that reports SETTLED on
data you believe you corrupted. Cover: cross-family disagreement, sibling
disagreement, a non-hierarchy label, and a demoted verification.
