import { CLUSTER_ID_RANGES, hexToRgb, SEGMENTATION_KEYS } from "./utils.js";
import { Segmentation } from "./segmentation.js";
export class Cluster {
  static async extractSegmentations(overlays, manifest, dataLoader) {
    const segmentations = new Map();
    for (let index = 0; index < overlays.length; index++) {
      const overlay = overlays[index];
      const segmentationKey = manifest.segmentation_keys[index];
      const colorMapping =
        dataLoader.getColorMappingForSegmentation(segmentationKey);
      const segmentation = Segmentation.fromFile(
        segmentationKey,
        overlay.georaster,
        colorMapping,
        overlay.stats
      );
      const pixelCounts = await this.countPixelsPerCluster(
        overlay.georaster,
        colorMapping
      );
      Object.entries(pixelCounts).forEach(([clusterId, count]) => {
        const id = parseInt(clusterId);
        const color = this.getClusterColor(id, colorMapping);
        segmentation.addCluster(id, count, "unlabeled", color);
      });
      segmentation.finalize();
      segmentations.set(segmentationKey, segmentation);
    }
    segmentations.set(
      SEGMENTATION_KEYS.COMPOSITE,
      Segmentation.createSynthetic()
    );
    return segmentations;
  }

  static getClusterColor(clusterId, colorMapping) {
    if (!colorMapping?.colors_rgb) return "rgb(128,128,128)";
    const color = colorMapping.colors_rgb[clusterId];
    if (color && color.length >= 3) {
      return `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`;
    }
    return "rgb(128,128,128)";
  }

  static updateSyntheticClusters(clusterData, allLabels, compositeGeoRaster) {
    const syntheticLabels = allLabels.get(SEGMENTATION_KEYS.COMPOSITE);
    if (!syntheticLabels || syntheticLabels.size === 0) {
      clusterData[SEGMENTATION_KEYS.COMPOSITE] = {
        clusters: [],
        colors: new Map(),
      };
      return;
    }
    const pixelCounts = {};
    const rasterData = compositeGeoRaster.values[0];
    const height = compositeGeoRaster.height;
    const width = compositeGeoRaster.width;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const clusterId = rasterData[y][x];
        if (CLUSTER_ID_RANGES.isSynthetic(clusterId)) {
          pixelCounts[clusterId] = (pixelCounts[clusterId] || 0) + 1;
        }
      }
    }
    const clusters = [];
    const colors = new Map();
    for (const [clusterId, landUsePath] of syntheticLabels) {
      const pixelCount = pixelCounts[clusterId] || 0;
      clusters.push({
        id: clusterId,
        pixelCount,
        segmentationKey: SEGMENTATION_KEYS.COMPOSITE,
        area_ha: (pixelCount * 0.01).toFixed(2),
      });
      colors.set(clusterId, this.getSyntheticClusterColor(landUsePath));
    }
    clusterData[SEGMENTATION_KEYS.COMPOSITE] = { clusters, colors };
  }

  static getSyntheticClusterColor(landUsePath) {
    if (!landUsePath || landUsePath === "unlabeled") {
      return "rgb(255, 255, 0)";
    }
    if (!window.LandUseHierarchy || !window.LandUseHierarchy.isLoaded()) {
      throw new Error(
        "LandUseHierarchy not loaded - cannot generate synthetic cluster colors"
      );
    }
    const hierarchy = window.LandUseHierarchy.getInstance();
    const color = hierarchy.getColorForPath(landUsePath);
    if (!color) {
      throw new Error(
        `No color mapping found for land use path: ${landUsePath}`
      );
    }
    return `rgb(${hexToRgb(color)})`;
  }

  static async countPixelsPerCluster(georaster, colorMapping) {
    const rasterData = georaster.values[0];
    const height = georaster.height;
    const width = georaster.width;
    const flatData = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        flatData.push(rasterData[y][x]);
      }
    }
    const tensor = tf.tensor1d(flatData, "int32");
    const nodataValue = colorMapping?.nodata_value || -1;
    const validMask = tf.notEqual(tensor, nodataValue);
    const validPixels = tf.where(validMask, tensor, tf.scalar(-999, "int32"));
    const pixelData = await validPixels.data();
    const pixelCounts = {};
    for (let i = 0; i < pixelData.length; i++) {
      const clusterId = pixelData[i];
      if (clusterId !== -999 && clusterId !== nodataValue) {
        pixelCounts[clusterId] = (pixelCounts[clusterId] || 0) + 1;
      }
    }
    tensor.dispose();
    validMask.dispose();
    validPixels.dispose();
    return pixelCounts;
  }
}
