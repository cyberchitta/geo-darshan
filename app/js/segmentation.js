import { SEGMENTATION_KEYS } from "./utils.js";

class Segmentation {
  constructor(key, georaster, colorMapping, metadata = {}) {
    this.key = key;
    this.georaster = georaster;
    this.colorMapping = colorMapping;
    this.metadata = metadata;
    this.clusters = new Map();
    this.isImmutable = metadata.source === "file";
  }

  static fromFile(key, georaster, colorMapping, stats) {
    const segmentation = new Segmentation(key, georaster, colorMapping, {
      source: "file",
      filename: stats?.filename,
      fileSize: stats?.file_size_mb,
    });
    segmentation.isImmutable = false;
    return segmentation;
  }

  static createComposite(refGeoRaster) {
    return new Segmentation(SEGMENTATION_KEYS.COMPOSITE, refGeoRaster, null, {
      source: "composite",
      created: new Date().toISOString(),
    });
  }

  getCluster(clusterId) {
    return this.clusters.get(clusterId);
  }

  getAllClusters() {
    return Array.from(this.clusters.values());
  }

  getColors() {
    const colorMap = new Map();
    this.clusters.forEach((cluster, id) => {
      colorMap.set(id, cluster.color);
    });
    return colorMap;
  }

  addCluster(clusterId, pixelCount, landUsePath, color) {
    if (this.isImmutable) return;
    this.clusters.set(clusterId, {
      id: clusterId,
      pixelCount,
      landUsePath,
      color,
      area_ha: (pixelCount * 0.01).toFixed(2),
      segmentationKey: this.key,
    });
  }

  updateCluster(clusterId, landUsePath, color) {
    if (this.isImmutable) return;
    const cluster = this.clusters.get(clusterId);
    if (cluster) {
      cluster.landUsePath = landUsePath;
      cluster.color = color;
    }
  }

  removeCluster(clusterId) {
    if (this.isImmutable) return;
    return this.clusters.delete(clusterId);
  }

  finalize() {
    if (this.metadata.source === "file") {
      this.isImmutable = true;
    }
  }
}

export { Segmentation };
