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
- **Mature coconut**: star-burst rosette crowns + thin long shadows (NOT scrub-like).
- **Young coconut**: a regular dot-grid of shrub-sized crowns in grass → new coconut,
  not generic orchard.
- **Casuarina is two-phase** (rotational, harvested every few years, like a water
  body is seasonal): (a) standing = fine feathery uniform dark-green canopy;
  (b) harvested = a regular-geometry field that looks fallow/bare for a few years.
  So a west-side geometric "fallow" field may be harvested casuarina.
- **Geometric field-like patches are NEVER planted forest** → label agriculture
  (crop/orchard/casuarina).
- **There are basically NO natural forests here — never use `forest.natural_forest`.**
  All forest is planted. Dense "natural-looking" canopy = `forest.planted_forest`,
  or casuarina on the west.
- **Planted forest clusters around Auroville communities** (correlates with settlement).
- **Mango orchards** exist but were under-labeled in the old map; smaller clusters.
  Actively hunt mango (large dense rounded dark crowns, wide regular spacing) at finer k.

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
| coconut, young/grid | `crops/c021_e2.jpg` (needs tint-free recrop) |
| casuarina, standing ✅ | `recheck_casuarina/c014_e0_raw100.jpg`, `c014_e2_raw100.jpg` |
| casuarina, harvested | `recheck_casuarina/c020_e1_raw100.jpg` (tentative) |
| cashew ✅ | `crops/c013_e0.jpg`, `c003_e0.jpg`, `c009_e0.jpg` |
| field_crops ✅ | `recheck_casuarina/c010_e0_raw100.jpg`, `crops/c006_e0.jpg` |
| dense_built ✅ | `crops/c008_e0.jpg` |
| sparse_built | `crops/c016_e1.jpg`, `crops/c007_e0.jpg` |
| forest_built | `crops/c004_e2.jpg`, `crops/c018_e0.jpg` |
| sparse_scrub (true) | `crops/c000_e0.jpg` (only outside the cashew belt) |

Still needed: a confirmed **mango**, a clean **planted_forest** (central, irregular),
**water.seasonal_tanks** (dry-season bed — k22 c12 read as grazing land).

## State / history

- **Round 1 = k22** (22 clusters × 3 exemplars), in `data/av-3.5K/intermediates/vlm_label_k22/`.
  Full results + the append-only `corrections.md` (per-cluster geo + user feedback)
  live there. Labeled by Claude in-harness; user gave 2 feedback rounds.
- **Next = finer k in a fresh session.** k22 proved too coarse/impure. Plan:
  go to **k88**, and since k-levels don't nest, consider **k88 ∩ k22** to get more
  uniform categories (~257 cells ≥200 px cover 97.6% of area; the sliver tail
  <0.5% is discardable). k88∩k44 → ~295 cells but a bigger sliver tail (~5%).
  Bump `--exemplars` to ~5–6; hunt mango; watch for harvested casuarina (west).

## Run commands (this AOI)

```
RUN=data/av-3.5K/intermediates/vlm_label_k88
python scripts/vlm_label_prototype.py --aoi data/av-3.5K --seg-key k88_s42 \
  --clusters 88 --exemplars 6 --dry-run --out $RUN
python .claude/skills/cluster-labeling/scripts/gen_locator.py $RUN \
  --seg data/av-3.5K/intermediates/clusters/k88_s42.tif \
  --base data/av-3.5K/intermediates/esri_3.5k_roi_cog.tif --center 79.8106 12.0058
# → read crops + locators, write $RUN/judgments.json
python .claude/skills/cluster-labeling/scripts/aggregate.py $RUN --judgments $RUN/judgments.json
python .claude/skills/cluster-labeling/scripts/gen_review_html.py $RUN \
  --seg data/av-3.5K/intermediates/clusters/k88_s42.tif \
  --old data/av-3.5K/outputs/land-cover_cog.tif \
  --mapping data/av-3.5K/outputs/pixel-mapping.json
```
