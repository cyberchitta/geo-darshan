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
    Object.freeze(this);
  }

  withOptions(options) {
    return new ClusterRenderer(this._segmentedRaster, this._segmentationKey, {
      interactionMode: options.interactionMode ?? this._interactionMode,
      selectedCluster: options.selectedCluster ?? this._selectedCluster,
      grayscaleLabeled: options.grayscaleLabeled ?? this._grayscaleLabeled,
    });
  }

  render(values) {
    if (!values || values.length === 0 || values[0] === 0) return null;
    const clusterId = values[0];
    if (CLUSTER_ID_RANGES.isNoData(clusterId)) return null;
    if (
      PixelRenderUtils.isSelected(
        clusterId,
        this._segmentationKey,
        this._selectedCluster
      )
    ) {
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
    Object.freeze(this);
  }

  withOptions(options) {
    return new ClassificationRenderer(this._segmentedRaster, {
      hierarchyLevel: options.hierarchyLevel ?? this._hierarchyLevel,
      interactionMode: options.interactionMode ?? this._interactionMode,
      selectedCluster: options.selectedCluster ?? this._selectedCluster,
      grayscaleLabeled: options.grayscaleLabeled ?? this._grayscaleLabeled,
    });
  }

  render(values) {
    if (!values || values.length === 0 || values[0] === 0) return null;
    const clusterId = values[0];
    if (CLUSTER_ID_RANGES.isNoData(clusterId)) return null;
    if (
      PixelRenderUtils.isSelected(clusterId, "composite", this._selectedCluster)
    ) {
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
