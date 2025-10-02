import { Raster } from "./raster/raster.js";
import { RasterTransform } from "./raster/raster-transform.js";
import { ClassificationHierarchy } from "./classification.js";
import { CLUSTER_ID_RANGES, SEGMENTATION_KEYS } from "./utils.js";

class RegionLabeler {
  constructor() {
    this.interactiveRaster = null;
    this.interactiveSegmentation = null;
    this.syntheticSegmentation = null;
    this.nextSyntheticId = CLUSTER_ID_RANGES.SYNTHETIC_START;
  }

  updateInteractiveData(
    interactiveGeoRaster,
    interactiveSegmentation,
    syntheticSegmentation
  ) {
    this.interactiveRaster = Raster.fromGeoRaster(interactiveGeoRaster);
    this.interactiveSegmentation = interactiveSegmentation;
    this.syntheticSegmentation = syntheticSegmentation;
    this.initializeSyntheticTracking();
  }

  initializeSyntheticTracking() {
    let maxId = CLUSTER_ID_RANGES.SYNTHETIC_START - 1;
    if (this.syntheticSegmentation) {
      const clusters = this.syntheticSegmentation.getAllClusters();
      const existingIds = clusters.map((c) => c.id);
      maxId = Math.max(
        maxId,
        ...existingIds.filter((id) => CLUSTER_ID_RANGES.isSynthetic(id))
      );
    }
    this.nextSyntheticId = maxId + 1;
  }

  latlngToPixelCoord(latlng) {
    return this.interactiveRaster?.latlngToPixel(latlng);
  }

  isPixelUnlabeled(pixelCoord) {
    if (!this.interactiveSegmentation) return true;
    const clusterId = this.interactiveRaster.get(pixelCoord.x, pixelCoord.y);
    const cluster = this.interactiveSegmentation.getCluster(clusterId);
    if (!cluster) return true;
    return (
      !cluster.classificationPath || cluster.classificationPath === "unlabeled"
    );
  }

  findContiguousRegion(
    startPixel,
    maxPixels = CLUSTER_ID_RANGES.SYNTHETIC_START,
    diagonalConnections = true
  ) {
    if (!this.interactiveRaster) return [];
    const startClusterId = this.interactiveRaster.get(
      startPixel.x,
      startPixel.y
    );
    return RasterTransform.findRegion(
      this.interactiveRaster,
      startPixel.x,
      startPixel.y,
      (seedValue, pixelValue) => pixelValue === seedValue,
      maxPixels,
      diagonalConnections
    );
  }

  labelRegion(region, classificationPath, hierarchyLevel = null) {
    if (!this.syntheticSegmentation) {
      throw new Error("Synthetic segmentation not initialized");
    }
    const syntheticId = this.getOrCreateSyntheticId(classificationPath);
    const syntheticRaster = this.syntheticSegmentation.georaster.values[0];
    region.forEach((pixel) => {
      syntheticRaster[pixel.y][pixel.x] = syntheticId;
    });
    const color = ClassificationHierarchy.getColorForClassification(
      classificationPath,
      hierarchyLevel
    );
    this.syntheticSegmentation.addCluster(
      syntheticId,
      region.length,
      classificationPath,
      color
    );
    console.log(
      `Labeled ${region.length} pixels as synthetic cluster ${syntheticId} (${classificationPath})`
    );
    return syntheticId;
  }

  analyzeNeighborhood(region) {
    const adjacentLabels = new Map();
    for (const pixel of region) {
      const neighbors = this.interactiveRaster.getNeighbors(
        pixel.x,
        pixel.y,
        true
      );
      for (const neighbor of neighbors) {
        const clusterId = this.interactiveRaster.get(neighbor.x, neighbor.y);
        const cluster = this.interactiveSegmentation.getCluster(clusterId);
        if (
          cluster?.classificationPath &&
          cluster.classificationPath !== "unlabeled"
        ) {
          adjacentLabels.set(
            cluster.classificationPath,
            (adjacentLabels.get(cluster.classificationPath) || 0) + 1
          );
        }
      }
    }
    return this.formatSuggestions(adjacentLabels);
  }

  pixelToLatLng(pixel) {
    return this.interactiveRaster?.pixelToLatlng(pixel.x, pixel.y);
  }

  getOrCreateSyntheticId(classificationPath) {
    const syntheticLabels = this.syntheticSegmentation?.clusters;
    if (syntheticLabels) {
      for (const [clusterId, cluster] of syntheticLabels) {
        if (cluster.classificationPath === classificationPath) {
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
