<script>
  import { onMount } from "svelte";
  import { ClassificationHierarchy } from "../js/classification.js";
  import { CLUSTER_ID_RANGES } from "../js/utils.js";
  import { MapManager } from "../js/map-manager.js";

  let { segmentationController, interactiveController } = $props();
  let mapManager = $state(null);
  let segmentationOpacity = $state(0.8);
  let interactiveOpacity = $state(0.8);
  let classificationOpacity = $state(0.8);
  let interactionMode = $state("view");
  let currentHoverLabel = $state("");
  let segmentationLayerVisible = $derived(
    segmentationController?.getState()?.hasActiveLayer &&
      segmentationOpacity > 0
  );
  let interactiveLayerVisible = $derived(
    interactiveController?.getState()?.hasActiveLayer && interactiveOpacity > 0
  );

  const stateObject = {
    get mapManager() {
      return mapManager;
    },
    get interactionMode() {
      return interactionMode;
    },
    get currentHoverLabel() {
      return currentHoverLabel;
    },
    get segmentationLayerVisible() {
      return segmentationLayerVisible;
    },
    get interactiveLayerVisible() {
      return interactiveLayerVisible;
    },
    setOpacity: (value) => {
      segmentationOpacity = value;
      interactiveOpacity = value;
      classificationOpacity = value;
      if (mapManager) {
        mapManager.setOverlayOpacity(value);
      }
    },
    setInteractionMode: (mode) => (interactionMode = mode),
  };

  export function getState() {
    return stateObject;
  }

  onMount(async () => {
    try {
      const rasterHandler = window.rasterHandler;
      if (!rasterHandler) {
        throw new Error(
          "Raster handler not found. Make sure it's injected from HTML."
        );
      }
      mapManager = new MapManager("map", rasterHandler);
      await mapManager.initialize();
      setupEventListeners(mapManager);
      setupKeyboardShortcuts();
    } catch (error) {
      console.error("Failed to initialize MapController:", error);
      throw error;
    }
  });

  $effect(() => {
    if (mapManager) {
      mapManager.setInteractionMode(interactionMode);
    }
  });
  let previousInteractionMode = $state(null);
  $effect(() => {
    if (
      previousInteractionMode &&
      interactionMode !== previousInteractionMode
    ) {
      segmentationController?.getState()?.clearSelection?.();
      interactiveController?.getState()?.clearSelection?.();
    }
    previousInteractionMode = interactionMode;
  });

  function setupEventListeners(manager) {
    manager.on("clusterInteraction", async (latlng) => {
      if (interactiveLayerVisible && !segmentationLayerVisible) {
        const interactiveState = interactiveController?.getState();
        await interactiveState?.selectClusterAt?.(latlng);
      } else if (segmentationLayerVisible && !interactiveLayerVisible) {
        const segState = segmentationController?.getState();
        await segState?.selectClusterAt?.(latlng);
      }
    });
    manager.on("compositeClick", async (latlng) => {
      const interactiveState = interactiveController?.getState();
      if (!interactiveState?.handleCompositeClick) {
        return;
      }
      await interactiveState.handleCompositeClick(latlng);
    });
    manager.map.on("mousemove", async (e) => {
      if (interactionMode !== "composite") {
        currentHoverLabel = "";
        return;
      }
      try {
        const label = await getCurrentLabelAtPosition(e.latlng);
        currentHoverLabel = label;
      } catch (error) {
        console.error("Error getting label at position:", error);
        currentHoverLabel = "";
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
          segmentationController?.getState()?.clearSelection?.();
          interactiveController?.getState()?.clearSelection?.();
          break;
      }
    });
  }

  async function getCurrentLabelAtPosition(latlng) {
    const interactiveState = interactiveController?.getState();
    const interactiveSegRaster = interactiveState?.interactiveSegmentation;
    const raster = interactiveState?.processedInteractiveRaster;
    if (!interactiveSegRaster || !raster) {
      return "";
    }
    const pixel = interactiveSegRaster.raster.latlngToPixel(latlng);
    if (!pixel) {
      return "";
    }
    const { x, y } = pixel;
    const clusterId = raster[y][x];
    if (clusterId === undefined || CLUSTER_ID_RANGES.isNoData(clusterId)) {
      return "";
    }
    const cluster = interactiveSegRaster.getClusterById(clusterId);
    if (
      !cluster?.classificationPath ||
      cluster.classificationPath === "unlabeled"
    ) {
      return "";
    }
    return cluster.classificationPath;
  }
</script>
