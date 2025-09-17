<script>
  import { setContext, getContext, onMount } from "svelte";
  import { STORAGE_KEYS } from "./js/utils.js";
  import { MapManager } from "./js/map.js";
  import { LandUseHierarchy } from "./js/land-use.js";
  import DataController from "./controllers/DataController.svelte";
  import SegmentationController from "./controllers/SegmentationController.svelte";
  import LabeledCompositeController from "./components/LabeledCompositeController.svelte";
  import LegendPanel from "./components/LegendPanel.svelte";
  import ControlsPanel from "./components/ControlsPanel.svelte";

  let {} = $props();

  let dataController = $state();
  let segmentationController = $state();
  let dataState = $derived(dataController?.getState() || {});
  let segmentationState = $derived(segmentationController?.getState() || {});

  const labeledLayerContext = getContext("labeledLayer");
  let labeledLayer = $derived(labeledLayerContext?.instance);

  let mapManager = $state();

  setContext("managers", {
    get dataLoader() {
      return dataState.loader;
    },
    get mapManager() {
      return mapManager;
    },
    get segmentationManager() {
      return segmentationController?.getManager();
    },
  });

  let labelsReady = $state(false);
  let clusterLabels = $state({});
  let selectedCluster = $state(null);
  let currentSegmentationData = $derived(
    segmentationState.currentSegmentationKey
      ? dataState.clusterData?.[segmentationState.currentSegmentationKey]
      : null
  );

  $effect(() => {
    if (dataState.manifest) {
      handleDataLoaded(dataState.manifest, dataController.getOverlays());
    }
  });
  $effect(() => {
    if (segmentationController && mapManager) {
      const segManager = segmentationController.getManager();
      if (segManager) {
        segManager.on("frameChanged", (frameIndex) => {
          mapManager.showFrame(frameIndex);
        });
      }
    }
  });

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
      mapManager = new MapManager("map", rasterHandler);
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
    mapManager.on("clusterClicked", (clusterValue, latlng) => {
      console.log("Cluster clicked:", clusterValue);
      selectedCluster = {
        clusterId: clusterValue,
        segmentationKey: segmentationState.currentSegmentationKey,
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
          segmentationState.togglePlayPause?.();
          break;
        case "ArrowLeft":
          e.preventDefault();
          segmentationState.stepBack?.();
          break;
        case "ArrowRight":
          e.preventDefault();
          segmentationState.stepForward?.();
          break;
      }
    });
  }

  async function handleDataLoaded(manifest, overlays) {
    console.log("=== DATA LOADING START ===");
    console.log("Overlays received:", overlays.length);
    mapManager.setDataLoader(dataState.loader);
    mapManager.setOverlays(overlays);
    if (labeledLayer) {
      labeledLayer.setOverlayData(overlays);
      mapManager.setLabeledLayer(labeledLayer);
    }

    await new Promise((resolve) => {
      mapManager.fitBounds(manifest.metadata.bounds);
      mapManager.map.whenReady(() => resolve());
    });

    const allSegmentationKeys = [
      ...manifest.segmentation_keys,
      "composite_regions",
    ];
    const allOverlays = [...overlays, null];
    segmentationState.setFrames?.(allSegmentationKeys, allOverlays);

    setTimeout(() => {
      segmentationState.showInitialFrame?.();
      console.log("✅ Initial frame displayed");
    }, 100);

    showLoading(false);
    console.log("✅ Data loading complete");
  }

  function clearData() {
    if (!confirm("Clear all loaded data? This will reset the viewer.")) return;
    if (dataState.clearData) {
      dataState.clearData();
    }
    segmentationState.reset?.();
    mapManager.clearOverlays();
    selectedCluster = null;
    console.log("✅ Data cleared");
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

<DataController bind:this={dataController} />
<SegmentationController bind:this={segmentationController} />

{#if dataState.loader && mapManager && segmentationController && dataState.manifest}
  <LabeledCompositeController
    overlayData={dataController?.getOverlays()}
    {clusterLabels}
    segmentationManager={segmentationController?.getManager()}
  />
{/if}
{#if dataState.loader && mapManager && segmentationController}
  <LegendPanel
    {dataState}
    {clusterLabels}
    currentSegmentationKey={segmentationState.currentSegmentationKey}
    {currentSegmentationData}
    {selectedCluster}
    onLabelChange={handleLabelChange}
  />
  <ControlsPanel {segmentationState} />
{/if}
