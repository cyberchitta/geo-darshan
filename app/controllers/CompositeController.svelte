<script>
  import { onMount } from "svelte";
  import { SEGMENTATION_KEYS } from "../js/utils.js";
  import { CompositeViewer } from "../js/composite-viewer.js";
  import { Segmentation } from "../js/segmentation.js";

  let { clusterLabels = {}, dataState, mapManager, dataLoader } = $props();
  let labeledLayer = $state(null);
  let layerGroup = $state(null);
  let hasSegmentations = $derived(dataState?.segmentations?.size > 0);
  let lastProcessedUserVersion = $state(-1);
  let shouldRegenerateComposite = $derived(
    hasSegmentations && dataState.userLabelsVersion > lastProcessedUserVersion
  );
  let compositeState = $state(null);
  const stateObject = {
    get labeledLayer() {
      return labeledLayer;
    },
    get compositeState() {
      return compositeState;
    },
  };

  export function getState() {
    return stateObject;
  }

  onMount(() => {
    if (mapManager && mapManager.map && mapManager.layerControl) {
      layerGroup = L.layerGroup();
      layerGroup.addTo(mapManager.map);
      mapManager.addOverlayLayer("Land Use", layerGroup, false);
    }
    return () => {
      if (labeledLayer) {
        labeledLayer.destroy();
      }
      if (layerGroup && mapManager) {
        mapManager.removeOverlayLayer("Land Use");
        mapManager.map.removeLayer(layerGroup);
      }
    };
  });

  $effect(() => {
    if (layerGroup && dataLoader && !labeledLayer) {
      labeledLayer = new CompositeViewer(mapManager, dataLoader, layerGroup);
      mapManager.setLabeledLayer(labeledLayer);
    }
  });
  $effect(async () => {
    if (!labeledLayer || !shouldRegenerateComposite) return;
    try {
      const allLabelsMap = new Map();
      Object.entries(clusterLabels).forEach(([segKey, labels]) => {
        const labelMap = new Map();
        Object.entries(labels).forEach(([clusterId, landUsePath]) => {
          labelMap.set(parseInt(clusterId), landUsePath);
        });
        allLabelsMap.set(segKey, labelMap);
      });
      const compositeResult = await labeledLayer.generateComposite(
        dataState.segmentations,
        allLabelsMap
      );
      compositeState = compositeResult;
      const syntheticOverlay = labeledLayer.generateSyntheticOverlay(
        compositeResult.georaster,
        compositeResult.segmentationMap,
        compositeResult.segmentations,
        allLabelsMap
      );
      dataState.addOverlay(SEGMENTATION_KEYS.COMPOSITE, syntheticOverlay);
      const syntheticSegmentation =
        await createSyntheticSegmentation(syntheticOverlay);
      dataState.addSegmentation(
        SEGMENTATION_KEYS.COMPOSITE,
        syntheticSegmentation
      );
      await mapManager.addOverlay(syntheticOverlay);
      lastProcessedUserVersion = dataState.userLabelsVersion;
      Object.entries(syntheticOverlay.pixelMapping).forEach(
        ([clusterId, landUsePath]) => {
          dataState.setClusterLabel(
            SEGMENTATION_KEYS.COMPOSITE,
            parseInt(clusterId),
            landUsePath
          );
        }
      );
    } catch (error) {
      console.error("Failed to generate composite:", error);
      lastProcessedUserVersion = dataState.userLabelsVersion;
      compositeState = null;
    }
  });

  async function createSyntheticSegmentation(overlay) {
    const segmentation = Segmentation.createSynthetic(overlay.georaster);
    Object.entries(overlay.pixelMapping).forEach(([clusterId, landUsePath]) => {
      const id = parseInt(clusterId);
      const color = getColorFromMapping(id, overlay.colorMapping);
      const pixelCount = calculatePixelCount(id, overlay.georaster);
      segmentation.addCluster(id, pixelCount, landUsePath, color);
    });
    segmentation.finalize();
    return segmentation;
  }

  function getColorFromMapping(clusterId, colorMapping) {
    const color = colorMapping.colors_rgb[clusterId];
    if (color && color.length >= 3) {
      return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, 1)`;
    }
    return "rgb(128,128,128)";
  }

  function calculatePixelCount(clusterId, georaster) {
    let count = 0;
    const rasterData = georaster.values[0];
    for (let y = 0; y < rasterData.length; y++) {
      for (let x = 0; x < rasterData[y].length; x++) {
        if (rasterData[y][x] === clusterId) count++;
      }
    }
    return count;
  }
</script>
