# The verdict record — single source of truth

**This table is the only place the fields of a verdict record are enumerated.**
Everything else — a workflow's task prompt, a miner, the gate, the reader's own
agent definition — **points here and does not restate it.** `check_verdict_contract.py` enforces
that: it parses this table and fails if a written record is missing a field, and
warns if any consumer re-enumerates a list of its own.

*Why it exists.* On 2026-08-17 `rejudge_workflow.js`'s task prompt was found
enumerating **nine** fields, while the round brief separately required two channel
fields — `no_class_fits` and `mixed` — that the enumeration omitted. (The brief
never gave a full list of its own; it described extras "beyond the standard
verdict fields", and the standards were enumerated nowhere but the task prompt.
That absence of a complete list *was* the defect.) A reader working from the
prompt's enumeration would have dropped both channels, and the resulting zero
would have read as "nothing to report" rather than "nobody was asked". Two
hand-maintained lists cannot be kept in agreement by discipline. There is now
one.

## Fields

| field | required | kind | meaning |
|---|---|---|---|
| `cluster` | yes | key | integer cluster id |
| `exemplar` | yes | key | integer exemplar index within the cluster |
| `label` | yes | verdict | dotted class path, or `uncertain` |
| `level` | yes | verdict | `leaf` or `interior` — which depth you committed to. **`null` when `label` is `uncertain`**, because nothing was committed |
| `confidence` | yes | verdict | 0–1 |
| `alternative` | yes | verdict | second-best dotted path, or null |
| `reasoning` | yes | verdict | one sentence on the **visual evidence** |
| `changed` | yes | round | true if `label` differs from `prev_label` |
| `change_reason` | yes | round | when `changed`, the definition or correction that drove it; `""` otherwise |
| `represents_cluster` | yes | verdict | `typical`, `atypical`, or `unsure` — is this fragment like the rest of its cluster, judged from the locator and context crops? |
| `no_class_fits` | yes | **channel** | null, or `{describes, nearest, why_it_fails}` |
| `mixed` | yes | **channel** | null, or `{describes, parts[], dominant_share}` — see below for what `dominant_share` is a share *of* |

## The flips summary — a different object, also enumerated here

A reader writes the full record array to disk and **returns** a summary carrying
only the exemplars whose label changed. That is a different shape and it needs its
own table, because an executable JSON Schema cannot point at a markdown file — it
must list its fields. So this restatement is unavoidable, and is therefore
**checked for agreement** instead of forbidden: `check_verdict_contract.py` reads
every `required: [...]` array it finds in a source and fails if it does not match
a table here.

| field | required | kind | meaning |
|---|---|---|---|
| `cluster` | yes | flip | integer cluster id |
| `exemplar` | yes | flip | integer exemplar index |
| `prev_label` | yes | flip | the label this exemplar carried before the round |
| `label` | yes | flip | the label you are giving it now |
| `confidence` | yes | flip | 0-1 |
| `reasoning` | yes | flip | one sentence on the visual evidence |
| `change_reason` | yes | flip | the definition or correction that drove the change |

## The verify result — the third object

An adversarial verifier re-reads a flip and returns a verdict on it. Also an
executable schema, also checked for agreement rather than forbidden.

| field | required | kind | meaning |
|---|---|---|---|
| `cluster` | yes | verify | integer cluster id |
| `exemplar` | yes | verify | integer exemplar index |
| `verdict` | yes | verify | `upheld`, `refuted`, or `unclear` |
| `better_label` | no | verify | dotted path if you would use a **third** label; empty otherwise |
| `note` | yes | verify | what you saw that decided it |

`better_label` is what makes a refutation *contested* rather than a plain revert —
see the intent doc: a contested refutation is not a revert, and is decided by a
person.

## The label record — the fourth object, and the one that leaves the run

The three objects above are internal to a round. The **label record** is what a
cluster's label carries when it travels — into `cluster_to_label.json`, into a
merge against a prior map, into an exported raster. It is the only one a later
round, or a person a year from now, will actually read.

*Why it exists.* On 2026-08-17 a merge of the round-2 labels against the 2025 hand
map found that **round 2 assigned a label to 100% of the AOI having inspected
17.17% of it** — 6 exemplars per cluster, 200 m windows. That number was not
recorded anywhere. It had to be re-derived from `results.jsonl` by re-projecting
every exemplar centre, because `cluster_to_label.json` carries only
`{label, confidence, agreement, n, votes}` and round 2 predates the gate, so it has
no `ledger.json` either. **A label that does not carry its own evidential basis
cannot be weighed against anything.** The gate computes most of these fields
already (`gate.py:130-155`); they simply never leave the ledger.

| field | required | kind | meaning |
|---|---|---|---|
| `cluster` | yes | lkey | integer cluster id |
| `label` | yes | lverdict | the voted dotted class path |
| `round_id` | yes | provenance | which round produced it (`k88`, `k88xk22`, …) |
| `defs_version` | yes | provenance | the class-definition hash it was judged against |
| `crop_rendering` | yes | provenance | which crop treatment the reader saw — e.g. `tinted`, `raw+edge+fill`; plus whether context and locator crops existed |
| `inspected_coverage` | yes | basis | `exemplar_px / cluster_px` — the share of the cluster actually looked at |
| `n_fragments` | yes | basis | connected components of the cluster |
| `fragments_inspected` | yes | basis | how many of them an exemplar window reached |
| `largest_fragment_share` | yes | basis | largest component as a share of the cluster |
| `one_cover` | yes | reader | `yes`, `no`, or `unsure` — across **all** its exemplars, is this one cover or several? |
| `prior_map_dist` | no | basis | the prior map's class distribution over this cluster, when a prior map exists |

**A name declared in two tables must be counted once — the checker used to count
it twice.** Adding this table turned all three consumer files from OK to WARN
without a line of them changing. `cluster` and `label` appear in both the
per-exemplar table and this one, `parse_contract` appended per row, and the
SOURCES restatement heuristic counts one hit per list entry — so a sentence like
*"per-exemplar correctness beats a tidy cluster label"* scored 5 instead of 3 and
crossed the 4-field threshold. The bug was latent from the moment the flip and
verify tables were written; a third table is simply what made it bite.
`parse_contract` now dedupes, and this table's key and payload rows carry their
own kinds (`lkey`, `lverdict`) so they never enter the per-exemplar list at all.
**The lesson is about the checker, not about naming** — an early reading here
blamed the new field names for being ordinary English words and renamed them,
which changed nothing. Verify a diagnosis against the baseline before writing it
down.

**`crop_rendering` is provenance about the instrument, not the ground.** Round 2's crops
carried a magenta outline and a yellow tint burned into the JPEG, and
`vlm_label_prototype.py` blames that tint for a coconut→scrub misread. Every round-2
label was produced through it, and there is no way to ask *which labels were made
under a defective rendering* except by knowing which run directory they came from.
Recording it makes a rendering defect a queryable requeue instead of an
archaeology problem.

**The three `basis` fields about fragments exist because coverage alone is not the
question.** Measured on the k88 clusters the same day: median **342** disconnected
fragments per cluster (max 1,104), largest fragment a median **8.2%** of its
cluster, and six exemplars reached a median of **11 of those 342**. A compact
cluster at 17% coverage is a reasonable extrapolation; a 342-fragment cluster at
17% is a guess, and the two are indistinguishable if only `coverage` is written
down.

**`one_cover` is not `mixed` at a different scale.** `mixed` asks whether one
*crop* holds two covers. `one_cover` asks whether the cluster's *fragments*
resemble each other — the failure that dispersion makes likely and that no
per-exemplar field can see. A cluster can have no mixed cells at all and still be
two covers wearing one label.

**`represents_cluster` is the per-exemplar half of the same question**, and it is the
cheapest instrument available for the extrapolation problem: with 11 of 342
fragments inspected, whether the sample generalises is otherwise unknowable. The
reader already has the locator and context crops in front of it.

## Channel fields are required *as keys*, even when they do not apply

A `channel` field is the only route by which a class of problem can ever be
discovered. Write the key on **every** record, set to `null` when it does not
apply.

This is not pedantry about JSON. An **absent key** and a **null value** mean
opposite things, and only one of them is a finding:

| | means |
|---|---|
| key absent from every record | the readers had **no way to report it** — evidence about the schema |
| key present, always null | the readers **could** report it and did not — evidence about the ground |

Both miners (`mine_missing_classes.py`, `mine_mixed_cells.py`) distinguish these
and print **CHANNEL ABSENT** for the first, precisely so a low count can never be
misread as the second.

## The three failures, kept apart

These are the distinctions the channels exist to preserve. A reader that collapses
them destroys the signal.

| | the reader's situation | field | it is a limit of |
|---|---|---|---|
| (a) | cannot **see** well enough to decide | `label: "uncertain"` | the **imagery** |
| (b) | sees fine; **no class** describes it | `no_class_fits` | the **class list** |
| (c) | sees fine, classes exist, but the patch holds **two or more** of them | `mixed` | the **cell** |

(b) and (c) still carry a best/dominant `label` — they are not exclusive with it,
and they are not substitutes for each other or for `uncertain`.

Guard against over-firing (c): flag it only when the parts share **no sensible
common ancestor**. Cashew beside coconut is an orchard. Orchard beside scrub is a
mixed cell.

**`mixed` in detail — both fields below were ambiguous enough that readers had to
say in prose what the contract should have stated:**

- `parts` — the classes present, **ordered largest first**. That ordering is what
  makes the next field mean anything.
- `dominant_share` — the share of **the marked cell in this exemplar's patch view**
  held by `parts[0]`. Not a share of the image frame (most of which is not the
  cell), and not a share of the whole cluster (which this exemplar only samples).
  A cell that is 70% orchard and 30% scrub gives `dominant_share: 0.7`.

**`mixed` is binding on the forest-blank convention — ruled 2026-08-22.** For a
cell that would take a forest class *only* via the forest-blank rule, `parts[0]`
decides: if the non-forest part leads, the label is the non-forest part. This is
the one place the channel overrides a convention. Everywhere else `mixed` stays
descriptive, and a label that disagrees with it is not thereby wrong.

**`level` and abstention.** `level` records the depth of a label you *committed*
to, so a record with `label: "uncertain"` takes `level: null`. Do not put
`interior` there as the least-wrong option: it makes an abstention indistinguishable
from a deliberate interior-level call, and every tally of interior-level verdicts
then silently counts abstentions among them.

## For what is particular to a round

Round briefs were deleted on 2026-08-22 (worklist T91). What is particular to a
round now reaches the reader through `round_workflow.js`'s task prompt — run dir,
cards file, and whether the pass is blind — and nothing else needs to.

The rule that stood here survives the file it was written for, and applies to
whatever carries round-specific text: it may explain a channel's *judgement*
freely, and it must not restate this field list. **A brief was the last thing to
break that rule**, which is the incident recorded at the top of this file; do not
reintroduce one to hold text that belongs in the reader definition.
