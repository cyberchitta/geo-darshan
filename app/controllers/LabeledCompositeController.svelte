<script>
  import { onMount } from "svelte";
  import { LabeledCompositeLayer } from "../js/labeled-composite.js";

  let {
    overlayData = [],
    clusterLabels = {},
    segmentationManager,
    mapManager,
    dataLoader,
  } = $props();
  let labeledLayer = $state(null);
  let layerGroup = $state(null);
  let hasOverlays = $derived(overlayData.length > 0);
  let hasLabels = $derived(Object.keys(clusterLabels).length > 0);
  let shouldHaveComposite = $derived(hasOverlays && hasLabels);
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
      labeledLayer = new LabeledCompositeLayer(
        mapManager,
        dataLoader,
        layerGroup
      );
      labeledLayer.setSegmentationManager(segmentationManager);
      mapManager.setLabeledLayer(labeledLayer);
    }
  });
  $effect(() => {
    if (!labeledLayer) return;
    if (hasOverlays) {
      labeledLayer.setOverlayData(overlayData);
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
