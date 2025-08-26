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

# Real AEF Data Analysis
> Clustering and classification pipeline with real AlphaEarth Foundation embeddings

```python
from pathlib import Path
import numpy as np

from alpha_bhu.data import load_aef_embeddings, validate_embedding_quality, reshape_for_clustering
from alpha_bhu.clustering import (
   cluster_embeddings_simple, 
   labels_to_raster, 
   cluster_aef_to_polygons_simple
)
from alpha_bhu.classification import (
   PrototypeLibrary,
   create_prototypes_from_labels,
   classify_with_prototypes,
   load_labels_geojson,
   enhanced_classification_pipeline
)
from alpha_bhu.visualization import (
   plot_cluster_raster,
   plot_classification_results
)
from alpha_bhu.config import TEST_ROI, FULL_ROI, CLASSES

print("✅ All imports successful")
```

## Data Paths Setup

```python
DATA_DIR = Path("../data")
AEF_PATH = DATA_DIR / "aef_3.5k_roi_cog.tif"
LABELS_PATH = DATA_DIR / "geo_darshan_polygons_test.geojson"
OUTPUT_DIR = DATA_DIR / "results"
OUTPUT_DIR.mkdir(exist_ok=True)

print(f"AEF Path: {AEF_PATH}")
print(f"Labels Path: {LABELS_PATH}")
print(f"Output Dir: {OUTPUT_DIR}")
```

## 1. Load and Inspect AEF Embeddings

```python
embeddings, metadata = load_aef_embeddings(AEF_PATH)

print("=== AEF Embeddings Loaded ===")
print(f"Shape: {embeddings.shape}")
print(f"CRS: {metadata['crs']}")
print(f"Bounds: {metadata['bounds']}")
print(f"Transform: {metadata['transform']}")

quality = validate_embedding_quality(embeddings)
print(f"\n=== Quality Report ===")
print(f"Total pixels: {quality['total_pixels']:,}")
print(f"Memory usage: {quality['memory_mb']:.1f} MB")
print(f"NaN pixels: {quality['nan_pixels']:,}")
print(f"Inf pixels: {quality['inf_pixels']:,}")
print(f"Valid pixels: {quality['valid_pixels']:,}")
print(f"Value range: [{quality['min_value']:.3f}, {quality['max_value']:.3f}]")
print(f"Mean: {quality['mean_value']:.3f} ± {quality['std_value']:.3f}")

print(f"\n=== First 5 Band Statistics ===")
for band_stat in quality['band_statistics'][:5]:
    print(f"Band {band_stat['band']:2d}: mean={band_stat['mean']:6.3f}, std={band_stat['std']:6.3f}")
```

## 2. Adaptive Clustering with Auto-K

```python
embeddings_flat = reshape_for_clustering(embeddings)
print(f"Reshaped to: {embeddings_flat.shape}")

# Run simple clustering with 18 clusters (EE-style)
labels, cluster_metadata = cluster_embeddings_simple(
   embeddings_flat,
   n_clusters=18,
   algorithm="kmeans",
   n_samples=1000,
   random_state=42
)

print(f"\n=== Clustering Results ===")
print(f"Clusters found: {cluster_metadata['n_clusters_found']}")
print(f"Sample size used: {cluster_metadata['sample_size']:,}")
print(f"Silhouette score: {cluster_metadata['silhouette_score']:.3f}")

# Convert to spatial raster
cluster_raster = labels_to_raster(labels, metadata['shape'])
print(f"Cluster raster shape: {cluster_raster.shape}")
```

## 3. Visualize K Selection and Clustering

```python
cluster_map = plot_cluster_raster(
    cluster_raster,
    metadata,
    title=f"AEF Clustering Results (K={cluster_metadata['n_clusters_found']})"
)
cluster_map
```

## 4. Vectorize Clusters to Polygons

```python
# Create polygons from clusters for labeling in Geo-Darshan
polygons, cluster_meta = cluster_aef_to_polygons_enhanced(
    AEF_PATH,
    n_clusters=cluster_metadata['n_clusters_found'],
    auto_k=False,  # Use the K we already found
    min_area_pixels=5
)

print(f"\n=== Polygon Vectorization ===")
print(f"Created {len(polygons)} polygons")
print(f"Silhouette quality: {cluster_meta['silhouette_score']:.3f}")

# Save for Geo-Darshan labeling
clusters_geojson = OUTPUT_DIR / "clusters_for_labeling.geojson"
polygons.to_file(clusters_geojson)
print(f"Saved cluster polygons to: {clusters_geojson}")

# Show polygon summary
print(f"\n=== Polygon Summary ===")
cluster_counts = polygons['cluster_id'].value_counts().sort_index()
for cluster_id, count in cluster_counts.items():
    print(f"Cluster {cluster_id}: {count} polygons")
```

## 5. Classification Pipeline (if labels exist)

```python
# Check if we have labeled data from Geo-Darshan
if LABELS_PATH.exists():
    print(f"Found labeled data: {LABELS_PATH}")
    
    # Run enhanced classification pipeline
    results = enhanced_classification_pipeline(
        cog_path=AEF_PATH,
        labels_path=LABELS_PATH,
        similarity_threshold=0.7,
        save_library=True
    )
    
    print(f"\n=== Classification Results ===")
    print(f"Predictions shape: {results['predictions'].shape}")
    print(f"Classes found: {results['class_names']}")
    print(f"Number of prototypes: {results['n_prototypes']}")
    
    # Show classification summary
    unique_preds, counts = np.unique(results['predictions'], return_counts=True)
    print(f"\n=== Prediction Summary ===")
    for pred, count in zip(unique_preds, counts):
        if pred == -1:
            print(f"Unclassified: {count:,} pixels")
        else:
            class_name = results['class_names'][pred] if pred < len(results['class_names']) else f"Class_{pred}"
            print(f"{class_name}: {count:,} pixels")
    
    # Novelty detection summary
    novel_pixels = np.sum(results['novelty_mask'])
    total_pixels = results['predictions'].size
    print(f"\nNovel/uncertain regions: {novel_pixels:,} pixels ({100*novel_pixels/total_pixels:.1f}%)")
    
    # Visualize classification results
    if len(results['class_names']) <= 10:  # Only if manageable number of classes
        print("Displaying classification results...")
        classification_chart = plot_classification_results(
            results['predictions'],
            results['confidences'], 
            results['novelty_mask'],
            results['class_names']
        )
        classification_chart.show()
    
    # Save classification results
    np.save(OUTPUT_DIR / "predictions.npy", results['predictions'])
    np.save(OUTPUT_DIR / "confidences.npy", results['confidences'])
    np.save(OUTPUT_DIR / "novelty_mask.npy", results['novelty_mask'])
    
    print(f"Saved classification arrays to: {OUTPUT_DIR}")
    
else:
    print(f"No labeled data found at: {LABELS_PATH}")
    print("Use clusters_for_labeling.geojson in Geo-Darshan to create labels")
```

## 6. Export Results for Analysis

```python
# Save comprehensive results
results_summary = {
    'embedding_shape': embeddings.shape,
    'embedding_quality': quality,
    'clustering': {
        'n_clusters': cluster_metadata['n_clusters_found'],
        'silhouette_score': cluster_metadata['silhouette_score'],
        'calinski_score': cluster_metadata['calinski_score'],
        'sample_size': cluster_metadata['sample_size']
    },
    'polygons': {
        'total_polygons': len(polygons),
        'clusters_represented': polygons['cluster_id'].nunique()
    }
}

if LABELS_PATH.exists():
    results_summary['classification'] = {
        'n_prototypes': results['n_prototypes'],
        'class_names': results['class_names'],
        'novel_pixel_ratio': float(np.sum(results['novelty_mask']) / results['predictions'].size)
    }

print(f"\n=== Complete Results Summary ===")
for section, data in results_summary.items():
    print(f"\n{section.upper()}:")
    if isinstance(data, dict):
        for key, value in data.items():
            print(f"  {key}: {value}")
    else:
        print(f"  {data}")

# Save summary as JSON
import json
with open(OUTPUT_DIR / "analysis_summary.json", 'w') as f:
    json.dump(results_summary, f, indent=2, default=str)

print(f"\nSaved analysis summary to: {OUTPUT_DIR / 'analysis_summary.json'}")
```

## Next Steps

```python
print("\n=== Next Steps ===")
print("1. Use 'clusters_for_labeling.geojson' in Geo-Darshan to label land use")
print("2. Save labeled polygons as 'geo_darshan_polygons_test.geojson'")
print("3. Re-run this notebook to train classifiers")
print("4. Iterate with active learning on uncertain regions")

if LABELS_PATH.exists():
    uncertain_pixels = np.sum(results['uncertainty_regions'])
    if uncertain_pixels > 0:
        print(f"5. Focus labeling on {uncertain_pixels:,} uncertain pixels for improvement")
```
