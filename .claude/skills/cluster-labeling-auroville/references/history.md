# Auroville labeling — round history and provenance

Background for **reviewing or revising** the pack, not for judging. If you are
labeling, you want `SKILL.md` + `class-definitions.md`; nothing here changes what
you should emit. This file exists so the operational files can state rules
without carrying the story of how each one was learned.

Kept here: what each round did, why a rule exists, which errors produced it, and
open threads.

## Rounds

### Round 1 — k22
`data/av-3.5K/intermediates/vlm_label_k22/` — 22 clusters × 3 exemplars, labeled
by Claude in-harness. User gave 2 feedback rounds. Full results + the append-only
`corrections.md` (per-cluster geo + user feedback) live in that dir.

### Round 2 — k88
`data/av-3.5K/intermediates/vlm_label_k88/` — 88 clusters × 6 exemplars, judged
in-harness by 11 parallel reader agents sharing one calibration brief. Outputs:
`judgments.json`, `cluster_to_label.json`, `review.html`, `split_candidates.md`,
`corrections.md`.

- Geography priors all held (casuarina W/NW, cashew E/S, centre = gardens).
- Per-exemplar vs old-map agreement: only **25% exact / 36% with hierarchy
  match** — the relabel is genuinely correcting the old map, not reproducing it.
- Errors found, and the rules they produced: `grazing_land` over-applied as a
  low-confidence default → **retired**; built subtypes arbitrary without
  definitions → **defined**; harvested casuarina under-called → **two-phase
  signature**.

### k88 ∩ k22 intersection — built 2026-07-05
Via the engine's `gen_intersection.py`: the 22 flagged split candidates (see
`vlm_label_k88/split_candidates.md`) partitioned by k22 membership →
`intermediates/clusters/k88xk22_s42.tif` (**191 clusters**, ids 0–190; largest
cell keeps the parent id, minorities = 88–190) + `k88xk22_s42_mapping.json`
(parentage). All 22 split under k22; verified pixel-conserving. Details and the
round-3 plan: `vlm_label_k88/INTERSECTION.md`.

Known limit: **interleaved** impurities (two-phase casuarina, the central gardens
gradient) survive within cells — an intersection with a *coarser* level cannot
separate those. See open thread (c).

### Round 3 — k88∩k22, judged 2026-07-05
`data/av-3.5K/intermediates/vlm_label_k88xk22/` — 103 minority cells + the 22
re-judged parents, 332 verdicts by 10 parallel fresh readers off `BRIEF.md`.

- Hard rules held (no `grazing_land`, no `natural_forest`); `maintained_grass`
  stayed central; tank-margin cells resolved as a coherent seasonal-tank family;
  c113-type riparian strips isolated.
- ⚠️ **`agriculture.fallow` became the new smooth-green default** — 30/125 votes,
  confetti pattern on the choropleth. The third class to inherit that role after
  `grazing_land` and `maintained_grass`.

**Neighbour context added 2026-07-24** (user request): `review.html` now shows each
cluster's dominant spatial neighbours + labels and flags those whose dominant
neighbour's label is unrelated. Caveat: neighbour labels for un-rejudged k88
parents come from round 2 via `--nbr-labels` and can be stale — c20/c71 still
carry the retired `grazing_land`.

**Neighbour-pair VLM check, 2026-07-24.** Per the user, "visually identical" is
decided by the VLM alone (the embeddings' job ended at clustering) → engine step
5b. First pass at small cells, then extended to all sizes (flag bar: boundary
share ≥ 0.25 at any size): **35 pairs, 21 same-cover / 14 distinct**, verdicts in
`nbr_verdicts.json`, folded into `review.html`. Adoption direction is not always
small→large; the verdict names which side is wrong.

**User feedback, 2026-08-09** (cards c2–c58, then c88–c96): logged verbatim in that
dir's `corrections.md`. Themes: planted forest under-called under new disguises;
roadside green strips are not fallow; c6 is coconut + casuarina, not mixed_fruit;
c47/c51/c53/c58/c90 are impure parents wanting carve-outs; "fallow"-looking ground
inside a young plantation is the plantation.

## Why the current rules exist

### The catch-all cascade
Three classes have now taken turns as the default for "smooth green I can't name":
`grassland.grazing_land` (round 2) → `grassland.maintained_grass` (round 2–3) →
`agriculture.fallow` (round 3). Retiring one just moved the problem to the next.
The 2026-08-09 fix attacks the mechanism rather than the class: **every class now
states the positive evidence it requires**, so a class can no longer be satisfied
by an absence. Watch for a fourth heir; the choropleth confetti test is how it
shows up.

### The stale FIELD_GUIDE
`FIELD_GUIDE` in `scripts/vlm_label_prototype.py` builds `prompt.txt` and is the
only class description an ordinary reader sees. It was written 2026-06-07 in the
same commit that created the skill (`6362c00`) and **never touched again**, while
three rounds of user corrections were absorbed into the pack markdown instead.
Readers were consequently still told `dryland_crops` = "bare-to-sparse rectangular
fields, brown/tan" — wording indistinguishable from `fallow` and from harvested
casuarina, which is precisely the confusion the rounds kept producing. Rounds 2–3
held their hard rules only because each round's hand-written `BRIEF.md` restated
them; anything not restated fell back to the stale guide.

Both were rewritten together on 2026-08-09. The lesson is generalised in the
engine skill: update the cue the model sees, not only the doc you read.

### Class definitions written 2026-08-09
The hierarchy had never been given real definitions — every node carried a
three-word `_description` and the rest lived in readers' heads. The user asked
for definitions grounded in professional practice rather than invented locally,
which produced `class-definitions.md` and two specific resolutions:

- **Roadside/waterside green strips** had no class and were defaulting to fallow.
  Resolved to a new `forest.tree_lines` node, defined from FSI's *Trees Outside
  Forests* (linear stratum) + Copernicus *Small Woody Features* geometry.
- **Built subtypes** were undecidable by the old matrix-only tie-breaker (c2 sat
  unresolved). Resolved density-first from CORINE/NLCD; FAO LCCS explained the
  underlying issue — built density and matrix life-form are orthogonal classifiers
  that our flat three-way collapses.

### The Matrimandir mislocation
A round-3 note recorded c2 e0 as "the Matrimandir monument itself". It is not:
c2's exemplars are 0.6–1.1 km from centre, and the e0 structure is another large
white-roofed building ~1 km west (user-corrected 2026-07-24). The generalised rule
— check a landmark claim against the exemplar's lon/lat before recording it — is
in the engine skill.

## Case citations and tallies moved out of `class-definitions.md` (2026-08-21)

The glossary had accumulated eleven sites of provenance: cluster-case citations,
verdict tallies, and dated ruling notes. Each was moved here and the *rule* it
justified left in place. Three reasons, the last of which is new:

1. It contradicted `cluster-reader.md`'s own instruction not to anchor on a
   previous label — and did it in the direction that suppresses a class, by
   implying whoever picked it was wrong.
2. For a not-assignable class it corrupted the very signal `_unlock` waits on.
   Telling readers a class "became a soft landing" biases the frequency that
   would eventually unblock it.
3. `class-definitions.md` is inside `--defs`, so from 2026-08-17 every anecdote
   edit moved `defs_version` and re-opened SETTLED clusters. Narrative churn had
   become contract churn.

**The line used:** does it tell you how to judge the thing in front of you, or
does it tell you about a past judgment? The first stays; the second moves. Where
a concrete case genuinely calibrates the eye, the reference example crops table
does it better — confirmed imagery rather than an asserted past vote.

What moved:

- `forest.tree_lines` was **added 2026-08-09**; the heading carried the date.
- `forest.scattered_trees` — 7 verdicts described scattered or isolated trees and
  landed on **four unrelated labels** (`sparse_scrub`, `maintained_grass`,
  `degraded_barren`, `fallow`). That tally is the evidence for the
  not-assignable flag; `_why` in `land-cover.json` is where it belongs.
- `agriculture.orchards.mixed_fruit` — **c6** was voted `mixed_fruit` and is
  actually coconut + casuarina.
- The bund ruling was **made 2026-08-17** and **supersedes the `bunds`-node
  reversal in `_notes/missing-classes_candidates.md` §G**. (§G already carries its
  own `SUPERSEDED 2026-08-17` marker pointing at the ruling; an earlier draft of
  this line called it stale without opening it.)
- `agriculture.agroforestry.mixed_cultivation` — became a soft landing for "trees
  and something else"; **c42** was voted here and is `planted_forest`.
- The `fallow` checklist's "young coconut or ground within a young planting" came
  from the maintainer, on **c89**.
- `built_environment.infrastructure` was **retired 2026-08-15** with **zero uses
  in 266 verdicts**.
- `degraded_barren.eroded_land`'s laterite leaf — **8 of the 9** parent-level
  `degraded_barren` verdicts described exactly it, in almost the same words.
- The forest-blank rule resolved the "bare clearing amid canopy" cases
  **c150/c1, c163, c168**, which no label then fit.
- The not-assignable flag was marked into every entry on **2026-08-21**; five
  carried no marking until then (`thorny_scrub` and the whole `agroforestry`
  subtree), `scattered_trees` was already marked, and `natural_forest` /
  `grazing_land` said "never emit".
- **The failure the flag replaces.** `natural_forest`, `thorny_scrub` and
  `grazing_land` were already "retired" — in prose in the glossary, while sitting
  fully pickable in the JSON. All three were still being offered to the VLM
  readers in `prompt.txt`, `natural_forest` with a helpful "LOOKS LIKE" cue, and
  `grazing_land` was still being emitted.

## `forest.scattered_trees` unlocked — 2026-08-21 (T43)

The node carried `_status: not-assignable` from 2026-08-17 to 2026-08-21. Its
`_why`, now discharged and kept here because the node no longer carries it:

> The stratum is published and the ground is real, but it does not separate at a
> 10 m cell: 7 verdicts describe scattered or isolated trees and they land on 4
> unrelated labels (sparse_scrub, maintained_grass, degraded_barren, fallow). A
> scattered-tree cell is mostly whatever the trees are scattered IN — the
> separability test's "inconsistent mixture" mode. Species identification
> compounds it: at 0.58 m/px a 7 m crown is ~12 px, enough to see a palm but not
> to tell a fan crown from a feather one.

Its `_unlock` asked for *"a cluster appears whose exemplars are majority
scattered-tree; and/or z19 imagery (0.29 m/px, now available) resolving crown
form."* **Neither was met.** Round 4's five scattered-tree mentions dispersed
across three labels exactly as before, and the maintainer, looking at them at
z19, found only one (c115e0) where the outlined patch was actually
scattered-tree ground.

**It was unlocked anyway, and that is the interesting part.** The ruling was not
"the evidence arrived" but *"this is a legitimate label"* — a published FSI
stratum should not stay unreachable because our cell geometry is awkward. So the
`_unlock` mechanism did its job as a **commitment to revisit** rather than as a
test that had to pass: it forced the class back in front of a person, and the
person overrode it. Worth remembering the next time an `_unlock` condition is
written as though it were a gate. It is a trigger.

The risk the `_why` named is real and did not go away; it moved into the class
entry as a usage caveat (*use it for the trees, not for the matrix*) instead of
being enforced by a block.

## Open threads

- **(a) Stratified exemplar selection.** `patch_exemplars` picks the N *largest*
  patches, biasing toward the dominant cover and under-sampling minorities in
  impure clusters. Pick exemplars spanning the old-label strata instead.
- **(b) Old-map family-spread within a cluster** as an independent split trigger,
  complementary to vote disagreement.
- **(c) Interleaved impurities need a finer local re-cluster,** not an
  intersection. `k88 ∩ k22` handles *spatially split* impurities; two-phase
  casuarina, the gardens gradient and cashew-belt edges need k176 or a
  sub-clustering of just the flagged masks, from alpha-bhu. Avoid a *global* k176
  — it re-fragments the already-clean clusters, since k-levels don't nest.
- **(d) Hierarchy cleanups flagged but not made** — see the tail of
  `class-definitions.md`: duplicate infrastructure nodes, retired classes still
  present in the JSON, casuarina filed under orchards vs NRSC's forest plantation.
- **(e) `agriculture.field_crops.dryland_crops` may not exist here at scale** —
  needs ground verification.
- **(f) Let the labeling pass interact with the AlphaEarth embeddings** (user
  idea, 2026-08-09 — parked, not scoped). Today the embeddings' job ends when the
  cluster raster is produced, and the engine's **Layer separation** rule forbids
  reaching back into them during labeling — deliberately, because "k-means kept
  them separate" was being used as false evidence that two covers differ. Any
  future design here has to say what the embeddings would contribute that vision
  cannot (they carry *temporal* signal the single-date imagery lacks — phenology,
  the casuarina rotation, seasonal water), and how that stays distinct from the
  discredited use. Revisiting the rule is the point of the idea, so it needs an
  explicit argument rather than a quiet exception.
