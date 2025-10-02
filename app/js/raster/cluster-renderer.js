import { CLUSTER_ID_RANGES } from "../utils.js";
import { rgbStringToObject, convertToGrayscale } from "../utils.js";

/**
 * Immutable renderer for source segmentation clusters.
 * Uses original cluster colors from color mapping, applying grayscale
 * to labeled clusters when in labeling mode.
 */
class ClusterRenderer {
  constructor(segmentedRaster, segmentationKey, options = {}) {
    this._segmentedRaster = segmentedRaster;
    this._segmentationKey = segmentationKey;
    this._interactionMode = options.interactionMode || "view";
    this._selectedCluster = options.selectedCluster || null;
    this._grayscaleLabeled = options.grayscaleLabeled || false;
    Object.freeze(this);
  }

  /**
   * Create new renderer with updated options.
   * @returns {ClusterRenderer}
   */
  withOptions(options) {
    return new ClusterRenderer(this._segmentedRaster, this._segmentationKey, {
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
    let color = cluster.color;
    if (!color) {
      return null;
    }
    if (
      this._grayscaleLabeled &&
      cluster.classificationPath &&
      cluster.classificationPath !== "unlabeled"
    ) {
      color = this._toGrayscale(color);
    }
    return color;
  }

  _isSelected(clusterId) {
    return (
      this._selectedCluster?.clusterId === clusterId &&
      this._selectedCluster?.segmentationKey === this._segmentationKey
    );
  }

  _toGrayscale(rgbString) {
    if (!rgbString) return null;
    const colorObj = rgbStringToObject(rgbString);
    if (!colorObj) return rgbString;
    const gray = convertToGrayscale(colorObj);
    return `rgba(${gray.r}, ${gray.g}, ${gray.b}, ${gray.a / 255})`;
  }
}

export { ClusterRenderer };
