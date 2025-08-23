# Geo-Darshan and Alpha-Bhu Project Reference

## Overview
Two projects for geospatial analysis in Auroville, India, focused on a 15km x 15km ROI ([79.676, 11.872, 79.946, 12.142]) and 500m x 500m test ROI ([79.808, 12.0045, 79.8125, 12.009]) around Matrimandir.

- **Geo-Darshan**: Standalone tool for labeling 10m cells/polygons using high-res imagery (Esri World Imagery 30cm–1m, Sentinel-2 10m fallback) in an offline Leaflet frontend. Outputs GeoJSON (SQLite optional) for ML/GIS tasks. Reusable for any geospatial data.
- **Alpha-Bhu**: Uses 2024 AlphaEarth Foundations (AEF) embeddings (10m, 64D) and Geo-Darshan’s labeled datasets to cluster and train classifiers for Auroville land use (e.g., forest, permaculture, urban).

## AlphaEarth Foundations (AEF) Details
- **Description**: Geospatial AI model (Google DeepMind, July 2025) generating 64D embeddings at 10m resolution for Earth observation.
- **Data Sources**: Sentinel-2 (optical, 10m), Sentinel-1 (radar), Landsat, climate simulations, elevation, geotagged text.
- **Embeddings**:
  - Format: 64D float vectors per 10m pixel.
  - Resolution: 10m (Sentinel-2 aligned).
  - Temporal: Annual (2017–2024, prefer 2024, fallback 2023).
  - Size: ~64 bytes/pixel (~100–150 MB for 15km x 15km, ~5–10 MB for 500m x 500m).
- **Access**: 
  - Dataset: `GOOGLE/SATELLITE_EMBEDDING/V1_ANNUAL` in Google Earth Engine (EE).
  - Requirements: EE account (free for non-commercial, quota-limited).
  - Export: GeoTIFF via EE API, convert to COG (Deflate compression).
- **Applications**:
  - Classification: Land use, crop types, biophysical properties.
  - Strengths: ~24% lower error in low-shot settings (10–50 labels/class for small ROIs, 100–500 for larger).
  - Tasks: Supervised (Random Forest, kNN) or unsupervised (k-means, DBSCAN).
- **Labeling**:
  - **Requirements**: Labels for 10m cells/polygons (GeoJSON). For 15km x 15km (~22,500 cells), 1,000–4,000 labels (100–200/class, 10–20 classes). For 500m x 500m (~2,500 cells), 100–400 labels (10–20/class).
  - **Sparsity**: Excels with sparse labels (~4–18% coverage). Use k-means (5–10 clusters) for initial polygons, refine via Geo-Darshan, iterate with active learning (2–3 rounds).
  - **Geo-Darshan Role**: Visualize Esri imagery (30cm–1m), draw polygons, label cells, export GeoJSON.
  - **Classes**: Suggested 10–20 classes (e.g., forest, permaculture, cropland, urban, water, road, scrubland, wetland, orchard, barren, grassland, residential, commercial, industrial, fallow, plantation, coastal, village, park, mixed-use). **Needs clarification**: Exact classes, number, process (hybrid: k-means + Auroville maps suggested).
- **Limitations**: Terrestrial/coastal only, pre-computed embeddings, needs accurate ground-truth.
- **Storage**: COG (Deflate, ~100–150 MB for 15km x 15km).

## Project Plan
### Geo-Darshan
- **Phase 1 - Test (Data Acquisition)**:
  - Fetch Esri imagery (zoom 10–16, ~1m) for 500m ROI, store as COG (~10–50 MB). Fallback: Sentinel-2 2024 (10m, ~5–10 MB).
  - Align to 10m grid (WGS84, EPSG:4326) for stitching with `gdalbuildvrt`.
  - Timeline: Aug 23–24, 2025.
- **Phase 3 - Test (Frontend Prototype)**:
  - Build HTML/JS Leaflet frontend to render test COG, add 10m grid (turf.js), polygon drawing (Leaflet.Draw), dropdown (10–20 classes, TBD).
  - Save to GeoJSON (`project/data/geo_darshan_polygons_test.geojson`).
  - Timeline: Aug 24–25, 2025.
- **Phase 1 - Full**: Scale Esri to 15km ROI (zoom 16 or 18, ~200 MB–1 GB), mosaic with test COG. Fallback: Sentinel-2 (~50–100 MB).
  - Timeline: Aug 26–28, 2025.
- **Label Refinement**: Import cluster polygons, edit, label 100–400 cells (test), 1,000–4,000 (full). Export GeoJSON (SQLite optional).
  - Timeline: Aug 29–31, 2025.

### Alpha-Bhu
- **Phase 1 - Test**: Fetch 2024 AEF embeddings for 500m ROI (~5–10 MB), store as COG. Fallback: 2023.
  - Timeline: Aug 23–24, 2025.
- **Phase 2 (Clustering)**: Run k-means (5–10 clusters, TBD), vectorize to GeoJSON using rasterio/shapely.
  - Timeline: Aug 26–27, 2025.
- **Phase 1 - Full**: Fetch 2024 AEF for 15km ROI (~100–150 MB).
- **Phase 3 (Classifier)**: Train Random Forest (TBD) on Geo-Darshan labels, iterate.
  - Timeline: Sep 1–7, 2025.

## Unconfirmed Details
1. **Label Classes**:
   - **Suggested**: 10 classes (forest, permaculture, cropland, urban, water, road, scrubland, wetland, orchard, barren). Expand to 15–20 (e.g., grassland, residential, coastal) post-clustering if needed.
   - **Process**: Hybrid (k-means 5–10 clusters + Auroville land use maps). **Needs clarification**: Confirm classes, number, process (hybrid, clustering-only, or map-only).
2. **Frontend**:
   - **Must-haves (assumed)**: Polygon drawing, cell selection, dropdown (10–20 classes), GeoJSON export.
   - **Nice-to-haves**: Tooltips (cell info), uncertainty highlights, bulk labeling. **Needs clarification**: Confirm must-haves, prioritize one nice-to-have (e.g., tooltips).
   - **Save Format**: GeoJSON preferred, SQLite optional. **Needs clarification**: GeoJSON only?
3. **Alpha-Bhu**:
   - Clusters: 5 clusters, k-means (suggested). **Needs clarification**: Confirm count, k-means vs. DBSCAN?
   - Classifier: Random Forest (suggested), kNN backup. **Needs clarification**: Confirm preference.
4. **Imagery**: Esri zoom 16 (~1m) first, Sentinel-2 fallback. **Needs clarification**: Zoom 18 (~30cm) if test needs detail?
5. **Constraints**:
   - **Storage**: ~50 MB (test), ~200 MB–1 GB (full). **Needs clarification**: Sufficient?
   - **Internet**: Reliability for Esri scraping? **Needs clarification**.
   - **EE Account**: Active? **Needs clarification**.

## Notes
- **Stitching**: Test ROI tiles (mercantile indices) align with full ROI for COG mosaicking.
- **AEF 2024**: Check availability in EE (`filterDate('2024-01-01', '2025-01-01')`).
- **Tools**: EE API, GDAL (gdal_translate, gdaladdo), rasterio, scikit-learn, Leaflet.js, turf.js.
- **Auroville**: 15km x 15km (~22,500 cells) covers diverse land use. Test ROI validates farm/urban features.
- **Frontend**: Defer React/Vue/HTML decision; use HTML/JS for test prototype.
