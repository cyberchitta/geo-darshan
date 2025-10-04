import { RasterFactory } from "./raster-factory.js";
import { TensorRaster } from "./tensor-raster.js";
import { Raster } from "./raster.js";
import { SEGMENTATION_KEYS } from "../utils.js";

class SegmentedRasterLoader {
  constructor(dataIO) {
    this.dataIO = dataIO;
  }

  /**
   * Load segmented rasters from overlay data.
   * @param {Array} overlays - Overlay data with georasters
   * @param {Object} manifest - Manifest with segmentation keys
   * @returns {Promise<Map<string, SegmentedRaster>>}
   */
  async load(overlays, manifest) {
    const rasters = new Map();
    for (let index = 0; index < overlays.length; index++) {
      const overlay = overlays[index];
      const key = manifest.segmentation_keys[index];
      const colorMapping = this.dataIO.getColorMappingForSegmentation(key);
      const segRaster = RasterFactory.fromFile(
        key,
        overlay.georaster,
        colorMapping,
        overlay.stats
      );
      const pixelCounts = await this._countPixels(
        overlay.georaster,
        colorMapping
      );
      Object.entries(pixelCounts).forEach(([clusterId, count]) => {
        const id = parseInt(clusterId);
        const color = this._getColor(id, colorMapping);
        segRaster.registry.add(id, count, "unlabeled", color);
      });
      rasters.set(key, segRaster);
    }
    const refRaster = Raster.fromGeoRaster(overlays[0].georaster);
    rasters.set(
      SEGMENTATION_KEYS.COMPOSITE,
      RasterFactory.createCompositePlaceholder(
        SEGMENTATION_KEYS.COMPOSITE,
        refRaster
      )
    );
    return rasters;
  }

  async _countPixels(georaster, colorMapping) {
    const raster = Raster.fromGeoRaster(georaster);
    const nodataValue = colorMapping?.nodata_value || -1;
    const counts = await TensorRaster.countPixels(raster, nodataValue);
    const pixelCounts = {};
    counts.forEach((count, clusterId) => {
      pixelCounts[clusterId] = count;
    });
    return pixelCounts;
  }

  _getColor(clusterId, colorMapping) {
    if (!colorMapping?.colors_rgb) return "rgb(128,128,128)";
    const color = colorMapping.colors_rgb[clusterId];
    if (color && color.length >= 3) {
      return `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`;
    }
    return "rgb(128,128,128)";
  }
}

export { SegmentedRasterLoader };
