import { SEGMENTATION_KEYS } from "./utils.js";
import { Segmentation } from "./segmentation.js";
import { TensorRaster } from "./raster/tensor-raster.js";
import { Raster } from "./raster/raster.js";

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
      Segmentation.createComposite()
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

  static async countPixelsPerCluster(georaster, colorMapping) {
    const raster = Raster.fromGeoRaster(georaster);
    const nodataValue = colorMapping?.nodata_value || -1;
    const counts = await TensorRaster.countPixels(raster, nodataValue);
    const pixelCounts = {};
    counts.forEach((count, clusterId) => {
      pixelCounts[clusterId] = count;
    });
    return pixelCounts;
  }
}
