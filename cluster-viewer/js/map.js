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
    this.listeners = {};
    this.overlayLayers = {};
    this.clusterLabels = new Map();
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
      this.layerControl = L.control.layers(
        {
          "Satellite (Esri)": this.baseLayers.esri,
          "Street Map (OSM)": this.baseLayers.osm,
        },
        {},
        { position: "topright" }
      );
      this.layerControl.addTo(this.map);
      console.log("✅ Map initialized with enhanced layer control");
      this.setupMapClickHandler();
      console.log("✅ Map initialized with click handling");
    } catch (error) {
      console.error("Failed to initialize map:", error);
      throw error;
    }
  }

  async createGeoRasterLayer(overlayData) {
    const { georaster } = overlayData;
    const segmentationKey = overlayData.segmentationKey;
    const layer = this.rasterHandler.createMapLayer(georaster, {
      opacity: 0,
      resolution: this.getOptimalResolution(georaster),
      pixelValuesToColorFn: (values) =>
        this.convertPixelsToColor(values, segmentationKey),
      zIndex: 1000,
    });
    layer._segmentationKey = segmentationKey;
    layer._bounds = georaster.bounds;
    return layer;
  }

  convertPixelsToColor(values, segmentationKey) {
    if (!values || values.some((v) => v === null || v === undefined)) {
      return null;
    }
    if (values.length === 1) {
      const clusterValue = values[0];
      const colorMapping =
        this.dataLoader?.getColorMappingForSegmentation(segmentationKey);
      if (!colorMapping) {
        throw new Error(
          `Color mapping not found for segmentation: ${segmentationKey}`
        );
      }
      const baseColor = this.mapClusterValueToColor(clusterValue, colorMapping);
      if (
        this.clusterLabels.has(clusterValue) &&
        this.clusterLabels.get(clusterValue) !== "unlabeled"
      ) {
        const grayColor = this.convertToGrayscale(baseColor);
        return `rgba(${grayColor.r},${grayColor.g},${grayColor.b},${
          grayColor.a / 255
        })`;
      }
      return `rgba(${baseColor.r},${baseColor.g},${baseColor.b},${
        baseColor.a / 255
      })`;
    }
    if (values.length >= 3) {
      return `rgb(${Math.round(values[0])},${Math.round(
        values[1]
      )},${Math.round(values[2])})`;
    }
    return null;
  }

  mapClusterValueToColor(clusterValue, colorMapping) {
    if (!colorMapping || !colorMapping.colors_rgb) {
      throw new Error(
        "Color mapping is required but missing - check data pipeline"
      );
    }
    const colors = colorMapping.colors_rgb;
    if (clusterValue === 0 || clusterValue === colorMapping.nodata_value) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    const color = colors[clusterValue];
    if (color && color.length >= 3) {
      return {
        r: Math.round(color[0] * 255),
        g: Math.round(color[1] * 255),
        b: Math.round(color[2] * 255),
        a: 255,
      };
    }
    throw new Error(`No color defined for cluster ${clusterValue} in mapping`);
  }

  convertToGrayscale(color) {
    const gray = Math.round(
      0.299 * color.r + 0.587 * color.g + 0.114 * color.b
    );
    return {
      r: gray,
      g: gray,
      b: gray,
      a: color.a,
    };
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
    this.animationLayerControlName = "Animation Layer";
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
    this.geoRasterLayers.clear();
    this.animationLayerGroup = L.layerGroup();
    for (let i = 0; i < this.overlays.length; i++) {
      const overlayData = this.overlays[i];
      try {
        console.log(
          `Loading ${overlayData.filename} (${overlayData.segmentationKey})...`
        );
        const geoRasterLayer = await this.createGeoRasterLayer(overlayData);
        geoRasterLayer.addTo(this.map);
        this.animationLayerGroup.addLayer(geoRasterLayer);
        geoRasterLayer.setOpacity(0);
        this.geoRasterLayers.set(i, geoRasterLayer);
        console.log(
          `✅ Preprocessed and added layer ${i + 1}/${this.overlays.length}`
        );
        if (i === 0) {
          this.emit("firstLayerReady");
        }
      } catch (error) {
        console.error(`Failed to preprocess layer ${i}:`, error);
        throw error;
      }
    }
    this.addOverlayLayer(
      this.animationLayerControlName,
      this.animationLayerGroup,
      true
    );
    console.log("✅ Animation layer added to layer control");
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
    try {
      this.geoRasterLayers.forEach((layer, index) => {
        const opacity = index === frameIndex ? this.currentOpacity : 0;
        if (layer.setOpacity) {
          layer.setOpacity(opacity);
        }
      });
      this.currentOverlay = this.geoRasterLayers.get(frameIndex);
      console.log(`✅ Displayed frame ${frameIndex} (opacity switch only)`);
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

  setupMapClickHandler() {
    this.map.on("click", (e) => {
      this.handleMapClick(e.latlng);
    });
  }

  async handleMapClick(latlng) {
    if (!this.currentOverlay || !this.currentOverlay.georasters[0]) {
      console.log("No active overlay to sample");
      return;
    }
    try {
      const clusterValue = await this.samplePixelAtCoordinate(latlng);
      if (
        clusterValue !== null &&
        clusterValue !== undefined &&
        clusterValue > 0
      ) {
        this.emit("clusterClicked", clusterValue, latlng);
      } else {
        this.emit("backgroundClicked", latlng);
      }
    } catch (error) {
      console.error("Failed to sample pixel at click:", error);
    }
  }

  async samplePixelAtCoordinate(latlng) {
    const georaster = this.currentOverlay.georasters[0];
    console.log("Sampling pixel at:", latlng.lat, latlng.lng);
    const x = (latlng.lng - georaster.xmin) / georaster.pixelWidth;
    const y = (georaster.ymax - latlng.lat) / georaster.pixelHeight;
    console.log("Pixel coordinates:", x, y);
    console.log("Georaster size:", georaster.width, georaster.height);
    if (x < 0 || x >= georaster.width || y < 0 || y >= georaster.height) {
      console.log("Click outside raster bounds");
      return null;
    }
    const pixelX = Math.floor(x);
    const pixelY = Math.floor(y);
    console.log("Array indices:", pixelX, pixelY);
    try {
      const pixelValue = georaster.values[0][pixelY][pixelX];
      console.log("Sampled pixel value:", pixelValue);
      return pixelValue;
    } catch (error) {
      console.error("Error accessing pixel value:", error);
      return null;
    }
  }

  emit(event, ...args) {
    if (!this.listeners) this.listeners = {};
    if (this.listeners[event]) {
      this.listeners[event].forEach((callback) => callback(...args));
    }
  }

  on(event, callback) {
    if (!this.listeners) this.listeners = {};
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  addOverlayLayer(name, layer, visible = false) {
    this.overlayLayers[name] = layer;
    this.layerControl.addOverlay(layer, name);
    if (visible) {
      layer.addTo(this.map);
    }
    console.log(`Added overlay layer: ${name} (visible: ${visible})`);
  }

  removeOverlayLayer(name) {
    const layer = this.overlayLayers[name];
    if (layer) {
      this.layerControl.removeLayer(layer);
      if (this.map.hasLayer(layer)) {
        this.map.removeLayer(layer);
      }
      delete this.overlayLayers[name];
      console.log(`Removed overlay layer: ${name}`);
    }
  }

  extractKValue(segmentationKey) {
    const match = segmentationKey.match(/k(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  updateClusterLabels(labels) {
    this.clusterLabels.clear();
    Object.entries(labels).forEach(([clusterId, label]) => {
      this.clusterLabels.set(parseInt(clusterId), label);
    });
    this.forceRedraw();
  }

  forceRedraw() {
    if (this.currentOverlay && this.currentOverlay.setOpacity) {
      const currentOpacity = this.currentOpacity;
      this.currentOverlay.setOpacity(0);
      setTimeout(() => {
        if (this.currentOverlay && this.currentOverlay.setOpacity) {
          this.currentOverlay.setOpacity(currentOpacity);
        }
      }, 10);
    }
  }
}

export { MapManager };
