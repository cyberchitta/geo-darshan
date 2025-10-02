import { Raster } from "./raster.js";
import { ClusterRegistry } from "./cluster-registry.js";
import { SegmentedRaster } from "./segmented-raster.js";
import { CLUSTER_ID_RANGES } from "../utils.js";

/**
 * Static methods for raster transformation operations.
 * All methods return new instances (immutable transformations).
 */
class RasterTransform {
  /**
   * Create new Raster by applying function to each pixel value.
   * @param {Raster} raster
   * @param {function({x: number, y: number}, number): number} fn
   * @returns {Raster}
   */
  static mapValues(raster, fn) {
    return raster.map(fn);
  }

  /**
   * Aggregate multiple segmented rasters into one, prioritizing labeled clusters.
   * @param {SegmentedRaster[]} segmentedRastersWithKeys - Rasters to aggregate (priority order)
   * @param {Object} options - Aggregation options
   * @param {string} options.priority - "highest_k" | "lowest_k" | "most_specific"
   * @returns {SegmentedRaster} New raster with aggregated values and combined registry
   */
  static aggregate(
    segmentedRastersWithKeys,
    options = { priority: "highest_k" }
  ) {
    if (segmentedRastersWithKeys.length === 0) {
      throw new Error("Cannot aggregate empty array of rasters");
    }
    const sorted = segmentedRastersWithKeys;
    const refRaster = sorted[0].segRaster.raster;
    const height = refRaster.height;
    const width = refRaster.width;
    // Create unique ID mapping for all labeled clusters
    let nextUniqueId = 1;
    const clusterIdMapping = new Map();
    const newRegistry = new ClusterRegistry();
    // First pass: assign unique IDs to all labeled clusters
    for (const { segRaster, key } of sorted) {
      const clusters = segRaster.getAllClusters();
      clusters.forEach((cluster) => {
        if (
          cluster.classificationPath &&
          cluster.classificationPath !== "unlabeled"
        ) {
          const mapKey = `${cluster.id}_${key}`;
          const uniqueId = nextUniqueId++;
          clusterIdMapping.set(mapKey, {
            uniqueId,
            originalId: cluster.id,
            sourceRaster: segRaster,
            classificationPath: cluster.classificationPath,
            color: cluster.color,
          });
          newRegistry.add(
            uniqueId,
            0,
            cluster.classificationPath,
            cluster.color
          );
        }
      });
    }
    // Second pass: assign pixels to labeled clusters or UNLABELED
    const aggregatedValues = Array(height);
    const pixelCounts = new Map();
    for (let y = 0; y < height; y++) {
      aggregatedValues[y] = Array(width);
      for (let x = 0; x < width; x++) {
        const refValue = refRaster.get(x, y);
        if (refValue === CLUSTER_ID_RANGES.NODATA) {
          aggregatedValues[y][x] = CLUSTER_ID_RANGES.NODATA;
          continue;
        }
        let assignedId = CLUSTER_ID_RANGES.UNLABELED;
        // Check each raster in priority order
        for (const { segRaster, key } of sorted) {
          const clusterId = segRaster.getClusterId(x, y);
          const cluster = segRaster.getClusterById(clusterId);
          if (
            cluster?.classificationPath &&
            cluster.classificationPath !== "unlabeled"
          ) {
            const mapKey = `${clusterId}_${key}`;
            const mapping = clusterIdMapping.get(mapKey);
            if (mapping) {
              assignedId = mapping.uniqueId;
              break;
            }
          }
        }
        aggregatedValues[y][x] = assignedId;
        if (assignedId !== CLUSTER_ID_RANGES.UNLABELED) {
          pixelCounts.set(assignedId, (pixelCounts.get(assignedId) || 0) + 1);
        }
      }
    }
    pixelCounts.forEach((count, clusterId) => {
      newRegistry.updatePixelCount(clusterId, count);
    });
    const aggregatedRaster = new Raster(
      aggregatedValues,
      refRaster.georeferencing,
      refRaster.metadata
    );
    return new SegmentedRaster(aggregatedRaster, newRegistry);
  }

  /**
   * Compare two rasters by priority rule.
   * @private
   */
  static _comparePriority(rasterA, rasterB, priority) {
    // For now, simple comparison - can be extended based on metadata
    switch (priority) {
      case "highest_k":
        return -1; // Maintain order
      case "lowest_k":
        return 1; // Reverse order
      case "most_specific":
        return -1; // Maintain order (assumes sorted by specificity)
      default:
        return -1;
    }
  }

  /**
   * Merge two rasters using decision function.
   * @param {Raster} rasterA
   * @param {Raster} rasterB
   * @param {function(number, number, {x: number, y: number}): number} decideFn
   * @returns {Raster}
   */
  static merge(rasterA, rasterB, decideFn) {
    if (rasterA.width !== rasterB.width || rasterA.height !== rasterB.height) {
      throw new Error("Cannot merge rasters with different dimensions");
    }

    const mergedValues = Array(rasterA.height);

    for (let y = 0; y < rasterA.height; y++) {
      mergedValues[y] = Array(rasterA.width);
      for (let x = 0; x < rasterA.width; x++) {
        const valueA = rasterA.get(x, y);
        const valueB = rasterB.get(x, y);
        mergedValues[y][x] = decideFn(valueA, valueB, { x, y });
      }
    }

    return new Raster(mergedValues, rasterA.georeferencing);
  }

  /**
   * Find contiguous region starting from seed pixel.
   * @param {Raster} raster
   * @param {number} x - Seed pixel column
   * @param {number} y - Seed pixel row
   * @param {function(number, number): boolean} matchFn - Should neighbor be included?
   * @param {number} maxPixels - Maximum region size
   * @param {boolean} includeDiagonal - Include diagonal neighbors
   * @returns {{x: number, y: number}[]} Array of pixel coordinates in region
   */
  static findRegion(
    raster,
    x,
    y,
    matchFn,
    maxPixels = CLUSTER_ID_RANGES.SYNTHETIC_START,
    includeDiagonal = true
  ) {
    const visited = new Set();
    const region = [];
    const queue = [{ x, y }];
    const seedValue = raster.get(x, y);

    if (seedValue === null) {
      return [];
    }

    while (queue.length > 0 && region.length < maxPixels) {
      const pixel = queue.shift();
      const key = `${pixel.x},${pixel.y}`;

      if (visited.has(key)) continue;
      visited.add(key);

      const pixelValue = raster.get(pixel.x, pixel.y);

      if (matchFn(seedValue, pixelValue)) {
        region.push(pixel);
        const neighbors = raster.getNeighbors(
          pixel.x,
          pixel.y,
          includeDiagonal
        );
        neighbors.forEach((neighbor) => queue.push(neighbor));
      }
    }

    return region;
  }

  /**
   * Aggregate segmented raster by grouping clusters with same key.
   * @param {SegmentedRaster} segmentedRaster
   * @param {function(number, Object): string} keyFn - Generate key from cluster ID and metadata
   * @returns {SegmentedRaster}
   */
  static aggregateByKey(segmentedRaster, keyFn) {
    const keyToId = new Map();
    const pixelCounts = new Map();
    let nextId = 1;

    // First pass: build key mapping
    const values = segmentedRaster.cloneValues();

    for (let y = 0; y < values.length; y++) {
      for (let x = 0; x < values[y].length; x++) {
        const clusterId = values[y][x];

        if (clusterId === CLUSTER_ID_RANGES.NODATA) continue;

        const cluster = segmentedRaster.getClusterById(clusterId);
        const key = keyFn(clusterId, cluster);

        if (!keyToId.has(key)) {
          keyToId.set(key, nextId++);
        }

        const newId = keyToId.get(key);
        values[y][x] = newId;

        pixelCounts.set(newId, (pixelCounts.get(newId) || 0) + 1);
      }
    }

    // Second pass: build registry for aggregated clusters
    const newRegistry = new ClusterRegistry();
    const keyMetadata = new Map();

    // Collect metadata for each key
    segmentedRaster.raster.forEach((coord, clusterId) => {
      if (clusterId === CLUSTER_ID_RANGES.NODATA) return;

      const cluster = segmentedRaster.getClusterById(clusterId);
      const key = keyFn(clusterId, cluster);

      if (!keyMetadata.has(key) && cluster) {
        keyMetadata.set(key, {
          classificationPath: cluster.classificationPath,
          color: cluster.color,
        });
      }
    });

    // Add aggregated clusters to registry
    keyToId.forEach((newId, key) => {
      const metadata = keyMetadata.get(key);
      const count = pixelCounts.get(newId) || 0;

      newRegistry.add(
        newId,
        count,
        metadata?.classificationPath || "unlabeled",
        metadata?.color || null
      );
    });

    const newRaster = new Raster(values, segmentedRaster.georeferencing);
    return new SegmentedRaster(newRaster, newRegistry);
  }

  /**
   * Remap cluster IDs using mapping function.
   * @param {Raster} raster
   * @param {function(number): number} mappingFn
   * @returns {Raster}
   */
  static remap(raster, mappingFn) {
    return raster.map((coord, value) => mappingFn(value));
  }

  /**
   * Count pixels per unique value.
   * @param {Raster} raster
   * @param {number} nodataValue - Value to exclude from counts
   * @returns {Map<number, number>} Map of value to pixel count
   */
  static countPixels(raster, nodataValue = CLUSTER_ID_RANGES.NODATA) {
    const counts = new Map();

    raster.forEach((coord, value) => {
      if (value !== nodataValue) {
        counts.set(value, (counts.get(value) || 0) + 1);
      }
    });

    return counts;
  }

  /**
   * Create segmented raster from raw values and color function.
   * @param {Raster} raster
   * @param {function(number): {classificationPath: string, color: string|null}} colorFn
   * @returns {SegmentedRaster}
   */
  static createSegmented(raster, colorFn) {
    const pixelCounts = this.countPixels(raster);
    const registry = new ClusterRegistry();

    pixelCounts.forEach((count, clusterId) => {
      const { classificationPath, color } = colorFn(clusterId);
      registry.add(clusterId, count, classificationPath, color);
    });

    return new SegmentedRaster(raster, registry);
  }

  /**
   * Replace values in region with new value.
   * @param {Raster} raster
   * @param {{x: number, y: number}[]} region
   * @param {number} newValue
   * @returns {Raster}
   */
  static fillRegion(raster, region, newValue) {
    const values = raster.cloneValues();

    region.forEach((pixel) => {
      values[pixel.y][pixel.x] = newValue;
    });

    return new Raster(values, raster.georeferencing);
  }

  /**
   * Extract subset of raster by cluster IDs.
   * @param {SegmentedRaster} segmentedRaster
   * @param {Set<number>} clusterIds - IDs to keep
   * @param {number} fillValue - Value for excluded pixels
   * @returns {SegmentedRaster}
   */
  static filterClusters(
    segmentedRaster,
    clusterIds,
    fillValue = CLUSTER_ID_RANGES.NODATA
  ) {
    const newRaster = segmentedRaster.raster.map((coord, value) =>
      clusterIds.has(value) ? value : fillValue
    );

    const newRegistry = new ClusterRegistry();
    clusterIds.forEach((clusterId) => {
      const cluster = segmentedRaster.getClusterById(clusterId);
      if (cluster) {
        newRegistry.add(
          clusterId,
          cluster.pixelCount,
          cluster.classificationPath,
          cluster.color
        );
      }
    });

    return new SegmentedRaster(newRaster, newRegistry);
  }
}

export { RasterTransform };
