import { DataLoader } from "./data-loader.js";
import { MapManager } from "./map.js";
import { AnimationController } from "./animation.js";
import { LabeledCompositeLayer } from "./labeled-composite.js";
import { LandUseHierarchy } from "./land-use-hierarchy.js";

class ClusterViewer {
  constructor() {
    this.dataLoader = null;
    this.mapManager = null;
    this.animationController = null;
    this.isInitialized = false;
    this.currentClusterData = null;
    this.labeledLayer = null;
  }

  async initialize() {
    try {
      console.log("Initializing Cluster Viewer...");
      await LandUseHierarchy.loadFromFile();
      const rasterHandler = window.rasterHandler;
      if (!rasterHandler) {
        throw new Error(
          "Raster handler not found. Make sure it's injected from HTML."
        );
      }
      this.dataLoader = new DataLoader(rasterHandler);
      this.mapManager = new MapManager("map", rasterHandler);
      this.animationController = new AnimationController();
      this.setupEventListeners();
      this.setupKeyboardShortcuts();
      await this.mapManager.initialize();
      this.isInitialized = true;
      this.labeledLayer = new LabeledCompositeLayer(
        this.mapManager,
        this.dataLoader
      );
      console.log("✅ Cluster Viewer initialized");
    } catch (error) {
      console.error("Failed to initialize viewer:", error);
      this.showError("Failed to initialize viewer");
    }
  }

  setupEventListeners() {
    this.animationController.on(
      "frameChanged",
      (frameIndex, segmentationKey) => {
        this.mapManager.showFrame(frameIndex);
        this.updateLegendForFrame(frameIndex, segmentationKey);
      }
    );
    this.animationController.on("framesReady", (frameCount) => {
      console.log(`Animation ready with ${frameCount} frames`);
    });
    this.dataLoader.on("loadComplete", (manifest, overlays) => {
      this.handleDataLoaded(manifest, overlays);
    });
    this.dataLoader.on("loadError", (error) => {
      this.handleLoadError(error);
    });
    window.addEventListener("clearData", () => {
      this.clearData();
    });
  }

  async handleDataLoaded(manifest, overlays) {
    console.log("=== DATA LOADING START ===");
    console.log("Overlays received:", overlays.length);
    this.mapManager.setDataLoader(this.dataLoader);
    this.currentClusterData = await this.extractClusterData(overlays, manifest);
    this.mapManager.setOverlays(overlays);
    if (this.labeledLayer) {
      this.labeledLayer.setOverlayData(overlays);
    }
    await new Promise((resolve) => {
      this.mapManager.fitBounds(manifest.metadata.bounds);
      this.mapManager.map.whenReady(() => resolve());
    });
    this.animationController.setFrames(manifest.segmentation_keys, overlays);
    setTimeout(() => {
      this.animationController.showInitialFrame();
      console.log("✅ Initial frame displayed");
    }, 100);
    this.showLoading(false);
    console.log("✅ Data loading complete");
  }

  handleLoadError(error) {
    console.error("Load error:", error);
    this.showError(`Failed to load data: ${error.message}`);
    this.showLoading(false);
  }

  clearData() {
    if (!confirm("Clear all loaded data? This will reset the viewer.")) return;
    this.animationController.destroy();
    this.mapManager.clearOverlays();
    this.currentClusterData = null;
    console.log("✅ Data cleared");
  }

  setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      switch (e.code) {
        case "Space":
          e.preventDefault();
          this.animationController.togglePlayPause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          this.animationController.stepBack();
          break;
        case "ArrowRight":
          e.preventDefault();
          this.animationController.stepForward();
          break;
      }
    });
  }

  async extractClusterData(overlays, manifest) {
    const clusterData = {};
    for (let index = 0; index < overlays.length; index++) {
      const overlay = overlays[index];
      const segmentationKey = manifest.segmentation_keys[index];
      const colorMapping =
        this.dataLoader.getColorMappingForSegmentation(segmentationKey);
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
    return clusterData;
  }

  async countPixelsPerCluster(georaster, colorMapping) {
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

  updateLegendForFrame(frameIndex, segmentationKey) {
    if (!this.currentClusterData || !this.currentClusterData[segmentationKey]) {
      console.warn(`No cluster data for segmentation key: ${segmentationKey}`);
      return;
    }
    window.dispatchEvent(
      new CustomEvent("clusterDataReady", {
        detail: this.currentClusterData,
      })
    );
  }

  getCurrentSegmentationKey() {
    const frameInfo = this.animationController.getCurrentFrameInfo();
    return frameInfo.segmentationKey;
  }

  showLoading(show) {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) {
      overlay.classList.toggle("hidden", !show);
    }
  }

  showError(message) {
    alert(`Error: ${message}`);
    console.error("Viewer error:", message);
  }
}

export { ClusterViewer };
