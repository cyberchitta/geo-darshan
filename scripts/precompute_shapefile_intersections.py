#!/usr/bin/env python3

import sys
from pathlib import Path
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Tuple, Any
import json
import argparse
import numpy as np
import rasterio
from rasterio.features import rasterize
import fiona
import traceback


sys.path.insert(0, str(Path(__file__).parent))
from lib.config import (
    load_config,
    get_current_segmentation,
    resolve_aoi_path,
)


@dataclass(frozen=True)
class IntersectionConfig:
    shapefile_path: Path
    segmentation_dir: Path
    manifest_path: Path
    output_dir: Path
    threshold_pct: float
    verbose: bool

    @classmethod
    def from_config(cls, config: Dict[str, Any], verbose: bool) -> "IntersectionConfig":
        aoi_path = config["aoi_path"]
        aoi_config = config["aoi_config"]
        threshold = aoi_config["shapefile_intersection"]["min_intersection_pct"]
        files_config = aoi_config.get("files", {})
        shapefile_rel = files_config.get("reference_labels")
        if not shapefile_rel:
            raise KeyError("reference_labels not found in AOI config files")
        shapefile_path = resolve_aoi_path(aoi_path, shapefile_rel)
        _, seg_config = get_current_segmentation(aoi_config)
        intermediates_rel = files_config.get("intermediates_dir", "intermediates")
        output_subdir = seg_config.get("output_subdir", "clusters")
        segmentation_dir = resolve_aoi_path(
            aoi_path, f"{intermediates_rel}/{output_subdir}"
        )
        manifest_path = segmentation_dir / "manifest.json"
        output_dir = resolve_aoi_path(
            aoi_path, f"{intermediates_rel}/shapefile_intersections"
        )
        return cls(
            shapefile_path=shapefile_path,
            segmentation_dir=segmentation_dir,
            manifest_path=manifest_path,
            output_dir=output_dir,
            threshold_pct=threshold,
            verbose=verbose,
        )

    def validate(self) -> None:
        if not self.shapefile_path.exists():
            raise FileNotFoundError(f"Shapefile not found: {self.shapefile_path}")
        if not self.manifest_path.exists():
            raise FileNotFoundError(f"Manifest not found: {self.manifest_path}")
        if not 0 <= self.threshold_pct <= 100:
            raise ValueError("Threshold must be between 0 and 100")


def load_shapefile(
    shapefile_path: Path, verbose: bool = False
) -> Tuple[List[dict], List[dict]]:
    geometries = []
    properties = []
    shapefile_uri = str(shapefile_path)
    if shapefile_path.suffix == ".zip":
        shapefile_uri = f"zip://{shapefile_path}"
    with fiona.open(shapefile_uri) as src:
        if verbose:
            print(f"📂 Loading shapefile: {src.name}")
            print(f"   CRS: {src.crs}")
            print(f"   Features: {len(src)}")
        for feature in src:
            geometries.append(feature["geometry"])
            properties.append(dict(feature.get("properties", {})))
    return geometries, properties


def rasterize_features(
    geometries: List[dict], reference_raster_path: Path, verbose: bool = False
) -> np.ndarray:
    with rasterio.open(reference_raster_path) as src:
        transform = src.transform
        shape = (src.height, src.width)
        _crs = src.crs
    shapes = [(geom, feature_id) for feature_id, geom in enumerate(geometries, start=1)]
    feature_raster = rasterize(
        shapes,
        out_shape=shape,
        transform=transform,
        fill=0,  # 0 = no feature
        dtype=np.uint16,
    )
    if verbose:
        unique_features = np.unique(feature_raster)
        n_features = len(unique_features) - 1  # Exclude 0
        print(f"✅ Rasterized {n_features} features")
    return feature_raster


def compute_intersections(
    cluster_raster: np.ndarray,
    feature_raster: np.ndarray,
    threshold_pct: float,
    nodata_value: int = -1,
) -> Tuple[Dict, Dict]:
    """
    Compute bidirectional intersection indices.

    Feature→Clusters: Include cluster if ≥threshold% of cluster is inside feature
    Cluster→Features: Include ALL features the cluster touches (no threshold)

    Returns:
        feature_to_clusters: {feature_id: [(cluster_id, pct_of_cluster, count), ...]}
        cluster_to_features: {cluster_id: [(feature_id, pct_of_cluster, count), ...]}
    """
    valid_mask = cluster_raster != nodata_value
    valid_clusters = cluster_raster[valid_mask]
    valid_features = feature_raster[valid_mask]
    pairs = np.stack([valid_clusters, valid_features], axis=0)
    unique_pairs, counts = np.unique(pairs, axis=1, return_counts=True)
    cluster_ids = unique_pairs[0]
    feature_ids = unique_pairs[1]
    cluster_totals = {}
    for cluster_id, count in zip(cluster_ids, counts):
        cluster_totals[cluster_id] = cluster_totals.get(cluster_id, 0) + count
    feature_to_clusters = {}
    cluster_to_features = {}
    for (cluster_id, feature_id), count in zip(zip(cluster_ids, feature_ids), counts):
        if feature_id == 0:
            continue
        cluster_pct = (count / cluster_totals[cluster_id]) * 100
        if cluster_pct >= threshold_pct:
            if feature_id not in feature_to_clusters:
                feature_to_clusters[feature_id] = []
            feature_to_clusters[feature_id].append(
                [int(cluster_id), round(cluster_pct, 2), int(count)]
            )
        if cluster_id not in cluster_to_features:
            cluster_to_features[cluster_id] = []
        cluster_to_features[cluster_id].append(
            [int(feature_id), round(cluster_pct, 2), int(count)]
        )
    for clusters in feature_to_clusters.values():
        clusters.sort(key=lambda x: -x[1])  # Sort by percentage desc
    for features in cluster_to_features.values():
        features.sort(key=lambda x: -x[1])
    return feature_to_clusters, cluster_to_features


def process_segmentation(
    seg_key: str,
    seg_path: Path,
    feature_raster: np.ndarray,
    feature_properties: List[dict],
    config: IntersectionConfig,
) -> None:
    if config.verbose:
        print(f"\n📊 Processing {seg_key}...")
    with rasterio.open(seg_path) as src:
        cluster_raster = src.read(1)
    feature_to_clusters, cluster_to_features = compute_intersections(
        cluster_raster, feature_raster, config.threshold_pct
    )
    feature_props_dict = {
        str(i): props for i, props in enumerate(feature_properties, start=1)
    }
    output = {
        "segmentation_key": seg_key,
        "shapefile": config.shapefile_path.name,
        "generated": datetime.now().isoformat(),
        "config": {"min_intersection_pct": config.threshold_pct},
        "feature_to_clusters": {
            str(fid): clusters for fid, clusters in feature_to_clusters.items()
        },
        "cluster_to_features": {
            str(cid): features for cid, features in cluster_to_features.items()
        },
        "feature_properties": feature_props_dict,
    }
    output_path = config.output_dir / f"{seg_key}.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)
    if config.verbose:
        print(f"  ✅ {len(feature_to_clusters)} features with intersections")
        print(f"  ✅ {len(cluster_to_features)} clusters with intersections")
        print(f"  💾 Saved to {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Precompute shapefile-cluster intersections"
    )
    parser.add_argument(
        "--verbose", action="store_true", default=True, help="Print detailed progress"
    )
    args = parser.parse_args()
    project_root = Path(__file__).parent.parent
    try:
        config_dict = load_config(project_root)
        config = IntersectionConfig.from_config(config_dict, args.verbose)
        config.validate()
        with open(config.manifest_path) as f:
            manifest = json.load(f)
        config.output_dir.mkdir(parents=True, exist_ok=True)
        if config.verbose:
            print("🚀 Starting intersection computation")
            print(f"   AOI: {config_dict['aoi_name']}")
            print(f"   Threshold: {config.threshold_pct}%")
            print(f"   Shapefile: {config.shapefile_path}")
            print(f"   Segmentations: {len(manifest['files'])}")
        geometries, feature_properties = load_shapefile(
            config.shapefile_path, config.verbose
        )
        reference_raster = config.segmentation_dir / manifest["files"][0]
        feature_raster = rasterize_features(
            geometries, reference_raster, config.verbose
        )
        for seg_key, filename in zip(manifest["segmentation_keys"], manifest["files"]):
            seg_path = config.segmentation_dir / filename
            process_segmentation(
                seg_key, seg_path, feature_raster, feature_properties, config
            )
        cache_config = {
            "version": 1,
            "shapefile": config.shapefile_path.name,
            "generated": datetime.now().isoformat(),
            "min_intersection_pct": config.threshold_pct,
            "segmentations": manifest["segmentation_keys"],
        }
        config_path = config.output_dir / "config.json"
        with open(config_path, "w") as f:
            json.dump(cache_config, f, indent=2)
        if config.verbose:
            print("\n✅ All intersections computed!")
            print(f"💾 Cache saved to {config.output_dir}")
    except Exception as e:
        print(f"❌ Error: {e}")
        if args.verbose:
            traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
