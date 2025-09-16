import { hexToRgb } from "./utils.js";
export class Cluster {
  static async extractClusterData(overlays, manifest, dataLoader) {
    const clusterData = {};
    for (let index = 0; index < overlays.length; index++) {
      const overlay = overlays[index];
      const segmentationKey = manifest.segmentation_keys[index];
      const colorMapping =
        dataLoader.getColorMappingForSegmentation(segmentationKey);
      const pixelCounts = await this.countPixelsPerCluster(
        overlay.georaster,
        colorMapping
      );
      const clusters = [];
      const colors = new Map();
      Object.entries(pixelCounts).forEach(([clusterId, count]) => {
        const id = parseInt(clusterId);
        clusters.push({
          id,
          pixelCount: count,
          segmentationKey,
          area_ha: (count * 0.01).toFixed(2),
        });
        if (colorMapping?.colors_rgb[id]) {
          const rgb = colorMapping.colors_rgb[id];
          colors.set(
            id,
            `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(
              rgb[1] * 255
            )}, ${Math.round(rgb[2] * 255)})`
          );
        }
      });
      clusterData[segmentationKey] = { clusters, colors };
    }
    clusterData["composite_regions"] = {
      clusters: [],
      colors: new Map(),
    };
    return clusterData;
  }

  static updateSyntheticClusters(clusterData, allLabels, compositeGeoRaster) {
    const syntheticLabels = allLabels.get("composite_regions");
    if (!syntheticLabels || syntheticLabels.size === 0) {
      clusterData["composite_regions"] = { clusters: [], colors: new Map() };
      return;
    }
    const pixelCounts = {};
    const rasterData = compositeGeoRaster.values[0];
    const height = compositeGeoRaster.height;
    const width = compositeGeoRaster.width;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const clusterId = rasterData[y][x];
        if (clusterId >= 10000) {
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
        segmentationKey: "composite_regions",
        area_ha: (pixelCount * 0.01).toFixed(2),
      });
      colors.set(clusterId, this.getSyntheticClusterColor(landUsePath));
    }
    clusterData["composite_regions"] = { clusters, colors };
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
