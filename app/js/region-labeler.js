import { CLUSTER_ID_RANGES, hexToRgb, SEGMENTATION_KEYS } from "./utils.js";

class RegionLabeler {
  constructor() {
    this.compositeData = null;
    this.compositeSegmentationMap = null;
    this.compositeSegmentations = null;
    this.allLabels = null;
    this.segmentations = null;
    this.nextSyntheticId = CLUSTER_ID_RANGES.SYNTHETIC_START;
  }

  updateCompositeData(
    compositeData,
    segmentationMap,
    segmentations,
    allLabels,
    segmentationsMap
  ) {
    this.compositeData = compositeData;
    this.compositeSegmentationMap = segmentationMap;
    this.compositeSegmentations = segmentations;
    this.allLabels = allLabels;
    this.segmentations = segmentationsMap;
    this.initializeSyntheticTracking();
  }

  initializeSyntheticTracking() {
    const syntheticLabels = this.allLabels.get(SEGMENTATION_KEYS.COMPOSITE);
    const syntheticSeg = this.segmentations?.get(SEGMENTATION_KEYS.COMPOSITE);
    let maxId = 9999;
    if (syntheticLabels && syntheticLabels.size > 0) {
      const existingIds = Array.from(syntheticLabels.keys());
      maxId = Math.max(
        maxId,
        ...existingIds.filter((id) => id >= CLUSTER_ID_RANGES.SYNTHETIC_START)
      );
    }
    if (syntheticSeg) {
      const clusters = syntheticSeg.getAllClusters();
      const existingIds = clusters.map((c) => c.id);
      maxId = Math.max(
        maxId,
        ...existingIds.filter((id) => id >= CLUSTER_ID_RANGES.SYNTHETIC_START)
      );
    }
    this.nextSyntheticId = maxId + 1;
  }

  latlngToPixelCoord(latlng) {
    const x = Math.floor(
      (latlng.lng - this.compositeData.xmin) / this.compositeData.pixelWidth
    );
    const y = Math.floor(
      (this.compositeData.ymax - latlng.lat) / this.compositeData.pixelHeight
    );
    if (
      x < 0 ||
      x >= this.compositeData.width ||
      y < 0 ||
      y >= this.compositeData.height
    ) {
      return null;
    }
    return { x, y };
  }

  isPixelUnlabeled(pixelCoord) {
    const clusterId = this.compositeData.values[0][pixelCoord.y][pixelCoord.x];
    if (clusterId >= CLUSTER_ID_RANGES.SYNTHETIC_START) {
      return false;
    }
    if (!this.compositeSegmentationMap || !this.compositeSegmentations) {
      return true;
    }
    const segmentationIndex =
      this.compositeSegmentationMap[pixelCoord.y][pixelCoord.x];
    const segmentationKey = this.compositeSegmentations[segmentationIndex];
    const labels = this.allLabels?.get(segmentationKey);
    if (!labels || !labels.has(clusterId)) {
      return true;
    }
    const label = labels.get(clusterId);
    return !label || label === "unlabeled";
  }

  findContiguousRegion(
    startPixel,
    maxPixels = CLUSTER_ID_RANGES.SYNTHETIC_START
  ) {
    const visited = new Set();
    const region = [];
    const queue = [startPixel];
    while (queue.length > 0 && region.length < maxPixels) {
      const pixel = queue.shift();
      const key = `${pixel.x},${pixel.y}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (this.isPixelUnlabeled(pixel)) {
        region.push(pixel);
        const neighbors = this.getNeighbors(pixel);
        neighbors.forEach((neighbor) => queue.push(neighbor));
      }
    }
    return region;
  }

  checkForOverlaps(region) {
    const overlappingClusters = new Map(); // clusterId -> landUsePath
    const syntheticLabels = this.allLabels.get(SEGMENTATION_KEYS.COMPOSITE);
    for (const pixel of region) {
      const clusterId = this.compositeData.values[0][pixel.y][pixel.x];
      if (
        clusterId >= CLUSTER_ID_RANGES.SYNTHETIC_START &&
        syntheticLabels &&
        syntheticLabels.has(clusterId)
      ) {
        overlappingClusters.set(clusterId, syntheticLabels.get(clusterId));
      }
    }
    return overlappingClusters;
  }

  getOrCreateSyntheticId(landUsePath) {
    const syntheticLabels = this.allLabels.get(SEGMENTATION_KEYS.COMPOSITE);
    if (syntheticLabels) {
      for (const [clusterId, existingPath] of syntheticLabels) {
        if (existingPath === landUsePath) {
          return clusterId;
        }
      }
    }
    return this.nextSyntheticId++;
  }

  labelRegion(region, landUsePath) {
    const syntheticId = this.getOrCreateSyntheticId(landUsePath);
    region.forEach((pixel) => {
      this.compositeData.values[0][pixel.y][pixel.x] = syntheticId;
    });
    let syntheticSeg = this.segmentations?.get(SEGMENTATION_KEYS.COMPOSITE);
    if (syntheticSeg) {
      const color = this.getColorForLandUse(landUsePath);
      syntheticSeg.addCluster(syntheticId, region.length, landUsePath, color);
    }
    if (!this.allLabels.has(SEGMENTATION_KEYS.COMPOSITE)) {
      this.allLabels.set(SEGMENTATION_KEYS.COMPOSITE, new Map());
    }
    this.allLabels
      .get(SEGMENTATION_KEYS.COMPOSITE)
      .set(syntheticId, landUsePath);
    console.log(
      `Labeled ${region.length} pixels as synthetic cluster ${syntheticId} (${landUsePath})`
    );
    return syntheticId;
  }

  getColorForLandUse(landUsePath) {
    if (!landUsePath || landUsePath === "unlabeled") {
      return "rgb(255, 255, 0)";
    }
    if (!window.LandUseHierarchy || !window.LandUseHierarchy.isLoaded()) {
      return "rgb(128, 128, 128)";
    }
    const hierarchy = window.LandUseHierarchy.getInstance();
    const color = hierarchy.getColorForPath(landUsePath);
    if (!color) {
      return "rgb(128, 128, 128)";
    }
    return `rgb(${hexToRgb(color)})`;
  }

  getNeighbors(pixel) {
    const neighbors = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const neighbor = { x: pixel.x + dx, y: pixel.y + dy };
        if (
          neighbor.x >= 0 &&
          neighbor.x < this.compositeData.width &&
          neighbor.y >= 0 &&
          neighbor.y < this.compositeData.height
        ) {
          neighbors.push(neighbor);
        }
      }
    }
    return neighbors;
  }

  pixelToLatLng(pixel) {
    const lng =
      this.compositeData.xmin + (pixel.x + 0.5) * this.compositeData.pixelWidth;
    const lat =
      this.compositeData.ymax -
      (pixel.y + 0.5) * this.compositeData.pixelHeight;
    return { lat, lng };
  }
}

export { RegionLabeler };
