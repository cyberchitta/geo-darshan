<script>
  import { onMount } from "svelte";
  import { MapManager } from "../js/map.js";
  import { LandUseHierarchy } from "../js/land-use.js";

  let { dataState, segmentationController, labeledLayer } = $props();
  let mapManager = $state(null);
  let opacity = $state(0.8);
  let interactionMode = $state("view");
  let selectedCluster = $state(null);
  let isReady = $derived(!!mapManager);
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
    get isReady() {
      return isReady;
    },
    setOpacity: (value) => (opacity = value),
    setInteractionMode: (mode) => (interactionMode = mode),
    clearSelectedCluster: () => (selectedCluster = null),
  };

  export function getState() {
    return stateObject;
  }

  export function getManager() {
    return mapManager;
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
      const overlays = dataState.getOverlays?.();
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
    if (mapManager && segmentationController) {
      const segManager = segmentationController.getManager();
      if (segManager) {
        segManager.on("frameChanged", (frameIndex) => {
          mapManager.showFrame(frameIndex);
        });
      }
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

  function setupEventListeners(manager) {
    manager.on("clusterClicked", (clusterValue, latlng) => {
      console.log("Cluster clicked:", clusterValue);
      const segState = segmentationController?.getState();
      selectedCluster = {
        clusterId: clusterValue,
        segmentationKey: segState?.currentSegmentationKey,
        latlng,
      };
    });
    manager.on("compositeClick", (latlng) => {
      if (labeledLayer?.handleCompositeClick) {
        labeledLayer.handleCompositeClick(latlng);
      } else {
        console.log("No labeled layer available for composite labeling");
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
    mapManager.setDataLoader(dataState.loader);
    mapManager.setOverlays(overlays);
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
