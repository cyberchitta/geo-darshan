import { Raster } from "./raster.js";
import { SegmentedRaster } from "./segmented-raster.js";
import { ClusterRegistry } from "./cluster-registry.js";
import { RasterTransform } from "./raster-transform.js";
import { CLUSTER_ID_RANGES } from "../utils.js";

/**
 * Factory for creating specialized SegmentedRaster instances.
 * Each factory method encapsulates domain-specific raster construction logic.
 */
class RasterFactory {
  /**
   * Create interactive raster for region labeling.
   * Merges composite (labeled) + current segmentation (unlabeled fine-grain).
   *
   * @param {SegmentedRaster} compositeSegRaster - Composite with labeled clusters
   * @param {SegmentedRaster} currentSegRaster - Current segmentation (k-means)
   * @returns {SegmentedRaster} Interactive raster with merged clusters
   */
  static createInteractive(compositeSegRaster, currentSegRaster) {
    // Merge rasters: composite clusters stay, current → fine-grain range
    const mergedRaster = RasterTransform.merge(
      compositeSegRaster.raster,
      currentSegRaster.raster,
      (compositeValue, currentValue) => {
        if (CLUSTER_ID_RANGES.isNoData(compositeValue)) {
          return CLUSTER_ID_RANGES.NODATA;
        }
        if (!CLUSTER_ID_RANGES.isUnlabeled(compositeValue)) {
          return compositeValue; // Keep labeled composite clusters
        }
        // Map current segmentation to fine-grain range
        return currentValue + CLUSTER_ID_RANGES.FINE_GRAIN_START;
      }
    );

    // Build registry from both sources
    const registry = new ClusterRegistry();

    // Add composite clusters (keep their classifications)
    compositeSegRaster.getAllClusters().forEach((cluster) => {
      if (!CLUSTER_ID_RANGES.isUnlabeled(cluster.id)) {
        registry.add(
          cluster.id,
          cluster.pixelCount,
          cluster.classificationPath,
          cluster.color
        );
      }
    });

    // Add current segmentation clusters as fine-grain unlabeled
    currentSegRaster.getAllClusters().forEach((cluster) => {
      const fineGrainId = cluster.id + CLUSTER_ID_RANGES.FINE_GRAIN_START;
      registry.add(fineGrainId, cluster.pixelCount, "unlabeled", null);
    });

    const merged = new SegmentedRaster(mergedRaster, registry);

    // Aggregate by classification path to deduplicate
    return RasterTransform.aggregateByKey(
      merged,
      (clusterId, cluster) => cluster.classificationPath
    );
  }

  /**
   * Create composite raster by aggregating labeled clusters across segmentations.
   * Priority: synthetic > highest-k > ... > lowest-k (by default).
   *
   * @param {Array<{segRaster: SegmentedRaster, key: string}>} segmentedRastersWithKeys
   * @param {Object} options - { priority: 'highest_k' | 'lowest_k' | 'most_specific' }
   * @returns {SegmentedRaster} Composite raster with aggregated labels
   */
  static createComposite(
    segmentedRastersWithKeys,
    options = { priority: "highest_k" }
  ) {
    return RasterTransform.aggregate(segmentedRastersWithKeys, options);
  }

  /**
   * Create empty synthetic raster for user-created labels.
   * All pixels initialized to NODATA.
   *
   * @param {Raster} referenceRaster - Reference raster for dimensions/georeferencing
   * @returns {SegmentedRaster} Empty raster ready for synthetic cluster creation
   */
  static createSynthetic(referenceRaster) {
    const emptyRaster = referenceRaster.createEmpty(CLUSTER_ID_RANGES.NODATA);
    const registry = new ClusterRegistry();
    return new SegmentedRaster(emptyRaster, registry);
  }
}

export { RasterFactory };
