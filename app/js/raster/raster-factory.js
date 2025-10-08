import { Raster } from "./raster.js";
import { SegmentedRaster } from "./segmented-raster.js";
import { ClusterRegistry } from "./cluster-registry.js";
import { RasterTransform } from "./raster-transform.js";
import { CLUSTER_ID_RANGES } from "../utils.js";

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
    const mergedRaster = RasterTransform.merge(
      compositeSegRaster.raster,
      currentSegRaster.raster,
      (compositeValue, currentValue) => {
        if (CLUSTER_ID_RANGES.isNoData(compositeValue)) {
          return CLUSTER_ID_RANGES.NODATA;
        }
        if (!CLUSTER_ID_RANGES.isUnlabeled(compositeValue)) {
          return compositeValue;
        }
        return currentValue + CLUSTER_ID_RANGES.FINE_GRAIN_START;
      }
    );
    const registry = new ClusterRegistry();
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
    currentSegRaster.getAllClusters().forEach((cluster) => {
      const fineGrainId = cluster.id + CLUSTER_ID_RANGES.FINE_GRAIN_START;
      registry.add(fineGrainId, cluster.pixelCount, "unlabeled", null);
    });
    const merged = new SegmentedRaster(mergedRaster, registry);
    return RasterTransform.aggregateByKey(merged, (clusterId, cluster) => {
      if (cluster.classificationPath !== "unlabeled") {
        return cluster.classificationPath;
      }
      return `unlabeled_${clusterId}`;
    });
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
   * Create SegmentedRaster from file data.
   * @param {string} key - Segmentation key
   * @param {Object} georaster - Georaster object
   * @param {Object} colorMapping - Color mapping
   * @param {Object} stats - File statistics
   * @returns {SegmentedRaster}
   */
  static fromFile(key, georaster, colorMapping, stats) {
    const raster = Raster.fromGeoRaster(georaster);
    const registry = new ClusterRegistry();
    const metadata = {
      key,
      source: "file",
      filename: stats?.filename,
      fileSize: stats?.file_size_mb,
    };
    const rasterWithMetadata = new Raster(
      raster.cloneValues(),
      raster.georeferencing,
      { ...raster.metadata, segmentation: metadata }
    );
    return new SegmentedRaster(rasterWithMetadata, registry);
  }

  /**
   * Create empty synthetic raster for user-created labels.
   * Replaces existing createSynthetic to include key metadata.
   * @param {string} key - Segmentation key
   * @param {Raster} referenceRaster - Reference raster for dimensions
   * @returns {SegmentedRaster}
   */
  static createSynthetic(key, referenceRaster) {
    const values = referenceRaster.cloneValues();
    let unlabeledPixelCount = 0;
    for (let y = 0; y < referenceRaster.height; y++) {
      for (let x = 0; x < referenceRaster.width; x++) {
        if (values[y][x] !== CLUSTER_ID_RANGES.NODATA) {
          values[y][x] = CLUSTER_ID_RANGES.UNLABELED;
          unlabeledPixelCount++;
        }
      }
    }
    const registry = new ClusterRegistry();
    registry.add(
      CLUSTER_ID_RANGES.UNLABELED,
      unlabeledPixelCount,
      "unlabeled",
      null
    );
    const metadata = {
      key,
      source: "user_labels",
      created: new Date().toISOString(),
    };
    const rasterWithMetadata = new Raster(
      values,
      referenceRaster.georeferencing,
      { ...referenceRaster.metadata, segmentation: metadata }
    );
    return new SegmentedRaster(rasterWithMetadata, registry);
  }

  /**
   * Create empty composite placeholder.
   * @param {string} key - Segmentation key
   * @param {Raster} referenceRaster - Reference raster for dimensions
   * @returns {SegmentedRaster}
   */
  static createCompositePlaceholder(key, referenceRaster) {
    const emptyRaster = referenceRaster.createEmpty(
      CLUSTER_ID_RANGES.UNLABELED
    );
    const registry = new ClusterRegistry();
    const metadata = {
      key,
      source: "composite_placeholder",
      created: new Date().toISOString(),
    };
    const rasterWithMetadata = new Raster(
      emptyRaster.cloneValues(),
      emptyRaster.georeferencing,
      { ...emptyRaster.metadata, segmentation: metadata }
    );
    return new SegmentedRaster(rasterWithMetadata, registry);
  }
}

export { RasterFactory };
