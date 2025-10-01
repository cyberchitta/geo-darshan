<script>
  import { onMount } from "svelte";
  import { CLUSTER_ID_RANGES, SEGMENTATION_KEYS } from "../js/utils.js";
  import { Segmentation } from "../js/segmentation.js";
  import { ClassificationHierarchy } from "../js/classification.js";
  import { RegionLabeler } from "../js/region-labeler.js";

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
  let selectedPixelData = $state(new Map()); // Map<"x,y", originalClusterId>
  let listeners = $state({});
  const stateObject = {
    get interactiveSegmentation() {
      return interactiveSegmentation;
    },
    get hasActiveLayer() {
      return interactiveLayer && isLayerVisible;
    },
    handleCompositeClick: async (latlng, allLabels, segmentations) => {
      if (!compositeState?.georaster || !regionLabeler) return null;
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
      createInteractiveSegmentation();
      createInteractiveLayer();
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
      hierarchyLevel !== lastProcessedHierarchyLevel
    ) {
      console.log(
        `Hierarchy level changed to ${hierarchyLevel}, regenerating layer...`
      );
      createInteractiveLayer();
      lastProcessedHierarchyLevel = hierarchyLevel;
    }
  });
  $effect(() => {
    if (compositeState?.georaster && regionLabeler && interactiveSegmentation) {
      const allLabelsMap = Segmentation.extractAllLabels(
        dataState.segmentations
      );
      regionLabeler.updateCompositeData(
        compositeState.georaster,
        interactiveSegmentation,
        allLabelsMap,
        dataState.segmentations,
        processedInteractiveRaster
      );
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
    if (!compositeState?.georaster || !compositeState?.clusterIdMapping) return;
    const segmentation = Segmentation.createComposite(compositeState.georaster);
    const compositeData = compositeState.georaster.values[0];
    const interactiveRaster = createInteractiveRaster(compositeData);
    const aggregationPixelCounts = new Map();
    const aggregationToId = new Map();
    let nextLabeledId = 1;
    for (let y = 0; y < interactiveRaster.length; y++) {
      for (let x = 0; x < interactiveRaster[y].length; x++) {
        const originalClusterId = interactiveRaster[y][x];
        if (originalClusterId === CLUSTER_ID_RANGES.NODATA) continue;
        let classificationPath = "unlabeled";
        if (CLUSTER_ID_RANGES.isFineGrain(originalClusterId)) {
          classificationPath = "unlabeled";
        } else {
          for (const [key, mapping] of compositeState.clusterIdMapping) {
            if (mapping.uniqueId === originalClusterId) {
              classificationPath = mapping.classificationPath;
              break;
            }
          }
        }
        let aggregationKey, clusterId;
        if (classificationPath !== "unlabeled") {
          aggregationKey = classificationPath;
          if (!aggregationToId.has(aggregationKey)) {
            aggregationToId.set(aggregationKey, nextLabeledId++);
          }
          clusterId = aggregationToId.get(aggregationKey);
        } else {
          aggregationKey = `unlabeled_${originalClusterId}`;
          clusterId = originalClusterId;
          if (!aggregationToId.has(aggregationKey)) {
            aggregationToId.set(aggregationKey, clusterId);
          }
        }
        aggregationPixelCounts.set(
          aggregationKey,
          (aggregationPixelCounts.get(aggregationKey) || 0) + 1
        );
      }
    }
    for (let y = 0; y < interactiveRaster.length; y++) {
      for (let x = 0; x < interactiveRaster[y].length; x++) {
        const originalClusterId = interactiveRaster[y][x];
        if (originalClusterId === CLUSTER_ID_RANGES.NODATA) continue;
        let classificationPath = "unlabeled";
        if (CLUSTER_ID_RANGES.isFineGrain(originalClusterId)) {
          classificationPath = "unlabeled";
        } else {
          for (const [key, mapping] of compositeState.clusterIdMapping) {
            if (mapping.uniqueId === originalClusterId) {
              classificationPath = mapping.classificationPath;
              break;
            }
          }
        }
        let aggregationKey, clusterId;
        if (classificationPath !== "unlabeled") {
          aggregationKey = classificationPath;
          clusterId = aggregationToId.get(aggregationKey);
        } else {
          aggregationKey = `unlabeled_${originalClusterId}`;
          clusterId = originalClusterId;
        }
        interactiveRaster[y][x] = clusterId;
      }
    }
    for (const [aggregationKey, pixelCount] of aggregationPixelCounts) {
      const clusterId = aggregationToId.get(aggregationKey);
      let classificationPath;
      if (aggregationKey.startsWith("unlabeled_")) {
        classificationPath = "unlabeled";
      } else {
        classificationPath = aggregationKey;
      }
      const color =
        classificationPath === "unlabeled"
          ? null
          : ClassificationHierarchy.getColorForClassification(
              classificationPath,
              hierarchyLevel
            );
      segmentation.addCluster(clusterId, pixelCount, classificationPath, color);
    }
    segmentation.finalize();
    interactiveSegmentation = segmentation;
    dataState.addSegmentation(SEGMENTATION_KEYS.COMPOSITE, segmentation);
    const compositeColorMapping = createCompositeColorMapping(segmentation);
    dataLoader.colorMappings.set(
      SEGMENTATION_KEYS.COMPOSITE,
      compositeColorMapping
    );
    processedInteractiveRaster = interactiveRaster;
  }

  function createInteractiveRaster(compositeData) {
    if (
      !currentSegmentationKey ||
      !dataState.segmentations?.has(currentSegmentationKey)
    ) {
      return compositeData;
    }
    const currentSegmentation = dataState.segmentations.get(
      currentSegmentationKey
    );
    const currentRaster = currentSegmentation.georaster.values[0];
    const height = compositeData.length;
    const width = compositeData[0].length;
    const interactiveRaster = new Array(height);
    for (let y = 0; y < height; y++) {
      interactiveRaster[y] = new Array(width);
      for (let x = 0; x < width; x++) {
        const compositeValue = compositeData[y][x];
        if (compositeValue === CLUSTER_ID_RANGES.UNLABELED) {
          const fineGrainValue =
            currentRaster[y][x] + CLUSTER_ID_RANGES.FINE_GRAIN_START;
          interactiveRaster[y][x] = fineGrainValue;
        } else {
          interactiveRaster[y][x] = compositeValue;
        }
      }
    }
    return interactiveRaster;
  }

  function createInteractiveLayer() {
    if (!compositeState?.georaster || !interactiveSegmentation) return;
    if (interactiveLayer) {
      layerGroup.removeLayer(interactiveLayer);
    }
    const interactiveGeoRaster = {
      ...compositeState.georaster,
      values: [processedInteractiveRaster],
    };
    interactiveLayer = mapManager.rasterHandler.createMapLayer(
      interactiveGeoRaster,
      {
        pixelValuesToColorFn: convertInteractivePixelToColor,
        zIndex: 3000,
      }
    );
    layerGroup.addLayer(interactiveLayer);
    interactiveLayer.setOpacity(mapManager.currentOpacity);
  }

  function convertInteractivePixelToColor(values) {
    if (!values || values.length === 0 || values[0] === 0) {
      return null;
    }
    const clusterId = values[0];
    if (CLUSTER_ID_RANGES.isSelected(clusterId)) {
      return "rgba(0, 0, 0, 1)";
    }
    if (
      selectedCluster?.clusterId === clusterId &&
      selectedCluster?.segmentationKey === SEGMENTATION_KEYS.COMPOSITE
    ) {
      return "rgba(0, 0, 0, 1)";
    }
    if (!interactiveSegmentation) return null;
    const cluster = interactiveSegmentation.getCluster(clusterId);
    if (!cluster) return null;
    return ClassificationHierarchy.getColorForClassification(
      cluster.classificationPath,
      hierarchyLevel
    );
  }

  function createCompositeColorMapping(segmentation) {
    const clusters = segmentation.getAllClusters();
    const colors_rgb = [];
    clusters.forEach((cluster) => {
      if (cluster.color === null) {
        colors_rgb[cluster.id] = null;
      } else {
        const rgbArray = convertColorStringToArray(cluster.color);
        colors_rgb[cluster.id] = rgbArray;
      }
    });
    return {
      method: "cluster_specific",
      colors_rgb,
      nodata_value: CLUSTER_ID_RANGES.NODATA,
    };
  }

  function convertColorStringToArray(colorString) {
    const match = colorString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    return [
      parseInt(match[1]) / 255,
      parseInt(match[2]) / 255,
      parseInt(match[3]) / 255,
    ];
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
