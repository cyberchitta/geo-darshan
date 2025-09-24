<script>
  import { onMount } from "svelte";
  import { SEGMENTATION_KEYS } from "../js/utils.js";
  import { MapManager } from "../js/map.js";
  import { LandUseHierarchy } from "../js/land-use.js";

  let {
    dataState,
    segmentationController,
    labelRegionsController,
    clusterLabels,
  } = $props();
  let mapManager = $state(null);
  let opacity = $state(0.8);
  let interactionMode = $state("view");
  let selectedCluster = $state(null);
  let clusterSuggestions = $state([]);
  let selectedRegion = $state(null);
  let layersReady = $state(false);
  let manifest = $derived(dataState.manifest);
  let currentHoverLabel = $state("");

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
    get clusterSuggestions() {
      return clusterSuggestions;
    },
    get selectedRegion() {
      return selectedRegion;
    },
    get currentHoverLabel() {
      return currentHoverLabel;
    },
    setOpacity: (value) => (opacity = value),
    setInteractionMode: (mode) => (interactionMode = mode),
    clearSelectedCluster: () => (selectedCluster = null),
    clearSelectedRegion: () => (selectedRegion = null),
    clearRegionHighlight: () => {
      const labelRegionsState = labelRegionsController?.getState();
      if (labelRegionsState) {
        labelRegionsState.clearRegionHighlight();
      }
    },
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
      await _mapManager.initialize();
      setupEventListeners(_mapManager);
      setupKeyboardShortcuts();
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
    if (mapManager && segmentationController && layersReady) {
      const segState = segmentationController.getState();
      if (segState && typeof segState.currentFrame === "number") {
        console.log(`Frame switching to ${segState.currentFrame}`);
        mapManager.showFrame(segState.currentFrame);
      }
    }
  });

  $effect(() => {
    if (mapManager && clusterLabels) {
      mapManager.updateAllLayersWithNewLabels(clusterLabels);
    }
  });

  $effect(() => {
    if (
      selectedCluster &&
      selectedCluster.segmentationKey === SEGMENTATION_KEYS.COMPOSITE &&
      labelRegionsController
    ) {
      const labelRegionsState = labelRegionsController.getState();
      if (labelRegionsState?.analyzeClusterNeighborhood) {
        clusterSuggestions = labelRegionsState.analyzeClusterNeighborhood(
          selectedCluster.clusterId
        );
      }
    } else {
      clusterSuggestions = [];
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
      const labelRegionsState = labelRegionsController?.getState();
      if (!labelRegionsState?.handleCompositeClick) {
        console.log("No label regions controller available for interaction");
        return;
      }

      // Convert clusterLabels to Map format
      const allLabelsMap = new Map();
      Object.entries(clusterLabels).forEach(([segKey, labels]) => {
        const labelMap = new Map();
        Object.entries(labels).forEach(([clusterId, landUsePath]) => {
          labelMap.set(parseInt(clusterId), landUsePath);
        });
        allLabelsMap.set(segKey, labelMap);
      });

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

    manager.on("globalOpacityChanged", (newOpacity) => {
      if (Math.abs(opacity - newOpacity) > 0.001) {
        opacity = newOpacity;
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
          selectedCluster = null;
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

    return cluster.landUsePath && cluster.landUsePath !== "unlabeled"
      ? cluster.landUsePath
      : "";
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
