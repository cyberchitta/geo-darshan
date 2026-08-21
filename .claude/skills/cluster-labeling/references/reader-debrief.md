# The reader debrief — single source of truth

**This file is the only place the debrief's fields and its question template are
written.** A miner, an orchestrator, or a round brief **points here and does not
restate them** — the same rule, and the same reason, as `verdict-record.md`.
`check_verdict_contract.py --contract` validates against this file:

```bash
uv run --no-project python .claude/skills/cluster-labeling/scripts/check_verdict_contract.py \
  RUN_DIR --contract .claude/skills/cluster-labeling/references/reader-debrief.md \
  --verdicts 'debrief_*.json' --record-key batch --rows-key debriefs
```

*Why it exists.* The swarm readers are closest to the work and nobody was asking
them anything. Their verdicts say what they concluded; nothing captured what
fought them on the way there — a definition that collides with another, a crop
that could not settle a call, guidance in the brief that never once applied.

## Two hard rules about *when* and *who*

**The debrief is a second turn, after the verdicts are on disk.** The reader
writes its verdict file first, then is asked. Reflection must not be able to
reach back and re-justify a label, and a reader composing both at once will
quietly harmonise them.

**It must be the same session that did the work.** A fresh agent asked "what was
hard about these cells?" invents plausible friction instead of reporting
experienced friction, and the two are indistinguishable in the output. This rules
out a workflow's one-shot `agent()`, which has no continuation — use `Agent` +
`SendMessage` and accept the loss of workflow determinism. That trade is
deliberate.

**Quiz each reader the moment it returns — before the contract check, before
the next reader lands, before anything else.** A reader becomes unreachable a few
minutes after it goes idle, and the bigger its transcript the sooner. Measured
2026-08-22 on this harness, resuming at ~11-12 minutes idle:

| transcript | idle | resumes |
|---|---|---|
| 24 KB | ~50 min | yes |
| 2.8 MB | 12 min | yes |
| 5.3 MB | 11 min | **no** |
| 9.7 MB | ~14 min | **no** |
| 15.1 MB | 11 min | **no** — though it resumed twice when asked immediately |

A real reader lands at 20-25 MB, so its window is short. This is what cost the
first attempt at running this channel (the `d1_` swarm, 2026-08-22 — a debrief
calibration, not a numbered round): three readers finished, and by the time their
prompts were generated and the contract check had run, the first had been idle
nine minutes and none of the three could be reached. Nothing was wrong with the channel; it was asked too
late.

So the order is per-reader, not per-swarm: **reader returns -> generate its prompt
-> send it -> only then move on.** Batch size is not the lever and does not need
to shrink. Generating prompts one at a time does weaken
`gen_debrief_prompts.py`'s uniformity proof, which compares the prompts produced
in a single invocation — so re-run it across all batches afterwards and confirm
they still fullmatch, rather than trusting that they must.

## Fields

| field | required | kind | meaning |
|---|---|---|---|
| `batch` | yes | key | the reader batch this debrief covers |
| `friction` | yes | channel | null, or a list of `{describes, exemplars[], cost}` — what fought you, anchored to the exemplars where it bit |
| `would_have_decided_it` | yes | channel | null, or a list of `{describes, exemplars[], obtainable}` — a **named, obtainable** thing that would have settled a call you could not settle |
| `definition_collisions` | yes | channel | null, or a list of `{classes[], describes, exemplars[]}` — two class definitions you could not cleanly separate on real imagery |
| `unused_guidance` | yes | channel | null, or a list of `{section, why}` — guidance you read and never once applied |

**Every key is written on every debrief, `null` when it does not apply** — the
absent-key/null-value distinction from `verdict-record.md` applies here
unchanged, and for the same reason: an absent key means nobody was asked, a null
means asked and had nothing. Only the second is evidence about the process.

**`would_have_decided_it` must name something obtainable.** "Higher resolution
would help" is always true, costs nothing to say, and cannot be acted on. A z19
crop, a wider context window, a dry-season image, a confirmed reference exemplar
for a named class — those are requests somebody can fill. Reject the generic form
in your own answer before writing it.

**`cost` is what the friction actually did to the work** — an exemplar you left
`uncertain`, a call you made at low confidence, time spent re-reading. Not a
severity score.

## Frequency across readers is the filter

One reader raising something is noise; most of them raising it is a defect in the
process. That only holds if **every reader was asked the same question**, so the
template below is fixed before the run and identical for all of them. Only the
mechanical slots vary, filled by `gen_debrief_prompts.py` from the reader's own
verdict file — never hand-worded per reader, and never adjusted after reading
their verdicts, which would make the tally measure who was asked what.

**Reader self-report is the weakest evidence class here.** Per the intent doc,
models agreeing with each other is not verification. This channel produces signal
to mine and adjudicate, never findings to adopt — the same standing as
`no_class_fits`.

## The question template

Sent as the second message to the reader that produced `{batch_file}`. Slots in
`{braces}` are filled mechanically; nothing else varies.

```text
Your verdicts are written and committed — this is not a chance to revise them,
and I am not asking you to.

You just judged {n_cards} cards / {n_exemplars} exemplars, left {n_uncertain}
at `uncertain` ({uncertain_ids}), and fired the no-class-fits channel
{n_no_class_fits} time(s) and the mixed channel {n_mixed} time(s).

Tell me what would make this process better for the next reader. Answer against
the field table in
`.claude/skills/cluster-labeling/references/reader-debrief.md` — read it and
write every key, `null` where you genuinely have nothing.

Ground rules that decide whether your answer is usable:
- Anchor everything to specific exemplar ids you actually judged. An
  unanchored complaint cannot be checked or acted on.
- For anything you could not decide, name the ONE obtainable thing that would
  have decided it. If the honest answer is "nothing available would have", say
  that instead of inventing a request.
- Report only what actually bit you on these cards. Do not generalise, do not
  pad, and do not soften — `null` is a good answer and an invented one is worse
  than silence.
- You are one of several readers answering this identical question. What matters
  is whether the same thing bit several of us independently, so report yours as
  you hit it rather than guessing at what the others will say.

Write it to `{out_file}` as JSON, then return it.
```
