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

1. **Render exemplar crops** (reuses the repo renderer, light tint by default):
   ```
   python scripts/vlm_label_prototype.py --aoi AOI --seg-key SEG_KEY \
     --clusters N --exemplars E --window-m 200 --dry-run --out RUN_DIR
   ```
   → `RUN_DIR/{crops/,prompt.txt,results.jsonl}`. More exemplars (5–6) for
   coverage; bump only as needed for uniform clusters. Use `--cluster-ids` to
   target specific clusters; `--window-m 100` + 4× upscale for fine crown/species.

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

3. **Judge.** Read `prompt.txt`, the AOI pack's reference example crops, then for
   each cluster read its exemplar crops **and** its locator map. Emit a verdict
   per exemplar into `RUN_DIR/judgments.json` — a JSON array of
   `{cluster, exemplar, label, level, confidence, alternative, reasoning}`,
   following `prompt.txt` exactly. Apply the AOI pack's signatures + geography
   priors. Hierarchy-aware fallback: most specific label you're confident in,
   else the parent; allow `uncertain`.

4. **Aggregate** (confidence-weighted vote → one label + agreement per cluster):
   ```
   python .claude/skills/cluster-labeling/scripts/aggregate.py RUN_DIR \
     --judgments RUN_DIR/judgments.json
   ```
   → `RUN_DIR/cluster_to_label.json` (+ fills `results.jsonl`).

5. **Review page:**
   ```
   python .claude/skills/cluster-labeling/scripts/gen_review_html.py RUN_DIR \
     --seg SEG [--old OLD.tif --mapping pixel-mapping.json]
   ```
   → `RUN_DIR/review.html` (cards: exemplars + locator + voted label + agreement
   + optional old-label cross-tab; filters for low-agreement / disagrees-with-old;
   click to zoom). Open it; this is the human-feedback surface.

6. **Corrections loop.** Keep an append-only `RUN_DIR/corrections.md` (one section
   per cluster, geo direction in the header, `- fb:` lines). Record user feedback,
   revise `judgments.json`, re-run steps 4–5. Update the AOI pack with any new
   durable signature/geography/reference learned.

## Methodology rules (hard-won)

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
- **Inherit the parts of the prior map that are already right.** Don't relabel cells the
  old map gets correct (the AOI pack names which — e.g. water). Freeze them and spend
  judgment only where the relabel adds value.
- **Light tint only.** A heavy patch fill flattens canopy/crown texture and
  causes misreads (it turned a coconut grove into "scrub"). Renderer default is
  12% yellow + magenta outline. Upscale small (~170 px) crops ~4× before reading.
- **Always look at the locator** before labeling — "largest patch" exemplars can
  be unrepresentative of a dispersed/impure cluster; the locator reveals that.
- **Geography is a prior, not trivia.** Every exemplar has lon/lat; compute its
  direction from the AOI center and apply the pack's spatial priors.
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

## Files

- `scripts/gen_locator.py` — per-cluster locator maps.
- `scripts/gen_overview.py` — whole-area basemap overview + label choropleth (macro-QA).
- `scripts/aggregate.py` — judgments.json + results.jsonl → cluster_to_label.json.
- `scripts/gen_review_html.py` — review.html.
- Renderer is **reused** from the repo: `scripts/vlm_label_prototype.py`
  (`--dry-run` renders crops; the same script can also call an API model).
