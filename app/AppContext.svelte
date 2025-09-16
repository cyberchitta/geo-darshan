<script>
  import { setContext, getContext, onMount } from "svelte";
  import { STORAGE_KEYS } from "./js/utils.js";
  import { DataLoader } from "./js/data-loader.js";
  import { MapManager } from "./js/map.js";
  import { AnimationController } from "./js/animation.js";
  import { LandUseHierarchy } from "./js/land-use-hierarchy.js";
  import { Cluster } from "./js/cluster.js";
  import LabeledCompositeController from "./components/LabeledCompositeController.svelte";
  import LegendPanel from "./components/LegendPanel.svelte";
  import ControlsPanel from "./components/ControlsPanel.svelte";

  let {} = $props();

  const labeledLayerContext = getContext("labeledLayer");
  let labeledLayer = $derived(labeledLayerContext?.instance);

  let dataLoader = $state();
  let mapManager = $state();
  let animationController = $state();

  setContext("managers", {
    get dataLoader() {
      return dataLoader;
    },
    get mapManager() {
      return mapManager;
    },
    get animationController() {
      return animationController;
    },
  });

  let currentFrame = $state(0);
  let totalFrames = $state(0);
  let isPlaying = $state(false);
  let currentSegmentationKey = $state(null);
  let labelsReady = $state(false);
  let clusterLabels = $state({});
  let manifest = $state(null);
  let overlayData = $state([]);
  let allClusterData = $state({});
  let selectedCluster = $state(null);

  let currentSegmentationData = $derived(
    currentSegmentationKey ? allClusterData[currentSegmentationKey] : null
  );

  onMount(async () => {
    console.log("AppContext mounted, initializing managers...");
    try {
      await LandUseHierarchy.loadFromFile();
      const rasterHandler = window.rasterHandler;
      if (!rasterHandler) {
        throw new Error(
          "Raster handler not found. Make sure it's injected from HTML."
        );
      }
      dataLoader = new DataLoader(rasterHandler);
      mapManager = new MapManager("map", rasterHandler);
      animationController = new AnimationController();
      setupEventListeners();
      setupKeyboardShortcuts();
      await mapManager.initialize();
      console.log("✅ All managers initialized");
    } catch (error) {
      console.error("Failed to initialize:", error);
      showError("Failed to initialize viewer");
    }
    loadSavedLabels();
  });

  function setupEventListeners() {
    animationController.on("frameChanged", (frameIndex, segmentationKey) => {
      console.log("Frame changed:", frameIndex, segmentationKey);
      currentFrame = frameIndex;
      currentSegmentationKey = segmentationKey;
      mapManager.showFrame(frameIndex);
    });
    animationController.on("framesReady", (frameCount) => {
      console.log("Frames ready:", frameCount);
      totalFrames = frameCount;
    });
    animationController.on("playStateChanged", (playing) => {
      console.log("Play state changed:", playing);
      isPlaying = playing;
    });
    dataLoader.on("loadComplete", (manifestData, overlays) => {
      handleDataLoaded(manifestData, overlays);
    });
    dataLoader.on("loadError", (error) => {
      handleLoadError(error);
    });
    mapManager.on("clusterClicked", (clusterValue, latlng) => {
      console.log("Cluster clicked:", clusterValue);
      selectedCluster = {
        clusterId: clusterValue,
        segmentationKey: currentSegmentationKey,
        latlng,
      };
    });
    mapManager.on("compositeClick", (latlng) => {
      if (labeledLayer && labeledLayer.handleCompositeClick) {
        labeledLayer.handleCompositeClick(latlng);
      } else {
        console.log("No labeled layer available for composite labeling");
      }
    });
    mapManager.on("globalOpacityChanged", (opacity) => {
      if (labeledLayer && labeledLayer.setOpacity) {
        labeledLayer.setOpacity(opacity);
      }
    });
    mapManager.on("syntheticClusterCreated", (syntheticInfo) => {
      console.log("Synthetic cluster created:", syntheticInfo);
      if (labeledLayer && labeledLayer.compositeLayer) {
        Cluster.updateSyntheticClusters(
          allClusterData,
          labeledLayer.allLabels,
          labeledLayer.compositeLayer.georasters[0]
        );
        allClusterData = { ...allClusterData };
      }
    });
    window.addEventListener("clearData", () => {
      clearData();
    });
  }

  function setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      switch (e.code) {
        case "Space":
          e.preventDefault();
          animationController.togglePlayPause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          animationController.stepBack();
          break;
        case "ArrowRight":
          e.preventDefault();
          animationController.stepForward();
          break;
      }
    });
  }

  async function handleDataLoaded(manifestData, overlays) {
    console.log("=== DATA LOADING START ===");
    console.log("Overlays received:", overlays.length);
    manifest = manifestData;
    overlayData = overlays;
    mapManager.setDataLoader(dataLoader);
    allClusterData = await Cluster.extractClusterData(
      overlays,
      manifestData,
      dataLoader
    );
    mapManager.setOverlays(overlays);
    if (labeledLayer) {
      labeledLayer.setOverlayData(overlays);
      mapManager.setLabeledLayer(labeledLayer);
    }
    await new Promise((resolve) => {
      mapManager.fitBounds(manifestData.metadata.bounds);
      mapManager.map.whenReady(() => resolve());
    });
    const allSegmentationKeys = [
      ...manifestData.segmentation_keys,
      "composite_regions",
    ];
    const allOverlays = [...overlays, null];
    animationController.setFrames(allSegmentationKeys, allOverlays);
    setTimeout(() => {
      animationController.showInitialFrame();
      console.log("✅ Initial frame displayed");
    }, 100);
    showLoading(false);
    console.log("✅ Data loading complete");
  }

  function handleLoadError(error) {
    console.error("Load error:", error);
    showError(`Failed to load data: ${error.message}`);
    showLoading(false);
  }

  function clearData() {
    if (!confirm("Clear all loaded data? This will reset the viewer.")) return;
    animationController.destroy();
    mapManager.clearOverlays();
    currentFrame = 0;
    totalFrames = 0;
    isPlaying = false;
    currentSegmentationKey = null;
    manifest = null;
    overlayData = [];
    allClusterData = {};
    selectedCluster = null;
    console.log("✅ Data cleared");
  }

  function getCurrentSegmentationKey() {
    const frameInfo = animationController.getCurrentFrameInfo();
    return frameInfo.segmentationKey;
  }

  function showLoading(show) {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) {
      overlay.classList.toggle("hidden", !show);
    }
  }

  function showError(message) {
    alert(`Error: ${message}`);
    console.error("Viewer error:", message);
  }

  $effect(() => {
    if (labelsReady) {
      $inspect("💾 Saving labels to localStorage:", clusterLabels);
      try {
        localStorage.setItem(
          STORAGE_KEYS.CLUSTER_LABELS,
          JSON.stringify({
            labels: clusterLabels,
            timestamp: new Date().toISOString(),
          })
        );
      } catch (error) {
        console.warn("Failed to save labels to localStorage:", error);
      }
    }
    if (labeledLayer) {
      labeledLayer.updateLabels(clusterLabels);
    }
    if (mapManager) {
      mapManager.updateAllLayersWithNewLabels(clusterLabels);
    }
  });

  $effect(() => {
    if (labelsReady && labeledLayer && labeledLayer.compositeLayer) {
      Cluster.updateSyntheticClusters(
        allClusterData,
        labeledLayer.allLabels,
        labeledLayer.compositeLayer.georasters[0]
      );
      allClusterData = { ...allClusterData };
    }
  });

  function loadSavedLabels() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CLUSTER_LABELS);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.labels && Object.keys(data.labels).length > 0) {
          console.log(
            "🔄 Loading saved labels from localStorage:",
            $state.snapshot(data.labels)
          );
          clusterLabels = data.labels;
          labelsReady = true;
          return;
        }
      }
      console.log("🔄 No saved labels found");
      labelsReady = true;
    } catch (error) {
      console.warn("Failed to load saved labels:", error);
      labelsReady = true;
    }
  }

  function handleLabelChange(
    segmentationKey,
    clusterId,
    landUsePath,
    bulkLabels = null
  ) {
    console.log("🔧 handleLabelChange called:", {
      segmentationKey,
      clusterId,
      landUsePath,
      bulkLabels,
    });
    if (bulkLabels !== null) {
      console.log("🔧 Setting bulkLabels, keys:", Object.keys(bulkLabels));
      clusterLabels = bulkLabels;
      console.log(
        "🔧 clusterLabels after bulk set:",
        $state.snapshot(clusterLabels)
      );
    } else if (segmentationKey && clusterId !== null) {
      clusterLabels = {
        ...clusterLabels,
        [segmentationKey]: {
          ...clusterLabels[segmentationKey],
          [clusterId]: landUsePath,
        },
      };
    }
  }
</script>

{#if dataLoader && mapManager && animationController}
  <LabeledCompositeController {overlayData} {clusterLabels} />
  <LegendPanel
    {clusterLabels}
    {currentSegmentationKey}
    {currentSegmentationData}
    {selectedCluster}
    {manifest}
    {overlayData}
    onLabelChange={handleLabelChange}
  />
  <ControlsPanel
    {currentFrame}
    {totalFrames}
    {isPlaying}
    {currentSegmentationKey}
  />
{/if}
