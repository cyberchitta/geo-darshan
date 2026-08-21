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

**0.58 m is the ceiling, not a starting point.** The close crops are rendered at
native scale — the generator never upsamples — so no reader is ever looking at
finer than ~0.58 m/px. A tree crown of 7 m is ~12 px: enough to see *that* it is
a palm, not enough to tell a fan crown from a feather one. Species-level calls
that need crown geometry are out of reach at z18. (ESRI began serving **z19,
0.29 m/px**, over this AOI — verified 2026-08-15, centre and four corners. The
current run predates it.)

Consequences worth holding onto: (a) you can *see* far more detail than you can
*assign* — a feature narrower than ~10 m never gets a cell **purely** to itself;
(b) one cluster cell = ~100 m², so a 0.5 ha forest MMU is ~50 cells; (c) the AOI
is **~7 km across, not 3.5** — the `av-3.5K` name is historical and misleads.

**(a) does not mean narrow features are unlabelable** — corrected 2026-08-15, and
it had been read that way. A cell that is consistently ~30% hedge still has a
repeatable signature, and repeatable mixtures cluster: `forest.tree_lines` is
built from features readers measure at **10–15 m** against a 10 m cell, and its
clusters are real at 10–16 px. Mixed is not unmappable. When you are weighing
whether a narrow feature earns a call, ask whether it **dominates this cell's
signature**, not whether it is wider than a cell. Full rule — the separability
test — is in the engine's `convergence-loop.md`.

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

**A change there reaches the readers directly — and nothing else does.** The
`cluster-reader` agent reads `class-definitions.md` itself, so that file is the
class description an ordinary reader sees. There is no second copy to mirror
into: the `FIELD_GUIDE` dict in `scripts/vlm_label_prototype.py` that used to
build `prompt.txt` went with the Gemini path in `a20a78f`, and any instruction to
update it is stale. What still holds is the rule underneath it — a correction
that lands only in a document readers are not pointed at does not reach them.

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
- **The cluster-level cross-tab is THE spatial prior — it outranks the compass
  priors below.** A cell's `old_map` distribution is the strongest positional
  evidence a reader gets: short of the `water` freeze, but well above "one weak
  input". The reason is aggregation over *scattered* pixels. A k-means cell's
  pixels are spread across the AOI, so the cross-tab samples the old map at many
  near-independent locations and a single mislabelled polygon barely moves the
  distribution.
  **Do not aggregate the old map over a neighbourhood around an exemplar, and do
  not read its label at a single exemplar's footprint.** Error in a coarse map is
  spatially correlated: a local window sits inside one or two polygons, so one
  mapping error comes back as a confident-looking "local: 70% casuarina" and
  reads as independent evidence. That turns the map's weakest property into its
  most persuasive output. Cell-level or not at all.
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


## Geography priors (direction from Matrimandir) — PROVENANCE, not an input

**These belts are a compression of the old map, not a second source.** They were
derived by aggregating it — "Casuarina → west" is recorded as *"Validated: all k22
casuarina clusters are NW"*, i.e. the cross-tab, summarised down to a compass
sector. Same data, lossier. They earned their keep on the **first** pass, when no
labelled map existed to cross-tab against; once `old_map` is on the card the belt
priors add nothing and only discard resolution.

So: **do not reason from a compass sector when the cell has an `old_map`
distribution** — that is reaching past the signal for its own summary. This was
happening (k88xk22 c61 e2: *"NW casuarina belt favors young/rotational casuarina"*
at conf 0.45, on a cell whose `old_map` was 99.8% casuarina).

Nor are they the fallback for a nodata cell (c185 is 99.6% nodata). The old map is
spatially continuous, so what surrounds a nodata cell's pixels says more than the
sector does. Read the neighbours, not the compass.

Kept below for provenance — how the classes came to be drawn, and what to expect
when auditing the old map's own geography:

- **Casuarina → west.** (Validated: all k22 casuarina clusters are NW.)
- **Cashew → east & south.**
- **Coconut → east & south.**
- **Forest (planted) → broad central-ish belt incl. the SE**; soft, not dead-center.
- A "scrub" read in the east/south cashew belt is almost certainly cashew — the
  lossy form of the hard rule above (**my "scrub" vs old map "cashew" ⇒ CASHEW**),
  which consults the map directly and is the one to use.

Two rules here are **not** map-compressions and stay operative:

- **The Matrimandir is AT the center** (= `CENTER`). No cluster cell may be
  recorded as containing it without a coordinate check — a look-alike white-roofed
  building ~1 km west has been mistaken for it before.
- **Don't default the geometric center to forest.** Around Matrimandir is a managed
  garden/agroforestry/built mosaic — neither forest nor field. This guards a reader
  default rather than asserting a belt.

Geometry, when a compass bearing is genuinely needed: every exemplar has lon/lat →
`brg=(90-deg(atan2(dLat,dLon)))%360`; idx=round(brg/45)%8 over
[N,NE,E,SE,S,SW,W,NW]. Per-exemplar, never per-cluster-centroid (scattered clusters
have meaningless centroids).

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
python .claude/skills/cluster-labeling/scripts/gen_exemplars.py $RUN \
  --seg data/av-3.5K/intermediates/clusters/k88_s42.tif \
  --base data/av-3.5K/intermediates/esri_3.5k_roi_cog.tif \
  --clusters 88 --exemplars 6
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
