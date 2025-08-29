class ClusterViewer {
  constructor() {
    this.dataLoader = null;
    this.mapManager = null;
    this.animationController = null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      console.log("Initializing Cluster Viewer...");

      // Initialize components
      this.dataLoader = new DataLoader();
      this.mapManager = new MapManager("map");
      this.animationController = new AnimationController();

      // Setup event listeners
      this.setupEventListeners();
      this.setupKeyboardShortcuts();

      // Initialize map
      await this.mapManager.initialize();

      this.isInitialized = true;
      console.log("✅ Cluster Viewer initialized");
    } catch (error) {
      console.error("Failed to initialize viewer:", error);
      this.showError("Failed to initialize viewer");
    }
  }

  // Replace the existing setupEventListeners method in viewer.js
  setupEventListeners() {
    // File loading (existing code...)
    document.getElementById("load-data-btn").addEventListener("click", () => {
      document.getElementById("file-input").click();
    });

    document.getElementById("file-input").addEventListener("change", (e) => {
      this.handleFileSelect(e.target.files);
    });

    // Animation controls - enhanced
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

    // Speed control
    document.getElementById("speed-slider").addEventListener("input", (e) => {
      const speed = parseFloat(e.target.value);
      this.animationController.setSpeed(speed);
      document.getElementById("speed-value").textContent = `${speed}x`;
    });

    // K-value navigation - enhanced
    document.getElementById("k-slider").addEventListener("input", (e) => {
      const frameIndex = parseInt(e.target.value);
      this.animationController.goToFrame(frameIndex);
    });

    // Opacity control (existing code...)
    document.getElementById("opacity-slider").addEventListener("input", (e) => {
      const opacity = parseFloat(e.target.value);
      this.mapManager.setOverlayOpacity(opacity);
      document.getElementById("opacity-value").textContent = `${Math.round(
        opacity * 100
      )}%`;
    });

    // Animation events - enhanced
    this.animationController.on(
      "frameChanged",
      (frameIndex, kValue, overlay) => {
        this.updateUI(frameIndex, kValue);
        this.mapManager.showFrame(frameIndex, overlay);
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

    // Data loading events (existing code...)
    this.dataLoader.on("loadProgress", (loaded, total) => {
      this.updateLoadingProgress(loaded, total);
    });

    this.dataLoader.on("loadComplete", (manifest, overlays) => {
      this.handleDataLoaded(manifest, overlays);
    });

    this.dataLoader.on("loadError", (error) => {
      this.handleLoadError(error);
    });
  }

  // Add these new methods to viewer.js
  updateDetailedInfo(info) {
    // Update progress in loading status area
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
    const manifestFile = Array.from(files).find(
      (f) => f.name === "manifest.json"
    );
    if (!manifestFile) {
      this.showError("Please select a manifest.json file");
      return;
    }

    try {
      this.showLoading(true);
      await this.dataLoader.loadFromManifest(manifestFile);
    } catch (error) {
      console.error("Failed to load data:", error);
      this.showError("Failed to load clustering data");
      this.showLoading(false);
    }
  }

  async handleDataLoaded(manifest, overlays) {
    console.log("=== DATA LOADING START ===");
    console.log("Overlays received:", overlays.length);

    // Debug the first overlay bounds
    if (overlays.length > 0) {
      console.log("First overlay bounds:", overlays[0].bounds);
      console.log("Manifest bounds:", manifest.metadata.bounds);
    }

    // Set overlays in map first
    this.mapManager.setOverlays(overlays);
    this.mapManager.fitBounds(manifest.metadata.bounds);

    // Set frames in animation (won't trigger display yet)
    this.animationController.setFrames(manifest.k_values, overlays);

    // Update UI
    this.updateDataInfo(manifest);
    this.setupSliders(manifest.k_values);

    // NOW show the initial frame (both have data)
    this.animationController.showInitialFrame();

    this.showLoading(false);
    console.log("✅ Data loading complete");
  }

  handleLoadError(error) {
    console.error("Load error:", error);
    this.showError(`Failed to load data: ${error.message}`);
    this.showLoading(false);
  }

  updateUI(frameIndex, kValue) {
    document.getElementById("current-k").textContent = kValue;
    document.getElementById("k-slider").value = frameIndex;
  }

  updatePlayButton(isPlaying) {
    const btn = document.getElementById("play-pause");
    btn.textContent = isPlaying ? "⏸" : "▶";
    btn.title = isPlaying ? "Pause (Space)" : "Play (Space)";
  }

  updateDataInfo(manifest) {
    const { metadata, k_values, processing_stats } = manifest;

    document.getElementById(
      "data-status"
    ).textContent = `${k_values.length} frames loaded`;
    document.getElementById(
      "data-bounds"
    ).textContent = `Bounds: ${metadata.bounds.join(", ")}`;
    document.getElementById(
      "data-shape"
    ).textContent = `Shape: ${metadata.shape.join(" × ")}`;
  }

  setupSliders(kValues) {
    const slider = document.getElementById("k-slider");
    slider.min = 0;
    slider.max = kValues.length - 1;
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
  }
}

// Initialize when page loads
document.addEventListener("DOMContentLoaded", async () => {
  const viewer = new ClusterViewer();
  await viewer.initialize();

  // Make viewer globally accessible for debugging
  window.clusterViewer = viewer;
});
