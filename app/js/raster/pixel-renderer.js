// app/js/raster/pixel-renderer.js
import { convertToGrayscale, rgbStringToObject } from "../utils.js";
import { ClassificationHierarchy } from "../classification.js";
import { CLUSTER_ID_RANGES } from "../utils.js";

/**
 * Immutable renderer for converting pixel values to colors.
 * Encapsulates color mapping logic including selection highlights,
 * grayscale conversion, and hierarchy-level colors.
 */
class PixelRenderer {
  constructor(segmentedRaster, options = {}) {
    this._segmentedRaster = segmentedRaster;
    this._hierarchyLevel = options.hierarchyLevel || 1;
    this._interactionMode = options.interactionMode || "view";
    this._selectedCluster = options.selectedCluster || null;
    this._grayscaleLabeled = options.grayscaleLabeled || false;
    this._colorCache = new Map();
    Object.freeze(this);
  }

  /**
   * Create new renderer with updated options.
   * @returns {PixelRenderer}
   */
  withOptions(options) {
    return new PixelRenderer(this._segmentedRaster, {
      hierarchyLevel: options.hierarchyLevel ?? this._hierarchyLevel,
      interactionMode: options.interactionMode ?? this._interactionMode,
      selectedCluster: options.selectedCluster ?? this._selectedCluster,
      grayscaleLabeled: options.grayscaleLabeled ?? this._grayscaleLabeled,
    });
  }

  /**
   * Main rendering function for georaster-layer.
   * Returns color string or null (transparent).
   * @param {number[]} values - Pixel values from georaster
   * @returns {string|null}
   */
  render(values) {
    if (!values || values.length === 0 || values[0] === 0) {
      return null;
    }
    const clusterId = values[0];
    if (CLUSTER_ID_RANGES.isNoData(clusterId)) {
      return null;
    }
    if (this._isSelected(clusterId)) {
      return "rgba(0, 0, 0, 1)";
    }
    const cluster = this._segmentedRaster.getClusterById(clusterId);
    if (!cluster) {
      return null;
    }
    if (
      !cluster.classificationPath ||
      cluster.classificationPath === "unlabeled"
    ) {
      return cluster.color;
    }
    if (this._grayscaleLabeled) {
      const hierarchyColor = this._resolveHierarchyColor(
        cluster.classificationPath
      );
      return this._toGrayscale(hierarchyColor);
    }
    return this._resolveHierarchyColor(cluster.classificationPath);
  }

  _isSelected(clusterId) {
    return (
      this._selectedCluster?.clusterId === clusterId &&
      this._selectedCluster?.segmentationKey === this._segmentedRaster.key
    );
  }

  _resolveHierarchyColor(classificationPath) {
    const cacheKey = `${classificationPath}:${this._hierarchyLevel}`;
    if (this._colorCache.has(cacheKey)) {
      return this._colorCache.get(cacheKey);
    }
    const color = ClassificationHierarchy.getColorForClassification(
      classificationPath,
      this._hierarchyLevel
    );
    this._colorCache.set(cacheKey, color);
    return color;
  }

  _toGrayscale(rgbString) {
    if (!rgbString) return null;
    const colorObj = rgbStringToObject(rgbString);
    if (!colorObj) return rgbString;
    const gray = convertToGrayscale(colorObj);
    return `rgba(${gray.r}, ${gray.g}, ${gray.b}, ${gray.a / 255})`;
  }
}

export { PixelRenderer };
