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

### `forest.tree_lines`  *(added 2026-08-09)*
- **Definition.** Linear woody features outside forest blocks. FSI *Trees Outside
  Forests*, **linear** stratum — trees along roads, canals and bunds. Geometry
  from Copernicus Small Woody Features: **≤ 30 m wide, ≥ 30 m long**.
- **Diagnostic.** A continuous woody ribbon tracking a road, tank margin, canal
  or field bund. ~50 px wide in the imagery; ~3 cells on the cluster grid.
- **Requires.** Linearity *and* a linear host feature to follow. Woody, not grass.
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
- **⚠ NOT CURRENTLY ASSIGNABLE** — see "Classes that are real but not currently
  assignable". The stratum is published and the ground is real, but it does not
  separate at a 10 m cell: 7 verdicts describe scattered or isolated trees and
  they land on **four unrelated labels** (`sparse_scrub`, `maintained_grass`,
  `degraded_barren`, `fallow`). A scattered-tree cell is mostly whatever the
  trees are scattered *in*.
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
  the mix, use the parent `agriculture.orchards`. c6 was voted mixed_fruit and is
  actually coconut + casuarina.

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

### `agriculture.field_crops.rice_paddies`
- **Diagnostic.** Small level parcels with water-retaining bunds, often a wet or
  mirror-like surface; strong rectangular tessellation; near tanks/canals.
- **Requires.** Bunded level parcels. Wetness is confirmatory, not required.

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

### `agriculture.agroforestry.permaculture`
- **Definition.** Auroville's designed multi-layer systems — swales, contour
  planting, mixed species by design.
- **Requires.** Visible design geometry (contour bunds, swales, keyline patterning)
  plus mixed vegetation. Near communities.

### `agriculture.agroforestry.food_forests`
- **Definition.** ICRAF *homegarden* / forest-farming — multi-storey edible
  planting, canopy over understorey crops, intensively managed, near dwellings.
- **Requires.** Multi-storey structure **and** proximity to habitation.
- **Not this:** any dense mixed canopy. Without the habitation link it is
  planted_forest.

### `agriculture.agroforestry.mixed_cultivation`
- **Definition.** ICRAF *agrisilviculture* — trees and crops interspersed on the
  same parcel; bund tree-lines around cropped fields are the classic case.
- **Requires.** Both layers visible in one parcel.
- **Not this:** became a soft landing for "trees and something else" — c42 was
  voted here and is planted_forest. If you can't see the crop layer, it isn't
  agroforestry.

### `agriculture.fallow`
- **Definition — the one to memorise.** NRSC 2.3: land **taken up for
  cultivation** but temporarily rested, **un-cropped for one or more season but
  not less than one year**.
- **Requires — BOTH:** (1) positive evidence of *cultivation* — field geometry,
  bunds, plough lines, straight boundaries shared with active parcels; and
  (2) absence of standing crop. Cultivation evidence is not optional.
- **Not this — the standing systematic failure.** Fallow became the default for
  any smooth green or tan patch with nothing obviously growing, inheriting the
  role `grazing_land` and then `maintained_grass` played before it. Before
  writing `fallow`, ask which of these it really is:
  - harvested **casuarina** (geometric field amid casuarina — west),
  - young **coconut** or ground within a young planting (user, c89),
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
- **Note.** Below ~20% artificial it is not a built class at all: label the matrix
  cover and let the buildings ride along.

### ~~`built_environment.infrastructure`~~ — RETIRED 2026-08-15
Structural duplicate of the top-level `infrastructure.*` family: its own
description was "Roads, industrial facilities", naming the same two things that
family lists as children. Zero uses in 266 verdicts. **Removed from
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
- **Definition.** NRSC Level II *Barren rocky*; Wastelands Atlas *barren rocky /
  stony waste / sheet rock*. Flat, smooth, compacted bare laterite.
- **Requires.** A bare mineral surface with **none** of the three sibling
  triggers: no visible channel dissection (→ `eroded_land`), no extraction scars
  or stockpiles (→ `quarries`), no foundations, trenches or machinery
  (→ `construction_sites`).
- **Diagnostic.** Orange-red laterite, undissected micro-relief, no branching
  gully shadows. This is the honest leaf for what readers were calling the bare
  `degraded_barren` **parent** — 8 of the 9 parent-level verdicts describe
  exactly this, in almost the same words.
- **Not this:** bare *because graded or trafficked* → `compacted_corridor`.

### `degraded_barren.compacted_corridor`
- **Definition.** Anthropogenic bare surfaces — track corridors, graded
  embankments, cleared service strips. Bare through **traffic and grading**, not
  through erosion: degraded in appearance, but not degraded *land*.
- **Requires.** A corridor form (elongate, following a track, edge or alignment)
  **and** a compacted or graded surface texture.
- **Not this:** a made carriageway → `infrastructure.roads` (at 10 m these are
  *surfaces*, not roads); natural bare laterite with no corridor form →
  `bare_ground`.
- **⚠ On probation.** Separability from `bare_ground` is **predicted, not
  demonstrated** — both are bare red laterite and the difference is *cause*, not
  colour, which may not survive into the embedding. Evidence at adoption: 9
  exemplars across 8 clusters, none holding both types — consistent with
  separation, far short of showing it. If these cells scatter into `bare_ground`
  instead of clustering, that is the answer and the node should merge back.

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
per NRSC, part of the **forest**, not fallow and not barren. That resolves the
"bare clearing amid canopy" cases (c150/c1, c163, c168) that no current label fit.

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

---

## grassland.*

NRSC 4.0: natural or semi-natural grass and grass-like herbs, **including manmade
grasslands**.

### `grassland.grazing_land`
- **RETIRED FOR THIS AOI — never emit.** Auroville has no land used exclusively
  for grazing; herds move over public and common land, so grazing is not a cover
  class here. It was the *first* smooth-green catch-all; its retirement is what
  pushed the default onto `maintained_grass` and then `fallow`.

### `grassland.maintained_grass`
- **Definition.** Managed/mown grass — gardens, lawns, campus grounds.
- **Requires.** Unmistakably mown or managed **and** ringed by built. **Rare, and
  mostly around Matrimandir** in the central zone.
- **Not this:** away from the centre, a smooth light-green patch is far more likely
  young `planted_forest`, harvested `casuarina`, or `fallow`. Decide by matrix and
  context, never by "it's green and smooth".

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

- They are **never offered in a pick-list** — not in `prompt.txt`, not in the
  review page's class inputs. Enforced by `scripts/check_pick_lists.py`, which
  reads the **generated artifacts** rather than trusting the generators.
- They **do** appear in the glossary, in coverage analyses and in missing-class
  mining, all of which need the whole tree. You cannot rule on a class you cannot
  see.
- `_unlock` states what evidence would make the class assignable. It is a
  commitment to revisit, not a graveyard.

Currently flagged (8): `forest.natural_forest`, `forest.scattered_trees`,
`scrubland.thorny_scrub`, `grassland.grazing_land`, `agriculture.agroforestry`
and its three children.

**Not the same thing: labelable-but-absent.** `degraded_barren.quarries` has zero
uses *and* zero mentions of quarry/mining/excavation in 482 texts — that is a
class the AOI does not contain, not one we cannot see. It stays **assignable**;
if a quarry appears, use it. Conflating the two would empty the flag of meaning.

**The failure this replaces.** `natural_forest`, `thorny_scrub` and `grazing_land`
were already "retired" — in prose *here*, while sitting fully pickable in the
JSON. All three were still being offered to the VLM readers in `prompt.txt`,
`natural_forest` with a helpful "LOOKS LIKE" cue, and `grazing_land` was still
being emitted. **Prose retirement does not retire anything.**

---

## Remaining structural notes (flagged, not fixed)

1. **`orchards.casuarina` vs NRSC's Forest Plantation** — ours is defensible
   (farm cash crop) but is a deliberate divergence; note it when comparing.
2. **Species-level orchard leaves are finer than any published scheme** —
   justified by sub-metre imagery, but they are our refinement, not a standard.
3. **`eroded_land` conflates NRSC's *Gullied* and *Ravinous*** — 6 verdicts use
   gully/ravine language. Real but minor; the class fell to 0.0% share this pass.
