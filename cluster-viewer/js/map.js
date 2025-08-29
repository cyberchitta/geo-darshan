class MapManager {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.overlays = [];
    this.currentOverlay = null;
    this.currentOpacity = 0.8;
    this.baseLayers = {};
    this.overlayCanvases = new Map(); // Cache for overlay canvases

    console.log("MapManager initialized");
  }

  async initialize() {
    try {
      // Initialize Leaflet map
      this.map = L.map(this.containerId, {
        zoomControl: true,
        attributionControl: true,
      }).setView([12.0, 79.8], 13);

      // Add base layers
      this.baseLayers.esri = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "Tiles © Esri",
          maxZoom: 19,
        }
      );

      this.baseLayers.osm = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution: "© OpenStreetMap contributors",
          maxZoom: 19,
        }
      );

      // Default to Esri imagery
      this.baseLayers.esri.addTo(this.map);

      // Add layer control
      const layerControl = L.control.layers(
        {
          "Satellite (Esri)": this.baseLayers.esri,
          "Street Map (OSM)": this.baseLayers.osm,
        },
        {},
        { position: "topright" }
      );
      layerControl.addTo(this.map);

      console.log("✅ Map initialized with base layers");
    } catch (error) {
      console.error("Failed to initialize map:", error);
      throw error;
    }
  }

  setOverlays(overlays) {
    this.overlays = overlays;
    this.overlayCanvases.clear(); // Clear cache

    console.log(`✅ Set ${overlays.length} overlays for map display`);

    // Start preprocessing in background, but don't block
    this.preprocessOverlays().catch((error) => {
      console.error("Preprocessing failed:", error);
    });
  }

  async preprocessOverlays() {
    if (!this.overlays || this.overlays.length === 0) {
      console.warn("No overlays to preprocess");
      return;
    }

    console.log("Preprocessing overlays for display...");

    for (let i = 0; i < this.overlays.length; i++) {
      const overlayData = this.overlays[i];

      try {
        // Create canvas element for this overlay
        const canvas = await this.createOverlayCanvas(overlayData);
        this.overlayCanvases.set(i, canvas);

        console.log(
          `✅ Preprocessed overlay ${i + 1}/${this.overlays.length} (k=${
            overlayData.kValue
          })`
        );
      } catch (error) {
        console.error(`Failed to preprocess overlay ${i}:`, error);
      }
    }

    console.log("✅ All overlay preprocessing complete");
  }

  async createOverlayCanvas(overlayData) {
    const { overlay, bounds } = overlayData;

    // Create canvas element
    const canvas = document.createElement("canvas");
    canvas.width = overlay.width;
    canvas.height = overlay.height;

    const ctx = canvas.getContext("2d");

    // Put image data on canvas
    ctx.putImageData(overlay.imageData, 0, 0);

    // Format bounds properly for Leaflet: [[south, west], [north, east]]
    let leafletBounds;
    if (Array.isArray(bounds) && bounds.length === 4) {
      // bounds format: [minx, miny, maxx, maxy]
      leafletBounds = [
        [bounds[1], bounds[0]],
        [bounds[3], bounds[2]],
      ];
    } else if (
      Array.isArray(bounds) &&
      bounds.length === 2 &&
      Array.isArray(bounds[0])
    ) {
      // Already in Leaflet format: [[south, west], [north, east]]
      leafletBounds = bounds;
    } else {
      console.error("Invalid bounds format in async creation:", bounds);
      throw new Error("Invalid bounds format");
    }

    // Return canvas with bounds info
    canvas._bounds = leafletBounds;
    canvas._kValue = overlayData.kValue;

    return canvas;
  }

  setOverlays(overlays) {
    this.overlays = overlays;
    this.overlayCanvases.clear(); // Clear cache

    console.log(`✅ Set ${overlays.length} overlays for map display`);

    // Start preprocessing in background, but don't block
    this.preprocessOverlays().catch((error) => {
      console.error("Preprocessing failed:", error);
    });
  }

  async preprocessOverlays() {
    if (!this.overlays || this.overlays.length === 0) {
      console.warn("No overlays to preprocess");
      return;
    }

    console.log("Preprocessing overlays for display...");

    for (let i = 0; i < this.overlays.length; i++) {
      const overlayData = this.overlays[i];

      try {
        // Create canvas element for this overlay
        const canvas = await this.createOverlayCanvas(overlayData);
        this.overlayCanvases.set(i, canvas);

        console.log(
          `✅ Preprocessed overlay ${i + 1}/${this.overlays.length} (k=${
            overlayData.kValue
          })`
        );
      } catch (error) {
        console.error(`Failed to preprocess overlay ${i}:`, error);
      }
    }

    console.log("✅ All overlay preprocessing complete");
  }

  showFrame(frameIndex, overlayData = null) {
    // Check if overlays are loaded
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

    // Remove current overlay if exists
    if (this.currentOverlay) {
      this.map.removeLayer(this.currentOverlay);
      this.currentOverlay = null;
    }

    try {
      // Get canvas for this frame (might not be ready yet)
      let canvas = this.overlayCanvases.get(frameIndex);

      if (!canvas) {
        console.log(
          `Canvas not ready for frame ${frameIndex}, creating immediately...`
        );
        // Create canvas synchronously from overlay data
        canvas = this.createOverlayCanvasSync(frameIndex);
        if (canvas) {
          this.overlayCanvases.set(frameIndex, canvas);
        }
      }

      if (!canvas) {
        console.error(`Failed to create canvas for frame ${frameIndex}`);
        return;
      }

      // Create image overlay from canvas
      const imageUrl = canvas.toDataURL("image/png");
      const bounds = canvas._bounds;

      // Create Leaflet ImageOverlay
      this.currentOverlay = L.imageOverlay(imageUrl, bounds, {
        opacity: this.currentOpacity,
        interactive: false,
        crossOrigin: "anonymous",
      });

      // Add to map
      this.currentOverlay.addTo(this.map);

      console.log(`✅ Displayed frame ${frameIndex} (k=${canvas._kValue})`);
    } catch (error) {
      console.error(`Failed to show frame ${frameIndex}:`, error);
    }
  }

  createOverlayCanvasSync(frameIndex) {
    if (frameIndex < 0 || frameIndex >= this.overlays.length) {
      console.error(
        `Invalid frame index for sync canvas creation: ${frameIndex}`
      );
      return null;
    }

    try {
      const overlayData = this.overlays[frameIndex];
      const { overlay, bounds } = overlayData;

      console.log("Overlay data for canvas creation:", {
        kValue: overlayData.kValue,
        bounds: bounds,
        overlayKeys: Object.keys(overlay),
      });

      // Create canvas element
      const canvas = document.createElement("canvas");
      canvas.width = overlay.width;
      canvas.height = overlay.height;

      const ctx = canvas.getContext("2d");

      // Put image data on canvas
      ctx.putImageData(overlay.imageData, 0, 0);

      // Format bounds properly for Leaflet: [[south, west], [north, east]]
      let leafletBounds;
      if (Array.isArray(bounds) && bounds.length === 4) {
        // bounds format: [minx, miny, maxx, maxy]
        leafletBounds = [
          [bounds[1], bounds[0]],
          [bounds[3], bounds[2]],
        ];
      } else if (
        Array.isArray(bounds) &&
        bounds.length === 2 &&
        Array.isArray(bounds[0])
      ) {
        // Already in Leaflet format: [[south, west], [north, east]]
        leafletBounds = bounds;
      } else {
        console.error("Invalid bounds format:", bounds);
        return null;
      }

      // Validate bounds values
      if (
        !leafletBounds ||
        leafletBounds.length !== 2 ||
        !Array.isArray(leafletBounds[0]) ||
        !Array.isArray(leafletBounds[1]) ||
        leafletBounds[0].length !== 2 ||
        leafletBounds[1].length !== 2
      ) {
        console.error("Invalid leaflet bounds structure:", leafletBounds);
        return null;
      }

      // Return canvas with bounds info
      canvas._bounds = leafletBounds;
      canvas._kValue = overlayData.kValue;

      console.log(
        `✅ Created canvas sync for frame ${frameIndex} (k=${overlayData.kValue})`
      );
      console.log("Canvas bounds:", leafletBounds);
      return canvas;
    } catch (error) {
      console.error(
        `Failed to create canvas sync for frame ${frameIndex}:`,
        error
      );
      return null;
    }
  }

  async createOverlayCanvasOnDemand(frameIndex) {
    if (frameIndex >= 0 && frameIndex < this.overlays.length) {
      try {
        const overlayData = this.overlays[frameIndex];
        const canvas = await this.createOverlayCanvas(overlayData);
        this.overlayCanvases.set(frameIndex, canvas);

        // Try showing frame again
        this.showFrame(frameIndex);
      } catch (error) {
        console.error(
          `Failed to create canvas on demand for frame ${frameIndex}:`,
          error
        );
      }
    }
  }

  setOverlayOpacity(opacity) {
    this.currentOpacity = Math.max(0, Math.min(1, opacity));

    if (this.currentOverlay) {
      this.currentOverlay.setOpacity(this.currentOpacity);
    }

    console.log(`Overlay opacity set to ${this.currentOpacity}`);
  }

  fitBounds(bounds) {
    if (!this.map || !bounds) return;

    try {
      // Convert bounds format: [minx, miny, maxx, maxy] -> [[miny, minx], [maxy, maxx]]
      const leafletBounds = [
        [bounds[1], bounds[0]],
        [bounds[3], bounds[2]],
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

  // Utility methods
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

  // Layer management
  setBaseLayer(layerName) {
    if (this.baseLayers[layerName]) {
      // Remove all base layers
      Object.values(this.baseLayers).forEach((layer) => {
        if (this.map.hasLayer(layer)) {
          this.map.removeLayer(layer);
        }
      });

      // Add selected base layer
      this.baseLayers[layerName].addTo(this.map);
      console.log(`Switched to base layer: ${layerName}`);
    }
  }

  // Animation-specific methods
  preloadFrames(startIndex = 0, count = 3) {
    // Preload next few frames for smoother animation
    const endIndex = Math.min(startIndex + count, this.overlays.length);

    for (let i = startIndex; i < endIndex; i++) {
      if (!this.overlayCanvases.has(i)) {
        const overlayData = this.overlays[i];
        this.createOverlayCanvas(overlayData)
          .then((canvas) => {
            this.overlayCanvases.set(i, canvas);
            console.log(`Preloaded frame ${i}`);
          })
          .catch((error) => {
            console.error(`Failed to preload frame ${i}:`, error);
          });
      }
    }
  }

  // Cleanup methods
  clearOverlays() {
    if (this.currentOverlay) {
      this.map.removeLayer(this.currentOverlay);
      this.currentOverlay = null;
    }

    this.overlays = [];
    this.overlayCanvases.clear();

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

  // Debug methods
  getOverlayInfo() {
    return {
      totalOverlays: this.overlays.length,
      cachedCanvases: this.overlayCanvases.size,
      currentOpacity: this.currentOpacity,
      hasCurrentOverlay: !!this.currentOverlay,
      mapZoom: this.getCurrentZoom(),
      mapCenter: this.getCurrentCenter(),
      mapBounds: this.getCurrentBounds(),
    };
  }

  // Performance monitoring
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
