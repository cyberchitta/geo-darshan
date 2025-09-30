<script>
  import { onMount } from "svelte";
  import { SEGMENTATION_KEYS } from "../js/utils.js";
  import { MapManager } from "../js/map-manager.js";
  import { ClassificationHierarchy } from "../js/classification.js";
  import { Segmentation } from "../js/segmentation.js";

  let { dataState, segmentationController, labelRegionsController } = $props();
  let mapManager = $state(null);
  let segmentationOpacity = $state(0.8);
  let labelRegionsOpacity = $state(0.8);
  let classificationOpacity = $state(0.8);
  let interactionMode = $state("view");
  let selectedCluster = $state(null);
  let clusterSuggestions = $state([]);
  let selectedRegion = $state(null);
  let manifest = $derived(dataState.manifest);
  let currentHoverLabel = $state("");
  let segmentationLayerVisible = $derived(
    segmentationController?.getState()?.hasActiveLayer &&
      segmentationOpacity > 0
  );
  let labelRegionsLayerVisible = $derived(
    labelRegionsController?.getState()?.hasActiveLayer &&
      labelRegionsOpacity > 0
  );
  const stateObject = {
    get mapManager() {
      return mapManager;
    },
    get interactionMode() {
      return interactionMode;
    },
    get selectedCluster() {
      return selectedCluster;
    },
    get clusterSuggestions() {
      return clusterSuggestions;
    },
    get selectedRegion() {
      return selectedRegion;
    },
    get currentHoverLabel() {
      return currentHoverLabel;
    },
    get segmentationLayerVisible() {
      return segmentationLayerVisible;
    },
    get labelRegionsLayerVisible() {
      return labelRegionsLayerVisible;
    },
    setOpacity: (value) => {
      segmentationOpacity = value;
      labelRegionsOpacity = value;
      classificationOpacity = value;
      if (mapManager) {
        mapManager.setOverlayOpacity(value);
      }
    },
    setInteractionMode: (mode) => (interactionMode = mode),
    clearSelectedCluster: () => (selectedCluster = null),
    clearSelectedRegion: () => {
      selectedRegion = null;
      const labelRegionsState = labelRegionsController?.getState();
      if (labelRegionsState?.clearSelection) {
        labelRegionsState.clearSelection();
      }
    },
    cancelSelection: () => {
      selectedCluster = null;
      selectedRegion = null;
      const labelRegionsState = labelRegionsController?.getState();
      if (labelRegionsState?.cancelSelection) {
        labelRegionsState.cancelSelection();
      }
    },
  };

  export function getState() {
    return stateObject;
  }

  onMount(async () => {
    try {
      await ClassificationHierarchy.loadFromFile();
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
      const checkForSegController = () => {
        const segState = segmentationController?.getState();
        if (segState?.on) {
          setupSegmentationListeners(segState);
        } else {
          setTimeout(checkForSegController, 10);
        }
      };
      checkForSegController();
      const checkForLabelRegionsController = () => {
        const labelRegionsState = labelRegionsController?.getState();
        if (labelRegionsState?.on) {
          setupLabelRegionsListeners(labelRegionsState);
        } else {
          setTimeout(checkForLabelRegionsController, 10);
        }
      };
      checkForLabelRegionsController();
      console.log("✅ MapController initialized");
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
  $effect(() => {
    if (selectedRegion?.suggestions) {
      clusterSuggestions = selectedRegion.suggestions;
    } else {
      clusterSuggestions = [];
    }
  });

  function setupSegmentationListeners(segState) {
    console.log("Setting up SegmentationController event listeners");
    segState.on("clusterSelected", (clusterValue, latlng) => {
      if (clusterValue === null) {
        selectedCluster = null;
      } else {
        selectedCluster = {
          clusterId: clusterValue,
          segmentationKey: segState.currentSegmentationKey,
          latlng,
        };
      }
    });
  }

  function setupLabelRegionsListeners(labelRegionsState) {
    console.log("Setting up LabelRegionsController event listeners");
    labelRegionsState.on("clusterSelected", (clusterValue, latlng) => {
      if (clusterValue === null) {
        selectedCluster = null;
      } else {
        selectedCluster = {
          clusterId: clusterValue,
          segmentationKey: SEGMENTATION_KEYS.COMPOSITE,
          latlng,
        };
      }
    });
  }

  function setupEventListeners(manager) {
    manager.on("clusterInteraction", async (latlng) => {
      if (labelRegionsLayerVisible && !segmentationLayerVisible) {
        const labelRegionsState = labelRegionsController?.getState();
        await labelRegionsState?.selectClusterAt?.(latlng);
      } else if (segmentationLayerVisible && !labelRegionsLayerVisible) {
        const segState = segmentationController?.getState();
        await segState?.selectClusterAt?.(latlng);
      } else {
        console.log("→ No handler matched conditions");
      }
    });
    manager.on("compositeClick", async (latlng) => {
      const labelRegionsState = labelRegionsController?.getState();
      if (!labelRegionsState?.handleCompositeClick) {
        console.log("No label regions controller available for interaction");
        return;
      }
      const allLabelsMap = Segmentation.extractAllLabels(
        dataState.segmentations
      );
      const result = await labelRegionsState.handleCompositeClick(
        latlng,
        allLabelsMap,
        dataState.segmentations
      );
      if (result?.action === "create_new") {
        selectedRegion = {
          region: result.region,
          latlng: result.latlng,
          pixelCount: result.region.length,
          suggestions: result.suggestions,
        };
      }
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
          stateObject.cancelSelection();
          break;
      }
    });
  }

  async function getCurrentLabelAtPosition(latlng) {
    if (!mapManager?.currentOverlay?.georasters?.[0]) {
      return "";
    }
    const clusterValue = await mapManager.samplePixelAtCoordinate(latlng);
    if (
      clusterValue === null ||
      clusterValue === undefined ||
      clusterValue < 0
    ) {
      return "";
    }
    const labelRegionsState = labelRegionsController?.getState();
    const interactiveSegmentation = labelRegionsState?.interactiveSegmentation;
    if (!interactiveSegmentation) {
      return "";
    }
    const cluster = interactiveSegmentation.getCluster(clusterValue);
    if (!cluster) {
      return "";
    }
    return cluster.classificationPath &&
      cluster.classificationPath !== "unlabeled"
      ? cluster.classificationPath
      : "";
  }
</script>
