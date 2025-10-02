import { Raster } from "./raster.js";
import { ClusterRegistry } from "./cluster-registry.js";
import { CLUSTER_ID_RANGES } from "../utils.js";

/**
 * Raster with associated cluster metadata registry.
 * Ensures lookups always use the correct registry for the raster's values.
 */
class SegmentedRaster {
  /**
   * @param {Raster} raster - Value container
   * @param {ClusterRegistry} registry - Metadata for clusters in this raster
   */
  constructor(raster, registry) {
    this._raster = raster;
    this._registry = registry;

    Object.freeze(this);
  }

  /**
   * Create from legacy Segmentation object.
   * @param {Object} segmentation - Legacy Segmentation with georaster and clusters Map
   * @returns {SegmentedRaster}
   */
  static fromSegmentation(segmentation) {
    const raster = Raster.fromGeoRaster(segmentation.georaster);
    const registry = ClusterRegistry.fromClustersMap(segmentation.clusters);
    return new SegmentedRaster(raster, registry);
  }

  /**
   * Create empty segmented raster with same georeferencing.
   * @param {Raster} referenceRaster - Raster to copy georeferencing from
   * @param {number} fillValue - Initial value for all pixels
   * @returns {SegmentedRaster}
   */
  static createEmpty(referenceRaster, fillValue = CLUSTER_ID_RANGES.NODATA) {
    const raster = referenceRaster.createEmpty(fillValue);
    const registry = new ClusterRegistry();
    return new SegmentedRaster(raster, registry);
  }

  get raster() {
    return this._raster;
  }

  get registry() {
    return this._registry;
  }

  get width() {
    return this._raster.width;
  }

  get height() {
    return this._raster.height;
  }

  get georeferencing() {
    return this._raster.georeferencing;
  }

  /**
   * Get cluster ID at pixel coordinates.
   * @param {number} x - Pixel column
   * @param {number} y - Pixel row
   * @returns {number|null}
   */
  getClusterId(x, y) {
    return this._raster.get(x, y);
  }

  /**
   * Get cluster metadata at pixel coordinates.
   * @param {number} x - Pixel column
   * @param {number} y - Pixel row
   * @returns {Object|null} Cluster metadata or null
   */
  getCluster(x, y) {
    const clusterId = this._raster.get(x, y);
    if (clusterId === null) {
      return null;
    }
    return this._registry.get(clusterId);
  }

  /**
   * Get cluster metadata by ID.
   * @param {number} clusterId
   * @returns {Object|null}
   */
  getClusterById(clusterId) {
    return this._registry.get(clusterId);
  }

  /**
   * Get classification path at pixel coordinates.
   * @param {number} x - Pixel column
   * @param {number} y - Pixel row
   * @returns {string} Classification path or "unlabeled"
   */
  getClassification(x, y) {
    const clusterId = this._raster.get(x, y);
    if (clusterId === null) {
      return "unlabeled";
    }
    return this._registry.getClassification(clusterId);
  }

  /**
   * Get classification path at lat/lng.
   * @param {{lat: number, lng: number}} latlng
   * @returns {string|null} Classification path or null if out of bounds
   */
  getClassificationAt(latlng) {
    const pixel = this._raster.latlngToPixel(latlng);
    if (!pixel) {
      return null;
    }
    return this.getClassification(pixel.x, pixel.y);
  }

  /**
   * Get color at pixel coordinates.
   * @param {number} x - Pixel column
   * @param {number} y - Pixel row
   * @returns {string|null}
   */
  getColor(x, y) {
    const clusterId = this._raster.get(x, y);
    if (clusterId === null) {
      return null;
    }
    return this._registry.getColor(clusterId);
  }

  /**
   * Update classification for a cluster.
   * Creates new SegmentedRaster with updated registry.
   * @param {number} clusterId
   * @param {string} classificationPath
   * @param {string|null} color
   * @returns {SegmentedRaster}
   */
  setClassification(clusterId, classificationPath, color) {
    const newRegistry = this._registry.clone();
    newRegistry.updateClassification(clusterId, classificationPath, color);
    return new SegmentedRaster(this._raster, newRegistry);
  }

  /**
   * Get all cluster metadata.
   * @returns {Object[]}
   */
  getAllClusters() {
    return this._registry.getAllClusters();
  }

  /**
   * Get all cluster IDs present in this raster.
   * @returns {number[]}
   */
  getAllClusterIds() {
    return this._registry.getAllIds();
  }

  /**
   * Get color map for rendering.
   * @returns {Map<number, string>}
   */
  getColorMap() {
    return this._registry.toColorMap();
  }

  /**
   * Build registry by counting pixels and applying color function.
   * Useful when creating new segmented raster from raw cluster values.
   * @param {function(number): {classificationPath: string, color: string|null}} colorFn
   * @returns {SegmentedRaster}
   */
  buildRegistry(colorFn) {
    const pixelCounts = new Map();

    // Count pixels per cluster
    this._raster.forEach((coord, value) => {
      if (value !== CLUSTER_ID_RANGES.NODATA) {
        pixelCounts.set(value, (pixelCounts.get(value) || 0) + 1);
      }
    });

    // Build new registry
    const newRegistry = new ClusterRegistry();
    pixelCounts.forEach((count, clusterId) => {
      const { classificationPath, color } = colorFn(clusterId);
      newRegistry.add(clusterId, count, classificationPath, color);
    });

    return new SegmentedRaster(this._raster, newRegistry);
  }

  /**
   * Create new SegmentedRaster with transformed raster values.
   * Registry is preserved but pixel counts will be stale.
   * @param {function({x: number, y: number}, number): number} fn
   * @returns {SegmentedRaster}
   */
  mapRaster(fn) {
    const newRaster = this._raster.map(fn);
    return new SegmentedRaster(newRaster, this._registry);
  }

  /**
   * Create new SegmentedRaster with different registry.
   * Raster values are preserved.
   * @param {ClusterRegistry} newRegistry
   * @returns {SegmentedRaster}
   */
  withRegistry(newRegistry) {
    return new SegmentedRaster(this._raster, newRegistry);
  }

  /**
   * Export to legacy Segmentation-compatible object.
   * @param {string} key - Segmentation key
   * @param {Object} metadata - Additional metadata
   * @returns {Object}
   */
  toSegmentation(key, metadata = {}) {
    return {
      key,
      georaster: this._raster.toGeoRaster(),
      clusters: this._registry.toClustersMap(),
      colorMapping: this._registry.toColorMapping(),
      metadata: {
        source: "segmented_raster",
        ...metadata,
      },
      // Legacy API methods
      getCluster: (clusterId) => this._registry.get(clusterId),
      getAllClusters: () => this._registry.getAllClusters(),
      getColors: () => this._registry.toColorMap(),
    };
  }

  /**
   * Export raster values as 2D array (for mutation operations).
   * Use sparingly - prefer immutable operations.
   * @returns {number[][]}
   */
  cloneValues() {
    return this._raster.cloneValues();
  }
}

export { SegmentedRaster };
