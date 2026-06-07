---
name: cluster-labeling-auroville
description: >-
  Auroville (Tamil Nadu, India) AOI pack for the cluster-labeling skill — paths,
  label hierarchy, crop visual signatures, geography priors, reference example
  crops, and the running corrections log. Use whenever labeling Auroville
  land-cover clusters / relabeling the Auroville land-use map. Load this together
  with the cluster-labeling engine skill.
---

# Auroville AOI pack

Domain pack for the `cluster-labeling` engine. **This file is the source of
truth** for Auroville labeling knowledge (the user's two memories point here).
Update it every session with new durable learnings.

## Paths / config (engine inputs)

- AOI dir: `data/av-3.5K`
- Cluster rasters (`SEG`): `data/av-3.5K/intermediates/clusters/{k22,k44,k88}_s42.tif`
  — 703×703, EPSG:4326, int16, nodata −1. `SEG_KEY` = e.g. `k88_s42`.
- Basemap (`BASE`): `data/av-3.5K/intermediates/esri_3.5k_roi_cog.tif`
  — ESRI mosaic, ~1 m effective (grid ~0.58 m, oversampled), 11906×12151, EPSG:4326,
  same bounds as the cluster rasters.
- Hierarchy: `data/av-3.5K/land-cover.json` (43 nodes flattened).
- Prior/old labels (for review cross-tab): `data/av-3.5K/outputs/land-cover_cog.tif`
  + `data/av-3.5K/outputs/pixel-mapping.json` (known weak — see below).
- **CENTER (`--center`): `79.8106 12.0058`** = Matrimandir.

Producers (out of scope for labeling): ESRI imagery via `bun run download-tiles`/
`stitch-tiles`; cluster rasters + hierarchy via the sibling **alpha-bhu** repo.

## Crop visual signatures

- **Cashew** looks scrub-like from above (low spreading crowns ≈ scrub clumps).
  **Hard rule: my "scrub" vs old "cashew" → it's CASHEW.** Don't trust the scrub read.
- **`degraded_barren` (esp. `.eroded_land`) is COMMON here and was under-applied** —
  bare red/laterite soil, eroded/gullied ground, sparse-to-no vegetation. It is more
  common than the grazing/maintained-grass reads that wrongly became defaults; actively
  use it for genuinely bare/eroded ground (esp. where the old map's smooth-green default
  was wrong).
- **Cashew vs barren discriminator (user-confirmed):** crowns present ⇒ CASHEW;
  bare/eroded soil with no crowns ⇒ `degraded_barren`. (So the "scrub→cashew" rule fires
  on vegetated clumps; genuinely bare/eroded laterite is barren, not cashew.)
- **Mature coconut**: star-burst rosette crowns + thin long shadows (NOT scrub-like).
- **Young coconut**: a regular dot-grid of shrub-sized crowns in grass → new coconut,
  not generic orchard.
- **Casuarina is two-phase** (rotational, harvested every few years, like a water
  body is seasonal): (a) standing = fine feathery uniform dark-green canopy;
  (b) harvested = a regular-geometry field that looks fallow/bare for a few years.
  **A geometric "fallow"/grassy field interspersed with or surrounded by casuarina
  fields is harvested/fallow casuarina, not generic fallow or dryland crops.**
  (User-confirmed across k88 c5, c6, c30, c31 — a strong, recurring prior on the west.)
  When you read a flat field as fallow/field_crops/grass and casuarina stands are nearby,
  prefer `orchards.casuarina`.
- **Young / recently-planted forest reads light-green and smooth** — no separable
  crowns, almost grass-like at ~170 px. Do NOT default this to grassland; in a
  forest/scrub matrix it is `forest.planted_forest` (k88 c17/c18 were misread as
  grazing land — they are planted forest).
- **Tree-lines along irrigation channels / bunds** are common — linear strings of
  trees following field edges. Don't let a bund tree-line flip an agricultural
  patch to forest; it's part of the field/agroforestry mosaic.
- **Geometric field-like patches are NEVER planted forest** → label agriculture
  (crop/orchard/casuarina).
- **There are basically NO natural forests here — never use `forest.natural_forest`.**
  All forest is planted. Dense "natural-looking" canopy = `forest.planted_forest`,
  or casuarina on the west.
- **Planted forest clusters around Auroville communities** (correlates with settlement).
- **Mango orchards** exist but were under-labeled in the old map; smaller clusters.
  Actively hunt mango (large dense rounded dark crowns, wide regular spacing) at finer k.

## Label policy (Auroville-specific class choices)

- **INHERIT water from the old map — do NOT relabel it.** The manual map's `water`
  bodies are accurate (and correctly seasonal). Freeze old-map water cells and carry
  them straight through; spend judgment only where the relabel adds value. (Don't waste
  exemplars re-deciding water, and don't second-guess a dry tank that the old map calls
  water — it's seasonal.)
- **NEVER use `grassland.grazing_land`.** Auroville has no land used *exclusively*
  for grazing — herds are moved around and feed off public/common land, so grazing
  is not a land-cover class here.
- **`grassland.maintained_grass` is RARE and mostly around Matrimandir** (managed
  gardens / lawns / campus grounds in the central zone). It became a second catch-all
  for smooth green (after grazing). Do NOT apply it away from the center unless the
  patch is unmistakably mown/managed and ringed by built. Away from the center, a
  smooth light-green patch is far more likely **`forest.planted_forest`** (young/sparse
  trees — see signature; the common case in a forest matrix), **harvested
  `orchards.casuarina`** (west / amid casuarina), or **`agriculture.fallow`** (geometric
  field in an agricultural context). Decide by matrix/context, not by "it's green and smooth."
- **`agriculture.field_crops.dryland_crops` — VERIFY before using.** Open question
  whether Auroville actually has dryland crops (groundnut/millet) at scale. Many
  "dryland_crops" / generic "field_crops" reads in or beside the casuarina zone are
  suspected to be **harvested/fallow casuarina** instead (user flagged c30/c31). Prefer
  casuarina when the field sits among casuarina; reserve dryland_crops for fields with a
  clear active-crop signature away from the casuarina belt, pending ground verification.
- **Built subtypes — discriminate by what fills the space BETWEEN the buildings:**
  - `built_environment.dense_built` — roofs adjacent/contiguous, little vegetation
    between; town/village urban fabric.
  - `built_environment.sparse_built` — buildings separated by **open ground** (bare
    soil / grass / field) as the matrix.
  - `built_environment.forest_built` — buildings embedded **under/among tree canopy**;
    canopy is the matrix and roofs peek through. The default Auroville
    community-in-greenbelt pattern.
  - Tie-breaker question: *is the matrix roofs, open ground, or canopy?* Don't pick a
    built subtype by roof density alone. (k88 c2/c7 were arbitrary without this.)

## Geography priors (direction from Matrimandir)

Every exemplar has lon/lat → compute 8-point compass from center
(`brg=(90-deg(atan2(dLat,dLon)))%360`; idx=round(brg/45)%8 over [N,NE,E,SE,S,SW,W,NW]).

- **Casuarina → west.** (Validated: all k22 casuarina clusters are NW.)
- **Cashew → east & south.**
- **Coconut → east & south.**
- **Forest (planted) → broad central-ish belt incl. the SE**; soft prior, not dead-center.
- **The geometric center (around Matrimandir) is GARDENS** — neither forest nor
  field (managed garden/agroforestry/built mosaic). Don't default the center to forest.
- A "scrub" read in the middle of the east/south cashew belt is almost certainly cashew.
- Apply per-exemplar, not per-cluster-centroid (scattered clusters have meaningless centroids).

## Reference example crops

Read these to calibrate before judging (prefer tint-free `_raw`; paths relative to
`data/av-3.5K/intermediates/vlm_label_k22/`). ✅ = confirmed.

| class | example |
|---|---|
| coconut, mature ✅ | `../vlm_label_k22_c5w100/crops/c005_e1_raw_x4.jpg`, `c005_e2_raw_x4.jpg` |
| coconut, grove + young grid ✅ | `../vlm_label_k88/crops/c029_e2.jpg` (maturing grove), `c029_e5.jpg` (young dot-grid in laterite) — tinted; clean recrop wanted. User-confirmed c29 ≈ coconut (was mis-voted cashew). |
| coconut, young/grid (older) | `crops/c021_e2.jpg` (needs tint-free recrop) |
| casuarina, standing ✅ | `recheck_casuarina/c014_e0_raw100.jpg`, `c014_e2_raw100.jpg` |
| casuarina, harvested | `recheck_casuarina/c020_e1_raw100.jpg` (tentative) |
| cashew ✅ | `crops/c013_e0.jpg`, `c003_e0.jpg`, `c009_e0.jpg` |
| field_crops ✅ | `recheck_casuarina/c010_e0_raw100.jpg`, `crops/c006_e0.jpg` |
| dense_built ✅ | `crops/c008_e0.jpg` |
| sparse_built | `crops/c016_e1.jpg`, `crops/c007_e0.jpg` |
| forest_built | `crops/c004_e2.jpg`, `crops/c018_e0.jpg` |
| sparse_scrub (true) | `crops/c000_e0.jpg` (only outside the cashew belt) |

Still needed: a confirmed **mango**, a clean **planted_forest** (central, irregular),
a confirmed **young planted_forest** (the light-green/smooth case misread as grazing),
**harvested casuarina** (west-side geometric fallow field), and a clean
**water.seasonal_tanks** (dry-season bed).

## State / history

- **Round 1 = k22** (22 clusters × 3 exemplars), in `data/av-3.5K/intermediates/vlm_label_k22/`.
  Full results + the append-only `corrections.md` (per-cluster geo + user feedback)
  live there. Labeled by Claude in-harness; user gave 2 feedback rounds.
- **Round 2 = k88** (88 clusters × 6 exemplars), in `data/av-3.5K/intermediates/vlm_label_k88/`.
  Judged in-harness via 11 parallel reader agents sharing one calibration brief.
  Outputs: `judgments.json`, `cluster_to_label.json`, `review.html`, `split_candidates.md`,
  `corrections.md`. Geography priors all held (casuarina W/NW, cashew E/S, center =
  gardens). Per-exemplar vs old-map check: only 25% exact / 36% w/ hierarchy match —
  the relabel is genuinely correcting the old map, not reproducing it. User feedback
  (round 1) drove the label-policy + signature updates above. Key errors found:
  `grazing_land` over-applied as a low-confidence default (now retired); built subtypes
  arbitrary without definitions (now defined); harvested casuarina under-called.
- **Next ideas (not yet done):** (a) **stratified exemplar selection** — pick exemplars
  to span the old-label strata within each cluster instead of just the N largest patches,
  so minority covers in impure clusters get sampled (the current `patch_exemplars` largest-N
  bias under-samples them). (b) Use **old-map family-spread within a cluster** as an
  independent split trigger. (c) Refine flagged impure clusters: `k88 ∩ k22` (computable
  locally, good for *spatially-split* impurities) for the spatial ones; a **finer/local
  re-cluster from alpha-bhu** (k176 or sub-clustering of just the flagged masks) for the
  *interleaved* ones (two-phase casuarina, gardens gradient, cashew-belt edges) that an
  intersection with a coarser level won't separate. Avoid *global* k176 (re-fragments the
  already-clean pure clusters; k-levels don't nest).

## Run commands (this AOI)

```
RUN=data/av-3.5K/intermediates/vlm_label_k88
python scripts/vlm_label_prototype.py --aoi data/av-3.5K --seg-key k88_s42 \
  --clusters 88 --exemplars 6 --dry-run --out $RUN
python .claude/skills/cluster-labeling/scripts/gen_locator.py $RUN \
  --seg data/av-3.5K/intermediates/clusters/k88_s42.tif \
  --base data/av-3.5K/intermediates/esri_3.5k_roi_cog.tif --center 79.8106 12.0058
python .claude/skills/cluster-labeling/scripts/gen_overview.py $RUN \
  --seg data/av-3.5K/intermediates/clusters/k88_s42.tif \
  --base data/av-3.5K/intermediates/esri_3.5k_roi_cog.tif
# → read overview_basemap.jpg + crops + locators, write $RUN/judgments.json
python .claude/skills/cluster-labeling/scripts/aggregate.py $RUN --judgments $RUN/judgments.json
python .claude/skills/cluster-labeling/scripts/gen_review_html.py $RUN \
  --seg data/av-3.5K/intermediates/clusters/k88_s42.tif \
  --old data/av-3.5K/outputs/land-cover_cog.tif \
  --mapping data/av-3.5K/outputs/pixel-mapping.json
```
