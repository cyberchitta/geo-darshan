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
  let interactionMode = $derived(mapState?.interactionMode);
  let selectedCluster = $state(null);
  let selectedRegion = $state(null);
  let interactiveLayer = $state(null);
  let pixelRenderer = $state(null);
  let layerGroup = $state(null);
  let interactiveSegmentation = $state(null);
  let isLayerVisible = $state(false);
  let lastProcessedSegmentationKey = $state(null);
  let currentSegmentationKey = $derived(
    segmentationController?.getState()?.currentSegmentationKey
  );
  let processedInteractiveRaster = $state(null);
  let selectedPixelData = $state(new Map());

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
    get selectedCluster() {
      return selectedCluster;
    },
    get selectedRegion() {
      return selectedRegion;
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
      selectedRegion = {
        region: contiguousRegion,
        latlng,
        pixelCount: contiguousRegion.length,
        suggestions,
      };
      return selectedRegion;
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
      selectedRegion = null;
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
        selectedCluster = null;
        return;
      }
      const clusterId = processedInteractiveRaster[pixel.y][pixel.x];
      if (clusterId === CLUSTER_ID_RANGES.NODATA) {
        selectedCluster = null;
        return;
      }
      selectedCluster = clusterId;
    },
    cancelSelection: () => {
      restoreOriginalValues();
      createInteractiveLayer();
      selectedRegion = null;
    },
    clearSelection: () => {
      if (selectedPixelData.size > 0) {
        restoreOriginalValues();
        createInteractiveLayer();
      }
      selectedCluster = null;
      selectedRegion = null;
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

  let hasInitialized = $state(false);
  $effect(() => {
    if (hasInitialized) return;
    if (
      !compositeState?.compositeSegRaster ||
      !layerGroup ||
      !currentSegmentationKey
    )
      return;
    if (!dataState.segmentedRasters?.has(currentSegmentationKey)) return;
    createInteractiveSegmentation();
    createInteractiveLayer();
    hasInitialized = true;
  });
  let lastSegKey = $state(null);
  let lastSynthVersion = $state(0);
  $effect(() => {
    if (!hasInitialized || !isLayerVisible) return;
    const currentKey = currentSegmentationKey;
    const synthVersion =
      dataState.segmentedRasters
        ?.get(SEGMENTATION_KEYS.SYNTHETIC)
        ?.registry.size() || 0;
    const needsRegeneration =
      currentKey !== lastSegKey || synthVersion !== lastSynthVersion;
    if (needsRegeneration) {
      createInteractiveSegmentation();
      createInteractiveLayer();
      lastSegKey = currentKey;
      lastSynthVersion = synthVersion;
    }
  });
  let lastHierLevel = $state(null);
  let lastCluster = $state(undefined);
  let lastMode = $state(null);
  $effect(() => {
    if (!hasInitialized || !pixelRenderer || !isLayerVisible) return;
    const hierLevel = hierarchyLevel;
    const cluster = selectedCluster;
    const mode = interactionMode;
    const needsUpdate =
      hierLevel !== lastHierLevel ||
      cluster !== lastCluster ||
      mode !== lastMode;
    if (needsUpdate) {
      pixelRenderer = pixelRenderer.update({
        hierarchyLevel: hierLevel,
        selectedCluster: cluster ? { clusterId: cluster } : null,
        interactionMode: mode,
      });
      createInteractiveLayer();
      lastHierLevel = hierLevel;
      lastCluster = cluster;
      lastMode = mode;
    }
  });
  $effect(() => {
    const shouldBeSelectable =
      isLayerVisible &&
      (interactionMode === "cluster" || interactionMode === "composite");
    if (!shouldBeSelectable) {
      selectedCluster = null;
      selectedRegion = null;
      if (selectedPixelData.size > 0) {
        restoreOriginalValues();
      }
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
    if (!compositeState?.compositeSegRaster) return;
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
      interactionMode,
      selectedCluster: selectedCluster ? { clusterId: selectedCluster } : null,
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
