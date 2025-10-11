import { CLUSTER_ID_RANGES, hexToRgb, SEGMENTATION_KEYS } from "./utils.js";

class ClassificationHierarchy {
  static getColorForClassification(
    classificationPath,
    colorData,
    hierarchyLevel = null
  ) {
    if (!classificationPath || classificationPath === "unlabeled") {
      return null;
    }
    const effectivePath = hierarchyLevel
      ? PixelClassifier.truncateToHierarchyLevel(
          classificationPath,
          hierarchyLevel
        )
      : classificationPath;
    const hexColor = this.getColorForPath(effectivePath, colorData);
    return hexColor ? `rgb(${hexToRgb(hexColor)})` : null;
  }

  static getColorForPath(path, colorData) {
    if (!path || !colorData) return null;
    if (colorData[path]) {
      return colorData[path];
    }
    const pathParts = path.split(".");
    while (pathParts.length > 0) {
      pathParts.pop();
      const parentPath = pathParts.join(".");
      if (colorData[parentPath]) {
        return colorData[parentPath];
      }
    }
    throw new Error(`No color mapping found for path: ${path}`);
  }

  static getSelectableOptions(hierarchyData) {
    const unlabeled = {
      path: "unlabeled",
      displayPath: "Unlabeled",
      level: 0,
      description: "Not yet classified",
      isLeaf: true,
    };
    const flatPaths = this.flattenHierarchy(hierarchyData);
    return [unlabeled, ...flatPaths];
  }

  static flattenHierarchy(obj, currentPath = [], result = []) {
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith("_")) continue;
      const newPath = [...currentPath, key];
      const hasSubcategories = Object.keys(value).some(
        (k) => !k.startsWith("_")
      );
      result.push({
        path: newPath.join("."),
        displayPath: newPath.join(" > "),
        level: newPath.length - 1,
        description: key,
        isLeaf: !hasSubcategories,
      });
      if (hasSubcategories) {
        this.flattenHierarchy(value, newPath, result);
      }
    }
    return result;
  }

  static getHierarchyItemsAtLevel(hierarchyData, colorData, level) {
    const items = [];
    this.traverseHierarchy(hierarchyData, colorData, [], items, level);
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  static traverseHierarchy(obj, colorData, currentPath, items, targetLevel) {
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith("_")) continue;
      const newPath = [...currentPath, key];
      if (newPath.length === targetLevel) {
        const path = newPath.join(".");
        const color = this.getColorForPath(path, colorData);
        items.push({
          path: path,
          name: key,
          displayPath: newPath.join(" > "),
          color: color.startsWith("#") ? color : `#${color}`,
        });
      } else if (newPath.length < targetLevel) {
        this.traverseHierarchy(value, colorData, newPath, items, targetLevel);
      }
    }
  }

  static getPathsByPrefix(hierarchyData, prefix) {
    const flatPaths = this.flattenHierarchy(hierarchyData);
    return flatPaths.filter((item) => item.path.startsWith(prefix));
  }
}

class PixelClassifier {
  constructor(
    hierarchyData,
    colorData,
    compositeData,
    clusterIdMapping,
    segmentations,
    hierarchyLevel
  ) {
    this.hierarchyData = hierarchyData;
    this.colorData = colorData;
    this.compositeData = compositeData;
    this.clusterIdMapping = clusterIdMapping;
    this.segmentations = segmentations;
    this.hierarchyLevel = hierarchyLevel;
  }

  static truncateToHierarchyLevel(classificationPath, hierarchyLevel) {
    if (!classificationPath || classificationPath === "unlabeled") {
      return classificationPath;
    }
    const pathParts = classificationPath.split(".");
    if (pathParts.length <= hierarchyLevel) {
      return classificationPath;
    }
    return pathParts.slice(0, hierarchyLevel).join(".");
  }

  generatePixelMapping() {
    const uniqueClassifications = new Set();
    const height = this.compositeData.height;
    const width = this.compositeData.width;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const clusterId = this.compositeData.values[0][y][x];
        if (clusterId === CLUSTER_ID_RANGES.NODATA) continue;
        const classificationPath = this.getPixelClassificationPath(
          clusterId,
          x,
          y
        );
        if (classificationPath && classificationPath !== "unlabeled") {
          const truncatedPath =
            this.truncateToHierarchyLevel(classificationPath);
          uniqueClassifications.add(truncatedPath);
        } else {
          uniqueClassifications.add("unlabeled");
        }
      }
    }
    const pixelMapping = {};
    let nextId = 0;
    Array.from(uniqueClassifications)
      .sort()
      .forEach((classificationPath) => {
        if (classificationPath === "unlabeled") {
          pixelMapping[CLUSTER_ID_RANGES.UNLABELED.toString()] =
            classificationPath;
        } else {
          pixelMapping[nextId.toString()] = classificationPath;
          nextId++;
        }
      });
    return pixelMapping;
  }

  createClassificationRaster() {
    const pixelMapping = this.generatePixelMapping();
    const classificationToId = new Map();
    Object.entries(pixelMapping).forEach(([id, classificationPath]) => {
      classificationToId.set(classificationPath, parseInt(id));
    });
    const height = this.compositeData.height;
    const width = this.compositeData.width;
    const rasterData = new Array(height);
    for (let y = 0; y < height; y++) {
      rasterData[y] = new Array(width);
      for (let x = 0; x < width; x++) {
        const clusterId = this.compositeData.values[0][y][x];
        if (clusterId === CLUSTER_ID_RANGES.NODATA) {
          rasterData[y][x] = CLUSTER_ID_RANGES.NODATA;
          continue;
        }
        const classificationPath = this.getPixelClassificationPath(
          clusterId,
          x,
          y
        );
        if (!classificationPath || classificationPath === "unlabeled") {
          rasterData[y][x] = CLUSTER_ID_RANGES.UNLABELED;
        } else {
          const truncatedPath =
            this.truncateToHierarchyLevel(classificationPath);
          const classificationId = classificationToId.get(truncatedPath);
          rasterData[y][x] =
            classificationId !== undefined
              ? classificationId
              : CLUSTER_ID_RANGES.UNLABELED;
        }
      }
    }
    return rasterData;
  }

  static createColorMapping(
    pixelMapping,
    hierarchyData,
    colorData,
    hierarchyLevel
  ) {
    const colorMapping = {};
    colorMapping[CLUSTER_ID_RANGES.NODATA] = "#000000";
    colorMapping[CLUSTER_ID_RANGES.UNLABELED] = null;
    Object.entries(pixelMapping).forEach(([id, classificationPath]) => {
      if (classificationPath === "unlabeled") {
        return;
      }
      const color = ClassificationHierarchy.getColorForPath(
        classificationPath,
        colorData
      );
      colorMapping[id] = color;
    });
    return colorMapping;
  }

  getPixelClassificationPath(clusterId, x, y) {
    if (CLUSTER_ID_RANGES.isSynthetic(clusterId)) {
      const syntheticSegmentation = this.segmentations.get(
        SEGMENTATION_KEYS.COMPOSITE
      );
      const cluster = syntheticSegmentation?.getCluster(clusterId);
      return cluster?.classificationPath || "unlabeled";
    }
    let mapping = null;
    for (const [key, value] of this.clusterIdMapping) {
      if (value.uniqueId === clusterId) {
        mapping = value;
        break;
      }
    }
    return mapping?.classificationPath || "unlabeled";
  }

  truncateToHierarchyLevel(classificationPath) {
    return PixelClassifier.truncateToHierarchyLevel(
      classificationPath,
      this.hierarchyLevel
    );
  }
}

export { ClassificationHierarchy, PixelClassifier };
