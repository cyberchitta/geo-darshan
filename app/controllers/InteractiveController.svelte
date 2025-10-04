<script>
  import { onMount } from "svelte";
  import { CLUSTER_ID_RANGES, SEGMENTATION_KEYS } from "../js/utils.js";
  import { MapOverlay } from "../js/map-overlay.js";
  import { ClassificationHierarchy } from "../js/classification.js";
  import { RegionLabeler } from "../js/region-labeler.js";
  import { RasterFactory } from "../js/raster/raster-factory.js";
  import { ClassificationRenderer } from "../js/raster/color-renderers.js";

  let {
    compositeState,
    dataState,
    mapState,
    mapManager,
    segmentationController,
    hierarchyLevel,
  } = $props();
  let interactiveLayer = $state(null);
  let pixelRenderer = $state(null);
  let layerGroup = $state(null);
  let interactiveSegmentation = $state(null);
  let isLayerVisible = $state(false);
  let lastProcessedHierarchyLevel = $state(null);
  let lastProcessedSegmentationKey = $state(null);
  let syntheticVersion = $state(0);
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
    handleCompositeClick: async (latlng) => {
      if (!interactiveSegmentation) return null;
      const pixelCoord = RegionLabeler.latlngToPixelCoord(
        latlng,
        interactiveSegmentation
      );
      if (!pixelCoord) return null;
      const isUnlabeled = RegionLabeler.isPixelUnlabeled(
        pixelCoord,
        interactiveSegmentation
      );
      if (!isUnlabeled) return null;
      const contiguousRegion = RegionLabeler.findContiguousRegion(
        pixelCoord,
        interactiveSegmentation
      );
      if (contiguousRegion.length === 0) return null;
      const suggestions = RegionLabeler.analyzeNeighborhood(
        contiguousRegion,
        interactiveSegmentation
      );
      markRegionAsSelected(contiguousRegion);
      return {
        action: "create_new",
        region: contiguousRegion,
        latlng,
        suggestions,
      };
    },
    labelRegion: (region, classificationPath) => {
      restoreOriginalValues();
      const syntheticSegRaster = dataState.segmentedRasters?.get(
        SEGMENTATION_KEYS.SYNTHETIC
      );
      if (!syntheticSegRaster) {
        console.error("Synthetic segmented raster not found");
        return null;
      }
      const { syntheticSegRaster: updatedSynthetic, syntheticId } =
        RegionLabeler.labelRegion(
          region,
          classificationPath,
          syntheticSegRaster,
          hierarchyLevel
        );
      dataState.addSegmentedRaster(
        SEGMENTATION_KEYS.SYNTHETIC,
        updatedSynthetic
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
      if (!processedInteractiveRaster || !interactiveSegmentation?.raster) {
        return;
      }
      const pixel = interactiveSegmentation.raster.latlngToPixel(latlng);
      if (!pixel) {
        stateObject.emit("clusterSelected", null, null);
        return;
      }
      const clusterId = processedInteractiveRaster[pixel.y][pixel.x];
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
      layerGroup = MapOverlay.create(mapManager, "Interactive", {
        visible: false,
        onVisibilityChange: (val) => (isLayerVisible = val),
      });
    }
    return () => {
      if (interactiveLayer && layerGroup) {
        layerGroup.removeLayer(interactiveLayer);
      }
      if (layerGroup && mapManager) {
        layerGroup.destroy();
      }
    };
  });

  $effect(() => {
    if (
      compositeState?.georaster &&
      layerGroup &&
      !interactiveSegmentation &&
      currentSegmentationKey &&
      dataState.segmentedRasters?.has(currentSegmentationKey)
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
    const syntheticSegRaster = dataState.segmentedRasters?.get(
      SEGMENTATION_KEYS.SYNTHETIC
    );
    if (syntheticSegRaster && interactiveSegmentation) {
      const currentVersion = syntheticSegRaster.registry.size();
      if (currentVersion !== syntheticVersion) {
        syntheticVersion = currentVersion;
        console.log("Synthetic clusters changed, regenerating interactive...");
        createInteractiveSegmentation();
        createInteractiveLayer();
      }
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
    const compositeSegRaster = dataState.segmentedRasters?.get(
      SEGMENTATION_KEYS.COMPOSITE
    );
    const currentSegRaster = dataState.segmentedRasters.get(
      currentSegmentationKey
    );
    if (!compositeSegRaster || !currentSegRaster) {
      return;
    }
    let aggregated = RasterFactory.createInteractive(
      compositeSegRaster,
      currentSegRaster
    );
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
    interactiveSegmentation = aggregated;
    pixelRenderer = new ClassificationRenderer(aggregated, {
      hierarchyLevel,
      interactionMode: mapState.interactionMode,
      selectedCluster,
      grayscaleLabeled: false,
    });
  }

  function createInteractiveLayer() {
    if (!interactiveSegmentation || !pixelRenderer) return;
    if (interactiveLayer) {
      layerGroup.removeLayer(interactiveLayer);
    }
    const interactiveGeoRaster = interactiveSegmentation.raster.toGeoRaster();
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
