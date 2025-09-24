import { convertToGrayscale, SEGMENTATION_KEYS } from "./utils.js";

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

  convertPixelsToColor(
    values,
    overlayData,
    interactionMode,
    currentSegmentationKey
  ) {
    if (!values || values.some((v) => v === null || v === undefined)) {
      return null;
    }
    if (values.length === 1) {
      const pixelValue = values[0];
      const segmentationKey = currentSegmentationKey;
      if (segmentationKey === SEGMENTATION_KEYS.COMPOSITE) {
        return this.convertCompositePixelsToColor(pixelValue, interactionMode);
      }
      const colorMapping =
        this.dataLoader?.getColorMappingForSegmentation(segmentationKey);
      if (!colorMapping) {
        throw new Error(
          `Color mapping not found for segmentation: ${segmentationKey}`
        );
      }
      const baseColor = this.mapClusterValueToColor(pixelValue, colorMapping);
      if (
        (interactionMode === "cluster" || interactionMode === "composite") &&
        this.allClusterLabels &&
        this.allClusterLabels[segmentationKey] &&
        this.allClusterLabels[segmentationKey][pixelValue] &&
        this.allClusterLabels[segmentationKey][pixelValue] !== "unlabeled"
      ) {
        const grayColor = convertToGrayscale(baseColor);
        return `rgba(${grayColor.r},${grayColor.g},${grayColor.b},${grayColor.a / 255})`;
      }
      return `rgba(${baseColor.r},${baseColor.g},${baseColor.b},${baseColor.a / 255})`;
    }
    if (values.length >= 3) {
      return `rgb(${Math.round(values[0])},${Math.round(values[1])},${Math.round(values[2])})`;
    }
    return null;
  }

  convertCompositePixelsToColor(clusterId, interactionMode) {
    const compositeSegmentation = this.dataLoader?.segmentations?.get(
      SEGMENTATION_KEYS.COMPOSITE
    );
    if (!compositeSegmentation) {
      return null;
    }
    const cluster = compositeSegmentation.getCluster(clusterId);
    if (!cluster) {
      return null;
    }
    if (
      interactionMode === "composite" &&
      cluster.landUsePath !== "unlabeled"
    ) {
      const baseColor = this.parseColorString(cluster.color);
      const grayColor = convertToGrayscale(baseColor);
      return `rgba(${grayColor.r},${grayColor.g},${grayColor.b},${grayColor.a / 255})`;
    }
    return cluster.color;
  }

  parseColorString(colorString) {
    const match = colorString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    return {
      r: parseInt(match[1]),
      g: parseInt(match[2]),
      b: parseInt(match[3]),
      a: 255,
    };
  }

  mapClusterValueToColor(clusterValue, colorMapping) {
    if (!colorMapping || !colorMapping.colors_rgb) {
      throw new Error(
        "Color mapping is required but missing - check data pipeline"
      );
    }
    const colors = colorMapping.colors_rgb;
    if (clusterValue === colorMapping.nodata_value) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    const color = colors[clusterValue];
    if (color === null) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
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
