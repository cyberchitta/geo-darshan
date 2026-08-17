# The verdict record — single source of truth

**This table is the only place the fields of a verdict record are enumerated.**
Everything else — the round brief, a workflow's task prompt, a miner, the gate —
**points here and does not restate it.** `check_verdict_contract.py` enforces
that: it parses this table and fails if a written record is missing a field, and
warns if any consumer re-enumerates a list of its own.

*Why it exists.* On 2026-08-17 `rejudge_workflow.js` was found telling readers to
write nine fields while the round brief told them to write eleven. The two
channels the brief had just gained — `no_class_fits` and `mixed` — were absent
from the operative list, so a reader following the task prompt would have dropped
them silently, and the resulting zero count would have read as "nothing to
report". Two hand-maintained lists cannot be kept in agreement by discipline.
There is now one.

## Fields

| field | required | kind | meaning |
|---|---|---|---|
| `cluster` | yes | key | integer cluster id |
| `exemplar` | yes | key | integer exemplar index within the cluster |
| `label` | yes | verdict | dotted class path, or `uncertain` |
| `level` | yes | verdict | `leaf` or `interior` — which depth you committed to |
| `confidence` | yes | verdict | 0–1 |
| `alternative` | yes | verdict | second-best dotted path, or null |
| `reasoning` | yes | verdict | one sentence on the **visual evidence** |
| `changed` | yes | round | true if `label` differs from `prev_label` |
| `change_reason` | yes | round | when `changed`, the definition or correction that drove it; `""` otherwise |
| `no_class_fits` | yes | **channel** | null, or `{describes, nearest, why_it_fails}` |
| `mixed` | yes | **channel** | null, or `{describes, parts[], dominant_share}` |

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

## For a round brief

A round brief adds what is **particular to the round** — why the pass exists, what
new evidence is available, which cards. It should explain a channel's *judgement*
freely. It must not restate this field list.
