import { DataLoader } from "./data-loader.js";
import { MapManager } from "./map.js";
import { AnimationController } from "./animation.js";
import { LegendPanel } from "./legend.js";
import { LabeledCompositeLayer } from "./labeled-composite.js";
import { LandUseHierarchy } from "./land-use-hierarchy.js";
import { extractKValue, STORAGE_KEYS } from "./utils.js";

class ClusterViewer {
  constructor() {
    this.dataLoader = null;
    this.mapManager = null;
    this.animationController = null;
    this.legendPanel = null;
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
      this.legendPanel = new LegendPanel("legend-panel");
      this.setupEventListeners();
      this.setupKeyboardShortcuts();
      await this.mapManager.initialize();
      this.isInitialized = true;
      this.labeledLayer = new LabeledCompositeLayer(
        this.mapManager,
        this.dataLoader
      );
      this.legendPanel.setLabeledLayer(this.labeledLayer);
      console.log("✅ Labeled regions layer initialized and registered");
    } catch (error) {
      console.error("Failed to initialize viewer:", error);
      this.showError("Failed to initialize viewer");
    }
  }

  setupEventListeners() {
    this.animationController.on(
      "frameChanged",
      (frameIndex, segmentationKey) => {
        this.updateUI(frameIndex, segmentationKey);
        this.mapManager.showFrame(frameIndex);
        this.updateLegendForFrame(frameIndex, segmentationKey);
        const currentLabels =
          this.legendPanel.getAllLabelsAsObject()[segmentationKey] || {};
        this.mapManager.updateClusterLabels(currentLabels, segmentationKey);
      }
    );
    this.animationController.on("frameInfo", (info) => {
      this.updateDetailedInfo(info);
    });
    this.animationController.on("playStateChanged", (isPlaying) => {
      this.updatePlayButton(isPlaying);
      this.updateControlStates(isPlaying);
    });
    this.animationController.on("framesReady", (frameCount) => {
      this.updateControlStates(false);
      console.log(`Animation ready with ${frameCount} frames`);
    });
    this.dataLoader.on("loadProgress", (loaded, total) => {
      this.legendPanel.updateLoadingProgress(loaded, total);
    });
    this.dataLoader.on("loadComplete", (manifest, overlays) => {
      this.handleDataLoaded(manifest, overlays);
    });
    this.dataLoader.on("loadError", (error) => {
      this.handleLoadError(error);
    });
    this.mapManager.on("clusterClicked", (clusterValue, latlng) => {
      this.handleClusterClicked(clusterValue, latlng);
    });
    this.mapManager.on("backgroundClicked", (latlng) => {
      this.handleBackgroundClicked(latlng);
    });
    this.legendPanel.on("animationLayerToggle", (visible) => {
      this.handleAnimationLayerToggle(visible);
    });
    this.legendPanel.on("animationOpacityChange", (opacity) => {
      this.mapManager.setOverlayOpacity(opacity);
    });
    this.legendPanel.on("labeledRegionsToggle", (visible) => {
      this.handleLabeledRegionsToggle(visible);
    });
    this.legendPanel.on("labeledRegionsOpacityChange", (opacity) => {
      if (this.labeledLayer) {
        this.labeledLayer.setOpacity(opacity);
      }
    });
    this.legendPanel.on("hierarchyLevelChange", (level) => {
      if (this.labeledLayer) {
        this.labeledLayer.setHierarchyLevel(level);
      }
    });
    this.legendPanel.on("fileSelect", (files) => {
      this.handleFileSelect(files);
    });
    this.legendPanel.on("clearData", () => {
      this.clearData();
    });
    document.getElementById("play-pause").addEventListener("click", () => {
      if (this.animationController.canPlay()) {
        this.animationController.togglePlayPause();
      }
    });
    document.getElementById("step-back").addEventListener("click", () => {
      this.animationController.stepBack();
    });
    document.getElementById("step-forward").addEventListener("click", () => {
      this.animationController.stepForward();
    });
    document.getElementById("speed-slider").addEventListener("input", (e) => {
      const speed = parseFloat(e.target.value);
      this.animationController.setSpeed(speed);
      document.getElementById("speed-value").textContent = `${speed}x`;
    });
    document.getElementById("k-slider").addEventListener("input", (e) => {
      const frameIndex = parseInt(e.target.value);
      this.animationController.goToFrame(frameIndex);
    });
  }

  handleAnimationLayerToggle(visible) {
    if (this.mapManager.animationLayerGroup) {
      if (visible) {
        if (
          !this.mapManager.map.hasLayer(this.mapManager.animationLayerGroup)
        ) {
          this.mapManager.animationLayerGroup.addTo(this.mapManager.map);
        }
      } else {
        if (this.mapManager.map.hasLayer(this.mapManager.animationLayerGroup)) {
          this.mapManager.map.removeLayer(this.mapManager.animationLayerGroup);
        }
      }
    }
    console.log(`Animation layer ${visible ? "enabled" : "disabled"}`);
  }

  handleLabeledRegionsToggle(visible) {
    if (this.labeledLayer) {
      if (
        visible &&
        this.labeledLayer.overlayData.size > 0 &&
        this.labeledLayer.allLabels.size > 0
      ) {
        this.labeledLayer
          .regenerateComposite()
          .then(() => {
            this.labeledLayer.setVisible(visible);
          })
          .catch((error) => {
            console.error("Failed to generate labeled composite:", error);
          });
      } else {
        this.labeledLayer.setVisible(visible);
      }
    }
    console.log(`Labeled regions layer ${visible ? "enabled" : "disabled"}`);
  }

  async handleFileSelect(files) {
    if (!files || files.length === 0) {
      this.showError("Please select a folder containing cluster data");
      return;
    }
    try {
      this.legendPanel.switchToTab("data");
      this.showLoading(true);
      await this.dataLoader.loadFromFolder(files);
    } catch (error) {
      console.error("Failed to load data:", error);
      this.showError("Failed to load clustering data");
      this.showLoading(false);
    }
  }

  async handleDataLoaded(manifest, overlays) {
    console.log("=== DATA LOADING START ===");
    console.log("Overlays received:", overlays.length);
    this.mapManager.setDataLoader(this.dataLoader);
    this.currentClusterData = this.extractClusterData(overlays, manifest);
    this.mapManager.setOverlays(overlays);
    if (this.labeledLayer) {
      this.labeledLayer.setOverlayData(overlays);
    }
    await new Promise((resolve) => {
      this.mapManager.fitBounds(manifest.metadata.bounds);
      this.mapManager.map.whenReady(() => resolve());
    });
    this.animationController.setFrames(manifest.segmentation_keys, overlays);
    this.legendPanel.updateDataInfo(manifest);
    this.setupSliders(manifest.segmentation_keys);
    setTimeout(async () => {
      await this.loadSavedLabels();
      this.animationController.showInitialFrame();
      console.log("✅ Initial frame displayed with saved labels");
      const allLabels = this.legendPanel.getAllLabelsAsObject();
      if (Object.keys(allLabels).length > 0 && this.labeledLayer) {
        this.labeledLayer.updateLabels(allLabels);
      }
      setTimeout(() => this.legendPanel.switchToTab("clusters"), 500);
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
    this.legendPanel.clearDataDisplay();
    document.getElementById("current-k").textContent = "--";
    document.getElementById("k-slider").value = 0;
    this.updateControlStates(false);
    console.log("✅ Data cleared");
  }

  updateDetailedInfo(info) {
    // This might need to be moved to appropriate renderer or removed
    const statusElement = document.getElementById("loading-status");
    if (statusElement) {
      statusElement.textContent = `Frame ${info.index + 1}/${
        info.total
      } (${info.progress.toFixed(1)}%)`;
    }
  }

  updateControlStates(isPlaying) {
    const canStep = this.animationController.canStepBack();
    const canPlay = this.animationController.canPlay();
    const stepBackBtn = document.getElementById("step-back");
    const stepForwardBtn = document.getElementById("step-forward");
    const playBtn = document.getElementById("play-pause");
    const kSlider = document.getElementById("k-slider");
    if (stepBackBtn) stepBackBtn.disabled = !canStep || isPlaying;
    if (stepForwardBtn) stepForwardBtn.disabled = !canStep || isPlaying;
    if (playBtn) playBtn.disabled = !canPlay;
    if (kSlider) kSlider.disabled = isPlaying;
  }

  setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        this.animationController.togglePlayPause();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        this.animationController.stepBack();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        this.animationController.stepForward();
      }
    });
  }

  handleClusterClicked(clusterValue, latlng) {
    console.log(
      `Map click: cluster ${clusterValue} at ${latlng.lat.toFixed(
        6
      )}, ${latlng.lng.toFixed(6)}`
    );
    this.legendPanel.selectCluster(clusterValue);
    this.showClickFeedback(latlng);
  }

  handleBackgroundClicked(latlng) {
    console.log(
      `Background clicked at ${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`
    );
    this.legendPanel.clearSelection();
  }

  handleLegendClusterSelected(clusterId) {
    console.log(`Legend selection: cluster ${clusterId}`);
    // TODO: Highlight cluster on map (next phase)
  }

  showClickFeedback(latlng) {
    if (this.clickMarker) {
      this.mapManager.map.removeLayer(this.clickMarker);
    }
    this.clickMarker = L.circleMarker(latlng, {
      radius: 5,
      fillColor: "#ff0000",
      color: "#ff0000",
      weight: 2,
      opacity: 0.8,
      fillOpacity: 0.3,
    }).addTo(this.mapManager.map);
    setTimeout(() => {
      if (this.clickMarker) {
        this.mapManager.map.removeLayer(this.clickMarker);
        this.clickMarker = null;
      }
    }, 2000);
  }

  extractClusterData(overlays, manifest) {
    const clusterData = {};
    overlays.forEach((overlay, index) => {
      const segmentationKey = manifest.segmentation_keys[index];
      const clusters = [];
      const colors = new Map();
      const colorMapping =
        this.dataLoader.getColorMappingForSegmentation(segmentationKey);
      const numericK = extractKValue(segmentationKey);
      const numClusters = numericK || Math.floor(Math.random() * 15) + 5;
      for (let i = 0; i < numClusters; i++) {
        clusters.push({
          id: i,
          pixelCount: Math.floor(Math.random() * 2000) + 100,
          segmentationKey: segmentationKey,
          area_ha: ((Math.random() * 2000 + 100) * 0.01).toFixed(2),
        });
        if (colorMapping && colorMapping.colors_rgb[i]) {
          const rgb = colorMapping.colors_rgb[i];
          const r = Math.round(rgb[0] * 255);
          const g = Math.round(rgb[1] * 255);
          const b = Math.round(rgb[2] * 255);
          colors.set(i, `rgb(${r}, ${g}, ${b})`);
        } else {
          throw new Error(
            `No color mapping found for cluster ${i} in segmentation ${segmentationKey}`
          );
        }
      }
      clusterData[segmentationKey] = { clusters, colors };
    });
    return clusterData;
  }

  updateLegendForFrame(frameIndex, segmentationKey) {
    if (!this.currentClusterData || !this.currentClusterData[segmentationKey]) {
      console.warn(`No cluster data for segmentation key: ${segmentationKey}`);
      return;
    }
    const { clusters, colors } = this.currentClusterData[segmentationKey];
    this.legendPanel.updateClusters(clusters, colors);
    this.legendPanel.switchToSegmentation(segmentationKey);
  }

  onLabelsChanged(allLabels) {
    console.log("Cluster labels changed:", allLabels);
    try {
      localStorage.setItem(
        STORAGE_KEYS.CLUSTER_LABELS,
        JSON.stringify({
          labels: allLabels,
          timestamp: new Date().toISOString(),
        })
      );
      console.log("✅ Labels saved to localStorage");
    } catch (error) {
      console.warn("Failed to save labels to localStorage:", error);
    }
    const currentSegmentationKey = this.getCurrentSegmentationKey();
    const currentLabels = allLabels[currentSegmentationKey] || {};
    this.mapManager.updateClusterLabels(currentLabels, currentSegmentationKey);
    if (this.labeledLayer) {
      this.labeledLayer.updateLabels(allLabels);
    }
  }

  async loadSavedLabels() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CLUSTER_LABELS);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.labels && this.legendPanel) {
          const blob = new Blob([JSON.stringify(data.labels)], {
            type: "application/json",
          });
          const file = new File([blob], "saved-labels.json");
          await this.legendPanel.loadLabels(file);
        }
      }
    } catch (error) {
      console.warn("Failed to load saved labels:", error);
    }
  }

  getCurrentSegmentationKey() {
    const frameInfo = this.animationController.getCurrentFrameInfo();
    return frameInfo.segmentationKey;
  }

  updateUI(frameIndex, segmentationKey) {
    const numericK = extractKValue(segmentationKey);
    const currentKElement = document.getElementById("current-k");
    const kSliderElement = document.getElementById("k-slider");
    if (currentKElement) currentKElement.textContent = numericK;
    if (kSliderElement) kSliderElement.value = frameIndex;
  }

  updatePlayButton(isPlaying) {
    const btn = document.getElementById("play-pause");
    if (btn) {
      btn.textContent = isPlaying ? "⏸" : "▶";
      btn.title = isPlaying ? "Pause (Space)" : "Play (Space)";
    }
  }

  setupSliders(segmentationKeys) {
    const slider = document.getElementById("k-slider");
    if (slider) {
      slider.min = 0;
      slider.max = segmentationKeys.length - 1;
      slider.value = 0;
    }
  }

  showLoading(show) {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) {
      if (show) {
        overlay.classList.remove("hidden");
      } else {
        overlay.classList.add("hidden");
      }
    }
  }

  showError(message) {
    alert(`Error: ${message}`);
    console.error("Viewer error:", message);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const viewer = new ClusterViewer();
  await viewer.initialize();
  window.clusterViewer = viewer;
});

export { ClusterViewer };
