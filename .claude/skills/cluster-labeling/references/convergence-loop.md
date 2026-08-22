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
- A proposal must clear the **separability test** — see below.
- Adding a class is a contract revision — it bumps `defs_version` and re-opens
  retirements. Batch proposals between passes; never mid-pass.

### The separability test — what admits a proposed class

> A candidate class must produce a **consistent, separable signature across enough
> cells to form a cluster.** The failure modes are **rarity** — too few cells
> anywhere in the AOI — and **inconsistent mixture** — its cells scatter into
> other clusters instead of grouping. Ask both of the run's own clustering, not
> of the feature's dimensions.

**This replaces an earlier "MMU test" that keyed on width** (*a feature narrower
than one cluster cell has no cell to carry it, so it is a resolution artifact*).
That rule was wrong, and it forbade `forest.tree_lines` — the discovery cited four
paragraphs above as this section's one success. Measured on k88∩k22 (2026-08-15):
readers describe tree-line features at **10–15 m** against a **10 m** cell, one as
a *"three-pixel patch [landing] squarely on the dense green hedge line"* where the
hedge itself is 2–5 m of woody material, and its clusters are real and small —
10 px, 13 px, 16 px. It was used 12 times and grew faster than all but three
classes.

The rule conflated two resolutions. **Judging resolution** is the imagery: on that
run 0.58 m/px, and the close crop displays it at native scale — the generator's
`scale = min(1.0, max_px / max(h, w))` never upsamples, so the pixel cap is a
ceiling that does not bind and buys no extra detail. Narrow features are still
plainly visible and judgeable at 0.58 m/px; they are simply not *finer* than the
source. **Labelling resolution** is the cluster cell: 10 m,
so no cell is ever *purely* the narrow feature. But a cell that is consistently,
say, 30% hedge has a repeatable signature, and repeatable mixtures cluster.
**Mixed is not the same as unmappable** — which is exactly why a segmentation over
learned embeddings can carry classes a per-pixel classifier could not.

Two practical consequences:

- **Never exclude a candidate on feature width.** Linear and interstitial features
  — hedgerows, bund tops, verges, tree lines, narrow riparian strips — are
  admissible, and on an agricultural AOI they are among the most-observed things
  in the reader corpus. The same sweep that produced this correction had wrongly
  excluded bunds, which turned out to be mentioned in **38 of 266 verdicts** and
  scattered across eight labels.
- **Test separability empirically, not by argument.** When two candidates are
  suspected of being one class — the usual case is same appearance, different
  cause — check whether their exemplars actually fall in different clusters. If
  they never separate in the clustering, they are one class whatever the semantics
  say.

Being admissible is not being warranted: a feature can be visible, clusterable and
still better handled as a **diagnostic** inside an existing class definition than
as a node of its own. Bunds are the standing example — readers use them as
evidence of cultivation, which is the right role. Ask what a reader *does* with
the feature before adding a node for it.

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

`ledger.json` stamps `defs_version`. When a class definition changes, every
SETTLED cluster whose label touches that class returns to OPEN. The 2026-08-09
definition rewrite moved 41% of verdicts — retirements made under superseded
definitions are not safe.

**`defs_version` must hash everything a reader reads, not just the class list.**
It began as a sha of class-definitions + hierarchy, and that was too narrow: five
further files determined reader behaviour while being invisible to the stamp, so
**two passes run under materially different contracts carried the same stamp and
looked comparable when they were not.** Widened 2026-08-17 to also hash the AOI
pack `SKILL.md`, the reader agent's definition, the round brief, the corrections
log, and the swarm harness — and again 2026-08-21 to the verdict record contract,
making eight. **Seven since 2026-08-22**, when the round brief was deleted rather
than excused (see below); the live list is in the engine `SKILL.md` under
`gate.py`, and this file deliberately does not carry a second copy. Expect the
stamp to move more often — that is the point, not a regression.

**The gap is narrowed, not closed.** Anything a reader reads that is not in the
hash still drifts silently. Test it the same way each time: change one word of
guidance, re-run `--defs`, and confirm the stamp moves. If it does not, that file
is outside the hash.

**Run 2026-08-21, and it found one — since closed.** `verdict-record.md` is item
5 on the reader's standing list in `.claude/agents/cluster-reader.md` and the only
enumeration of the verdict fields, yet it sat outside the hash: it joined that
list twenty minutes after the 08-17 widening was stamped and `--defs` never
followed, so a change to the *verdict contract* did not move the stamp. **Added
2026-08-21 on a maintainer ruling** — round 4 had no ledger, so nothing was
invalidated by the move; the same fix costs a live stamp once a round is gated.
The run cleared the rest: all seven prior inputs move the stamp, no entry is dead.
The exact eight-file list and the before/after stamps live with the invocation, in
the run dir's `HANDOFF.md`; this file deliberately does not carry a second copy.

**Narrowed once, on 2026-08-22: the round brief was deleted, not excused** (T91).
It was the only entry that differed between *any* two rounds — path, date, round
number, wording — so it moved the stamp every round and **no two rounds could
ever share one**, which is exactly what `compare_rounds.py` concurrence needs in
order to compare them. The fix was not to drop a file a reader reads out of the
hash: its one contract-bearing bit (is this pass blind?) moved into
`round_workflow.js`, and what blind *obliges* moved into
`.claude/agents/cluster-reader.md` — both already hashed. Nothing a reader reads
left the hash; one file stopped existing. Seven entries now, listed in the engine
`SKILL.md` under `gate.py`.

**Do not fix this by hashing a generated prompt file.** That was tried and
withdrawn: a `prompt.txt` emitted by a since-deleted generator had already drifted
from the definitions it was built from, so adding it to the hash would have
stamped the drift in rather than caught it. Hash the *sources*, never a rendered
artifact of them.

**Corollary — know which surface actually reaches your readers.** When the loop
moved from an API-call path to agent readers, the standing instruction to mirror
every class ruling into the API path's field guide silently became inert: agent
readers load `class-definitions.md`, and the field guide reached nobody. The
instruction stayed correct-looking and was dutifully followed for weeks. **When
the reader mechanism changes, re-derive what the readers read.**

## Termination

Cluster px floor 25 (~0.25 ha at 10 m pixels); max 4 passes; stop when a pass
settles < 5% of remaining. A cluster at the px floor that still disagrees takes
the retreat label rather than splitting further.

## Built vs not

**Built:** `gate.py` (ledger + gate + triage) · `gen_intersection.py` (finer-k
split) · `gen_prior_labels.py` (cross-tab) · `gen_review_html.py` (neighbour
flags) · `aggregate.py` (vote) · **verify-all-exemplars** (`round_workflow.js`,
Verify phase — every exemplar, not only the changed ones) · **`gate.py` honouring
`verify: "human"`** — counted toward criterion 3 *and* its label folded by
`--apply-verified`.

**Prototyped, not promoted** (round-3 run dir, `gen_decisions_review.py`): the
human adjudication surface — cluster cards, refuted triage, inline contract +
reference crops, `human_verdicts.json` export with reference-example and
missing-class channels. First use; graduates to `scripts/` if round 4 wants it.
The *contract* it emits (the `human` verdict value, the export schema, the
clean/contested/unclear triage) is AOI-agnostic and belongs here regardless.

**Not built:** **exemplar promotion into the AOI pack** (confirmed crops → pack,
with provenance + per-class coverage report) · concurrence criterion replacing
confidence · stratified/novel re-sampling · connected-component carve (the
non-finer-k split path) · **converting a maintainer export into something the
gate reads** (`human_verdicts.json`'s `exemplar_rulings` must be reshaped by hand
today; `gate.py` refuses it by name rather than crashing) · missing-class signal
mining · held-out calibration + precision scoring · re-opening SETTLED on
`defs_version` change · the pass N→N+1 driver.

## Open decisions

- How many concurring readers for criterion 4's replacement — 2, 3, majority?
- Coverage floor 0.30 blocks 60 of 102. Should low coverage *block*, or instead
  trigger RESAMPLE (more exemplars) rather than fail the gate?
- `retreat_min_depth = 2` sends `forest.planted_forest` vs `forest.natural_forest`
  to SPLIT. Defensible (a real spatial distinction) but worth revisiting.
- How many exemplars does RESAMPLE add, and drawn from where?
- Does the exemplar manifest enter `defs_version`? (Argued yes above — but it
  means every promotion re-opens retirements, so promotion has to batch.)
- Can gate-SETTLED ever promote an exemplar on its own, or is human confirmation
  permanently required?
- Where do `human_verdicts.json` and promoted crops live — the AOI pack, or notes?
  Both outlive the run dir; the pack is what readers already load.
- Does a maintainer's self-rated "guess" carry the same authority as "sure"? If
  not, a low-confidence human call is evidence, not ground truth — and the
  authority levels stop being binary.

## The verify pass and the gate must agree on a key name

`round_workflow.js`'s Verify phase writes the **verify-result** record of
`verdict-record.md`, whose verdict field is `verdict`. `gate.py` was written
against the older shape — a flips file with the verdicts merged back in, where the
field is `verify`. It read `verify` with a `"unverified"` default, so every
verify-result record parsed cleanly and arrived **unverified**.

Measured 2026-08-21 on round 4's real artifacts: 321 verify records (249 upheld)
in, **0 of 320 exemplars verified** out, criterion 3 blocking all 120 clusters,
nothing SETTLED. Nothing errored. The output is indistinguishable from a gate
that is simply strict, and criterion 3 is the one the loop is expected to bind
on — so the natural next move is to loosen a threshold that was never the
problem.

`load_verify` now reads either key, takes several `--verify` files (the workflow
writes one per batch), and **exits rather than defaulting** when a record carries
neither. The general rule, worth more than the fix: *a gate that cannot parse its
evidence must fail, not downgrade it.* Downgrading produces a stricter,
plausible, wrong answer; failing produces a question.

## Verifying the gate

A green gate proves nothing until watched going red. Inject faults at the
**verify** layer, not into `judgments.json` — `--apply-verified` overwrites
judgment labels, so injecting there is a silent no-op that reports SETTLED on
data you believe you corrupted. Cover: cross-family disagreement, sibling
disagreement, a non-hierarchy label, and a demoted verification.

---

## Splitting: when to split, and what the children inherit

**Do split children inherit their parent's verification state? — NO. Decided
2026-08-17 (geo-darshan, Auroville run); this replaces the open question that
stood here.** Children reset to unverified; the parent's ruling is recorded as
their **prior**, not as their verification. A split declares the parent's extent
was not uniform, so inheriting a ruling made over that extent launders a claim
the split just invalidated.

**Split on spatial coherence, not on count.** `gate.py` and the SPLIT/RETREAT
rule above already separate cross-family disagreement from same-family, and warn
that splitting fixes only *spatial* impurity — definitional ambiguity just yields
children straddling the same boundary. The added test, computable from the
rulings themselves: **split when the exceptions are spatially COHERENT, not
merely numerous.** Concentrated in particular fragments or localities → split.
Scattered with no pattern → contract fix, or a parent-level label.

**Mechanisms, cheapest first:**

1. Intersect an existing k-level (`gen_intersection.py`, k88 × k22/k44) — the
   established route.
2. **Intersect the prior map** — cheap, and aimed at exactly this case. Where the
   parent is largely pure against an *independent* map, the differing minority is
   the sub-population you are trying to separate, and the prior map is already a
   hypothesis about where the seam lies. **This is the default** for cells that
   reached SPLIT through disagreement with a prior map.
3. Group by fragment locality.
4. Re-cluster at a higher k — retires the ledger and needs the embedding pipeline.
   Last resort.
