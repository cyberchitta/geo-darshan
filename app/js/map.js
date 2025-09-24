class MapManager {
  constructor(containerId, rasterHandler) {
    this.containerId = containerId;
    this.map = null;
    this.currentOpacity = 0.8;
    this.baseLayers = {};
    this.dataLoader = null;
    this.rasterHandler = rasterHandler;
    this.listeners = {};
    this.overlayLayers = {};
    this.interactionMode = "view";
    this.labeledLayer = null;
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

  setDataLoader(dataLoader) {
    this.dataLoader = dataLoader;
    console.log(`MapManager dataLoader set: ${!!dataLoader}`);
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
    }
  }

  setOverlayOpacity(opacity) {
    this.currentOpacity = Math.max(0, Math.min(1, opacity));
    this.emit("globalOpacityChanged", this.currentOpacity);
    console.log(`Global layer opacity set to ${this.currentOpacity}`);
  }

  setLabeledLayer(labeledLayer) {
    this.labeledLayer = labeledLayer;
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

  destroy() {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    console.log("MapManager destroyed");
  }

  getOverlayInfo() {
    return {
      currentOpacity: this.currentOpacity,
      mapZoom: this.getCurrentZoom(),
      mapCenter: this.getCurrentCenter(),
      mapBounds: this.getCurrentBounds(),
    };
  }

  setupMapClickHandler() {
    this.map.on("click", (e) => {
      this.handleMapClick(e.latlng);
    });
  }

  setInteractionMode(mode) {
    this.interactionMode = mode;
    console.log(`Interaction mode set to: ${mode}`);
  }

  async handleMapClick(latlng) {
    if (this.interactionMode === "view") {
      return;
    } else if (this.interactionMode === "composite") {
      this.emit("compositeClick", latlng);
    } else if (this.interactionMode === "cluster") {
      this.emit("clusterInteraction", latlng);
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
}

export { MapManager };
