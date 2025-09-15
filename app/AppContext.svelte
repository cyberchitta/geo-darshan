<script>
  import { setContext, onMount } from "svelte";
  import { STORAGE_KEYS } from "./js/utils.js";
  import LegendPanel from "./components/LegendPanel.svelte";
  import ControlsPanel from "./components/ControlsPanel.svelte";

  let { dataLoader, mapManager, animationController, labeledLayer } = $props();

  setContext("managers", {
    dataLoader,
    mapManager,
    animationController,
    labeledLayer,
  });

  // Shared state owned by AppContext
  let currentFrame = $state(0);
  let totalFrames = $state(0);
  let isPlaying = $state(false);
  let currentSegmentationKey = $state(null);
  let clusterLabels = $state({});
  let manifest = $state(null);
  let overlayData = $state([]);
  let allClusterData = $state({});

  // Derived state
  let currentSegmentationData = $derived(
    currentSegmentationKey ? allClusterData[currentSegmentationKey] : null
  );

  onMount(() => {
    console.log("AppContext mounted, setting up event listeners...");

    // Animation controller events
    animationController.on("frameChanged", (frameIndex, segmentationKey) => {
      console.log("Frame changed:", frameIndex, segmentationKey);
      currentFrame = frameIndex;
      currentSegmentationKey = segmentationKey;
    });

    animationController.on("framesReady", (frameCount) => {
      console.log("Frames ready:", frameCount);
      totalFrames = frameCount;
    });

    animationController.on("playStateChanged", (playing) => {
      console.log("Play state changed:", playing);
      isPlaying = playing;
    });

    // Data loader events
    dataLoader.on("loadComplete", (manifestData, overlays) => {
      console.log("Data loaded:", manifestData, overlays);
      manifest = manifestData;
      overlayData = overlays;
    });

    // Cluster data events
    window.addEventListener("clusterDataReady", (event) => {
      console.log("Cluster data received in AppContext:", event.detail);
      allClusterData = event.detail;
    });

    // Load saved labels
    loadSavedLabels();

    // Clear data events
    window.addEventListener("clearData", () => {
      currentFrame = 0;
      totalFrames = 0;
      isPlaying = false;
      currentSegmentationKey = null;
      manifest = null;
      overlayData = [];
      allClusterData = {};
    });
  });

  // Save labels to localStorage whenever they change
  $effect(() => {
    console.log(
      "💾 Saving labels to localStorage:",
      $state.snapshot(clusterLabels)
    );

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

    // Update external systems
    if (labeledLayer) {
      labeledLayer.updateLabels(clusterLabels);
    }
    mapManager.updateAllLayersWithNewLabels(clusterLabels);
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
          return;
        }
      }
      console.log("🔄 No saved labels found");
    } catch (error) {
      console.warn("Failed to load saved labels:", error);
    }
  }

  // Callback for label changes from ClusterLegend
  function handleLabelChange(
    segmentationKey,
    clusterId,
    landUsePath,
    bulkLabels = null
  ) {
    if (bulkLabels !== null) {
      // Special case: bulk load or clear all
      clusterLabels = bulkLabels;
    } else if (segmentationKey && clusterId !== null) {
      // Normal label change
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

<!-- Pass shared state as props to child components -->
<LegendPanel
  {clusterLabels}
  {currentSegmentationKey}
  {currentSegmentationData}
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
