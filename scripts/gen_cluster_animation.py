#!/usr/bin/env python3
"""
Generate hierarchical clustering and land cover core animation GeoTIFFs for
web visualization.

Configuration is embedded in this file. Edit the CONFIG sections below
to customize parameters.
"""

import sys
from pathlib import Path
import json
from dataclasses import dataclass, field
from typing import List, Dict, Any
import numpy as np

try:
    from alpha_bhu.data import load_aef_embeddings, reshape_for_clustering
    from alpha_bhu.segset import SegSet
    from alpha_bhu.color_assigner import create_hierarchical_color_mapper
    from alpha_bhu.export import export_animation_geotiffs, export_geotiffs
    from alpha_bhu.land_cover import export_cores_for_labeling
except ImportError as e:
    print(f"Error importing alpha-bhu: {e}")
    print("Ensure alpha-bhu is installed or in Python path")
    sys.exit(1)


# ============================================================================
# CONFIGURATION
# ============================================================================


@dataclass
class ClusterConfig:
    """Clustering animation configuration"""

    # Input/Output paths
    aef_file: Path = Path("data/aef_3.5k_roi_cog.tif")
    output_dir: Path = Path("output/cluster_animation")
    # Clustering parameters
    k_min: int = 8
    k_max: int = 24
    k_step: int = 2
    # Color mapping
    n_color_families: int = 8
    # Algorithm settings
    scenario: str = "exploration"
    random_seed: int = 42
    # Output control
    verbose: bool = True
    overwrite_existing: bool = True

    @property
    def k_range(self) -> List[int]:
        return list(range(self.k_min, self.k_max + 1, self.k_step))

    def validate(self) -> None:
        if not self.aef_file.exists():
            raise FileNotFoundError(f"AEF file not found: {self.aef_file}")
        if self.k_min >= self.k_max or self.k_step <= 0:
            raise ValueError("Invalid k_range parameters")
        if self.n_color_families < 2:
            raise ValueError("n_color_families must be >= 2")


@dataclass
class LandCoverConfig:
    """Land cover core discovery configuration"""

    # Input/Output paths
    aef_file: Path = Path("data/aef_3.5k_roi_cog.tif")
    output_dir: Path = Path("output/land_cover_candidates")
    # K-range for discovery
    k_values: List[int] = field(default_factory=lambda: [15, 18, 20, 22, 25, 30, 35])
    # Geometric filters
    min_area: int = 50
    min_coherence: float = 0.6
    # Algorithm settings
    scenario: str = "nesting_analysis"
    random_seed: int = 42
    # Output control
    verbose: bool = True
    overwrite_existing: bool = True

    def validate(self) -> None:
        if not self.aef_file.exists():
            raise FileNotFoundError(f"AEF file not found: {self.aef_file}")
        if self.min_area <= 0 or not (0 < self.min_coherence <= 1.0):
            raise ValueError("Invalid geometric filter parameters")


# --- EDIT YOUR CONFIGURATIONS HERE ---
CLUSTER_ANIMATION_CONFIG = ClusterConfig(
    output_dir=Path("output/cluster_animation"),
    k_min=8,
    k_max=24,
    k_step=2,
    n_color_families=8,
    scenario="exploration",
)

LAND_COVER_CONFIG = LandCoverConfig(
    output_dir=Path("output/land_cover_candidates"),
    k_values=[15, 18, 20, 22, 25, 30, 35],
    min_area=50,
    min_coherence=0.6,
    scenario="nesting_analysis",
)
# --- END OF CONFIGURATIONS ---


# ============================================================================
# GENERATION LOGIC
# ============================================================================


def generate_cluster_animation(
    config: ClusterConfig, embeddings_flat: np.ndarray, metadata: Dict[str, Any]
):
    """Generate hierarchical clustering animation GeoTIFFs."""
    if config.verbose:
        print("\n🚀 Starting Hierarchical Clustering Animation Generator")
        print("=" * 55)
        print(f"Output directory: {config.output_dir.resolve()}")
        print(f"K range: {config.k_range}")

    if config.output_dir.exists() and not config.overwrite_existing:
        print(f"❌ Output directory exists, skipping: {config.output_dir}")
        return

    # 1. Create SegSet and generate segmentations
    segset = SegSet.from_embeddings(
        embeddings_flat, metadata["shape"]
    ).with_kmeans_range(
        config.k_range,
        config.scenario,
        random_state=config.random_seed,
        verbose=config.verbose,
    )

    # 2. Create hierarchical color mapper
    color_mapper, color_meta = create_hierarchical_color_mapper(
        segset,
        n_color_families=config.n_color_families,
        random_state=config.random_seed,
        verbose=config.verbose,
    )

    # 3. Export animation GeoTIFFs
    results = export_animation_geotiffs(
        segset,
        color_mapper,
        metadata,
        config.output_dir,
        color_meta=color_meta,
        verbose=config.verbose,
    )

    # 4. Generate web integration config
    web_config = {
        "data_bounds": metadata["bounds"],
        "data_crs": str(metadata["crs"]),
        "files": results["manifest"]["files"],
        "k_values": config.k_range,
        "generated": results["manifest"]["generated"],
    }
    with open(config.output_dir / "web_config.json", "w") as f:
        json.dump(web_config, f, indent=2)

    if config.verbose:
        print("✅ Clustering animation generation complete!")
        print(f"🌐 Web config: {config.output_dir}/web_config.json")


def generate_land_cover_animation(
    config: LandCoverConfig, embeddings_flat: np.ndarray, metadata: Dict[str, Any]
):
    """Discover and export land cover core candidates."""
    if config.verbose:
        print("\n🎯 Starting Land Cover Core Discovery")
        print("=" * 55)
        print(f"Output directory: {config.output_dir.resolve()}")
        print(f"Discovery K values: {config.k_values}")

    if config.output_dir.exists() and not config.overwrite_existing:
        print(f"❌ Output directory exists, skipping: {config.output_dir}")
        return

    # 1. Create SegSet with segmentations needed for discovery
    segset = SegSet.from_embeddings(
        embeddings_flat, metadata["shape"]
    ).with_kmeans_range(
        config.k_values,
        config.scenario,
        random_state=config.random_seed,
        verbose=config.verbose,
    )

    # 2. Discover, color, and export cores
    results = export_cores_for_labeling(
        segset,
        metadata,
        config.output_dir,
        k_range=config.k_values,
        min_area=config.min_area,
        min_coherence=config.min_coherence,
        verbose=config.verbose,
    )

    # 3. Generate web integration config
    web_config = {
        "data_bounds": metadata["bounds"],
        "data_crs": str(metadata["crs"]),
        "files": list(results.get("exported_files", {}).values()),
        "cores_metadata_file": str(results.get("metadata_path", "")),
        "n_cores": results.get("metadata", {}).get("n_cores", 0),
    }
    with open(config.output_dir / "web_config.json", "w") as f:
        json.dump(web_config, f, indent=2, default=str)

    if config.verbose:
        print("✅ Land cover core discovery complete!")
        print(f"🌐 Web config: {config.output_dir}/web_config.json")


# ============================================================================
# MAIN SCRIPT
# ============================================================================


def main():
    """Run all configured data generation pipelines"""
    # Use the aef_file from the first config for data loading
    aef_file = CLUSTER_ANIMATION_CONFIG.aef_file
    verbose = CLUSTER_ANIMATION_CONFIG.verbose  # General verbosity

    try:
        # Validate configurations
        CLUSTER_ANIMATION_CONFIG.validate()
        LAND_COVER_CONFIG.validate()

        if verbose:
            print(f"Input file: {aef_file.resolve()}")

        # Load embeddings once
        if verbose:
            print(f"\n📊 Loading AEF embeddings from {aef_file.name}...")
        embeddings, metadata = load_aef_embeddings(aef_file)
        embeddings_flat = reshape_for_clustering(embeddings)
        if verbose:
            valid_pixels = (~np.isnan(embeddings_flat).any(axis=1)).sum()
            print(
                f"✓ Loaded. Valid pixels: {valid_pixels:,} / {len(embeddings_flat):,}"
            )

        # --- Run Pipelines ---
        generate_cluster_animation(CLUSTER_ANIMATION_CONFIG, embeddings_flat, metadata)
        generate_land_cover_animation(LAND_COVER_CONFIG, embeddings_flat, metadata)
        # --- End Pipelines ---

        if verbose:
            print("\n🎉 All generation tasks complete!")

    except Exception as e:
        print(f"❌ An error occurred: {e}")
        if verbose:
            import traceback

            traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
