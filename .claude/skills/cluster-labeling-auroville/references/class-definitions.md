# Class definitions — `data/av-3.5K/land-cover.json`

The contract for every class in the hierarchy. Read before judging.
(Provenance and the failures that shaped these: `history.md`.)

Each class carries four things:

- **Definition** — anchored to a published scheme, not invented here.
- **Diagnostic** — what to look for in the **sub-metre ESRI imagery**.
- **Requires** — the positive evidence without which you may NOT use the class.
  This is the important column; most of our errors are classes applied on
  absence of evidence rather than presence.
- **Not this** — the confusions it actually loses to here.

## Which schemes, and why

| scheme | why it governs | used for |
|---|---|---|
| **NRSC/ISRO National LULC 50K** ([2011-12 doc](https://bhuvan-app1.nrsc.gov.in/2dresources/thematic/2LULC/lulc1112.pdf)) | India's national scheme; our hierarchy is essentially its tree | primary anchor for nearly every class |
| **FAO** forest definition ([FRA 2020 Terms and Definitions](https://openknowledge.fao.org/server/api/core/bitstreams/531a9e1b-596d-4b07-b9fd-3103fb4d0e72/content), via MoEF 2011, quoted in NRSC) | fixes what counts as forest at all | forest.* |
| **FSI Trees Outside Forests** — block / linear / scattered ([TOF Resources in India, 2020](https://fsi.nic.in/fsi-result/technical-information-series-vol2-no1-2020.pdf); [TOF-Rural field manual](https://fsi.nic.in/documents/fieldmanual_tofrural.pdf)) | the Indian treatment of trees that aren't forest | tree_lines, scattered_trees |
| **Copernicus Small Woody Features** ([SWF 2018 product user manual](https://land.copernicus.eu/en/technical-library/high-resolution-layer-small-woody-features-2018-product-user-manual/@@download/file)) | usable geometry for linear woody features | tree_lines |
| **CORINE** 111/112/141 ([nomenclature](https://land.copernicus.eu/content/corine-land-cover-nomenclature-guidelines/html/)) · **NLCD** developed classes ([legend](https://www.mrlc.gov/data/legends/national-land-cover-database-class-legend-and-description)) | built-up graded by impervious fraction | built_environment.* |
| **Wastelands Atlas of India** 2019 (DoLR + NRSC; [DoLR](https://dolr.gov.in/en/wasteland-atlas-of-india-2019/), [NRSC](https://www.nrsc.gov.in/Atlas_Wastelands?language_content_entity=en)) | gullied/ravinous, scrub, barren rocky | degraded_barren.*, scrubland.* |
| **ICRAF / FAO agroforestry** typology (Nair 1985, [FAO Technical Paper 3](https://openknowledge.fao.org/server/api/core/bitstreams/b447cf68-d3f5-4733-940c-f33591e0588a/content/x5546e06.htm)) | agrisilviculture, homegardens | agroforestry.* |
| **FAO LCCS** ([Di Gregorio & Jansen 2000](https://www.fao.org/4/x0596e/x0596e00.htm)) · CORINE 1.2 | protected / greenhouse cultivation | protected_cultivation |

**How our tree relates to NRSC's.** Ours is NRSC's, with the `Plantation` node
expanded to species (mango / coconut / cashew / casuarina / mixed fruit — finer
than any published leaf; that refinement is ours and is justified by sub-metre
imagery) and NRSC's `Wasteland` family split across our `degraded_barren` and
`scrubland`. Where we are finer than NRSC, say so in `reasoning` rather than
pretending a standard backs it.

**Read this with the two-grid note in SKILL.md.** Diagnostics are stated for
sub-metre imagery; minimum-mapping-unit thresholds are stated in 10 m cluster
cells (1 cell ≈ 100 m²; 0.5 ha ≈ 50 cells).

---

## forest.*

FAO/MoEF gate for the whole family: **tree canopy > 10%, area > 0.5 ha (~50
cells), species able to reach 5 m.** Below that gate it is not forest — it is
scrub, tree_lines, or trees riding along on another cover.

### `forest.natural_forest`
- **Definition.** NRSC deciduous / evergreen natural forest — self-regenerating,
  not planted, no planting geometry.
- **RETIRED FOR THIS AOI.** There are essentially no natural forests around
  Auroville; everything wooded was planted within living memory. Never emit it.
- **Not this:** dense irregular canopy → `planted_forest` (mature plantings lose
  their rows).

### `forest.planted_forest`
- **Definition.** **Managed woody planting** — trees established and tended by
  people, **whatever the origin or purpose**: forestry, ecological restoration,
  or amenity. Includes the whole age range. Auroville's TDEF restoration blocks
  and its non-native plantings **both** land here; **species mix is not a
  criterion and neither is commercial intent.**
  *(NRSC 3.3 *Forest Plantation* is the nearest published stratum, but its "of
  forestry importance, raised and managed" qualifier is deliberately dropped — it
  excludes restoration planting, which is most of this class in this AOI.
  Auroville has planted >3 million trees of 185 TDEF species on formerly eroded
  laterite; a 40-year-old restoration stand that now self-recruits is neither a
  plantation crop nor virgin forest, and the old wording gave it no home.)*
- **Diagnostic.** Two very different looks: **mature** = closed irregular canopy,
  crowns touching, no field geometry; **young** = light-green, smooth, almost
  grass-like, crowns not separable, sometimes faint planting rows. The young case
  is the one that keeps getting lost.
- **Requires.** A forest/scrub matrix around it, or visible planting in a
  reforestation context. Auroville's plantings cluster around communities.
- **Not this:** rectangular field-shaped patch → agriculture; regular wide grid of
  discrete crowns → orchard; linear strip ≤30 m wide → `tree_lines`.
- **Chronically under-called** under every neighbouring class name. When canopy
  sits in a forest matrix and isn't a clear orchard grid, lean here.
- **On its size.** This is the largest class in the run (n=50) at 0.44
  confidence. Some of that is genuine breadth — it now spans restoration and
  production planting alike — and some of it is the two neighbouring subtrees
  that cannot currently be assigned (`agroforestry`, `natural_forest`) draining
  into it. Do not read its size as over-application without checking which.

### `forest.bamboo_groves`
- **Definition.** Bamboo plantation. NRSC files bamboo under deciduous /
  tree-clad ("herbaceous with a woody appearance").
- **Diagnostic.** Fine feathery clumped texture, distinctly yellow-green, tight
  clump outlines rather than single crowns.
- **Not this:** casuarina is also feathery but darker, taller, in rectangular
  blocks. Bamboo has not yet been confirmed anywhere in this AOI — treat a
  bamboo call as a claim needing evidence.

### `forest.tree_lines`
- **Definition.** Linear woody features outside forest blocks. FSI *Trees Outside
  Forests*, **linear** stratum — trees along roads, canals and bunds. Geometry
  from Copernicus Small Woody Features: **≤ 30 m wide, ≥ 30 m long**.
- **Diagnostic.** A continuous woody ribbon tracking a road, tank margin, canal
  or field bund. ~50 px wide in the imagery; ~3 cells on the cluster grid.
- **Contiguity with a block — ruled 2026-08-22.** A ribbon touching or grading
  into a forest block is still `tree_lines` **unless it matches the block** — same
  age class *and* same species character. A distinct planting running along a
  block's edge stays a line; a ribbon that is merely the block's own margin is part
  of the block. Where age and species cannot be told apart at this resolution, say
  so and cap confidence — do not default either way.
- **Requires.** Linearity *and* a linear host feature to follow — road, canal,
  tank margin, or **field/tank bund**. Woody, not grass. **Judge the width of the
  woody ribbon, not of the landform it follows:** a tank foreshore or a hollow may
  be hundreds of metres across while the ribbon riding it is 10-30 m. This cuts
  both ways — it does not license the call on a strip that is not itself linear.
- **Not this:** a strip that does not dominate its cell's signature — the cell
  belongs to the field/agroforestry mosaic it edges. Judge by **what fills the
  cell**, not by whether the strip is wider than one: a ribbon narrower than a
  cell can still carry the call when it is most of what the cell is made of.
  A wide riparian belt that stops being linear is `planted_forest` or
  `dense_scrub`.
- **Caveat.** FSI would call these *trees outside forest*, not forest; the node
  sits under `forest` for tree convenience only.
- **Covers:** the "green strips near roads/lakes" that had been defaulting to
  fallow.

### `forest.scattered_trees`
- **Definition.** FSI Trees-Outside-Forests **`scattered`** stratum — individual
  trees on farmland, homesteads and community land, forming neither a block nor a
  line. Palmyra (*Borassus flabellifer*) standing on field edges and bunds is the
  characteristic local case; tamarind and isolated farm trees are others.
- **ASSIGNABLE — unlocked 2026-08-21 on the maintainer's T43 ruling.** It was
  blocked because a scattered-tree cell is mostly whatever the trees are
  scattered *in*; the ruling accepts that and unlocks anyway, because **the
  label is legitimate** and a real stratum should not stay unreachable for the
  convenience of the cell geometry.
- **⚠ Use it for the trees, not for the matrix.** The maintainer's own words on
  the evidence that unlocked it: *"only c115e0 actually has scattered trees in
  the selected area."* Five round-4 cells carried scattered-tree prose; on that
  ruling one of them held it inside the outline. *(The "so the other four
  described the surroundings" reading is an inference from the maintainer's
  sentence, not something they said cell by cell — corrected at session close,
  where it had been written as a finding.)* So before
  choosing this, check that the **outlined patch** is the scattered-tree ground —
  if the trees are beside it or around it, label what is inside the outline.
- **Caveat.** Same as `tree_lines` — FSI would call these trees outside forest,
  not forest; the node sits under `forest` for tree convenience only.
- **Why the node exists at all.** The crosswalk cites FSI TOF's
  **block / linear / scattered** strata but only ever instantiated `linear` (as
  `tree_lines`). `block` needs no node — it is already covered by
  `planted_forest` and `orchards.casuarina`. `scattered` was the real gap.

---

## agriculture.orchards.*

NRSC 2.2 *Plantations*: "areas under agricultural tree crops planted adopting
agricultural management techniques", explicitly including horticultural
plantation — coconut, orchards, fruit. **Requires visible planting geometry** or
a known species signature. Species split below NRSC's leaf is ours.

### `agriculture.orchards.mango`
- **Diagnostic.** Large, dense, rounded dark crowns, wide *regular* spacing, often
  with clean ground between. The biggest individual crowns in the AOI.
- **Requires.** Crown size + spacing regularity together.
- **Not this:** irregular spacing → planted_forest. Under-labelled in the old map;
  actively hunt it.

### `agriculture.orchards.coconut`
- **Diagnostic.** **Mature:** star-burst rosette crowns, thin long shadows, never
  scrub-like. **Young:** a regular *dot-grid* of shrub-sized crowns in grass or
  laterite — the grid is the tell, not the crowns.
- **Requires.** Rosette form or grid regularity.
- **Not this:** the young case reads as fallow/bare ground with specks. Ground
  inside or adjacent to a young planting belongs to the planting.
- **Geography.** East and south.

### `agriculture.orchards.cashew`
- **Diagnostic.** Low, spreading, clumpy crowns that look **scrub-like from
  above** — this is the single most-repeated confusion in this AOI.
- **Hard rule.** My "scrub" read + old map "cashew" ⇒ **cashew**. A scrub read
  inside the east/south cashew belt is almost certainly cashew.
- **Discriminator vs barren (user-confirmed).** Crowns present ⇒ cashew; bare or
  eroded soil with no crowns ⇒ `degraded_barren`.
- **Geography.** East and south.

### `agriculture.orchards.casuarina`
- **Definition.** Farm woodlot of *Casuarina equisetifolia*, grown on rotation.
  (NRSC files casuarina under *Forest Plantation*; here it is a cash crop on
  farmland, so it sits under orchards. Worth knowing if comparing to NRSC data.)
- **Diagnostic — two phases, and the second is the trap.** **(a) Standing:** fine
  feathery uniform dark-green canopy in a rectangular block. **(b) Harvested:** a
  regular-geometry field that looks fallow or bare, for *years* at a time.
- **Requires.** For phase (b): field geometry **plus** casuarina context — other
  casuarina blocks adjacent or interspersed. Treat the rotation like a seasonal
  water body: the bare state is still the class.
- **Not this:** reading a harvested block as `fallow`, `dryland_crops`, or grass.
- **Geography.** West / NW — validated, all k22 casuarina clusters are NW.

### `agriculture.orchards.mixed_fruit`
- **Definition.** Polyculture orchard — several fruit species interplanted, still
  under orchard management.
- **Requires.** Evidence of *multiple* crown types under one planting geometry.
- **Not this:** the default when an orchard's species is unclear. If you can't name
  the mix, use the parent `agriculture.orchards`.

---

## agriculture.protected_cultivation

- **Definition.** FAO LCCS *protected / greenhouse cultivation* within Cultivated
  Managed Terrestrial Areas; CORINE *permanent greenhouse cover*. Engineered
  growing structures — shade-net spans, polyhouses, nursery beds under cloth.
  (NRSC 2.2 *Plantations* covers horticulture but **not** protected structures,
  which is why this had no home.)
- **Requires.** A visible engineered structure — regular rectilinear spans,
  straight-edged blocks, usually with a service yard or access.
- **Diagnostic.** The give-away is regular rectilinear spans carrying a *fabric
  or glazing tone* unlike any crop canopy.
- **Covers:** the feature that was routing to four unrelated classes —
  `infrastructure.industrial`, `field_crops`, `maintained_grass` and
  `dense_scrub` — because nothing fitted. Auroville's TDEF nursery alone produces
  ~50,000 seedlings/year.

---

## agriculture.field_crops.*

NRSC 2.1 *Cropland*: "areas with **standing crop** as on the date of satellite
overpass". Standing crop is the requirement — bare cultivated ground is fallow,
not cropland.

**Bunds are a diagnostic here, not a class.** Bunded parcel geometry — tessellated
boundaries, shared straight edges with active parcels — is positive evidence of
*cultivation*, and is what separates `fallow` from `degraded_barren`. No governing
scheme gives bunds a cover class; the woody crests are `forest.tree_lines` (whose
definition names bund alignments) and bare crests are
`degraded_barren.compacted_corridor`.

**A bund is a landform, not a cover: what covers it decides the class.** Woody
crest -> `forest.tree_lines`. Bare compacted crest ->
`degraded_barren.compacted_corridor`. The bunded parcel geometry itself is a
**diagnostic** for cultivation, never a label.

### `agriculture.field_crops.rice_paddies`
- **Diagnostic.** Small level parcels with water-retaining bunds, often a wet or
  mirror-like surface; strong rectangular tessellation; near tanks/canals.
- **Requires — ruled 2026-08-22.** Bunded level parcels **and** evidence of
  current or recent rice use: standing water, a mirror surface, a green or stubble
  crop, puddled soil. *(The previous line — "wetness is confirmatory, not
  required" — is **withdrawn**. It let a dry bunded parcel satisfy this class and
  `fallow` in full at once, with nothing in either entry to break the tie.)*
- **A dry bunded parcel with no crop is `fallow`,** not this. Its bunds are
  cultivation evidence lying inside the outline, so the parcel's form *supports*
  the fallow call rather than competing with it.

### `agriculture.field_crops.dryland_crops`
- **Definition.** Rainfed groundnut, millets (NRSC kharif/rabi cropland).
- **⚠ VERIFY BEFORE USING.** Open question whether Auroville has these at scale.
  Many reads here — especially in or beside the casuarina belt — are suspected
  **harvested casuarina**.
- **Requires.** A clear *active crop* signature (row texture, uniform crop colour)
  **away from** the casuarina belt.
- **Not this:** a bare geometric field is fallow or harvested casuarina, never
  dryland_crops by default.

### `agriculture.field_crops.sugarcane`
- **Diagnostic.** Tall dense uniform bright-green stand, coarse streaky texture,
  large regular parcels, irrigated.
- **Requires.** Irrigation context. Not yet confirmed in this AOI.

---

## agriculture.agroforestry.*

ICRAF/FAO: woody perennials *deliberately combined with crops* on the same
management unit. The distinguishing feature is **two production layers at once**,
not merely "trees near fields".

**⚠ THIS WHOLE SUBTREE IS NOT CURRENTLY ASSIGNABLE — the parent and all three
children.** Do not emit any of them; if you believe you are looking at one, fire
`no_class_fits` naming it. Each entry below keeps its full definition on purpose:
`_unlock` is a commitment to revisit, and you cannot rule on a class you cannot
see. The definitions say what the class *is*, not that you may assign it.

### `agriculture.agroforestry.permaculture`
- **Definition.** Auroville's designed multi-layer systems — swales, contour
  planting, mixed species by design.
- **Requires.** Visible design geometry (contour bunds, swales, keyline patterning)
  plus mixed vegetation. Near communities.
- **⚠ NOT CURRENTLY ASSIGNABLE** — see "Classes that are real but not currently
  assignable". Do not emit it; if you believe you are looking at one, fire
  `no_class_fits` naming it.

### `agriculture.agroforestry.food_forests`
- **Definition.** ICRAF *homegarden* / forest-farming — multi-storey edible
  planting, canopy over understorey crops, intensively managed, near dwellings.
- **Requires.** Multi-storey structure **and** proximity to habitation.
- **Not this:** any dense mixed canopy. Without the habitation link it is
  planted_forest.
- **⚠ NOT CURRENTLY ASSIGNABLE** — see "Classes that are real but not currently
  assignable". Do not emit it; if you believe you are looking at one, fire
  `no_class_fits` naming it.

### `agriculture.agroforestry.mixed_cultivation`
- **Definition.** ICRAF *agrisilviculture* — trees and crops interspersed on the
  same parcel; bund tree-lines around cropped fields are the classic case.
- **Requires.** Both layers visible in one parcel.
- **Not this:** if you can't see the crop layer, it isn't agroforestry.
- **⚠ NOT CURRENTLY ASSIGNABLE** — see "Classes that are real but not currently
  assignable". Do not emit it; if you believe you are looking at one, fire
  `no_class_fits` naming it.

### `agriculture.fallow`
- **Definition — the one to memorise.** NRSC 2.3: land **taken up for
  cultivation** but temporarily rested, **un-cropped for one or more season but
  not less than one year**.
- **Requires — BOTH:** (1) positive evidence of *cultivation* — field geometry,
  bunds, plough lines, or a straight boundary the outline itself **shares** with
  an active parcel; and (2) absence of standing crop. Cultivation evidence is not
  optional.
- **Where that evidence must lie — ruled 2026-08-22.** Inside the outline, or on
  its edge. A boundary the cell *shares* with a worked parcel counts: the cell's
  own edge is then cultivated geometry. A worked parcel merely *near* the cell,
  sharing no boundary with it, does **not** — that is the neighbour's history, not
  this cell's. Cultivation visible only by looking outside the outline never makes
  the cell fallow.
- **Fallow is a cropland state — NRSC 2.3, ruled 2026-08-22.** "An agricultural
  system with an alternation between a **cropping** period of several years and a
  fallow period… lands taken up for cultivation but temporarily allowed to rest,
  un-cropped for one or more season, but not less than one year." A **tree crop**
  between harvests, or left unmanaged, is **not fallow**: NRSC 2.2 *Plantations*
  covers "horticultural plantation (like coconut, arecanut, citrus fruits,
  **orchards**, fruits…)" and is fallow's *sibling*, not its parent. A rested
  cashew or casuarina block stays with its orchard class while the trees stand;
  once they are gone the ground is grass, scrub or barren **by cover** — never
  fallow. (This is the rule behind the first two "Not this" entries below; the
  woody-but-not-agricultural ones after them are excluded by the forest/agriculture
  split, not by this rule.)
- **Not this — the standing systematic failure.** Fallow became the default for
  any smooth green or tan patch with nothing obviously growing, inheriting the
  role `grazing_land` and then `maintained_grass` played before it. Before
  writing `fallow`, ask which of these it really is:
  - harvested **casuarina** (geometric field amid casuarina — west),
  - young **coconut** or ground within a young planting,
  - young **planted_forest** (light-green, smooth, forest matrix),
  - roadside/waterside **tree_lines** (linear, woody),
  - **eroded_land** (bare, gullied, no cultivation geometry),
  - a **forest blank** — an opening amid canopy, which NRSC keeps with the forest.
  If none of those fit *and* you can see cultivation geometry, then fallow.

---

## built_environment.*

Graded by **areal fraction of artificial surface** (roofs + roads + paving), per
CORINE (111 ≥80% sealed, 112 30–80%) and NLCD (open space <20%, low 20–49%,
medium 50–79%, high ≥80%). **Footprint size is never a criterion.** NRSC's own
50K classes — *Built-up Compact*, *Built-up Sparse*, *Built-up Vegetated/Open* —
map onto our three almost exactly, which is good external validation of the split.

**How the subtypes are ordered — ruled 2026-08-22.** By artificial fraction,
always. The matrix names the subtype *within* the 20–50% band and nowhere else.

| artificial fraction | class |
|---|---|
| ≥ ~50% | `dense_built` — matrix irrelevant, closed canopy included |
| ~20–50%, matrix canopy | `forest_built` |
| ~20–50%, matrix open ground | `sparse_built` |
| below ~20%, and not enclosed (below) | not a built class — label the matrix cover |

A closed canopy matrix does **not** hold a cell in `forest_built` once the
artificial fraction reaches ~50%. NRSC and CORINE both order on sealed fraction.

**When the family applies at all — ruled 2026-08-22.** NRSC 1.0 Built-up is a
**land-use** class ("lands used for human settlement"), and its Level-3 *Built up
– Vegetated / **Open** area* covers the open and vegetated ground inside a
settlement. A cell lying **wholly inside a settlement's footprint** therefore
belongs here whatever its own artificial fraction: a service yard, forecourt or
common opening is settlement land, not degraded land. The fraction table orders
the **subtype once the family applies**; the ~20% floor governs cells at the
settlement's edge or outside it, never enclosed ones.

FAO LCCS explains why the three-way felt arbitrary before: LCCS composes classes
from **independent classifiers**, so *built density* and *matrix life-form* are
two orthogonal axes that our flat list collapses. Apply them in order.

### `built_environment.dense_built`
- **Requires.** Artificial fraction **≥ ~50%** of the cell — roofs adjacent or
  contiguous, little vegetation between. NRSC *Built-up Compact*; town/village
  fabric. Matrix is irrelevant at this density.

### `built_environment.sparse_built`
- **Requires.** Artificial fraction ~20–50%, and the matrix between buildings is
  **open ground** — bare soil, grass, or field. NRSC *Built-up Sparse*, CORINE 112.

### `built_environment.forest_built`
- **Requires.** Artificial fraction ~20–50%, and the matrix is **canopy** — roofs
  peeking through trees. NRSC *Built-up Vegetated/Open*. The default Auroville
  community-in-greenbelt pattern.
- **Note — floor kept, ruled 2026-08-22.** Below ~20% artificial, **and not
  enclosed by a settlement** (see the family preamble), it is not a built class at
  all: label the matrix cover and let the buildings ride along. In the Tamil
  homestead pattern that matrix is usually homestead trees, so the cell is
  `forest.scattered_trees` — whose FSI definition names homesteads explicitly —
  not a built class made thin. Where the cell is too small to estimate a fraction,
  use `no_class_fits` and say so rather than guessing which side of the floor it
  falls.

### ~~`built_environment.infrastructure`~~ — RETIRED
Structural duplicate of the top-level `infrastructure.*` family. **Removed from
`land-cover.json`** — use `infrastructure.roads` / `infrastructure.industrial`.
Tombstone kept so the deletion is not mistaken for the finding going missing.

---

## water.*

**Policy: inherit water from the old map — do not relabel it.** The manual map's
water bodies are accurate and correctly seasonal. Definitions here are for
recognising water in *new* cells only.

### `water.permanent_water`
- **Definition.** NRSC 6.x — water present year-round: rivers, perennial ponds,
  reservoirs.

### `water.seasonal_tanks`
- **Definition.** NRSC "Permanent & seasonal Lake/Ponds, Reservoir/Tanks" — the
  traditional South Indian tank, bunded, filling in monsoon.
- **Diagnostic.** A closed basin with a distinct bund arc on the downstream side;
  in dry season a flat pale bed with a clear shoreline scar and radiating cattle
  tracks. **A dry tank is still a tank** — do not second-guess the old map's water
  call on a dry bed.

### `water.constructed_wetlands`
- **Definition.** Engineered treatment wetlands — sewage/greywater polishing beds.
- **Requires.** Rectangular engineered cells with emergent vegetation, adjacent to
  a community. Rare and small.

---

## degraded_barren.*

Wastelands Atlas family. NRSC 5.0: degraded land, currently underutilised,
deteriorating for lack of soil/water management or natural causes.

### `degraded_barren.bare_ground`
- **Definition.** NRSC 5.5 *Barren Rocky / Stony Waste*: "rock exposures of
  varying lithology often barren and **devoid of soil and vegetation cover**."
- **Requires — corrected 2026-08-22.** A bare mineral surface with **none** of the
  three sibling triggers: no visible channel dissection (→ `eroded_land`), no
  extraction scars or stockpiles (→ `quarries`), no foundations, trenches or
  machinery (→ `construction_sites`).
- **Bare *soil* is not this class.** The previous wording — "flat, smooth,
  compacted bare laterite" — had widened this past its own citation into bare
  soil, which is why it kept surfacing as the plausible alternative on vegetated
  cells. Thin soil with sparse or absent scrub is Wastelands *open scrub*
  (`sparse_scrub`); ground held by grass or herbs is `grassland.grazing_land`.
  Reserve this leaf for rock: laterite duricrust, sheet rock, stony waste.
- **Absorbs `compacted_corridor` (merged 2026-08-22).** Trafficked and graded bare
  surfaces come here when they are genuinely bare mineral ground — but see the
  next line first.
- **Not this:** trodden bare ground **inside a settlement** → `built_environment`
  (see its containment rule). NRSC 5.0 Wastelands means degraded or underutilised
  land, and an actively used yard or forecourt is neither.
- **Diagnostic.** Orange-red laterite, undissected micro-relief, no branching
  gully shadows.
- **Not this:** bare *because graded or trafficked* → `compacted_corridor`.

### ~~`degraded_barren.compacted_corridor`~~ — MERGED INTO `bare_ground`
**Merged 2026-08-22 on the maintainer's ruling. Never emit; use `bare_ground`, or
`built_environment` where the bare ground is inside a settlement.**

It was adopted on probation with its own retirement condition written in: *"If
these cells scatter into `bare_ground` instead of clustering, that is the answer
and the node should merge back."* **That condition is met, three ways:**

1. **It never won a cell.** 0 cluster votes out of 125, against 13 exemplar reads
   across 8 clusters — read often, never decisive. (`infrastructure.roads`, for
   scale, carries 1.)
2. **The demonstration was attempted and failed** (D2 readers, 2026-08-22). On
   c149e0 and c149e2 the only usable discriminator was corridor *geometry*, while
   the entry required geometry **and** a compacted surface texture. Cause is not
   observable from imagery — exactly as the probation note predicted.
3. **Its remaining slot was near-empty anyway.** A lane is sub-cell at 10 m and a
   made carriageway goes to `infrastructure.roads`, so the class could only ever
   describe a corridor wide enough to fill a cell yet not an engineered road.

Tombstone kept so the deletion is not mistaken for the finding going missing, and
so the 13 existing reads stay resolvable.

### `degraded_barren.eroded_land`
- **Definition.** Wastelands Atlas *Gullied / Ravinous Land* — terrain deformation
  by **water erosion**; localised runoff cutting perceptible channels, undulating
  dissected ground; networked gullies become ravines.
- **Diagnostic.** Bare red/laterite soil **with visible dissection** — branching
  channels, sharp shadowed edges, sparse-to-no vegetation.
- **Requires.** For the `.eroded_land` leaf specifically: **visible channels**.
  Flat bare ground with no dissection is barren, not eroded — use the parent
  `degraded_barren`.
- **Status.** Genuinely **common here and historically under-applied**; more common
  than the grazing/maintained-grass reads that wrongly displaced it. Actively use
  it for bare/eroded ground, but keep the crowns test: crowns ⇒ cashew.

### `degraded_barren.quarries`
- **Definition.** NRSC 1.3 *Mining* — surface extraction: stone quarries, sand and
  gravel pits, brick kilns, spoil dumps.
- **Diagnostic.** Sharp-edged excavation with benched walls, spoil heaps, access
  ramp, often a pit pond. Geometry is angular and man-made.

### `degraded_barren.construction_sites`
- **Definition.** Active construction — ground cleared and disturbed, works in
  progress.
- **Requires.** Evidence of *activity*: foundation outlines, materials stockpiles,
  vehicle tracks, part-built structures. Bare ground alone is not a site.

---

## scrubland.*

Two distinct concepts live in NRSC and are collapsed here — worth knowing which
you mean. **Scrub Land** (5.3, wasteland): "shallow and skeletal soils… severely
eroded or subjected to excessive aridity with scrubs dominating". **Scrub Forest**
(3.4, forest): forest fringe near settlement with biotic interference, *including
"forest blanks" — openings amid forest devoid of tree cover*.

**Consequence worth applying:** an opening or clearing inside a canopy matrix is,
per NRSC, part of the **forest**, not fallow and not barren. That is the answer
for a "bare clearing amid canopy" that no other label fits.

**But the convention has a ceiling — ruled 2026-08-22.** It holds only while the
forest is still the *dominant* part of the outline. If you report `mixed` and the
opening leads — `parts[0]` is the opening, so `dominant_share` is its share and
not the canopy's — **the label follows the opening**. A cell that is more clearing
than canopy is not a forest blank; it is a clearing with trees at its edge.

### `scrubland.dense_scrub`
- **Diagnostic.** Continuous shrub cover, crowns merging, no tree-height canopy,
  no planting geometry.
- **Not this:** in the east/south belt, this look is **cashew**.

### `scrubland.sparse_scrub`
- **Diagnostic.** Scattered shrub clumps over bare or grassy ground; soil visible
  between clumps.
- **Not this:** young `planted_forest` — smoother, light-green, forest matrix.

### `scrubland.thorny_scrub`
- **Definition.** Acacia / *Prosopis* thorn scrub.
- **Diagnostic.** Fine grey-green open crowns, irregular spacing, on poor dry ground.
- **Requires.** The distinctive grey-green tone; otherwise use dense/sparse.
- **⚠ NOT CURRENTLY ASSIGNABLE** — see "Classes that are real but not currently
  assignable". Do not emit it; if you believe you are looking at one, fire
  `no_class_fits` naming it.

---

## grassland.*

NRSC 4.0: natural or semi-natural grass and grass-like herbs, **including manmade
grasslands**.

### `grassland.grazing_land`
- **ASSIGNABLE — restored 2026-08-22 on the maintainer's ruling.** It had been
  retired as a *land-use* class ("Auroville has no land used exclusively for
  grazing"); NRSC 4.0 is a **cover** class that merely carries "grazing" in its
  name. Retiring it left semi-natural grass with nowhere to go, and the gap was
  being absorbed by `fallow`, `sparse_scrub` and `bare_ground` in turn.
- **A finer cell would not have fixed this, and that was checked.** When three
  classes fit one patch, the tempting read is that the patch is heterogeneous and
  wants splitting. On the seven exemplars that raised it, `mixed` was **null on six**
  — the readers saw *one* cover, not several, and said so: `sparse_scrub` "is always
  satisfiable on the same pixels". Classes that describe the same square metre are
  not separated by making the square metre smaller. Splitting was separately
  measured and rejected on cost (T20/T22, 2026-08-21); this is the other reason.
- **Definition.** NRSC 4.0 *Grass / Grazing Land*: "areas of natural grass along
  with other vegetation, predominantly grass-like plants (Monocots) and
  non-grass-like herbs… includes natural/semi-natural grass/grazing lands of …
  tropical zones, desertic areas and **manmade grasslands**."
- **The AOI's NRSC leaf is Tropical.** NRSC splits grassland *climatically* —
  Alpine/Sub-Alpine, Temperate/Sub Tropical, Tropical/Desertic — and nowhere by
  use or management. Do not invent a split below it.
- **Requires.** Herbaceous cover — grass or non-grass herbs — holding the outline,
  with woody clumps present but **not dominating**. Once scrub dominates the
  landscape it is `scrubland.*` (NRSC 5.3).
- **Not this:** **Lantana** — NRSC classifies it explicitly as scrub, not grass.
- **The catch-all warning stands.** This was the *first* smooth-green catch-all
  and its restoration does not make it a default. Cultivation geometry inside the
  outline → `fallow`. Scrub dominating → `scrubland`. Rock exposure →
  `bare_ground`. Grass or herb cover, and nothing else, → here.

### `grassland.maintained_grass`
- **Definition.** Managed/mown grass — gardens, lawns, campus grounds.
- **Requires.** Unmistakably mown or managed **and** ringed by built. **Rare, and
  mostly around Matrimandir** in the central zone.
- **Not this:** away from the centre, a smooth light-green patch is far more likely
  young `planted_forest`, harvested `casuarina`, or `fallow`. Decide by matrix and
  context, never by "it's green and smooth".
- *Below NRSC's leaf: ours.* NRSC 4.0 already includes manmade grasslands, so this
  is a management split we make **inside** the standard's class rather than a class
  of its own — the same convention as the species split under `plantations`.

---

## infrastructure.*

### `infrastructure.roads`
- **Definition.** Highways, streets, surfaced paths — the linear transport network.
- **Requires.** At 10 m cells only major roads get their own cell; a lane is
  visible in the imagery but sub-cell. Note the roadside *trees* are
  `forest.tree_lines`, a separate class from the carriageway.

### `infrastructure.industrial`
- **Definition.** NRSC industrial area — small-scale industry, workshops, sheds.
- **Diagnostic.** Large uniform roofs, hardstanding, yard space, vehicle access;
  distinct from the residential grain around it.

---

## Classes that are real but not currently assignable

A class that exists on the ground **stays in the hierarchy** even when our
methodology cannot assign it. Retiring it would bake a sensor limitation into an
ontology meant to outlive it, and would discard the reasoning along with the
node. Such nodes carry `_status: "not-assignable"` in `land-cover.json`, plus
`_why` and `_unlock`.

**What that means in practice:**

- They are **never offered in a pick-list** — not in the review page's class
  inputs. Enforced by `scripts/check_pick_lists.py`, which reads the **generated
  artifacts** rather than trusting the generators. It now checks **one** surface,
  not two: `prompt.txt` is retired and its arm was removed.
- ⚠ **The remaining route to a reader is not enforced by anything.** Readers now
  read *this document* directly, and by the rule above the glossary must show
  every class including these. Prose in its own entry is what a reader sees, and
  prose is what failed before — so **the verdicts are now checked instead of
  trusted.** `check_verdict_contract.py --hierarchy land-cover.json` fails a round
  whose records name a blocked class in `label`, `alternative`, `prev_label` or
  `better_label`, reading `_status` from the hierarchy rather than from any list
  it keeps itself. Without `--hierarchy` it reports **NOT CHECKED**, not OK.
- **If you believe you are looking at a blocked class, fire `no_class_fits` and
  name it.** Do not reach for the nearest assignable label — that converts the
  evidence for the `_unlock` decision into a wrong verdict, silently, which is
  worse than the gap it papers over. A rejected reading is recoverable; a
  plausible substitute is not.
- Every blocked class is marked in its own entry.
- They **do** appear in the glossary, in coverage analyses and in missing-class
  mining, all of which need the whole tree. You cannot rule on a class you cannot
  see.
- `_unlock` states what evidence would make the class assignable. It is a
  commitment to revisit, not a graveyard.

Currently flagged (7): `forest.natural_forest`, `scrubland.thorny_scrub`,
`grassland.grazing_land`, `agriculture.agroforestry` and its three children.

**Ruled on 2026-08-21 (T43), against each class's own `_unlock` condition rather
than against a general impression — the surface was `t43_review.html` in the
round-4 run dir, and the export is `t43_rulings.json` beside it.**

| class | ruling | the maintainer's reason |
|---|---|---|
| `forest.scattered_trees` | **unlocked** | *"only c115e0 actually has scattered trees in the selected area. but this is a legitimate label"* |
| `grassland.grazing_land` | kept | *"parts of some of these look like grassland. but the full selections do not"* — the four round-4 cells argued for it, and looking at them refuted it |
| `agriculture.agroforestry` | kept | no reason given; the round offered one two-layer observation (c187e2) |
| `agriculture.agroforestry.food_forests` | kept | no reason given |

**The other four were not ruled on, and stay blocked by default** —
`forest.natural_forest`, `scrubland.thorny_scrub`,
`agriculture.agroforestry.permaculture`, `agriculture.agroforestry.mixed_cultivation`.
Round 4 produced **no evidence of any kind** for any of them, so there was
nothing to rule against; the page said so and they were left alone. Absence of a
ruling is not a ruling — do not read these four as re-affirmed.

**Not the same thing: labelable-but-absent.** `degraded_barren.quarries` has zero
uses *and* zero mentions of quarry/mining/excavation in 482 texts — that is a
class the AOI does not contain, not one we cannot see. It stays **assignable**;
if a quarry appears, use it. Conflating the two would empty the flag of meaning.

**Prose retirement does not retire anything** — which is why the rule above is a
checked one. What happened when it was only prose is in `history.md`.

---

## Remaining structural notes (flagged, not fixed)

1. **`orchards.casuarina` vs NRSC's Forest Plantation** — ours is defensible
   (farm cash crop) but is a deliberate divergence; note it when comparing.
2. **Species-level orchard leaves are finer than any published scheme** —
   justified by sub-metre imagery, but they are our refinement, not a standard.
3. **`eroded_land` conflates NRSC's *Gullied* and *Ravinous*** — 6 verdicts use
   gully/ravine language. Real but minor; the class fell to 0.0% share this pass.
