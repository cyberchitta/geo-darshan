---
name: cluster-labeling-auroville
description: >-
  Auroville (Tamil Nadu, India) AOI pack for the cluster-labeling skill — paths,
  label hierarchy, research-backed per-class definitions, geography priors,
  reference example crops, and the running corrections log. Use whenever labeling
  Auroville land-cover clusters / relabeling the Auroville land-use map. Load this
  together with the cluster-labeling engine skill.
---

# Auroville AOI pack

Domain pack for the `cluster-labeling` engine — the operational rules for
labeling Auroville. Update it every session with new durable learnings.

- `references/class-definitions.md` — the per-class contract for every node in
  `land-cover.json`, anchored to published schemes. **Read before judging.**
- `references/history.md` — round history, why each rule exists, open threads.
  Consult when **revising** the pack; not needed to judge. Keep the narrative
  there so these files stay operational.

## Paths / config (engine inputs)

- AOI dir: `data/av-3.5K`
- Cluster rasters (`SEG`): `data/av-3.5K/intermediates/clusters/{k22,k44,k88}_s42.tif`
  — 703×703, EPSG:4326, int16, nodata −1. `SEG_KEY` = e.g. `k88_s42`.
- Basemap (`BASE`): `data/av-3.5K/intermediates/esri_3.5k_roi_cog.tif`
  — ESRI mosaic, ~1 m effective (grid ~0.58 m, oversampled), 11906×12151, EPSG:4326,
  same bounds as the cluster rasters.
- Hierarchy: **`references/land-cover.json`, here in this pack** (44 nodes
  flattened). The label tree is Auroville-specific, not general, so it belongs to
  the AOI pack and not to the engine or to `data/` — which is gitignored, where it
  sat unversioned until 2026-08-09. Pass it explicitly:
  `--hierarchy .claude/skills/cluster-labeling-auroville/references/land-cover.json`.
- Prior/old labels (for review cross-tab): `data/av-3.5K/outputs/land-cover_cog.tif`
  + `data/av-3.5K/outputs/pixel-mapping.json` (known weak — see below).
- **CENTER (`--center`): `79.8106 12.0058`** = Matrimandir.

### Two grids — don't conflate them

The thing you **look at** and the thing you **label** are different rasters, an
order of magnitude apart. Every threshold below is stated against whichever one
it belongs to.

| | source | cell | role |
|---|---|---|---|
| **Imagery** | ESRI mosaic | **~0.58 m** (sub-metre) | what the VLM reads — individual tree crowns, roof outlines, plough lines are all resolved |
| **Cluster grid** | AlphaEarth embeddings over Sentinel | **~10 m** | what carries a label — 703 × 703 over a ~7 km AOI |

Consequences worth holding onto: (a) you can *see* far more detail than you can
*assign* — a feature narrower than ~10 m is visible but has no cell of its own;
(b) one cluster cell = ~100 m², so a 0.5 ha forest MMU is ~50 cells; (c) the AOI
is **~7 km across, not 3.5** — the `av-3.5K` name is historical and misleads.

Producers (out of scope for labeling): ESRI imagery via `bun run download-tiles`/
`stitch-tiles`; cluster rasters + hierarchy via the sibling **alpha-bhu** repo.

## Class definitions — canonical

**`references/class-definitions.md` is the contract for every class in
`land-cover.json`**: definition, the diagnostic to look for at sub-metre, the
positive evidence the class *requires*, and the confusions it loses to. Written
2026-08-09 against published schemes — NRSC/ISRO National LULC 50K (India's own,
and the closest match to our tree), FAO forest + LCCS, CORINE, NLCD, the
Wastelands Atlas, FSI Trees-Outside-Forests, ICRAF agroforestry. **Read it before
judging**; do not restate its per-class rules here, they drift.

**Any change there must also land in `FIELD_GUIDE`** in
`scripts/vlm_label_prototype.py` — that dict builds `prompt.txt` and is the only
class description an ordinary reader sees. A correction that lands only in the
docs does not reach the readers.

Every class states the positive evidence it **requires**, because the standing
failure mode here is a class applied on *absence* of evidence — most sharply
`fallow`, which per NRSC needs visible evidence of cultivation plus ≥1 year
un-cropped, not merely nothing growing.

## Auroville-specific priors on top of the definitions

These are the local facts the standards can't carry:

- **Retired here — never emit:** `grassland.grazing_land` (no exclusive grazing;
  herds move over common land) and `forest.natural_forest` (nothing here is
  self-regenerating; all forest was planted within living memory).
- **INHERIT water from the old map — do NOT relabel it.** The manual map's `water`
  bodies are accurate and correctly seasonal; **`water` is the one class it has
  authority on** (it is weak elsewhere — ~25% agreement overall). Don't spend
  exemplars re-deciding water, and never second-guess a dry tank the old map calls
  water: on the imagery a dry-season tank is a pale flat bed that reads as bare
  ground or fallow. Run the cross-tab and freeze it rather than trusting readers to
  remember:
  ```
  python .claude/skills/cluster-labeling/scripts/gen_prior_labels.py $RUN \
    --seg <SEG> --old data/av-3.5K/outputs/land-cover_cog.tif \
    --mapping data/av-3.5K/outputs/pixel-mapping.json \
    --authoritative water --freeze-share 0.5
  ```
  Pass the resulting per-cell distribution to the readers as evidence for the
  non-frozen cells; a cell that is part water and part something else is a
  shoreline carve-out, not a single label.
- **`maintained_grass` is RARE and mostly around Matrimandir** — managed gardens,
  lawns, campus grounds in the central zone. Away from the centre a smooth
  light-green patch is far more likely young `planted_forest`, harvested
  `casuarina`, or `fallow`.
- **`dryland_crops` — VERIFY before using.** Open whether Auroville has groundnut/
  millet at scale; reads in or beside the casuarina belt are suspected harvested
  casuarina. Pending ground verification.
- **`degraded_barren` was under-applied and is genuinely common** — bare red
  laterite, eroded ground. Use it, but keep the crowns test: crowns ⇒ cashew.
- **Cashew is the big trap:** it looks scrub-like from above. **Hard rule — my
  "scrub" vs old map "cashew" ⇒ CASHEW.**
- **Planted forest clusters around Auroville communities** (correlates with
  settlement) and is persistently under-called under other class names — when
  canopy sits in a forest matrix and isn't a clear orchard grid, lean here.
- **Mango exists but was under-labelled in the old map** — actively hunt it at
  finer k (large dense rounded dark crowns, wide regular spacing).
- **Large roofs in a green matrix are still `forest_built`**, not `dense_built` —
  built subtypes go by artificial *fraction*, never building size (k88xk22 c2).


## Geography priors (direction from Matrimandir)

Every exemplar has lon/lat → compute 8-point compass from center
(`brg=(90-deg(atan2(dLat,dLon)))%360`; idx=round(brg/45)%8 over [N,NE,E,SE,S,SW,W,NW]).

- **Casuarina → west.** (Validated: all k22 casuarina clusters are NW.)
- **Cashew → east & south.**
- **Coconut → east & south.**
- **Forest (planted) → broad central-ish belt incl. the SE**; soft prior, not dead-center.
- **The geometric center (around Matrimandir) is GARDENS** — neither forest nor
  field (managed garden/agroforestry/built mosaic). Don't default the center to forest.
- **The Matrimandir itself is AT the center** (= `CENTER`), and no cluster cell
  should be recorded as containing it without a coordinate check — a look-alike
  white-roofed building ~1 km west has been mistaken for it before.
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

Moved to `references/history.md` — rounds, provenance of each rule, and open
threads. **Current position:** round 3 (k88∩k22) judged; user feedback partially
in; `judgments.json` not yet revised. Session handoff lives in
`data/av-3.5K/intermediates/vlm_label_k88xk22/HANDOFF.md`.

## Run commands (this AOI)

```
RUN=data/av-3.5K/intermediates/vlm_label_k88
python scripts/vlm_label_prototype.py --aoi data/av-3.5K --seg-key k88_s42 \
  --hierarchy .claude/skills/cluster-labeling-auroville/references/land-cover.json \
  --clusters 88 --exemplars 6 --dry-run --out $RUN
python .claude/skills/cluster-labeling/scripts/gen_locator.py $RUN \
  --seg data/av-3.5K/intermediates/clusters/k88_s42.tif \
  --base data/av-3.5K/intermediates/esri_3.5k_roi_cog.tif --center 79.8106 12.0058
python .claude/skills/cluster-labeling/scripts/gen_overview.py $RUN \
  --seg data/av-3.5K/intermediates/clusters/k88_s42.tif \
  --base data/av-3.5K/intermediates/esri_3.5k_roi_cog.tif
python .claude/skills/cluster-labeling/scripts/gen_context.py $RUN \
  --seg data/av-3.5K/intermediates/clusters/k88_s42.tif \
  --base data/av-3.5K/intermediates/esri_3.5k_roi_cog.tif --window-m 800
# split raster for round 3 (flagged impure clusters partitioned by k22):
python .claude/skills/cluster-labeling/scripts/gen_intersection.py \
  data/av-3.5K/intermediates/clusters/k88xk22_s42.tif \
  --seg data/av-3.5K/intermediates/clusters/k88_s42.tif \
  --with data/av-3.5K/intermediates/clusters/k22_s42.tif \
         data/av-3.5K/intermediates/clusters/k44_s42.tif \
  --ids <flagged ids from split_candidates.md>
# → read overview_basemap.jpg + crops + locators, write $RUN/judgments.json
python .claude/skills/cluster-labeling/scripts/aggregate.py $RUN --judgments $RUN/judgments.json
python .claude/skills/cluster-labeling/scripts/gen_review_html.py $RUN \
  --seg data/av-3.5K/intermediates/clusters/k88_s42.tif \
  --old data/av-3.5K/outputs/land-cover_cog.tif \
  --mapping data/av-3.5K/outputs/pixel-mapping.json
# round-3 (k88xk22) variant: --seg …/clusters/k88xk22_s42.tif plus
#   --nbr-labels data/av-3.5K/intermediates/vlm_label_k88/cluster_to_label.json
# (fallback labels for un-rejudged k88 parents in the neighbor context)
# NOTE (cleanroom mac): alpha-bhu is absent so the uv project env can't build;
# run engine scripts via  uv run --no-project --with rasterio,numpy python …
```
