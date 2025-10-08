/**
 * Registry mapping cluster IDs to their metadata.
 * Mutable internally but provides controlled access.
 */
class ClusterRegistry {
  constructor() {
    this._clusters = new Map();
  }

  /**
   * Create registry from existing clusters Map (legacy format).
   * @param {Map<number, Object>} clustersMap - Map of cluster ID to cluster object
   * @returns {ClusterRegistry}
   */
  static fromClustersMap(clustersMap) {
    const registry = new ClusterRegistry();
    clustersMap.forEach((cluster, id) => {
      registry.add(
        id,
        cluster.pixelCount,
        cluster.classificationPath,
        cluster.color
      );
    });
    return registry;
  }

  /**
   * Add or update cluster metadata.
   * @param {number} clusterId
   * @param {number} pixelCount
   * @param {string} classificationPath
   * @param {string|null} color - RGB string or null for unlabeled
   */
  add(clusterId, pixelCount, classificationPath, color) {
    this._clusters.set(clusterId, {
      id: clusterId,
      pixelCount,
      classificationPath: classificationPath || "unlabeled",
      color,
      area_ha: (pixelCount * 0.01).toFixed(2),
    });
  }

  /**
   * Get cluster metadata by ID.
   * @param {number} clusterId
   * @returns {Object|null} Cluster metadata or null if not found
   */
  get(clusterId) {
    return this._clusters.get(clusterId) || null;
  }

  /**
   * Check if cluster exists.
   * @param {number} clusterId
   * @returns {boolean}
   */
  has(clusterId) {
    return this._clusters.has(clusterId);
  }

  /**
   * Get classification path for cluster.
   * @param {number} clusterId
   * @returns {string} Classification path or "unlabeled"
   */
  getClassification(clusterId) {
    const cluster = this._clusters.get(clusterId);
    return cluster?.classificationPath || "unlabeled";
  }

  /**
   * Get color for cluster.
   * @param {number} clusterId
   * @returns {string|null}
   */
  getColor(clusterId) {
    const cluster = this._clusters.get(clusterId);
    return cluster?.color || null;
  }

  /**
   * Update classification for existing cluster.
   * @param {number} clusterId
   * @param {string} classificationPath
   * @param {string|null} color
   * @returns {boolean} True if cluster existed and was updated
   */
  updateClassification(clusterId, classificationPath, color) {
    const cluster = this._clusters.get(clusterId);
    if (!cluster) {
      return false;
    }
    cluster.classificationPath = classificationPath;
    cluster.color = color;
    return true;
  }

  /**
   * Update pixel count for cluster (e.g., after region operations).
   * @param {number} clusterId
   * @param {number} pixelCount
   * @returns {boolean} True if cluster existed and was updated
   */
  updatePixelCount(clusterId, pixelCount) {
    const cluster = this._clusters.get(clusterId);
    if (!cluster) {
      return false;
    }
    cluster.pixelCount = pixelCount;
    cluster.area_ha = (pixelCount * 0.01).toFixed(2);
    return true;
  }

  /**
   * Remove cluster from registry.
   * @param {number} clusterId
   * @returns {boolean} True if cluster existed and was removed
   */
  remove(clusterId) {
    return this._clusters.delete(clusterId);
  }

  /**
   * Get all cluster IDs.
   * @returns {number[]}
   */
  getAllIds() {
    return Array.from(this._clusters.keys());
  }

  /**
   * Get all clusters as array.
   * @returns {Object[]}
   */
  getAllClusters() {
    return Array.from(this._clusters.values());
  }

  /**
   * Get number of clusters.
   * @returns {number}
   */
  size() {
    return this._clusters.size;
  }

  /**
   * Export to color mapping format for georaster rendering.
   * @returns {Map<number, string>} Map of cluster ID to color
   */
  toColorMap() {
    const colorMap = new Map();
    this._clusters.forEach((cluster, id) => {
      colorMap.set(id, cluster.color);
    });
    return colorMap;
  }

  /**
   * Export to color mapping format with RGB arrays (legacy format).
   * @returns {Object} {colors_rgb: number[][], nodata_value: number}
   */
  toColorMapping() {
    const colorsRgb = [];
    this._clusters.forEach((cluster, id) => {
      if (cluster.color === null) {
        colorsRgb[id] = null;
      } else {
        colorsRgb[id] = this._parseRgbColor(cluster.color);
      }
    });
    return {
      method: "cluster_specific",
      colors_rgb: colorsRgb,
      nodata_value: -1,
    };
  }

  /**
   * Parse RGB color string to normalized array.
   * @private
   * @param {string} colorString - "rgb(r, g, b)" format
   * @returns {number[]} [r/255, g/255, b/255]
   */
  _parseRgbColor(colorString) {
    const match = colorString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) {
      return [0.5, 0.5, 0.5]; // Gray fallback
    }
    return [
      parseInt(match[1]) / 255,
      parseInt(match[2]) / 255,
      parseInt(match[3]) / 255,
    ];
  }

  /**
   * Create a shallow copy of the registry.
   * @returns {ClusterRegistry}
   */
  clone() {
    const newRegistry = new ClusterRegistry();
    this._clusters.forEach((cluster, id) => {
      newRegistry.add(
        id,
        cluster.pixelCount,
        cluster.classificationPath,
        cluster.color
      );
    });
    return newRegistry;
  }

  /**
   * Export to legacy clusters Map format.
   * @returns {Map<number, Object>}
   */
  toClustersMap() {
    return new Map(this._clusters);
  }
}

export { ClusterRegistry };
