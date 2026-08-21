---
name: cluster-labeling
description: >-
  Label unsupervised segmentation clusters (k-means over geospatial embeddings)
  into a land-cover/land-use hierarchy by looking at high-res imagery. Use when
  assigning semantic labels to cluster rasters, relabeling/auditing an existing
  land-cover map, or running a per-cluster vision-judgment pass over satellite
  crops. AOI-agnostic engine; pair with an AOI pack (e.g. cluster-labeling-auroville).
---

# Cluster labeling (engine)

Turn a **cluster raster** + **high-res RGB basemap** + a **label hierarchy** into
a labeled map, by rendering exemplar crops per cluster, judging them against the
hierarchy (Claude reads the images directly in-harness — no API key needed), and
voting one label per cluster. Designed for iterative rounds with human feedback.

This skill is the **site-agnostic engine**. Concrete paths, the label hierarchy,
domain visual signatures and geography priors live in an **AOI pack** skill —
for Auroville that's `cluster-labeling-auroville`. Always load the AOI pack first.

## Inputs (contract — this skill consumes, does not produce)

| input | what | produced by (out of scope) |
|---|---|---|
| cluster raster | `kNN_s42.tif`, int cluster ids, nodata < 0, EPSG:4326 | embedding + k-means pipeline (e.g. sibling `alpha-bhu`) |
| basemap | high-res RGB COG, same CRS/bounds | imagery downloader/stitcher (e.g. `bun run download-tiles`/`stitch-tiles`) |
| hierarchy | dotted-path label tree JSON | AOI pack |
| (optional) prior labels | old label raster + `pixel-mapping.json` | previous labeling pass — used only for the review cross-tab |

If inputs are missing, stop and point at the producer; do not reimplement
downloading/embedding/clustering here.

## Procedure

Let `AOI`, `SEG` (cluster raster), `BASE` (basemap), `CENTER` (lon lat landmark)
come from the AOI pack. Pick a `RUN_DIR` per round (e.g. `…/vlm_label_k88/`).

1. **Render exemplar crops** (light tint by default):
   ```
   python .claude/skills/cluster-labeling/scripts/gen_exemplars.py RUN_DIR \
     --seg SEG --base BASE --cluster-ids ID... --exemplars E --window-m 200
   ```
   → `RUN_DIR/{crops/,results.jsonl}`, each record carrying `"result": {}` for
   the in-harness reader to fill. More exemplars (5–6) for coverage; bump only as
   needed for uniform clusters. `--clusters N` takes the N largest instead of
   explicit ids; `--window-m 100` + 4× upscale for fine crown/species.

   **It will not overwrite an existing `results.jsonl`** — that file is what the
   run's cards, ledger and verdicts are keyed to. Render an additional batch into
   a run with `--results results_bN.jsonl`.

1b. **Render the patch crop — the view that is about the cell**, once
   `results.jsonl` exists:
   ```
   python .claude/skills/cluster-labeling/scripts/gen_patch_crops.py RUN_DIR \
     --seg SEG --base BASE
   ```
   → `RUN_DIR/crops/cNNN_eN_patch.jpg`, window sized to the patch, boundary
   burned in, no tint, captioned with the cell's share of the frame and any
   upscale factor.

   **Not optional, and not a nicety.** In the fixed 200 m crop the cell is a
   median 5.2% of the frame and 65% of exemplars sit under 10% — so the image a
   reader judges is ~95% not the thing being judged. Measured over the same 332
   exemplars, this view takes the median to 20.7% and the under-10% share to 2%.
   Readers worked this out on their own before it existed: three of them spent 25
   resize, 21 crop and 6 composite calls per pass rebuilding it by hand, which
   inflated transcripts past the point where they could be resumed **and left
   each reader judging different images**. Render it once for everyone, then keep
   the reader off image tooling so concurrence means what it claims to.

2. **Locator maps** (where each cluster sits — essential for dispersed clusters):
   ```
   python .claude/skills/cluster-labeling/scripts/gen_locator.py RUN_DIR \
     --seg SEG --base BASE --center LON LAT
   ```

2b. **Whole-area overview** (macro context for judging + macro-QA after):
   ```
   python .claude/skills/cluster-labeling/scripts/gen_overview.py RUN_DIR \
     --seg SEG --base BASE
   ```
   → `RUN_DIR/overview_basemap.jpg` (downsampled whole basemap — **read it before
   judging** to see the regional layout / belts) and, once `cluster_to_label.json`
   exists, `RUN_DIR/overview_labels.jpg` (label choropleth + legend — re-run after
   aggregate as a macro-QA surface).

2c. **Mid-scale context crops** (the zoom between exemplar and locator):
   ```
   python .claude/skills/cluster-labeling/scripts/gen_context.py RUN_DIR \
     --seg SEG --base BASE [--window-m 800]
   ```
   → `RUN_DIR/crops/cXXX_eN_ctx.jpg` — the same centre as each exemplar at a wider
   window, magenta outline, 100 m scale bar, no tint. Rendered from `results.jsonl`
   centres so indices match the exemplars one-to-one. **Any class defined by its
   surroundings needs this** — a bare field reads as fallow at 200 m and as a
   harvested plantation block at 800 m; "matrix between the buildings", "opening
   inside forest", and "strip following a road" are all invisible in a close crop.

2d. **Prior-label cross-tab** (only when a prior label raster exists):
   ```
   python .claude/skills/cluster-labeling/scripts/gen_prior_labels.py RUN_DIR \
     --seg SEG --old OLD.tif --mapping pixel-mapping.json \
     [--authoritative water --freeze-share 0.5]
   ```
   → `RUN_DIR/prior_labels.json` — per cell, the distribution of prior-map classes
   over its pixels, plus freeze candidates for the classes the AOI pack names as
   reliable. Feed the distribution to the readers as evidence and hold the frozen
   cells out of judging entirely.

3. **Judge.** For each cluster read its exemplar crops, its context crops **and**
   its locator map, plus the AOI pack's reference example crops. Apply the AOI
   pack's signatures + geography priors. Hierarchy-aware fallback: most specific
   label you're confident in, else the parent; allow `uncertain`.

   **The verdict fields are in `references/verdict-record.md` and nowhere else.**
   Read them from there; this step deliberately does not list them, because the
   copy that used to stand here went stale (it predated `changed`,
   `represents_cluster`, `no_class_fits` and `mixed`). Validate before anything
   consumes the verdicts:
   ```
   uv run --no-project python .claude/skills/cluster-labeling/scripts/check_verdict_contract.py \
     RUN_DIR --contract .claude/skills/cluster-labeling/references/verdict-record.md
   ```
   *(There is no `prompt.txt`. Its generator went with the Gemini path in
   `a20a78f` and cannot be regenerated; the round brief in `RUN_DIR` is what
   readers read.)*

3a. **Pick the harness — and know what the choice forecloses.** Two paths, and
   the difference is not cosmetic:

   | | `Workflow` + `scripts/round_workflow.js` | `Agent` + `SendMessage` |
   |---|---|---|
   | readers | one-shot `agent()`, deterministic, resumable | live sessions you can come back to |
   | debrief | **impossible** — no continuation to quiz | available (step 3b) |
   | use when | the contract is settled and you want throughput | the process itself is under test |

   ```
   Workflow({scriptPath: '.claude/skills/cluster-labeling/scripts/round_workflow.js',
             args: {runDir: RUN_DIR, cards: 'cards.json', brief: 'BRIEF.md',
                    batchPrefix: 'batch', batches: [[...ids...], ...]}})
   ```
   **Generate the cards with the same batches first** — the workflow hands reader
   *i* `cards_bN.json`, not the whole file:
   ```
   python .claude/skills/cluster-labeling/scripts/gen_round_cards.py RUN_DIR \
     --batches '2,78,103;35,90,109'
   ```
   A reader has no shell (see its tool list), so it cannot narrow the full file
   down itself, and handing it every cell loads its context with the whole round
   rather than its batch — which is what puts a reader past the size where it can
   be reached for step 3b. Pass `cardsPerBatch: false` only for a run whose cards
   were never split.
   **A reader's session ends the moment its `agent()` returns**, so choosing
   `Workflow` decides step 3b before you get there and cannot be undone by
   noticing later. Round 4 lost its debrief exactly this way, with the rule
   written down — at the destination, not here.

3b. **Debrief the readers** — only on the `Agent` path, and only as a **second
   turn after the verdict files are on disk**. Contract, fields and the fixed
   question template: `references/reader-debrief.md`. Generate the prompts
   mechanically (never hand-word them per reader — frequency across readers is
   the filter, and it only measures the process if everyone was asked the same
   thing):
   ```
   uv run --no-project python .claude/skills/cluster-labeling/scripts/gen_debrief_prompts.py \
     RUN_DIR --verdicts 'batch_*.json' --out-prefix debrief
   ```
   `SendMessage` each filled prompt to the reader that produced that batch — **the
   moment that reader returns, before the contract check and before waiting for
   the others.** A reader goes unreachable a few minutes after it falls idle, and
   the larger its transcript the faster; a real reader's is 20-25 MB. The measured
   ladder and what it cost is in `references/reader-debrief.md`. Then mine the
   tally:
   ```
   uv run --no-project python .claude/skills/cluster-labeling/scripts/mine_debrief.py RUN_DIR
   ```
   Reader self-report is the **weakest** evidence class here — it produces signal
   to adjudicate, never findings to adopt. Same standing as `no_class_fits`.

4. **Aggregate** (confidence-weighted vote → one label + agreement per cluster):
   ```
   python .claude/skills/cluster-labeling/scripts/aggregate.py RUN_DIR \
     --judgments RUN_DIR/judgments.json
   ```
   → `RUN_DIR/cluster_to_label.json` (+ fills `results.jsonl`).

5. **Review page:**
   ```
   python .claude/skills/cluster-labeling/scripts/gen_review_html.py RUN_DIR \
     --seg SEG [--old OLD.tif --mapping pixel-mapping.json] \
     [--nbr-labels PRIOR_RUN/cluster_to_label.json]
   ```
   → `RUN_DIR/review.html` (cards: exemplars + locator + voted label + agreement
   + spatial-neighbor labels with boundary shares + optional old-label cross-tab;
   filters for low-agreement / differs-from-neighbours / disagrees-with-old; click
   to zoom). `--nbr-labels` supplies fallback labels for neighbor clusters not
   judged in this run (e.g. the parent round of an intersection raster). Open it;
   this is the human-feedback surface.

5b. **Neighbor-pair check** (for the flagged differs-from-neighbour clusters —
   the VLM, not any clustering-side signal, decides "visually identical"):
   ```
   python .claude/skills/cluster-labeling/scripts/gen_nbr_pairs.py RUN_DIR \
     --seg SEG --base BASE
   ```
   → raw boundary-straddling crops (`crops/cXXX_nbrYYY.jpg`, cell magenta /
   neighbor cyan) from `nbr_flags.json`. Judge each: same cover across the
   boundary? → `RUN_DIR/nbr_verdicts.json`
   (`[{cluster, nbr, same_cover, cover, confidence, note, img}]`), then re-run
   step 5 with `--nbr-verdicts` to fold verdicts + pair crops into the cards.
   NOTE adoption has no fixed direction: "same cover" as often means the big
   neighbor is wrong at that spot as the small cell — the verdict names which.

6. **Corrections loop.** Keep an append-only `RUN_DIR/corrections.md` (one section
   per cluster, geo direction in the header, `- fb:` lines). Record user feedback,
   revise `judgments.json`, re-run steps 4–5. Route durable learnings to the right
   sink: AOI-specific (signature/geography/reference/label policy) → the AOI pack;
   methodology that would hold for any AOI → this skill (see Self-improvement).

## Methodology rules (hard-won)

- **Layer separation: embeddings cluster, vision labels.** The embeddings' job ends
  when the cluster raster is produced. In the labeling pass, every qualitative question —
  including "is this cell visually identical to its neighbor?" — is answered by the VLM
  looking at imagery, never by reaching back into embedding distances or other
  clustering-side signals. (Corollary: "k-means kept them separate" is NOT evidence the
  covers differ.) Imagery/embedding snapshot-date mismatches are acknowledged and worked
  *modulo* — do not reintroduce embedding signals to compensate.
- **Consult the whole-area overview, and use the label choropleth as macro-QA.** Read
  `overview_basemap.jpg` before judging — it shows large uniform regions and how cover
  types are arranged (the visual form of the geography priors, and the neighbor context
  the per-cluster crops can't give). After aggregating, scan `overview_labels.jpg`: a
  real land-cover class **clusters spatially** (coherent belts ⇒ trustworthy); a
  default/uncertainty artifact **sprays as confetti** across the map (suspect). This
  catches systematic errors that per-cluster review can't — they're only visible at
  whole-map scale (e.g. an over-applied "grassland" default showing as scattered specks
  while cashew forms a clean belt).
- **The goal is a correct label per CELL, not per cluster.** The cluster is a *prior*
  that propagates one label across visually-similar cells cheaply — it is not the unit of
  truth and is overridable. Where a cluster is pure, label it wholesale; where it isn't,
  drop to a finer unit (sub-cluster / tile / carve-out) and get each piece right. Better a
  correct label on a 10×10 m square than a tidy single label on a mixed cluster.
- **Carve out confident minorities.** When review (an exemplar, or a spotted sub-region
  like a small coconut grid inside a cashew cluster) shows a distinct cover different from
  the cluster majority, mask that sub-region out and relabel it — don't let the vote bury
  it. Mechanisms: intersect the cluster with a finer k, or carve the visually-similar
  connected patch around the exemplar. (This is the actionable form of "impurity ⇒ go finer".)
- **Resolve low-confidence cells by spatial context, not in isolation.** A ~0.4-confidence
  cell is frequently wrong on its own, but an adjacent cell/cluster of the same visual type
  is often confidently (and correctly) labeled — adopt the confident neighbor's label.
  Show neighbors in review and let confident regions propagate into ambiguous ones.
  Implemented: `gen_review_html.py` computes raster adjacency, prints each cluster's
  dominant neighbors + labels on its card, and flags/filters clusters whose dominant
  neighbor's label is unrelated and holds ≥ 25% of the boundary — the
  "cell visually identical to its surroundings" case.
- **Inherit the parts of the prior map that are already right, and give the readers the
  mechanism — not just the policy.** Don't relabel cells the old map gets correct (the AOI
  pack names which — e.g. water): freeze them and spend judgment only where the relabel
  adds value. A policy nobody can act on is not a policy: for two rounds this project
  said "inherit water" while no reader was ever shown what the prior map claimed, and
  dry-season tank beds were duly judged from the photo alone — four were guessed right at
  ~0.45 confidence and one became `fallow`. Compute the cross-tab (step 2d), freeze the
  authoritative class, and pass the rest down as evidence.
- **A prior map is an independent observation at a different time, and that is its whole
  value.** It can know what your imagery cannot show — seasonality above all. A tank
  photographed dry looks like bare ground and nothing in a single-date image says
  otherwise. But authority is **per-class, never blanket**: the same map is usually weak
  overall (that's why it's being relabelled), so "the old map says X" must not become the
  next default. Freeze the classes it's known to get right; pass the rest down as real
  positional evidence — below what the reader can plainly see in the crops, but above any
  coarse textual geography prior, which is typically just this same map summarised (see
  next bullet); and where a cell straddles two prior classes, read that as a split signal
  along a real boundary rather than a label to pick between.
- **Cross-tab the prior map at CELL scale only — never over a window around an exemplar.**
  A cell's pixels are scattered across the AOI, so the distribution samples the old map at
  many near-independent locations and one mislabelled polygon barely moves it. A local
  window sits inside one or two polygons, and error in a coarse map is *spatially
  correlated* — so a single mapping mistake returns as a confident "local: 70% X" and reads
  to the reader as independent evidence. Per-exemplar prior lookups fail the same way, more
  sharply. The aggregation scale is what makes this signal trustworthy; don't shrink it.
- **Textual geography priors are bootstrapping, and the prior map retires them.** Belt/
  compass rules ("class C → the west") are almost always derived by eyeballing the same map
  the cross-tab now reads directly: same source, summarised to a sector. They earn their
  keep on the first pass, when nothing exists to cross-tab against. After that, a reader
  citing a sector while `old_map` sits on the card has reached past the signal for its own
  lossy summary — and they will, unless the AOI pack says outright which one outranks.
  A nodata cell falls back to the prior map's *neighbours*, not to the sector.
- **Light tint only.** A heavy patch fill flattens canopy/crown texture and
  causes misreads (it turned a coconut grove into "scrub"). Renderer default is
  12% yellow + magenta outline. Upscale small (~170 px) crops ~4× before reading.
- **Always look at the locator** before labeling — "largest patch" exemplars can
  be unrepresentative of a dispersed/impure cluster; the locator reveals that.
- **Judge at three scales, not one.** The close crop identifies the cover, the
  context crop identifies its *matrix*, and the locator says whether the patch is
  typical of its cluster. Skipping the middle scale is a systematic bias, not a
  minor loss: every class whose definition contains "amid", "surrounded by",
  "between", or "in a … matrix" is undecidable from the close crop, so a reader
  given only that will reach for the class that needs no context — which is how a
  smooth-green default gets established in the first place.
- **Geography is a prior, not trivia.** Every exemplar has lon/lat; compute its
  direction from the AOI center and apply the pack's spatial priors. The same data
  polices landmark claims: never record "this crop is <landmark>" without checking the
  exemplar's coordinates against the landmark's — a look-alike building 1 km away got
  logged as the AOI's central monument and the error propagated for rounds.
- **The cues the readers actually consume must be the same artifact you maintain.**
  Class knowledge ends up in two places now — the AOI pack's class definitions and
  each round's hand-written brief — and the reader agent reads the class
  definitions *directly*, so that document IS the cue surface. It was not always:
  the renderer's `FIELD_GUIDE` used to build a `prompt.txt` that was the only thing
  an ordinary reader saw, and a pack could absorb rounds of corrections while
  readers were still served the original wording. That indirection is gone with the
  Gemini path, which removes the drift but creates the opposite hazard — see the
  not-assignable note below. When feedback updates a class, check that the reader's
  entry point carries it, not only the doc you read.
- **Write cues as REQUIREMENTS, not appearances.** Every systematic error this
  pipeline produced came from a class applied on *absence* of evidence — "smooth
  green, nothing obviously growing". A cue that only describes a look can always be
  satisfied by an ambiguous patch; a cue that names the positive evidence the class
  *requires* cannot. Where a published scheme defines the class, quote its
  requirement (e.g. fallow needs visible evidence of prior cultivation, not merely
  no crop) — it is more defensible than anything you invent, and it survives review.
- **Record `alternative` + `reasoning` every time** — they drive the review and
  the corrections triage.
- **Disagreement (mine vs prior) = the expert-review queue**, not noise.
- **Impurity is a signal to go finer.** Clusters whose exemplars/locator show
  multiple cover types want a finer k (or an intersection of k-levels — note that
  k-levels generally do NOT nest cleanly, so intersecting kA∩kB yields more, more
  uniform cells plus a discardable sliver tail).
- **Per-exemplar correctness beats one-label-per-cluster.** If any exemplar is
  *confidently* a different class than the cluster's majority, that is a SPLIT signal —
  flag the cluster rather than letting the vote bury the minority exemplar. A right
  label on each piece is worth more than a tidy single label on the whole cluster.
- **High agreement built from uniformly LOW confidence is NOT a clean cluster.** Six
  exemplars all guessing the same fallback at conf ~0.5 produces agreement 1.0 but means
  systematic uncertainty, not homogeneity. Trust `agreement` only when confidence is also
  high; surface low-confidence "consensus" clusters for review (and watch for a class that
  has become a catch-all default — e.g. any smooth/ambiguous patch → "grassland").
- **Stratified exemplar selection (when a prior label raster exists).** The renderer's
  default `patch_exemplars` picks the N *largest* patches, which biases toward the dominant
  cover and under-samples minority covers in impure clusters. Prefer exemplars that span the
  prior-label strata (or distinct spatial sub-regions) within the cluster so each
  sub-population is seen. Prior-label family-spread *within* a cluster is an independent
  impurity/split trigger, complementary to vote-disagreement.

## Self-improvement (living skill)

This skill is a procedure, not a frozen product — every round should leave it
better than it found it. Two grades of learning, two speeds:

- **User-confirmed corrections fold in immediately.** Feedback recorded in
  `RUN_DIR/corrections.md` is ground truth from the maintainer — route it
  before the round closes: AOI-specific (signature / geography / reference /
  label policy) → the AOI pack; AOI-agnostic methodology (a new rule, failure
  mode, QA surface) → this file's Methodology rules. A round that ends with an
  unrecorded surprise isn't done.
- **Self-observed friction accumulates first.** A one-session hunch (awkward
  step, suspected pattern, missing view) gets logged — a `- friction:` line in
  `RUN_DIR/corrections.md`, or the AOI pack's State section if cross-round —
  not an immediate edit here. Same friction in a second round ⇒ promote it.
  Log first, don't filter; a pattern only emerges from honestly recorded
  one-offs.
- **Improvise views; promote on reuse.** The scripted views (crops, locators,
  overview, review page) are a floor, not a ceiling. When a judgment stalls for
  want of evidence, compile a new task-shaped view on the spot (recrop, upscale,
  tint-free, composite, intersection — whatever the question needs); that's how
  every current script started. An ad-hoc view that earns a second use graduates
  into `scripts/` and gets a line under Files and Procedure.

## Files

- `references/verdict-record.md` — the verdict record's fields and their meaning,
  single-sourced. Step 3 and every harness read them from here; nothing restates
  them. `scripts/check_verdict_contract.py --contract` validates against it.
- `references/reader-debrief.md` — the reader debrief: its four channels, the two
  hard rules about when and who, and the fixed question template. Reachable only
  from the `Agent` + `SendMessage` harness (step 3a).
- `references/convergence-loop.md` — the multi-pass settle/split loop that wraps
  this procedure: per-cluster state machine, the settle gate and its criteria,
  disagreement triage, what is built vs not, and the open decisions. Load it when
  running a pass after the first, or tuning the gate.
- `scripts/gate.py` — ledger + settle gate: judgments (+ verify, prior, neighbour)
  → `ledger.json` with a state per cluster, stamped with `defs_version` **and the
  `--defs` paths that stamp was computed over**.
- `scripts/human_verify.py` — the adjudication surface's export → a file
  `gate.py --verify` can read. **Exemplar rulings only**: a cluster-wide ruling is
  reported by id and left for the router, never folded in silently. Reports what it
  refused to convert, whether the export's `defs_version` still matches the contract
  on disk, and any ruling naming a cell the round never judged; `--strict` turns
  every such report into exit 1.
- `scripts/check_defs_drift.py` — recomputes a ledger's `defs_version` from its own
  recorded `--defs` and reports drift. Exit 0 matches / 1 drifted / **2 no defs
  recorded** (a ledger written before gate.py stored them cannot be checked, and
  that is not the same as clean). Run it before trusting any ledger you did not
  just write; it reports and never re-stamps.
- `scripts/gen_locator.py` — per-cluster locator maps.
- `scripts/gen_overview.py` — whole-area basemap overview + label choropleth (macro-QA).
- `scripts/gen_context.py` — mid-scale context crop per exemplar (same centre, wider
  window) for classes decided by their surroundings.
- `scripts/aggregate.py` — judgments.json + results.jsonl → cluster_to_label.json.
- `scripts/gen_review_html.py` — review.html (+ `nbr_flags.json` side output).
- `scripts/gen_nbr_pairs.py` — boundary-straddling pair crops for the flagged
  neighbor mismatches (handles dispersed cells: centers on the largest connected
  patch touching that neighbor). Needs scipy.
- `scripts/gen_intersection.py` — split flagged impure clusters by intersecting
  with other k-level rasters (kA ∩ kB): minority cells get new ids, the largest
  cell keeps the parent id, slivers (< --min-px) fold into it. Output is a normal
  cluster raster + parentage mapping JSON, consumable by all the other scripts.
- `scripts/measure_coverage.py` — per-cell exemplar coverage against the gate's
  `min_coverage`, i.e. what a pass would cost before it is rendered. Calibrate the
  window convention against figures already on record before quoting it; centring
  vs tiling swings the answer 6×.
- `scripts/gen_exemplars.py` — selects each cluster's largest connected patches
  and renders the judged crops + `results.jsonl`. Lifted from the repo's deleted
  `scripts/vlm_label_prototype.py`; the API path did not come with it.
- `scripts/gen_round_cards.py` — reader cards + the baseline they are diffed
  against, kept apart on purpose (`--blind`, the default, omits the previous
  label). `--batches '1,2;3,4'` also writes `cards_b0.json`, `cards_b1.json` … so
  each reader gets only its own cells; a requested id with no card is reported,
  never dropped quietly.
- `scripts/gen_patch_crops.py` — the patch-scaled crop (step 1b): window sized to
  the component, aspect-matched so a ribbon is not framed as a square, boundary
  burned in at full resolution, **no tint**, captioned with the cell's share of
  the frame. Reads geometry from `results.jsonl`; reports any exemplar whose
  patch it could not find rather than skipping it silently.
- Imagery comes from the repo's tile pipeline, **not from this skill**:
  `scripts/esri_tiles.py download` / `stitch` (AOI and zoom from `config.yaml`;
  needs no GDAL CLI). The mosaic it writes is what every crop generator here
  takes as `--base`.
- `scripts/check_tile_upsampling.py` — **run this on every new tile pull before
  anything cuts crops from it.** A tile server serves *something* for a zoom it
  does not hold: the parent tile, resampled, unmarked. A mosaic that is real at
  one edge and upsampled at the other is worse than a uniformly coarser one,
  because readers cannot tell which they are looking at and will over-read the
  fake detail — and every label resting on it is a false claim about ground.
  Exits non-zero when a pull looks fake; the threshold is calibrated by
  injection, so read the docstring before changing it.
