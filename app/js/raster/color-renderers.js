import { ClassificationHierarchy } from "../classification.js";
import {
  CLUSTER_ID_RANGES,
  rgbStringToObject,
  convertToGrayscale,
} from "../utils.js";

const _createBaseRenderer = (options = {}) => {
  const { selectedCluster, grayscaleLabeled = false } = options;
  return Object.freeze({
    isSelected(clusterId, segKey) {
      return (
        selectedCluster?.clusterId === clusterId &&
        selectedCluster?.segmentationKey === segKey
      );
    },
    toGrayscale(rgbString, alpha = 1) {
      if (!rgbString) return null;
      const colorObj = rgbStringToObject(rgbString);
      if (!colorObj) return rgbString;
      const gray = convertToGrayscale(colorObj);
      return `rgba(${gray.r}, ${gray.g}, ${gray.b}, ${alpha})`;
    },
    shouldGrayscaleLabeled(classificationPath) {
      return (
        grayscaleLabeled &&
        classificationPath &&
        classificationPath !== "unlabeled"
      );
    },
    getClusterColor(cluster) {
      return cluster?.color;
    },
  });
};

class ClusterRenderer {
  constructor(segmentedRaster, segmentationKey, options = {}) {
    this._segmentedRaster = segmentedRaster;
    this._segmentationKey = segmentationKey;
    this._base = _createBaseRenderer(options);
    Object.freeze(this);
  }

  withOptions(options) {
    return new ClusterRenderer(this._segmentedRaster, this._segmentationKey, {
      ...options,
    });
  }

  render(values) {
    if (!values || values.length === 0 || values[0] === 0) return null;
    const clusterId = values[0];
    if (CLUSTER_ID_RANGES.isNoData(clusterId)) return null;
    if (this._base.isSelected(clusterId, this._segmentationKey)) {
      return "rgba(0, 0, 0, 1)";
    }
    const cluster = this._segmentedRaster.getClusterById(clusterId);
    if (!cluster) return null;
    let color = this._base.getClusterColor(cluster);
    if (!color) return null;
    if (this._base.shouldGrayscaleLabeled(cluster.classificationPath)) {
      color = this._base.toGrayscale(color);
    }
    return color;
  }
}

class ClassificationRenderer {
  constructor(segmentedRaster, options = {}) {
    this._segmentedRaster = segmentedRaster;
    this._base = _createBaseRenderer(options);
    this._hierarchyLevel = options.hierarchyLevel || 1;
    this._colorCache = new Map();
    Object.freeze(this);
  }

  withOptions(options) {
    return new ClassificationRenderer(this._segmentedRaster, {
      ...options,
      hierarchyLevel: options.hierarchyLevel ?? this._hierarchyLevel,
    });
  }

  render(values) {
    if (!values || values.length === 0 || values[0] === 0) return null;
    const clusterId = values[0];
    if (CLUSTER_ID_RANGES.isNoData(clusterId)) return null;
    if (this._base.isSelected(clusterId, "composite")) {
      return "rgba(0, 0, 0, 1)";
    }
    const cluster = this._segmentedRaster.getClusterById(clusterId);
    if (!cluster) return null;
    if (
      !cluster.classificationPath ||
      cluster.classificationPath === "unlabeled"
    ) {
      return this._base.getClusterColor(cluster);
    }
    return this._resolveHierarchyColor(cluster.classificationPath);
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
