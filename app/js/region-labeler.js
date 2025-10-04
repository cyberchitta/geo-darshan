// app/js/region-labeler.js
import { Raster } from "./raster/raster.js";
import { SegmentedRaster } from "./raster/segmented-raster.js";
import { RasterTransform } from "./raster/raster-transform.js";
import { ClassificationHierarchy } from "./classification.js";
import { CLUSTER_ID_RANGES } from "./utils.js";

/**
 * Pure functional service for region labeling operations.
 * All methods are static - no mutable state.
 */
class RegionLabeler {
  /**
   * Convert lat/lng to pixel coordinates.
   * @param {{lat: number, lng: number}} latlng
   * @param {SegmentedRaster} interactiveSegRaster
   * @returns {{x: number, y: number}|null}
   */
  static latlngToPixelCoord(latlng, interactiveSegRaster) {
    return interactiveSegRaster.raster.latlngToPixel(latlng);
  }

  /**
   * Check if pixel is unlabeled.
   * @param {{x: number, y: number}} pixelCoord
   * @param {SegmentedRaster} interactiveSegRaster
   * @returns {boolean}
   */
  static isPixelUnlabeled(pixelCoord, interactiveSegRaster) {
    const clusterId = interactiveSegRaster.getClusterId(
      pixelCoord.x,
      pixelCoord.y
    );
    const cluster = interactiveSegRaster.getClusterById(clusterId);
    if (!cluster) return true;
    return (
      !cluster.classificationPath || cluster.classificationPath === "unlabeled"
    );
  }

  /**
   * Find contiguous region starting from seed pixel.
   * @param {{x: number, y: number}} startPixel
   * @param {SegmentedRaster} interactiveSegRaster
   * @param {number} maxPixels
   * @param {boolean} diagonalConnections
   * @returns {{x: number, y: number}[]}
   */
  static findContiguousRegion(
    startPixel,
    interactiveSegRaster,
    maxPixels = CLUSTER_ID_RANGES.SYNTHETIC_START,
    diagonalConnections = true
  ) {
    const startClusterId = interactiveSegRaster.raster.get(
      startPixel.x,
      startPixel.y
    );
    return RasterTransform.findRegion(
      interactiveSegRaster.raster,
      startPixel.x,
      startPixel.y,
      (seedValue, pixelValue) => pixelValue === seedValue,
      maxPixels,
      diagonalConnections
    );
  }

  /**
   * Label a region by creating/updating synthetic cluster.
   * Returns new synthetic SegmentedRaster and synthetic ID.
   * @param {{x: number, y: number}[]} region - Pixels to label
   * @param {string} classificationPath
   * @param {SegmentedRaster} syntheticSegRaster - Current synthetic raster
   * @param {number} hierarchyLevel
   * @returns {{syntheticSegRaster: SegmentedRaster, syntheticId: number}}
   */
  static labelRegion(
    region,
    classificationPath,
    syntheticSegRaster,
    hierarchyLevel = null
  ) {
    if (!syntheticSegRaster) {
      throw new Error("Synthetic segmented raster not provided");
    }
    const syntheticId = this.getOrCreateSyntheticId(
      classificationPath,
      syntheticSegRaster
    );
    const syntheticValues = syntheticSegRaster.cloneValues();
    region.forEach((pixel) => {
      syntheticValues[pixel.y][pixel.x] = syntheticId;
    });
    const updatedRaster = new Raster(
      syntheticValues,
      syntheticSegRaster.georeferencing,
      syntheticSegRaster.raster.metadata
    );
    const color = ClassificationHierarchy.getColorForClassification(
      classificationPath,
      hierarchyLevel
    );
    const newRegistry = syntheticSegRaster.registry.clone();
    if (newRegistry.has(syntheticId)) {
      const existingCluster = newRegistry.get(syntheticId);
      newRegistry.updatePixelCount(
        syntheticId,
        existingCluster.pixelCount + region.length
      );
    } else {
      newRegistry.add(syntheticId, region.length, classificationPath, color);
    }
    const newSyntheticSegRaster = new SegmentedRaster(
      updatedRaster,
      newRegistry
    );
    console.log(
      `Labeled ${region.length} pixels as synthetic cluster ${syntheticId} (${classificationPath})`
    );
    return {
      syntheticSegRaster: newSyntheticSegRaster,
      syntheticId,
    };
  }

  /**
   * Analyze neighboring pixels to suggest classifications.
   * @param {{x: number, y: number}[]} region
   * @param {SegmentedRaster} interactiveSegRaster
   * @returns {{classificationPath: string, count: number}[]}
   */
  static analyzeNeighborhood(region, interactiveSegRaster) {
    const adjacentLabels = new Map();
    for (const pixel of region) {
      const neighbors = interactiveSegRaster.raster.getNeighbors(
        pixel.x,
        pixel.y,
        true
      );
      for (const neighbor of neighbors) {
        const clusterId = interactiveSegRaster.raster.get(
          neighbor.x,
          neighbor.y
        );
        const cluster = interactiveSegRaster.getClusterById(clusterId);
        if (
          cluster?.classificationPath &&
          cluster.classificationPath !== "unlabeled"
        ) {
          const currentCount =
            adjacentLabels.get(cluster.classificationPath) || 0;
          adjacentLabels.set(cluster.classificationPath, currentCount + 1);
        }
      }
    }
    return Array.from(adjacentLabels.entries())
      .map(([classificationPath, count]) => ({ classificationPath, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Convert pixel coordinates to lat/lng.
   * @param {{x: number, y: number}} pixel
   * @param {SegmentedRaster} interactiveSegRaster
   * @returns {{lat: number, lng: number}}
   */
  static pixelToLatLng(pixel, interactiveSegRaster) {
    return interactiveSegRaster.raster.pixelToLatlng(pixel.x, pixel.y);
  }

  /**
   * Get existing synthetic ID for classification or generate new one.
   * @param {string} classificationPath
   * @param {SegmentedRaster} syntheticSegRaster
   * @returns {number}
   */
  static getOrCreateSyntheticId(classificationPath, syntheticSegRaster) {
    const clusters = syntheticSegRaster.getAllClusters();
    for (const cluster of clusters) {
      if (cluster.classificationPath === classificationPath) {
        return cluster.id;
      }
    }
    return this.getNextSyntheticId(syntheticSegRaster);
  }

  /**
   * Calculate next available synthetic ID.
   * @param {SegmentedRaster} syntheticSegRaster
   * @returns {number}
   */
  static getNextSyntheticId(syntheticSegRaster) {
    const clusters = syntheticSegRaster.getAllClusters();
    const existingIds = clusters
      .map((c) => c.id)
      .filter((id) => CLUSTER_ID_RANGES.isSynthetic(id));
    if (existingIds.length === 0) {
      return CLUSTER_ID_RANGES.SYNTHETIC_START;
    }
    return Math.max(...existingIds) + 1;
  }
}

export { RegionLabeler };
