#!/usr/bin/env python3

import sys
from pathlib import Path
from dataclasses import dataclass
import traceback
from typing import List, Dict, Any
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from lib.config import (
    load_config,
    get_source_config,
    get_current_segmentation,
    resolve_aoi_path,
)

try:
    from alpha_bhu.data import load_aef_embeddings, reshape_for_clustering
    from alpha_bhu.segset import SegSet
    from alpha_bhu.color_assigner import create_hierarchical_color_mapper
    from alpha_bhu.export import export_animation_geotiffs
except ImportError as e:
    print(f"Error importing alpha-bhu: {e}")
    print("Ensure alpha-bhu is installed or in Python path")
    sys.exit(1)


@dataclass(frozen=True)
class ClusterConfig:
    aef_file: Path
    output_dir: Path
    k_values: List[int]
    n_color_families: int = 8
    sample_fraction: float = 0.25
    random_seed: int = 42
    verbose: bool = True
    overwrite_existing: bool = True

    @classmethod
    def from_config(cls, config: Dict[str, Any]) -> "ClusterConfig":
        aoi_path = config["aoi_path"]
        aoi_config = config["aoi_config"]
        seg_name, seg_config = get_current_segmentation(aoi_config)
        source_config = get_source_config(aoi_config, seg_config["source"])
        input_file = resolve_aoi_path(aoi_path, source_config["input_file"])
        output_subdir = seg_config.get("output_subdir", "clusters")
        output_dir = resolve_aoi_path(aoi_path, f"intermediates/{output_subdir}")
        return cls(
            aef_file=input_file,
            output_dir=output_dir,
            k_values=seg_config.get("k_values", []),
            n_color_families=seg_config.get("n_color_families", cls.n_color_families),
            sample_fraction=seg_config.get("sample_fraction", cls.sample_fraction),
            random_seed=seg_config.get("random_seed", cls.random_seed),
            verbose=seg_config.get("verbose", cls.verbose),
            overwrite_existing=seg_config.get(
                "overwrite_existing", cls.overwrite_existing
            ),
        )

    def validate(self) -> None:
        if not self.aef_file.exists():
            raise FileNotFoundError(f"AEF file not found: {self.aef_file}")
        if not self.k_values or len(self.k_values) == 0:
            raise ValueError("k_values cannot be empty")
        if self.n_color_families < 2:
            raise ValueError("n_color_families must be >= 2")


def generate_hierarchical_clusters(
    config: ClusterConfig, embeddings_flat: np.ndarray, metadata: Dict[str, Any]
):
    if config.verbose:
        print("\n🚀 Starting Hierarchical Clustering Generator")
        print("=" * 55)
        print(f"Output directory: {config.output_dir.resolve()}")
        print(f"K range: {config.k_values}")
        print(f"Color families: {config.n_color_families}")
        print(f"Sample fraction: {config.sample_fraction:.0%}")
    if config.output_dir.exists() and not config.overwrite_existing:
        print(f"⌛ Output directory exists, skipping: {config.output_dir}")
        return
    segset = SegSet.from_embeddings(
        embeddings_flat, metadata["shape"]
    ).with_kmeans_range(
        config.k_values,
        sample_fraction=config.sample_fraction,
        random_state=config.random_seed,
        verbose=config.verbose,
    )
    color_mapper, color_meta = create_hierarchical_color_mapper(
        segset,
        n_color_families=config.n_color_families,
        random_state=config.random_seed,
        verbose=config.verbose,
    )
    results = export_animation_geotiffs(
        segset,
        color_mapper,
        metadata,
        config.output_dir,
        verbose=config.verbose,
    )
    if config.verbose:
        print("✅ Hierarchical clustering generation complete!")
        print(f"📁 {len(results['exported_files'])} cluster rasters")
        print("🎨 1 color legend file")
        print("📄 1 manifest file")

def main():
    project_root = Path(__file__).parent.parent
    try:
        config = load_config(project_root)
        cluster_config = ClusterConfig.from_config(config)
        verbose = cluster_config.verbose
        cluster_config.validate()
        if verbose:
            print(f"AOI: {config['aoi_name']}")
            print(f"Input file: {cluster_config.aef_file.resolve()}")
        if verbose:
            print(f"\n📊 Loading AEF embeddings from {cluster_config.aef_file.name}...")
        embeddings, metadata = load_aef_embeddings(cluster_config.aef_file)
        embeddings_flat = reshape_for_clustering(embeddings)
        if verbose:
            valid_pixels = (~np.isnan(embeddings_flat).any(axis=1)).sum()
            print(
                f"✓ Loaded. Valid pixels: {valid_pixels:,} / {len(embeddings_flat):,}"
            )
        generate_hierarchical_clusters(cluster_config, embeddings_flat, metadata)
        if verbose:
            print("\n🎉 Hierarchical clustering generation complete!")
            print("\nOutput directory:")
            print(f"  📊 Clusters: {cluster_config.output_dir}")
            print("\nContents:")
            print("  • Raw cluster GeoTIFFs (int16, single band)")
            print("  • color_legend.json (RGB/hex color mappings)")
            print("  • manifest.json (processing stats)")
            print("  • web_config.json (client integration info)")
    except Exception as e:
        print(f"❌ An error occurred: {e}")
        if cluster_config.verbose if "cluster_config" in locals() else True:
            traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
