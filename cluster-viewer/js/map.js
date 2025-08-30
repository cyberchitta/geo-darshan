class MapManager {
  constructor(containerId, rasterHandler) {
    this.containerId = containerId;
    this.map = null;
    this.overlays = [];
    this.currentOverlay = null;
    this.currentOpacity = 0.8;
    this.baseLayers = {};
    this.geoRasterLayers = new Map();
    this.dataLoader = null;
    this.rasterHandler = rasterHandler;
    if (this.rasterHandler) {
      console.log(`MapManager initialized with ${this.rasterHandler.name}`);
    } else {
      console.log(
        "MapManager initialized (waiting for raster handler injection)"
      );
    }
  }

  async initialize() {
    try {
      this.map = L.map(this.containerId, {
        zoomControl: true,
        attributionControl: true,
      }).setView([12.0, 79.8], 13);
      this.baseLayers.esri = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "Tiles © Esri",
          maxZoom: 19,
          zIndex: 1,
        }
      );
      this.baseLayers.osm = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution: "© OpenStreetMap contributors",
          maxZoom: 19,
          zIndex: 1,
        }
      );
      this.baseLayers.esri.addTo(this.map);
      const layerControl = L.control.layers(
        {
          "Satellite (Esri)": this.baseLayers.esri,
          "Street Map (OSM)": this.baseLayers.osm,
        },
        {},
        { position: "topright" }
      );
      layerControl.addTo(this.map);
      console.log("✅ Map initialized with base layers and z-index control");
    } catch (error) {
      console.error("Failed to initialize map:", error);
      throw error;
    }
  }

  async createGeoRasterLayer(overlayData) {
    const { georaster, kValue } = overlayData;
    const layer = this.rasterHandler.createMapLayer(georaster, {
      opacity: this.currentOpacity,
      resolution: this.getOptimalResolution(georaster),
      pixelValuesToColorFn: (values) =>
        this.dataLoader.pixelValuesToColorFn(values, kValue),
      zIndex: 1000,
    });
    layer._kValue = kValue;
    layer._bounds = georaster.bounds;
    return layer;
  }

  setBaseLayer(layerName) {
    if (this.baseLayers[layerName]) {
      Object.values(this.baseLayers).forEach((layer) => {
        if (this.map.hasLayer(layer)) {
          this.map.removeLayer(layer);
        }
      });
      const newBaseLayer = this.baseLayers[layerName];
      newBaseLayer.addTo(this.map);
      newBaseLayer.on("add", () => {
        if (newBaseLayer.getContainer && newBaseLayer.getContainer()) {
          newBaseLayer.getContainer().style.zIndex = "1";
        }
      });
      console.log(`Switched to base layer: ${layerName} with z-index 1`);
      if (this.currentOverlay) {
        this.map.removeLayer(this.currentOverlay);
        this.currentOverlay.addTo(this.map);
      }
    }
  }

  setOverlayOpacity(opacity) {
    this.currentOpacity = Math.max(0, Math.min(1, opacity));
    if (this.currentOverlay && this.currentOverlay.setOpacity) {
      this.currentOverlay.setOpacity(this.currentOpacity);
    }
    console.log(`Overlay opacity set to ${this.currentOpacity}`);
  }

  setDataLoader(dataLoader) {
    this.dataLoader = dataLoader;
  }

  setOverlays(overlays) {
    this.overlays = overlays;
    this.geoRasterLayers.clear();
    console.log(`✅ Set ${overlays.length} overlays for map display`);
    this.preprocessOverlays().catch((error) => {
      console.error("Preprocessing failed:", error);
    });
  }

  async preprocessOverlays() {
    if (!this.overlays || this.overlays.length === 0) {
      console.warn("No overlays to preprocess");
      return;
    }
    console.log("Preprocessing georaster layers...");
    for (let i = 0; i < this.overlays.length; i++) {
      const overlayData = this.overlays[i];
      try {
        const geoRasterLayer = await this.createGeoRasterLayer(overlayData);
        this.geoRasterLayers.set(i, geoRasterLayer);
        console.log(
          `✅ Preprocessed layer ${i + 1}/${this.overlays.length} (k=${
            overlayData.kValue
          })`
        );
      } catch (error) {
        console.error(`Failed to preprocess layer ${i}:`, error);
      }
    }
    console.log("✅ All layer preprocessing complete");
  }

  getOptimalResolution(georaster) {
    const totalPixels = georaster.width * georaster.height;
    if (totalPixels > 100_000_000) return 128;
    if (totalPixels > 25_000_000) return 256;
    return 512;
  }

  showFrame(frameIndex, overlayData = null) {
    if (!this.overlays || this.overlays.length === 0) {
      console.warn("No overlays loaded yet, cannot show frame");
      return;
    }
    if (frameIndex < 0 || frameIndex >= this.overlays.length) {
      console.warn(
        `Invalid frame index: ${frameIndex}, available: 0-${
          this.overlays.length - 1
        }`
      );
      return;
    }
    if (this.currentOverlay) {
      this.map.removeLayer(this.currentOverlay);
      this.currentOverlay = null;
    }
    try {
      let layer = this.geoRasterLayers.get(frameIndex);
      if (!layer) {
        console.log(`Layer not ready for frame ${frameIndex}, creating...`);
        const overlayData = this.overlays[frameIndex];
        this.createGeoRasterLayer(overlayData)
          .then((newLayer) => {
            this.geoRasterLayers.set(frameIndex, newLayer);
            if (this.currentOverlay) {
              this.map.removeLayer(this.currentOverlay);
            }
            newLayer.addTo(this.map);
            this.currentOverlay = newLayer;
            console.log(
              `✅ Created and displayed layer for frame ${frameIndex}`
            );
          })
          .catch((error) => {
            console.error(
              `Failed to create layer for frame ${frameIndex}:`,
              error
            );
          });
        return;
      }
      layer.addTo(this.map);
      this.currentOverlay = layer;
      console.log(`✅ Displayed frame ${frameIndex} (k=${layer._kValue})`);
    } catch (error) {
      console.error(`Failed to show frame ${frameIndex}:`, error);
    }
  }

  fitBounds(bounds) {
    if (!this.map || !bounds) return;
    try {
      const leafletBounds = [
        [bounds[1], bounds[0]], // [south, west]
        [bounds[3], bounds[2]], // [north, east]
      ];
      this.map.fitBounds(leafletBounds, {
        padding: [20, 20],
        maxZoom: 16,
      });
      console.log(
        `Map fitted to bounds: ${bounds.map((b) => b.toFixed(6)).join(", ")}`
      );
    } catch (error) {
      console.error("Failed to fit bounds:", error);
    }
  }

  getCurrentBounds() {
    if (!this.map) return null;
    const bounds = this.map.getBounds();
    return [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ];
  }

  getCurrentZoom() {
    return this.map ? this.map.getZoom() : null;
  }

  getCurrentCenter() {
    if (!this.map) return null;
    const center = this.map.getCenter();
    return [center.lat, center.lng];
  }

  preloadFrames(startIndex = 0, count = 3) {
    const endIndex = Math.min(startIndex + count, this.overlays.length);
    for (let i = startIndex; i < endIndex; i++) {
      if (!this.geoRasterLayers.has(i)) {
        const overlayData = this.overlays[i];
        this.createGeoRasterLayer(overlayData)
          .then((layer) => {
            this.geoRasterLayers.set(i, layer);
            console.log(`Preloaded frame ${i}`);
          })
          .catch((error) => {
            console.error(`Failed to preload frame ${i}:`, error);
          });
      }
    }
  }

  clearOverlays() {
    if (this.currentOverlay) {
      this.map.removeLayer(this.currentOverlay);
      this.currentOverlay = null;
    }
    this.overlays = [];
    this.geoRasterLayers.clear();
    console.log("Cleared all overlays");
  }

  destroy() {
    this.clearOverlays();
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    console.log("MapManager destroyed");
  }

  getOverlayInfo() {
    return {
      totalOverlays: this.overlays.length,
      cachedLayers: this.geoRasterLayers.size,
      currentOpacity: this.currentOpacity,
      hasCurrentOverlay: !!this.currentOverlay,
      mapZoom: this.getCurrentZoom(),
      mapCenter: this.getCurrentCenter(),
      mapBounds: this.getCurrentBounds(),
    };
  }

  measureFrameSwitch(frameIndex) {
    const startTime = performance.now();
    this.showFrame(frameIndex);
    const endTime = performance.now();
    const switchTime = endTime - startTime;
    console.log(
      `Frame switch to ${frameIndex} took ${switchTime.toFixed(2)}ms`
    );
    return switchTime;
  }
}

export { MapManager };
