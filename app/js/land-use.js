import { CLUSTER_ID_RANGES, SEGMENTATION_KEYS } from "./utils.js";

class LandUseHierarchy {
  constructor(hierarchyData, colorData) {
    this.hierarchy = hierarchyData;
    this.colors = colorData;
    this.flatPaths = this.flattenHierarchy();
  }

  static async loadFromFile(
    hierarchyUrl = "land-use.json",
    colorUrl = "land-use-colors.json"
  ) {
    try {
      const [hierarchyResponse, colorResponse] = await Promise.all([
        fetch(hierarchyUrl),
        fetch(colorUrl),
      ]);
      if (!hierarchyResponse.ok) {
        throw new Error(
          `Failed to load hierarchy: ${hierarchyResponse.status} ${hierarchyResponse.statusText}`
        );
      }
      if (!colorResponse.ok) {
        throw new Error(
          `Failed to load colors: ${colorResponse.status} ${colorResponse.statusText}`
        );
      }
      const [hierarchyData, colorData] = await Promise.all([
        hierarchyResponse.json(),
        colorResponse.json(),
      ]);
      const instance = new LandUseHierarchy(hierarchyData, colorData);
      LandUseHierarchy._instance = instance;
      console.log(
        "✅ Land use hierarchy and colors loaded as singleton service"
      );
      return instance;
    } catch (error) {
      console.error("Failed to load land-use hierarchy or colors:", error);
      throw error;
    }
  }

  static getInstance() {
    if (!LandUseHierarchy._instance) {
      throw new Error("Hierarchy not loaded. Call loadFromFile() first.");
    }
    return LandUseHierarchy._instance;
  }

  static isLoaded() {
    return !!LandUseHierarchy._instance;
  }

  flattenHierarchy(obj = this.hierarchy, currentPath = [], result = []) {
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

  getSelectableOptions() {
    return [
      {
        path: "unlabeled",
        displayPath: "Unlabeled",
        level: 0,
        description: "Not yet classified",
        isLeaf: true,
      },
      ...this.flatPaths,
    ];
  }

  getPathByPrefix(prefix) {
    return this.flatPaths.filter((item) => item.path.startsWith(prefix));
  }

  getColorForPath(path, level = null) {
    if (!path) return null;
    const pathParts = path.split(".");
    const truncatedPath = level ? pathParts.slice(0, level).join(".") : path;
    return this.findColorInColorMapping(truncatedPath);
  }

  findColorInColorMapping(path) {
    if (!path) return null;
    if (this.colors[path]) {
      return this.colors[path];
    }
    const pathParts = path.split(".");
    while (pathParts.length > 0) {
      pathParts.pop();
      const parentPath = pathParts.join(".");
      if (this.colors[parentPath]) {
        return this.colors[parentPath];
      }
    }
    throw new Error(`No color mapping found for path: ${path}`);
  }

  getHierarchyItemsAtLevel(level) {
    const items = [];
    this.traverseHierarchy(this.hierarchy, [], items, level);
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  traverseHierarchy(obj, currentPath, items, targetLevel) {
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith("_")) continue;
      const newPath = [...currentPath, key];
      if (newPath.length === targetLevel) {
        const path = newPath.join(".");
        const color = this.findColorInColorMapping(path);
        items.push({
          path: path,
          name: key,
          displayPath: newPath.join(" > "),
          color: color.startsWith("#") ? color : `#${color}`,
        });
      } else if (newPath.length < targetLevel) {
        this.traverseHierarchy(value, newPath, items, targetLevel);
      }
    }
  }
}

class LandUseMapper {
  constructor(
    hierarchy,
    compositeData,
    clusterIdMapping,
    segmentations,
    hierarchyLevel
  ) {
    this.hierarchy = hierarchy;
    this.compositeData = compositeData;
    this.clusterIdMapping = clusterIdMapping;
    this.segmentations = segmentations;
    this.hierarchyLevel = hierarchyLevel;
  }

  generatePixelMapping() {
    const uniqueLandUses = new Set();
    const height = this.compositeData.height;
    const width = this.compositeData.width;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const clusterId = this.compositeData.values[0][y][x];
        if (clusterId === CLUSTER_ID_RANGES.NODATA) continue;
        const landUsePath = this.getPixelLandUsePath(clusterId, x, y);
        if (landUsePath && landUsePath !== "unlabeled") {
          const truncatedPath = this.truncateToHierarchyLevel(landUsePath);
          uniqueLandUses.add(truncatedPath);
        } else {
          uniqueLandUses.add("unlabeled");
        }
      }
    }
    const pixelMapping = {};
    let nextId = 0;
    Array.from(uniqueLandUses)
      .sort()
      .forEach((landUsePath) => {
        if (landUsePath === "unlabeled") {
          pixelMapping[CLUSTER_ID_RANGES.UNLABELED.toString()] = landUsePath;
        } else {
          pixelMapping[nextId.toString()] = landUsePath;
          nextId++;
        }
      });
    return pixelMapping;
  }

  createLandUseRaster() {
    const pixelMapping = this.generatePixelMapping();
    const landUseToId = new Map();
    Object.entries(pixelMapping).forEach(([id, landUsePath]) => {
      landUseToId.set(landUsePath, parseInt(id));
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
        const landUsePath = this.getPixelLandUsePath(clusterId, x, y);
        if (!landUsePath || landUsePath === "unlabeled") {
          rasterData[y][x] = CLUSTER_ID_RANGES.UNLABELED;
        } else {
          const truncatedPath = this.truncateToHierarchyLevel(landUsePath);
          const landUseId = landUseToId.get(truncatedPath);
          rasterData[y][x] =
            landUseId !== undefined ? landUseId : CLUSTER_ID_RANGES.UNLABELED;
        }
      }
    }
    return rasterData;
  }

  static createColorMapping(pixelMapping, hierarchy, hierarchyLevel) {
    const colorMapping = {};
    colorMapping[CLUSTER_ID_RANGES.NODATA] = "#000000";
    colorMapping[CLUSTER_ID_RANGES.UNLABELED] = null;
    Object.entries(pixelMapping).forEach(([id, landUsePath]) => {
      if (landUsePath === "unlabeled") {
        return;
      }
      const color = hierarchy.getColorForPath(landUsePath, hierarchyLevel);
      colorMapping[id] = color;
    });
    return colorMapping;
  }

  getPixelLandUsePath(clusterId, x, y) {
    if (CLUSTER_ID_RANGES.isSynthetic(clusterId)) {
      const syntheticSegmentation = this.segmentations.get(
        SEGMENTATION_KEYS.COMPOSITE
      );
      const cluster = syntheticSegmentation?.getCluster(clusterId);
      return cluster?.landUsePath || "unlabeled";
    }
    let mapping = null;
    for (const [key, value] of this.clusterIdMapping) {
      if (value.uniqueId === clusterId) {
        mapping = value;
        break;
      }
    }
    return mapping?.landUsePath || "unlabeled";
  }

  truncateToHierarchyLevel(landUsePath) {
    if (!landUsePath || landUsePath === "unlabeled") {
      return landUsePath;
    }
    const pathParts = landUsePath.split(".");
    if (pathParts.length <= this.hierarchyLevel) {
      return landUsePath;
    }
    return pathParts.slice(0, this.hierarchyLevel).join(".");
  }
}

export { LandUseHierarchy, LandUseMapper };
