<script>
  import { setContext, onMount } from "svelte";
  import {
    currentFrame,
    totalFrames,
    isPlaying,
    overlayData,
    manifest,
    clusterLabels,
    currentSegmentationKey,
    allClusterData,
    animationSpeed,
    overlayOpacity,
  } from "./stores.js";
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
  let currentSegKey = null;
  onMount(() => {
    console.log("AppContext mounted, setting up event listeners...");
    animationController.on("frameChanged", (frameIndex, segmentationKey) => {
      console.log("Frame changed:", frameIndex, segmentationKey);
      currentFrame.set(frameIndex);
      currentSegmentationKey.set(segmentationKey);
    });
    animationController.on("framesReady", (frameCount) => {
      console.log("Frames ready:", frameCount);
      totalFrames.set(frameCount);
    });
    animationController.on("playStateChanged", (playing) => {
      console.log("Play state changed:", playing);
      isPlaying.set(playing);
    });
    dataLoader.on("loadComplete", (manifestData, overlays) => {
      console.log("Data loaded:", manifestData, overlays);
      manifest.set(manifestData);
      overlayData.set(overlays);
    });
    window.addEventListener("clusterDataReady", (event) => {
      console.log("Cluster data received in AppContext:", event.detail);
      allClusterData.set(event.detail);
    });
    loadSavedLabels();
    const unsubscribeSegKey = currentSegmentationKey.subscribe((segKey) => {
      console.log("Current segmentation changed to:", segKey);
    });
    const unsubscribeLabels = clusterLabels.subscribe((labels) => {
      console.log("💾 Saving labels to localStorage:", labels);
      try {
        localStorage.setItem(
          STORAGE_KEYS.CLUSTER_LABELS,
          JSON.stringify({
            labels,
            timestamp: new Date().toISOString(),
          })
        );
      } catch (error) {
        console.warn("Failed to save labels to localStorage:", error);
      }
      if (labeledLayer) {
        labeledLayer.updateLabels(labels);
      }
      mapManager.updateAllLayersWithNewLabels(labels);
    });
    const unsubscribeSpeed = animationSpeed.subscribe((speed) => {
      if (Math.abs(animationController.speed - speed) > 0.01) {
        animationController.setSpeed(speed);
      }
    });
    const unsubscribeOpacity = overlayOpacity.subscribe((opacity) => {
      if (Math.abs(mapManager.currentOpacity - opacity) > 0.01) {
        mapManager.setOverlayOpacity(opacity);
      }
    });
    return () => {
      unsubscribeSegKey();
      unsubscribeLabels();
      unsubscribeSpeed();
      unsubscribeOpacity();
    };
  });

  function loadSavedLabels() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CLUSTER_LABELS);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.labels && Object.keys(data.labels).length > 0) {
          console.log(
            "🔄 Loading saved labels from localStorage:",
            data.labels
          );
          clusterLabels.set(data.labels);
          return;
        }
      }
      console.log("🔄 No saved labels found");
    } catch (error) {
      console.warn("Failed to load saved labels:", error);
    }
  }
</script>

<LegendPanel />
<ControlsPanel />
