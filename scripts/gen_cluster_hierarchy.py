#!/usr/bin/env python3
"""
Generate hierarchical clustering GeoTIFFs for web visualization.

Configuration is loaded from config.yaml. Edit it to customize AOI parameters.
"""

import sys
from pathlib import Path
import json
from dataclasses import dataclass, field
from typing import List, Dict, Any
import numpy as np
import yaml

try:
    from alpha_bhu.data import load_aef_embeddings, reshape_for_clustering
    from alpha_bhu.segset import SegSet
    from alpha_bhu.color_assigner import create_hierarchical_color_mapper
    from alpha_bhu.export import export_animation_geotiffs
except ImportError as e:
    print(f"Error importing alpha-bhu: {e}")
    print("Ensure alpha-bhu is installed or in Python path")
    sys.exit(1)


# ============================================================================
# CONFIGURATION
# ============================================================================


@dataclass(frozen=True)
class ClusterConfig:
    """Immutable hierarchical clustering configuration"""

    # Input/Output paths
    aef_file: Path
    output_dir: Path
    # Clustering parameters
    k_values: List[int] = field(
        default_factory=lambda: [8, 10, 12, 14, 16, 18, 20, 22, 24]
    )
    # Color mapping
    n_color_families: int = 8
    # Algorithm settings
    scenario: str = "exploration"
    random_seed: int = 42
    # Output control
    verbose: bool = True
    overwrite_existing: bool = True

    @classmethod
    def from_range(
        cls, k_min: int, k_max: int, k_step: int = 2, **kwargs: Any
    ) -> "ClusterConfig":
        """Factory method to create config from k-range parameters."""
        k_values = list(range(k_min, k_max + 1, k_step))
        return cls(k_values=k_values, **kwargs)

    @classmethod
    def from_config(cls, aoi_config: Dict[str, Any]) -> "ClusterConfig":
        """Factory method to create config from AOI dict in yaml."""
        aef_file = (
            Path(aoi_config["output_dir"]) / "intermediates" / "stitched-esri.tif"
            if aoi_config["source"] == "esri"
            else Path(aoi_config["output_dir"])
            / "inputs"
            / "aef"
            / f"embedding-{aoi_config['date_range'][0].replace('-', '')}.tif"
        )
        output_dir = Path(aoi_config["output_dir"]) / "intermediates"
        k_values = aoi_config.get("k_values_cluster", cls.k_values)
        return cls(
            aef_file=aef_file,
            output_dir=output_dir,
            k_values=k_values,
            n_color_families=aoi_config.get("n_color_families", cls.n_color_families),
            scenario=aoi_config.get("scenario", cls.scenario),
            random_seed=aoi_config.get("random_seed", cls.random_seed),
            verbose=aoi_config.get("verbose", cls.verbose),
            overwrite_existing=aoi_config.get(
                "overwrite_existing", cls.overwrite_existing
            ),
        )

    @property
    def k_range(self) -> List[int]:
        """Backward compatibility property."""
        return self.k_values

    def validate(self) -> None:
        if not self.aef_file.exists():
            raise FileNotFoundError(f"AEF file not found: {self.aef_file}")
        if not self.k_values or len(self.k_values) == 0:
            raise ValueError("k_values cannot be empty")
        if self.n_color_families < 2:
            raise ValueError("n_color_families must be >= 2")


# ============================================================================
# GENERATION LOGIC
# ============================================================================


def generate_hierarchical_clusters(
    config: ClusterConfig, embeddings_flat: np.ndarray, metadata: Dict[str, Any]
):
    """Generate hierarchical clustering GeoTIFFs."""
    if config.verbose:
        print("\n🚀 Starting Hierarchical Clustering Generator")
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
        config.k_values,
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

    # 3. Export hierarchical GeoTIFFs (raw cluster rasters + color legend)
    results = export_animation_geotiffs(
        segset,
        color_mapper,
        metadata,
        config.output_dir,
        verbose=config.verbose,
    )

    # 4. Generate web integration config
    web_config = {
        "format_version": "1.0",
        "data_type": "hierarchical_clusters",
        "data_bounds": metadata["bounds"],
        "data_crs": str(metadata["crs"]),
        "cluster_files": [f.name for f in results["exported_files"].values()],
        "color_legend_file": "color_legend.json",
        "manifest_file": "manifest.json",
        "k_values": config.k_values,
        "nodata_value": -1,
        "color_method": "hierarchical",
        "n_color_families": config.n_color_families,
        "generated": results["manifest"]["generated"],
    }

    with open(config.output_dir / "web_config.json", "w") as f:
        json.dump(web_config, f, indent=2)

    if config.verbose:
        print("✅ Hierarchical clustering generation complete!")
        print(f"📁 {len(results['exported_files'])} cluster rasters")
        print("🎨 1 color legend file")
        print(f"🌐 Web config: {config.output_dir}/web_config.json")


# ============================================================================
# MAIN SCRIPT
# ============================================================================


def main():
    """Run hierarchical clustering generation pipeline"""
    # Load config from yaml
    config_path = Path(__file__).parent.parent / "config.yaml"
    if not config_path.exists():
        raise FileNotFoundError(f"config.yaml not found: {config_path}")
    with open(config_path) as f:
        config = yaml.safe_load(f)
    aoi_name = config["aoi"]["current"]
    aoi_config = config["aoi"][aoi_name]
    if aoi_config["source"] not in ["esri", "aef"]:
        raise ValueError(f"Unsupported source: {aoi_config['source']}")

    # Create config via factory
    CLUSTER_ANIMATION_CONFIG = ClusterConfig.from_config(aoi_config)

    verbose = CLUSTER_ANIMATION_CONFIG.verbose  # General verbosity

    try:
        # Validate configuration
        CLUSTER_ANIMATION_CONFIG.validate()

        if verbose:
            print(f"Input file: {CLUSTER_ANIMATION_CONFIG.aef_file.resolve()}")

        # Load embeddings once
        if verbose:
            print(
                f"\n📊 Loading AEF embeddings from {CLUSTER_ANIMATION_CONFIG.aef_file.name}..."
            )
        embeddings, metadata = load_aef_embeddings(CLUSTER_ANIMATION_CONFIG.aef_file)
        embeddings_flat = reshape_for_clustering(embeddings)
        if verbose:
            valid_pixels = (~np.isnan(embeddings_flat).any(axis=1)).sum()
            print(
                f"✓ Loaded. Valid pixels: {valid_pixels:,} / {len(embeddings_flat):,}"
            )

        # --- Run Pipeline ---
        generate_hierarchical_clusters(
            CLUSTER_ANIMATION_CONFIG, embeddings_flat, metadata
        )
        # --- End Pipeline ---

        if verbose:
            print("\n🎉 Hierarchical clustering generation complete!")
            print("\nOutput directory:")
            print(f"  📊 Clusters: {CLUSTER_ANIMATION_CONFIG.output_dir}")
            print("\nContents:")
            print("  • Raw cluster GeoTIFFs (int16, single band)")
            print("  • color_legend.json (RGB/hex color mappings)")
            print("  • manifest.json (processing stats)")
            print("  • web_config.json (client integration info)")

    except Exception as e:
        print(f"❌ An error occurred: {e}")
        if verbose:
            import traceback

            traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
