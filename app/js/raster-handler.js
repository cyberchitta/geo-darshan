class GeoRasterAdapter {
  constructor() {
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

  getOptimalResolution(rasterData) {
    const totalPixels = rasterData.width * rasterData.height;
    if (totalPixels > 100_000_000) return 128;
    if (totalPixels > 25_000_000) return 256;
    return 512;
  }
}

export { GeoRasterAdapter };
