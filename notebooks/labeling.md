---
jupyter:
  jupytext:
    formats: ipynb,md
    text_representation:
      extension: .md
      format_name: markdown
      format_version: '1.3'
      jupytext_version: 1.17.2
  kernelspec:
    display_name: Python 3 (ipykernel)
    language: python
    name: python3
---

<!-- #region -->
# Geo-Darshan Interactive Labeling

This notebook provides an interactive interface for labeling 10m x 10m grid cells in the Geo-Darshan test ROI ([79.808, 12.0045, 79.8125, 12.009]) using `ipyleaflet`. It loads a pre-downloaded COG (Esri imagery or Sentinel-2 fallback) as a tile layer, overlays a 10m grid, and allows users to click grid cells to assign labels (10 classes). Outputs are saved as GeoJSON.

## Setup
- **Dependencies**: Managed via `uv` (see `requirements.txt`).
- **Input**: COG file (`data/esri_test_roi_cog.tif` or `data/sentinel2_test_roi_cog.tif`).
- **Output**: `data/geo_darshan_polygons_test.geojson`.
- **Classes**: forest, permaculture, cropland, urban, water, road, scrubland, wetland, orchard, barren.

Run the following to set up the environment:
```bash
uv init
uv add jupyter ipyleaflet ipywidgets rasterio geopandas shapely localtileserver earthengine-api
uv run jupyter notebook
```
Enable `ipyleaflet` widgets:
```bash
uv run jupyter nbextension enable --py --sys-prefix ipyleaflet
```
Authenticate Earth Engine (for download scripts, not visualization):
```bash
uv run earthengine authenticate
```
**Note**: Ensure the COG file exists in `data/`. Pre-download using `scripts/download_esri.py` or `scripts/download_sentinel2.py` (requires `earthengine-api` for Sentinel-2).
<!-- #endregion -->

```python
import ipyleaflet as L
from ipywidgets import Dropdown, Button, Output, VBox
import geopandas as gpd
import rasterio
from shapely.geometry import box
from localtileserver import TileClient, get_leaflet_tile_layer
import json
import os
```

```python
# Configuration
ROI = [79.808, 12.0045, 79.8125, 12.009]  # [minx, miny, maxx, maxy]
GRID_SIZE = 10  # meters
CLASSES = [
    'forest', 'permaculture', 'cropland', 'urban', 'water',
    'road', 'scrubland', 'wetland', 'orchard', 'barren'
]
COG_PATH = '../data/esri_test_roi_cog.tif'
OUTPUT_GEOJSON = '../data/geo_darshan_polygons_test.geojson'

# Check if COG exists
if not os.path.exists(COG_PATH):
    raise FileNotFoundError(f'No COG file found at {COG_PATH} or data/sentinel2_test_roi_cog.tif. Run download scripts first.')
```

```python
# Create 10m x 10m grid
def create_grid(roi, grid_size_meters):
    minx, miny, maxx, maxy = roi
    # Convert meters to degrees (approximate, near equator: 1 degree ~ 111,000 meters)
    grid_size_deg = grid_size_meters / 111000
    grid_cells = []
    x = minx
    while x < maxx:
        y = miny
        while y < maxy:
            cell = box(x, y, x + grid_size_deg, y + grid_size_deg)
            grid_cells.append({'geometry': cell, 'properties': {'label': None}})
            y += grid_size_deg
        x += grid_size_deg
    return gpd.GeoDataFrame(grid_cells, geometry='geometry', crs='EPSG:4326')

# Initialize grid
grid_gdf = create_grid(ROI, GRID_SIZE)

# Initialize map
center = [(ROI[1] + ROI[3]) / 2, (ROI[0] + ROI[2]) / 2]  # [lat, lon]
m = L.Map(center=center, zoom=16, layout={'height': '600px'})

# Add COG as tile layer
client = TileClient(COG_PATH)
tile_layer = get_leaflet_tile_layer(client, opacity=1.0)
m.add_layer(tile_layer)

# Add grid as GeoJSON layer
grid_geojson = json.loads(grid_gdf.to_json())
grid_layer = L.GeoJSON(
    data=grid_geojson,
    style={'color': 'blue', 'weight': 1, 'opacity': 0.5, 'fillOpacity': 0},
    hover_style={'fillColor': 'yellow', 'fillOpacity': 0.2}
)
m.add_layer(grid_layer)
```

```python
# Labeling interface
label_dropdown = Dropdown(options=[''] + CLASSES, description='Label:')
save_button = Button(description='Save GeoJSON')
output = Output()

# Store labeled cells
labeled_cells = {}

# Click handler for grid cells
def on_click(event, feature, **kwargs):
    with output:
        if label_dropdown.value:
            cell_id = feature['id']
            labeled_cells[cell_id] = label_dropdown.value
            print(f'Labeled cell {cell_id} as {label_dropdown.value}')
            # Update grid layer style for labeled cell
            feature['properties']['label'] = label_dropdown.value
            grid_layer.data = grid_geojson

grid_layer.on_click(on_click)

# Save GeoJSON
def save_geojson(b):
    with output:
        grid_gdf['label'] = grid_gdf.index.map(lambda i: labeled_cells.get(i, None))
        grid_gdf.to_file(OUTPUT_GEOJSON, driver='GeoJSON')
        print(f'Saved labels to {OUTPUT_GEOJSON}')

save_button.on_click(save_geojson)
```

```python
# Display map and controls
display(VBox([m, label_dropdown, save_button, output]))
```

## Usage
1. Ensure a COG file (`data/esri_test_roi_cog.tif` or `data/sentinel2_test_roi_cog.tif`) exists.
2. Run the cell above to display the map.
3. Select a label from the dropdown (e.g., 'forest').
4. Click grid cells to assign the selected label.
5. Click 'Save GeoJSON' to export labels to `data/geo_darshan_polygons_test.geojson`.

## Notes
- Grid cells are 10m x 10m, aligned to WGS84 (EPSG:4326).
- COG is served via `localtileserver` for offline compatibility.
- Aim to label 100–400 cells (~4–16% of ~2,500 cells).
- For Earth Engine layers (e.g., Sentinel-2, AEF embeddings), pre-download COGs using `scripts/download_sentinel2.py` or `scripts/download_aef.py`.
- For full ROI (15km x 15km), optimize tile serving or switch to standalone Leaflet frontend.
