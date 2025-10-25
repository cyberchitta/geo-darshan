# Geo-Darshan 🌍

A web-based geospatial visualization tool for analyzing cluster segmentation data and creating land cover classifications.

## Features

### Core Capabilities

- **Cluster Animation**: Navigate through different segmentation levels (k-values)
- **Land Cover Classification**: Label clusters with hierarchical land use categories
- **Object Detection**: LLM-powered detection of buildings, roads, vegetation, and other features from satellite imagery
- **Visualization**: Dynamic overlay rendering with adjustable opacity
- **Export**: Generate GeoTIFF and mapping files for analysis

### Object Detection

- **Workflow Modes**: Manual (upload image) or Automatic (capture from map)
- **Models**: Gemini 2.5 Flash/Pro (requires API key)
- **Output**: GeoJSON features with confidence scores and geometry
- **Region Selection**: Draw rectangular bounds on map for analysis

### Map Features

- Multiple base layers (Satellite, Street Map)
- Cluster-specific color mapping
- Labeled regions composite layer
- Map controls

### Data Management

- Manifest-based data loading from folders
- Support for multi-temporal GeoTIFF datasets
- Color legend generation
- Local storage for label persistence

## Tech Stack

- **Frontend**: Vanilla JavaScript + Svelte components
- **Mapping**: Leaflet with GeoRaster extensions
- **Data Processing**: TensorFlow.js for composite generation
- **Geospatial**: GeoTIFF library for raster handling
- **Build**: Vite with ES modules

## Project Structure

```
geo-darshan/
├── app/
│   ├── components/          # Svelte UI components
│   ├── js/                  # Core JavaScript modules
│   ├── index.html          # Cluster animation viewer
│   ├── land-cover-viewer.html  # Land cover display
│   └── stores.js           # Svelte reactive stores
├── scripts/                # Data processing utilities
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- Modern web browser with WebGL support

### Installation

```bash
# Clone repository
git clone <repository-url>
cd geo-darshan

# Install dependencies
bun install

# Start development server
bun run dev
```

### Data Format

The application expects a folder containing:

```
dataset/
├── manifest.json           # Dataset metadata
├── color_legend.json      # Cluster color mappings
├── k5_segmentation.tif    # Segmentation rasters
├── k10_segmentation.tif
└── ...
```

#### Manifest Structure

```json
{
  "segmentation_keys": ["k5", "k10", "k15"],
  "files": ["k5_segmentation.tif", "k10_segmentation.tif", "k15_segmentation.tif"],
  "metadata": {
    "bounds": [minx, miny, maxx, maxy],
    "shape": [height, width]
  }
}
```

## Usage

### Basic Workflow

1. **Load Data**: Use "Select Data Folder" to load your segmentation dataset
2. **Navigate**: Use animation controls to explore k-values
3. **Label Clusters**: Click clusters to assign land use classifications
4. **Visualize**: Toggle labeled regions layer to see composite results
5. **Export**: Generate GeoTIFF and mapping files

### Land Use Hierarchy

The tool supports 4-level hierarchical classification:

1. **Broad Categories** (e.g., Natural, Agricultural)
2. **General Types** (e.g., Forest, Cropland)
3. **Specific Uses** (e.g., Deciduous Forest, Rice Paddies)
4. **Detailed Classification** (e.g., Mature Oak Forest)

## License

Apache License 2.0
