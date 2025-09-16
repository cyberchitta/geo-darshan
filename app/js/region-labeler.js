class RegionLabeler {
  constructor(compositeData) {
    this.compositeData = compositeData; // georaster data
    this.compositeSegmentationMap = null; // from LabeledCompositeLayer
    this.compositeSegmentations = null; // from LabeledCompositeLayer
    this.allLabels = null; // cluster labels map
    this.pixelLabels = new Map(); // "x,y" -> landUsePath for pixel-level labels
  }

  updateCompositeData(
    compositeData,
    segmentationMap,
    segmentations,
    allLabels
  ) {
    this.compositeData = compositeData;
    this.compositeSegmentationMap = segmentationMap;
    this.compositeSegmentations = segmentations;
    this.allLabels = allLabels;
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
    const key = `${pixelCoord.x},${pixelCoord.y}`;
    if (this.pixelLabels.has(key)) {
      return false;
    }
    if (!this.compositeSegmentationMap || !this.compositeSegmentations) {
      return true;
    }
    const segmentationIndex =
      this.compositeSegmentationMap[pixelCoord.y][pixelCoord.x];
    const segmentationKey = this.compositeSegmentations[segmentationIndex];
    const clusterId = this.compositeData.values[0][pixelCoord.y][pixelCoord.x];
    const labels = this.allLabels?.get(segmentationKey);
    if (!labels || !labels.has(clusterId)) {
      return true;
    }
    const label = labels.get(clusterId);
    return !label || label === "unlabeled";
  }

  findContiguousRegion(startPixel, maxPixels = 10000) {
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

  labelRegion(region, landUsePath) {
    region.forEach((pixel) => {
      const key = `${pixel.x},${pixel.y}`;
      this.pixelLabels.set(key, landUsePath);
    });
    console.log(`Labeled ${region.length} pixels as ${landUsePath}`);
    return region.length;
  }

  getPixelLabel(pixelCoord) {
    const key = `${pixelCoord.x},${pixelCoord.y}`;
    if (this.pixelLabels.has(key)) {
      return this.pixelLabels.get(key);
    }
    if (!this.compositeSegmentationMap || !this.compositeSegmentations) {
      return null;
    }
    const segmentationIndex =
      this.compositeSegmentationMap[pixelCoord.y][pixelCoord.x];
    const segmentationKey = this.compositeSegmentations[segmentationIndex];
    const clusterId = this.compositeData.values[0][pixelCoord.y][pixelCoord.x];
    const labels = this.allLabels?.get(segmentationKey);
    if (labels && labels.has(clusterId)) {
      const label = labels.get(clusterId);
      return label && label !== "unlabeled" ? label : null;
    }
    return null;
  }

  pixelToLatLng(pixel) {
    const lng =
      this.compositeData.xmin + (pixel.x + 0.5) * this.compositeData.pixelWidth;
    const lat =
      this.compositeData.ymax -
      (pixel.y + 0.5) * this.compositeData.pixelHeight;
    return { lat, lng };
  }

  getStats() {
    const totalPixels = this.compositeData.width * this.compositeData.height;
    const pixelLevelLabels = this.pixelLabels.size;
    let clusterLabeledPixels = 0;
    for (let y = 0; y < this.compositeData.height; y++) {
      for (let x = 0; x < this.compositeData.width; x++) {
        const pixelCoord = { x, y };
        if (
          !this.pixelLabels.has(`${x},${y}`) &&
          !this.isPixelUnlabeled(pixelCoord)
        ) {
          clusterLabeledPixels++;
        }
      }
    }
    return {
      totalPixels,
      pixelLevelLabels,
      clusterLabeledPixels,
      unlabeledPixels: totalPixels - pixelLevelLabels - clusterLabeledPixels,
      percentComplete:
        ((pixelLevelLabels + clusterLabeledPixels) / totalPixels) * 100,
    };
  }

  clearPixelLabels() {
    this.pixelLabels.clear();
  }

  exportPixelLabels() {
    const labels = {};
    for (const [key, value] of this.pixelLabels) {
      labels[key] = value;
    }
    return labels;
  }

  importPixelLabels(labels) {
    this.pixelLabels.clear();
    Object.entries(labels).forEach(([key, value]) => {
      this.pixelLabels.set(key, value);
    });
  }
}

export { RegionLabeler };
