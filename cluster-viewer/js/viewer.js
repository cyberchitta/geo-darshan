import { DataLoader } from "./data-loader.js";
import { MapManager } from "./map.js";
import { AnimationController } from "./animation.js";
import { LegendPanel } from "./legend.js";

class ClusterViewer {
  constructor() {
    this.dataLoader = null;
    this.mapManager = null;
    this.animationController = null;
    this.legendPanel = null;
    this.isInitialized = false;
    this.currentClusterData = null;
  }

  async initialize() {
    try {
      console.log("Initializing Cluster Viewer...");
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
      console.log("✅ Cluster Viewer initialized");
    } catch (error) {
      console.error("Failed to initialize viewer:", error);
      this.showError("Failed to initialize viewer");
    }
  }

  setupEventListeners() {
    document.getElementById("load-data-btn").addEventListener("click", () => {
      document.getElementById("file-input").click();
    });
    document.getElementById("file-input").addEventListener("change", (e) => {
      this.handleFileSelect(e.target.files);
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
    document.getElementById("opacity-slider").addEventListener("input", (e) => {
      const opacity = parseFloat(e.target.value);
      this.mapManager.setOverlayOpacity(opacity);
      document.getElementById("opacity-value").textContent = `${Math.round(
        opacity * 100
      )}%`;
    });
    this.animationController.on(
      "frameChanged",
      (frameIndex, kValue, overlay) => {
        this.updateUI(frameIndex, kValue);
        this.mapManager.showFrame(frameIndex, overlay);
        this.updateLegendForFrame(frameIndex, kValue);
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
      this.updateLoadingProgress(loaded, total);
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
    this.legendPanel.onClusterSelected = (clusterId) => {
      this.handleLegendClusterSelected(clusterId);
    };
    this.legendPanel.onLabelsChanged = (labels) => {
      this.onLabelsChanged(labels);
    };
  }

  updateDetailedInfo(info) {
    document.getElementById("loading-status").textContent = `Frame ${
      info.index + 1
    }/${info.total} (${info.progress.toFixed(1)}%)`;
  }

  updateControlStates(isPlaying) {
    const canStep = this.animationController.canStepBack();
    const canPlay = this.animationController.canPlay();
    document.getElementById("step-back").disabled = !canStep || isPlaying;
    document.getElementById("step-forward").disabled = !canStep || isPlaying;
    document.getElementById("play-pause").disabled = !canPlay;
    document.getElementById("k-slider").disabled = isPlaying;
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

  async handleFileSelect(files) {
    if (!files || files.length === 0) {
      this.showError("Please select a folder containing cluster data");
      return;
    }
    try {
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
    this.currentClusterData = this.extractClusterData(overlays, manifest);
    this.mapManager.setDataLoader(this.dataLoader);
    this.mapManager.setOverlays(overlays);
    await new Promise((resolve) => {
      this.mapManager.fitBounds(manifest.metadata.bounds);
      this.mapManager.map.whenReady(() => resolve());
    });
    this.animationController.setFrames(manifest.segmentation_keys, overlays);
    this.updateDataInfo(manifest);
    this.setupSliders(manifest.segmentation_keys);
    this.mapManager.on("firstLayerReady", () => {
      this.animationController.showInitialFrame();
      console.log("✅ Initial frame displayed after preprocessing");
    });
    this.showLoading(false);
    console.log("✅ Data loading complete");
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
    // this.mapManager.highlightCluster(clusterId);
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
      const numericK = this.extractKValue(segmentationKey);
      const numClusters = numericK || Math.floor(Math.random() * 15) + 5;
      for (let i = 0; i < numClusters; i++) {
        clusters.push({
          id: i,
          pixelCount: Math.floor(Math.random() * 2000) + 100,
          segmentationKey: segmentationKey,
          area_ha: ((Math.random() * 2000 + 100) * 0.01).toFixed(2),
        });
        const hue = (i * 137.508) % 360;
        const saturation = 70 + (i % 3) * 10;
        const lightness = 50 + (i % 2) * 20;
        colors.set(i, `hsl(${hue}, ${saturation}%, ${lightness}%)`);
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
  }

  onLabelsChanged(labels) {
    console.log("Cluster labels changed:", labels);
    try {
      localStorage.setItem(
        "cluster-labels",
        JSON.stringify({
          labels: labels,
          timestamp: new Date().toISOString(),
          segmentationKey: this.getCurrentSegmentationKey(),
        })
      );
      console.log("✅ Labels saved to localStorage");
    } catch (error) {
      console.warn("Failed to save labels to localStorage:", error);
    }
  }

  getCurrentSegmentationKey() {
    const frameInfo = this.animationController.getCurrentFrameInfo();
    return frameInfo.segmentationKey;
  }

  extractKValue(segmentationKey) {
    const match = segmentationKey.match(/k(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  handleLoadError(error) {
    console.error("Load error:", error);
    this.showError(`Failed to load data: ${error.message}`);
    this.showLoading(false);
  }

  updateUI(frameIndex, segmentationKey) {
    const numericK = this.extractKValue(segmentationKey);
    document.getElementById("current-k").textContent = numericK;
    document.getElementById("k-slider").value = frameIndex;
  }

  updatePlayButton(isPlaying) {
    const btn = document.getElementById("play-pause");
    btn.textContent = isPlaying ? "⏸" : "▶";
    btn.title = isPlaying ? "Pause (Space)" : "Play (Space)";
  }

  updateDataInfo(manifest) {
    const { metadata, segmentation_keys } = manifest;
    document.getElementById(
      "data-status"
    ).textContent = `${segmentation_keys.length} frames loaded`;
    document.getElementById(
      "data-bounds"
    ).textContent = `Bounds: ${metadata.bounds
      .map((b) => b.toFixed(6))
      .join(", ")}`;
    document.getElementById(
      "data-shape"
    ).textContent = `Shape: ${metadata.shape.join(" × ")}`;
  }

  setupSliders(segmentationKeys) {
    const slider = document.getElementById("k-slider");
    slider.min = 0;
    slider.max = segmentationKeys.length - 1;
    slider.value = 0;
  }

  updateLoadingProgress(loaded, total) {
    const percent = (loaded / total) * 100;
    document.getElementById("progress-fill").style.width = `${percent}%`;
    document.getElementById(
      "loading-status"
    ).textContent = `Loading ${loaded}/${total} files...`;
  }

  showLoading(show) {
    const overlay = document.getElementById("loading-overlay");
    if (show) {
      overlay.classList.remove("hidden");
    } else {
      overlay.classList.add("hidden");
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
