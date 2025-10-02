<script>
  import { onMount } from "svelte";
  import { CLUSTER_ID_RANGES, SEGMENTATION_KEYS } from "../js/utils.js";
  import { ClassificationHierarchy } from "../js/classification.js";
  import { RegionLabeler } from "../js/region-labeler.js";
  import { RasterFactory } from "../js/raster/raster-factory.js";
  import { ClassificationRenderer } from "../js/raster/classification-renderer.js";

  let {
    compositeState,
    dataState,
    mapState,
    mapManager,
    dataLoader,
    segmentationController,
    hierarchyLevel,
  } = $props();
  let interactiveLayer = $state(null);
  let pixelRenderer = $state(null);
  let layerGroup = $state(null);
  let regionLabeler = $state(null);
  let interactiveSegmentation = $state(null);
  let isLayerVisible = $state(false);
  let lastProcessedHierarchyLevel = $state(null);
  let lastProcessedSegmentationKey = $state(null);
  let currentSegmentationKey = $derived(
    segmentationController?.getState()?.currentSegmentationKey
  );
  let shouldRegenerateInteractive = $derived(
    compositeState?.georaster &&
      currentSegmentationKey !== lastProcessedSegmentationKey
  );
  let processedInteractiveRaster = $state(null);
  let selectedCluster = $derived(mapState?.selectedCluster);
  let selectedPixelData = $state(new Map());
  let listeners = $state({});

  const stateObject = {
    get interactiveSegmentation() {
      return interactiveSegmentation;
    },
    get processedInteractiveRaster() {
      return processedInteractiveRaster;
    },
    get hasActiveLayer() {
      return interactiveLayer && isLayerVisible;
    },
    handleCompositeClick: async (latlng, allLabels, segmentations) => {
      if (!interactiveSegmentation || !regionLabeler) return null;
      const pixelCoord = regionLabeler.latlngToPixelCoord(latlng);
      if (!pixelCoord) return null;
      const isUnlabeled = regionLabeler.isPixelUnlabeled(pixelCoord);
      if (!isUnlabeled) return null;
      const contiguousRegion = regionLabeler.findContiguousRegion(pixelCoord);
      if (contiguousRegion.length === 0) return null;
      const suggestions = regionLabeler.analyzeNeighborhood(contiguousRegion);
      markRegionAsSelected(contiguousRegion);
      return {
        action: "create_new",
        region: contiguousRegion,
        latlng,
        suggestions,
      };
    },
    labelRegion: (region, classificationPath) => {
      if (!regionLabeler) return null;
      restoreOriginalValues();
      const syntheticId = regionLabeler.labelRegion(
        region,
        classificationPath,
        hierarchyLevel
      );
      dataState.setClusterLabel(
        SEGMENTATION_KEYS.SYNTHETIC,
        syntheticId,
        classificationPath
      );
      showBriefMessage(
        `Created synthetic cluster ${syntheticId} with classification: ${classificationPath}`
      );
      return syntheticId;
    },
    setOpacity: (opacity) => {
      if (interactiveLayer) {
        interactiveLayer.setOpacity(opacity);
      }
    },
    selectClusterAt: async (latlng) => {
      if (!processedInteractiveRaster || !interactiveSegmentation?.georaster) {
        return;
      }
      const georaster = interactiveSegmentation.georaster;
      const x = Math.floor(
        (latlng.lng - georaster.xmin) / georaster.pixelWidth
      );
      const y = Math.floor(
        (georaster.ymax - latlng.lat) / georaster.pixelHeight
      );
      if (x < 0 || x >= georaster.width || y < 0 || y >= georaster.height) {
        stateObject.emit("clusterSelected", null, null);
        return;
      }
      const clusterId = processedInteractiveRaster[y][x];
      if (clusterId === CLUSTER_ID_RANGES.NODATA) {
        stateObject.emit("clusterSelected", null, null);
        return;
      }
      stateObject.emit("clusterSelected", clusterId, latlng);
    },
    cancelSelection: () => {
      restoreOriginalValues();
      createInteractiveLayer();
    },
    clearSelection: () => {
      if (selectedPixelData.size > 0) {
        restoreOriginalValues();
        createInteractiveLayer();
      }
      stateObject.emit("clusterSelected", null, null);
    },
    on: (event, callback) => {
      if (!listeners) listeners = {};
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(callback);
    },
    emit: (event, ...args) => {
      if (listeners?.[event]) {
        listeners[event].forEach((callback) => callback(...args));
      }
    },
  };

  export function getState() {
    return stateObject;
  }

  onMount(() => {
    if (mapManager && mapManager.map && mapManager.layerControl) {
      layerGroup = L.layerGroup();
      mapManager.addOverlayLayer("Labeled", layerGroup, false);
      regionLabeler = new RegionLabeler();
      layerGroup.on("add", () => {
        isLayerVisible = true;
        console.log("Labeled layer visible");
      });
      layerGroup.on("remove", () => {
        isLayerVisible = false;
        console.log("Labeled layer hidden");
      });
      isLayerVisible = mapManager.map.hasLayer(layerGroup);
    }
    return () => {
      if (interactiveLayer && layerGroup) {
        layerGroup.removeLayer(interactiveLayer);
      }
      if (layerGroup && mapManager) {
        mapManager.removeOverlayLayer("Labeled");
        mapManager.map.removeLayer(layerGroup);
      }
    };
  });

  $effect(() => {
    if (
      compositeState?.georaster &&
      layerGroup &&
      !interactiveSegmentation &&
      currentSegmentationKey &&
      dataState.segmentations?.has(currentSegmentationKey)
    ) {
      createInteractiveSegmentation();
      createInteractiveLayer();
      lastProcessedSegmentationKey = currentSegmentationKey;
    }
  });
  $effect(() => {
    if (shouldRegenerateInteractive && interactiveSegmentation) {
      console.log(
        `Regenerating interactive segmentation for ${currentSegmentationKey}`
      );
      createInteractiveSegmentation();
      createInteractiveLayer();
      lastProcessedSegmentationKey = currentSegmentationKey;
    }
  });
  $effect(() => {
    if (
      interactiveSegmentation &&
      pixelRenderer &&
      hierarchyLevel !== lastProcessedHierarchyLevel
    ) {
      console.log(
        `Hierarchy level changed to ${hierarchyLevel}, updating renderer...`
      );
      pixelRenderer = pixelRenderer.withOptions({ hierarchyLevel });
      createInteractiveLayer();
      lastProcessedHierarchyLevel = hierarchyLevel;
    }
  });
  $effect(() => {
    if (compositeState?.georaster && regionLabeler && interactiveSegmentation) {
      const syntheticSegmentation = dataState.segmentations?.get(
        SEGMENTATION_KEYS.SYNTHETIC
      );
      regionLabeler.updateInteractiveData(
        interactiveSegmentation.georaster,
        interactiveSegmentation,
        syntheticSegmentation
      );
    }
  });
  $effect(() => {
    if (pixelRenderer && selectedCluster !== pixelRenderer._selectedCluster) {
      pixelRenderer = pixelRenderer.withOptions({ selectedCluster });
      createInteractiveLayer();
    }
  });

  function markRegionAsSelected(region) {
    if (!processedInteractiveRaster) return;
    selectedPixelData.clear();
    region.forEach((pixel) => {
      const key = `${pixel.x},${pixel.y}`;
      const original = processedInteractiveRaster[pixel.y][pixel.x];
      selectedPixelData.set(key, original);
      processedInteractiveRaster[pixel.y][pixel.x] =
        CLUSTER_ID_RANGES.SELECTED_REGION;
    });
    createInteractiveLayer();
  }

  function restoreOriginalValues() {
    if (!processedInteractiveRaster || selectedPixelData.size === 0) return;
    selectedPixelData.forEach((original, key) => {
      const [x, y] = key.split(",").map(Number);
      processedInteractiveRaster[y][x] = original;
    });
    selectedPixelData.clear();
  }

  function createInteractiveSegmentation() {
    if (!compositeState?.georaster) return;
    console.log("=== Creating Interactive Segmentation with RasterFactory ===");
    const compositeSegmentation = dataState.segmentations?.get(
      SEGMENTATION_KEYS.COMPOSITE
    );
    const currentSegmentation = dataState.segmentations.get(
      currentSegmentationKey
    );
    if (!compositeSegmentation || !currentSegmentation) {
      console.error("Missing segmentations");
      return;
    }
    const compositeSegRaster = compositeSegmentation.toSegmentedRaster();
    const currentSegRaster = currentSegmentation.toSegmentedRaster();
    let aggregated = RasterFactory.createInteractive(
      compositeSegRaster,
      currentSegRaster
    );
    console.log("Factory created interactive raster:", {
      clusters: aggregated.getAllClusters().length,
      sampleCluster: aggregated.getClusterById(1),
    });
    aggregated = aggregated.buildRegistry((clusterId) => {
      const cluster = aggregated.getClusterById(clusterId);
      const color =
        cluster.classificationPath === "unlabeled"
          ? null
          : ClassificationHierarchy.getColorForClassification(
              cluster.classificationPath,
              hierarchyLevel
            );
      return {
        classificationPath: cluster.classificationPath,
        color,
      };
    });
    processedInteractiveRaster = aggregated.raster.toGeoRaster().values[0];
    interactiveSegmentation = aggregated.toSegmentation(
      SEGMENTATION_KEYS.INTERACTIVE,
      { source: "interactive", created: new Date().toISOString() }
    );
    pixelRenderer = new ClassificationRenderer(aggregated, {
      hierarchyLevel,
      interactionMode: mapState.interactionMode,
      selectedCluster,
      grayscaleLabeled: false,
    });
    console.log("=== Interactive Segmentation Complete ===");
  }

  function createInteractiveLayer() {
    if (!interactiveSegmentation || !pixelRenderer) return;
    if (interactiveLayer) {
      layerGroup.removeLayer(interactiveLayer);
    }
    const interactiveGeoRaster = interactiveSegmentation.georaster;
    interactiveLayer = mapManager.rasterHandler.createMapLayer(
      interactiveGeoRaster,
      {
        pixelValuesToColorFn: (values) => pixelRenderer.render(values),
        zIndex: 3000,
      }
    );
    layerGroup.addLayer(interactiveLayer);
    interactiveLayer.setOpacity(mapManager.currentOpacity);
  }

  function showBriefMessage(message) {
    const messageEl = document.createElement("div");
    messageEl.className = "brief-message";
    messageEl.textContent = message;
    messageEl.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #333;
      color: white;
      padding: 10px 15px;
      border-radius: 4px;
      z-index: 9999;
      font-size: 14px;
    `;
    document.body.appendChild(messageEl);
    setTimeout(() => {
      if (document.body.contains(messageEl)) {
        document.body.removeChild(messageEl);
      }
    }, 3000);
  }
</script>
