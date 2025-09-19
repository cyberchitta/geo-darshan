<script>
  import { onMount } from "svelte";
  import { MapManager } from "../js/map.js";
  import { LandUseHierarchy } from "../js/land-use.js";

  let { dataState, segmentationController, labeledLayer, clusterLabels } =
    $props();
  let mapManager = $state(null);
  let opacity = $state(0.8);
  let interactionMode = $state("view");
  let selectedCluster = $state(null);
  let layersReady = $state(false);
  let manifest = $derived(dataState.manifest);

  const stateObject = {
    get mapManager() {
      return mapManager;
    },
    get opacity() {
      return opacity;
    },
    get interactionMode() {
      return interactionMode;
    },
    get selectedCluster() {
      return selectedCluster;
    },
    setOpacity: (value) => (opacity = value),
    setInteractionMode: (mode) => (interactionMode = mode),
    clearSelectedCluster: () => (selectedCluster = null),
  };

  export function getState() {
    return stateObject;
  }

  onMount(async () => {
    try {
      await LandUseHierarchy.loadFromFile();
      const rasterHandler = window.rasterHandler;
      if (!rasterHandler) {
        throw new Error(
          "Raster handler not found. Make sure it's injected from HTML."
        );
      }
      let _mapManager = new MapManager("map", rasterHandler);
      setupEventListeners(_mapManager);
      setupKeyboardShortcuts();
      await _mapManager.initialize();
      mapManager = _mapManager;
      console.log("✅ MapController initialized");
    } catch (error) {
      console.error("Failed to initialize MapController:", error);
      throw error;
    }
  });

  $effect(() => {
    if (mapManager && manifest) {
      const overlays = dataState.getAllOverlays?.();
      if (overlays.length > 0) {
        handleDataLoaded(manifest, overlays);
      }
    }
  });
  $effect(() => {
    if (mapManager) {
      mapManager.setOverlayOpacity(opacity);
    }
  });
  $effect(() => {
    if (mapManager) {
      mapManager.setInteractionMode(interactionMode);
    }
  });
  $effect(() => {
    if (mapManager && labeledLayer) {
      mapManager.setLabeledLayer(labeledLayer);
    }
  });
  $effect(() => {
    if (labeledLayer?.setOpacity) {
      labeledLayer.setOpacity(opacity);
    }
  });
  $effect(() => {
    if (mapManager && segmentationController && layersReady) {
      const segState = segmentationController.getState();
      if (segState && typeof segState.currentFrame === "number") {
        console.log(`Frame switching to ${segState.currentFrame}`);
        mapManager.showFrame(segState.currentFrame);
      }
    }
  });
  function setupEventListeners(manager) {
    manager.on("firstLayerReady", () => {
      console.log("First layer ready event received");
      layersReady = true;
    });
    manager.on("clusterClicked", (clusterValue, latlng) => {
      console.log("Cluster clicked:", clusterValue);
      const segState = segmentationController?.getState();
      selectedCluster = {
        clusterId: clusterValue,
        segmentationKey: segState?.currentSegmentationKey,
        latlng,
      };
    });
    manager.on("compositeClick", async (latlng) => {
      if (labeledLayer?.handleCompositeClick) {
        const compositeState = labeledLayer.getCompositeState?.();
        if (!compositeState) {
          console.log("No composite state available for labeling");
          return;
        }
        const result = await labeledLayer.handleCompositeClick(
          latlng,
          compositeState.georaster,
          compositeState.segmentationMap,
          compositeState.segmentations,
          clusterLabels,
          dataState.segmentations
        );
        if (result?.action === "create_new") {
          // Show UI for labeling the region
          // This could trigger an event or callback to show labeling dialog
        }
      }
    });
    manager.on("globalOpacityChanged", (newOpacity) => {
      if (Math.abs(opacity - newOpacity) > 0.001) {
        opacity = newOpacity;
      }
    });
  }

  function setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      switch (e.code) {
        case "Digit1":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            interactionMode = "view";
          }
          break;
        case "Digit2":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            interactionMode = "cluster";
          }
          break;
        case "Digit3":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            interactionMode = "composite";
          }
          break;
        case "Escape":
          e.preventDefault();
          selectedCluster = null;
          break;
      }
    });
  }

  async function handleDataLoaded(manifest, overlays) {
    console.log("MapController: Processing data load");
    mapManager.setDataLoader(dataState.dataIO);
    await mapManager.setOverlays(overlays);
    await new Promise((resolve) => {
      mapManager.fitBounds(manifest.metadata.bounds);
      mapManager.map.whenReady(() => resolve());
    });
    console.log("✅ MapController: Data loading complete");
  }

  function updateAllLayersWithLabels(clusterLabels) {
    if (mapManager) {
      mapManager.updateAllLayersWithNewLabels(clusterLabels);
    }
  }
  export { updateAllLayersWithLabels };
</script>
