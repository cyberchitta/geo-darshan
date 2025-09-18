<script>
  import { onMount } from "svelte";
  import { CompositeViewer } from "../js/composite-viewer.js";

  let {
    clusterLabels = {},
    dataState,
    segmentationManager,
    mapManager,
    dataLoader,
  } = $props();
  let labeledLayer = $state(null);
  let layerGroup = $state(null);
  let hasSegmentations = $derived(dataState?.segmentations?.size > 0);
  let hasLabels = $derived(Object.keys(clusterLabels).length > 0);
  let shouldHaveComposite = $derived(hasSegmentations && hasLabels);
  let isCompositeReady = $state(false);
  const stateObject = {
    get labeledLayer() {
      return labeledLayer;
    },
  };

  export function getState() {
    return stateObject;
  }

  $effect(() => {
    if (
      mapManager &&
      mapManager.map &&
      mapManager.layerControl &&
      !layerGroup
    ) {
      layerGroup = L.layerGroup();
      layerGroup.addTo(mapManager.map);
      mapManager.addOverlayLayer("Land Use", layerGroup, false);
    }
  });
  $effect(() => {
    if (layerGroup && dataLoader && !labeledLayer) {
      labeledLayer = new CompositeViewer(mapManager, dataLoader, layerGroup);
      labeledLayer.setSegmentationManager(segmentationManager);
      mapManager.setLabeledLayer(labeledLayer);
    }
  });
  $effect(() => {
    if (!labeledLayer) return;
    if (dataState?.segmentations) {
      labeledLayer.setSegmentations(dataState.segmentations);
    }
    if (hasLabels) {
      labeledLayer.updateLabels(clusterLabels);
    }
    if (shouldHaveComposite && !isCompositeReady) {
      isCompositeReady = false;
      labeledLayer
        .regenerateComposite()
        .then(() => {
          isCompositeReady = true;
        })
        .catch((error) => {
          isCompositeReady = false;
        });
    }
  });

  onMount(() => {
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
</script>
