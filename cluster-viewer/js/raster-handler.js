class RasterDataHandler {
  constructor() {
    this.name = "Abstract Raster Handler";
  }
  async parseGeoTIFF(arrayBuffer) {
    throw new Error("parseGeoTIFF must be implemented by subclass");
  }
  createMapLayer(rasterData, options) {
    throw new Error("createMapLayer must be implemented by subclass");
  }
  getMetadata(rasterData) {
    throw new Error("getMetadata must be implemented by subclass");
  }
  pixelValuesToColor(pixelValues, kValue) {
    throw new Error("pixelValuesToColor must be implemented by subclass");
  }
}

class GeoRasterAdapter extends RasterDataHandler {
  constructor() {
    super();
    this.name = "GeoRaster Adapter";
    console.log("GeoRasterAdapter initialized");
  }

  async parseGeoTIFF(arrayBuffer) {
    try {
      return await parseGeoraster(arrayBuffer);
    } catch (error) {
      console.error("GeoRaster parsing failed:", error);
      throw error;
    }
  }

  createMapLayer(rasterData, options = {}) {
    const {
      opacity = 0.8,
      pixelValuesToColorFn,
      resolution = this.getOptimalResolution(rasterData),
      zIndex = 1000,
    } = options;
    const layer = new GeoRasterLayer({
      georaster: rasterData,
      opacity,
      resolution,
      pixelValuesToColorFn,
      maxNativeZoom: 20,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 2,
      zIndex,
    });
    layer._bounds = rasterData.bounds;
    layer.on("add", () => {
      if (layer.getContainer && layer.getContainer()) {
        layer.getContainer().style.zIndex = zIndex.toString();
      }
    });
    return layer;
  }

  getMetadata(rasterData) {
    return {
      width: rasterData.width,
      height: rasterData.height,
      bands: rasterData.numberOfRasters,
      bounds: rasterData.bounds,
      noDataValue: rasterData.noDataValue,
      projection: rasterData.projection,
      pixelHeight: rasterData.pixelHeight,
      pixelWidth: rasterData.pixelWidth,
    };
  }

  pixelValuesToColor(pixelValues, kValue) {
    return null;
  }

  getOptimalResolution(rasterData) {
    const totalPixels = rasterData.width * rasterData.height;
    if (totalPixels > 100_000_000) return 128;
    if (totalPixels > 25_000_000) return 256;
    return 512;
  }
}

export { RasterDataHandler, GeoRasterAdapter };
