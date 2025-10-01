import { ClassificationHierarchy } from "./classification.js";
import { CLUSTER_ID_RANGES, hexToRgb, SEGMENTATION_KEYS } from "./utils.js";

class RegionLabeler {
  constructor() {
    this.compositeGeoRaster = null;
    this.compositeSegmentation = null;
    this.allLabels = null;
    this.segmentations = null;
    this.nextSyntheticId = CLUSTER_ID_RANGES.SYNTHETIC_START;
    this.processedInteractiveRaster = null;
  }

  updateCompositeData(
    compositeGeoRaster,
    compositeSegmentation,
    allLabels,
    segmentationsMap,
    processedInteractiveRaster
  ) {
    this.compositeGeoRaster = compositeGeoRaster;
    this.compositeSegmentation = compositeSegmentation;
    this.allLabels = allLabels;
    this.segmentations = segmentationsMap;
    this.processedInteractiveRaster = processedInteractiveRaster;
    this.initializeSyntheticTracking();
  }

  initializeSyntheticTracking() {
    const syntheticLabels = this.allLabels.get(SEGMENTATION_KEYS.COMPOSITE);
    let maxId = 9999;
    if (syntheticLabels && syntheticLabels.size > 0) {
      const existingIds = Array.from(syntheticLabels.keys());
      maxId = Math.max(
        maxId,
        ...existingIds.filter((id) => CLUSTER_ID_RANGES.isSynthetic(id))
      );
    }
    if (this.compositeSegmentation) {
      const clusters = this.compositeSegmentation.getAllClusters();
      const existingIds = clusters.map((c) => c.id);
      maxId = Math.max(
        maxId,
        ...existingIds.filter((id) => CLUSTER_ID_RANGES.isSynthetic(id))
      );
    }
    this.nextSyntheticId = maxId + 1;
  }

  latlngToPixelCoord(latlng) {
    const x = Math.floor(
      (latlng.lng - this.compositeGeoRaster.xmin) /
        this.compositeGeoRaster.pixelWidth
    );
    const y = Math.floor(
      (this.compositeGeoRaster.ymax - latlng.lat) /
        this.compositeGeoRaster.pixelHeight
    );
    if (
      x < 0 ||
      x >= this.compositeGeoRaster.width ||
      y < 0 ||
      y >= this.compositeGeoRaster.height
    ) {
      return null;
    }
    return { x, y };
  }

  isPixelUnlabeled(pixelCoord) {
    const clusterId =
      this.compositeGeoRaster.values[0][pixelCoord.y][pixelCoord.x];
    if (!this.compositeSegmentation) {
      return true;
    }
    const cluster = this.compositeSegmentation.getCluster(clusterId);
    if (!cluster) {
      return true;
    }
    return (
      !cluster.classificationPath || cluster.classificationPath === "unlabeled"
    );
  }

  findContiguousRegion(
    startPixel,
    maxPixels = CLUSTER_ID_RANGES.SYNTHETIC_START,
    diagonalConnections = true
  ) {
    const visited = new Set();
    const region = [];
    const queue = [startPixel];
    const startClusterId =
      this.compositeGeoRaster.values[0][startPixel.y][startPixel.x];
    while (queue.length > 0 && region.length < maxPixels) {
      const pixel = queue.shift();
      const key = `${pixel.x},${pixel.y}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const pixelClusterId =
        this.compositeGeoRaster.values[0][pixel.y][pixel.x];
      if (pixelClusterId === startClusterId) {
        region.push(pixel);
        const neighbors = this.getNeighbors(pixel, diagonalConnections);
        neighbors.forEach((neighbor) => queue.push(neighbor));
      }
    }
    return region;
  }

  labelRegion(region, classificationPath, hierarchyLevel = null) {
    const syntheticId = this.getOrCreateSyntheticId(classificationPath);
    region.forEach((pixel) => {
      this.compositeGeoRaster.values[0][pixel.y][pixel.x] = syntheticId;
    });
    if (this.compositeSegmentation) {
      const color = ClassificationHierarchy.getColorForClassification(
        classificationPath,
        hierarchyLevel
      );
      this.compositeSegmentation.addCluster(
        syntheticId,
        region.length,
        classificationPath,
        color
      );
    }
    if (!this.allLabels.has(SEGMENTATION_KEYS.COMPOSITE)) {
      this.allLabels.set(SEGMENTATION_KEYS.COMPOSITE, new Map());
    }
    this.allLabels
      .get(SEGMENTATION_KEYS.COMPOSITE)
      .set(syntheticId, classificationPath);
    console.log(
      `Labeled ${region.length} pixels as synthetic cluster ${syntheticId} (${classificationPath})`
    );
    return syntheticId;
  }

  analyzeNeighborhood(region) {
    const adjacentLabels = new Map();
    for (const pixel of region) {
      const neighbors = this.getNeighbors(pixel, true);
      for (const neighbor of neighbors) {
        const clusterId =
          this.processedInteractiveRaster[neighbor.y][neighbor.x];
        const classificationPath = this.getPixelClassificationPath(clusterId);
        if (classificationPath && classificationPath !== "unlabeled") {
          adjacentLabels.set(
            classificationPath,
            (adjacentLabels.get(classificationPath) || 0) + 1
          );
        }
      }
    }
    return this.formatSuggestions(adjacentLabels);
  }

  getPixelClassificationPath(clusterId) {
    if (!this.compositeSegmentation) {
      return "unlabeled";
    }
    const cluster = this.compositeSegmentation.getCluster(clusterId);
    if (!cluster) {
      return "unlabeled";
    }
    return cluster.classificationPath;
  }

  getNeighbors(pixel, includeDiagonal = false) {
    const neighbors = [];
    const offsets = includeDiagonal
      ? [
          [-1, -1],
          [0, -1],
          [1, -1],
          [-1, 0],
          [1, 0],
          [-1, 1],
          [0, 1],
          [1, 1],
        ]
      : [
          [0, -1],
          [-1, 0],
          [1, 0],
          [0, 1],
        ];
    for (const [dx, dy] of offsets) {
      const neighbor = { x: pixel.x + dx, y: pixel.y + dy };
      if (
        neighbor.x >= 0 &&
        neighbor.x < this.compositeGeoRaster.width &&
        neighbor.y >= 0 &&
        neighbor.y < this.compositeGeoRaster.height
      ) {
        neighbors.push(neighbor);
      }
    }
    return neighbors;
  }

  pixelToLatLng(pixel) {
    const lng =
      this.compositeGeoRaster.xmin +
      (pixel.x + 0.5) * this.compositeGeoRaster.pixelWidth;
    const lat =
      this.compositeGeoRaster.ymax -
      (pixel.y + 0.5) * this.compositeGeoRaster.pixelHeight;
    return { lat, lng };
  }

  getOrCreateSyntheticId(classificationPath) {
    const syntheticLabels = this.allLabels.get(SEGMENTATION_KEYS.COMPOSITE);
    if (syntheticLabels) {
      for (const [clusterId, existingPath] of syntheticLabels) {
        if (existingPath === classificationPath) {
          return clusterId;
        }
      }
    }
    return this.nextSyntheticId++;
  }

  formatSuggestions(adjacentLabels) {
    return Array.from(adjacentLabels.entries())
      .map(([classificationPath, count]) => ({ classificationPath, count }))
      .sort((a, b) => b.count - a.count);
  }
}

export { RegionLabeler };
