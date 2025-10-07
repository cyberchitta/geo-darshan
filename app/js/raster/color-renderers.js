import { ClassificationHierarchy } from "../classification.js";
import {
  CLUSTER_ID_RANGES,
  rgbStringToObject,
  convertToGrayscale,
} from "../utils.js";

const PixelRenderUtils = Object.freeze({
  isSelected(clusterId, segmentationKey, selectedCluster) {
    return (
      selectedCluster?.clusterId === clusterId &&
      selectedCluster?.segmentationKey === segmentationKey
    );
  },
  toGrayscale(rgbString, alpha = 1) {
    if (!rgbString) return null;
    const colorObj = rgbStringToObject(rgbString);
    if (!colorObj) return rgbString;
    const gray = convertToGrayscale(colorObj);
    return `rgba(${gray.r}, ${gray.g}, ${gray.b}, ${alpha})`;
  },
  shouldGrayscaleLabeled(classificationPath, grayscaleLabeled) {
    return (
      grayscaleLabeled &&
      classificationPath &&
      classificationPath !== "unlabeled"
    );
  },
});

class ClusterRenderer {
  constructor(segmentedRaster, segmentationKey, options = {}) {
    this._segmentedRaster = segmentedRaster;
    this._segmentationKey = segmentationKey;
    this._interactionMode = options.interactionMode || "view";
    this._selectedCluster = options.selectedCluster || null;
    this._grayscaleLabeled = options.grayscaleLabeled || false;
  }

  update(options) {
    this._interactionMode = options.interactionMode ?? this._interactionMode;
    this._selectedCluster = options.selectedCluster ?? this._selectedCluster;
    this._grayscaleLabeled = options.grayscaleLabeled ?? this._grayscaleLabeled;
    return this;
  }

  render(values) {
    if (!values || values.length === 0) return null;
    const clusterId = values[0];
    if (CLUSTER_ID_RANGES.isNoData(clusterId)) return null;
    if (this._selectedCluster?.clusterId === clusterId) {
      return "rgba(0, 0, 0, 1)";
    }
    const cluster = this._segmentedRaster.getClusterById(clusterId);
    if (!cluster) return null;
    let color = cluster.color;
    if (!color) return null;
    if (
      PixelRenderUtils.shouldGrayscaleLabeled(
        cluster.classificationPath,
        this._grayscaleLabeled
      )
    ) {
      color = PixelRenderUtils.toGrayscale(color);
    }
    return color;
  }
}

class ClassificationRenderer {
  constructor(segmentedRaster, options = {}) {
    this._segmentedRaster = segmentedRaster;
    this._hierarchyLevel = options.hierarchyLevel || 1;
    this._interactionMode = options.interactionMode || "view";
    this._selectedCluster = options.selectedCluster || null;
    this._grayscaleLabeled = options.grayscaleLabeled || false;
    this._colorCache = new Map();
  }

  update(options) {
    this._hierarchyLevel = options.hierarchyLevel ?? this._hierarchyLevel;
    this._interactionMode = options.interactionMode ?? this._interactionMode;
    this._selectedCluster = options.selectedCluster ?? this._selectedCluster;
    this._grayscaleLabeled = options.grayscaleLabeled ?? this._grayscaleLabeled;
    return this;
  }

  render(values) {
    if (!values || values.length === 0) return null;
    const clusterId = values[0];
    if (CLUSTER_ID_RANGES.isNoData(clusterId)) return null;
    if (this._selectedCluster?.clusterId === clusterId) {
      return "rgba(0, 0, 0, 1)";
    }
    const cluster = this._segmentedRaster.getClusterById(clusterId);
    if (!cluster) return null;
    if (
      !cluster.classificationPath ||
      cluster.classificationPath === "unlabeled"
    ) {
      return cluster.color;
    }
    const color = this._resolveHierarchyColor(cluster.classificationPath);
    if (this._grayscaleLabeled) {
      return PixelRenderUtils.toGrayscale(color);
    }
    return color;
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
}

export { ClusterRenderer, ClassificationRenderer };
