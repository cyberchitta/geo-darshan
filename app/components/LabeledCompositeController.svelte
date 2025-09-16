<script>
  import { getContext, setContext, onMount } from "svelte";
  import { LabeledCompositeLayer } from "../js/labeled-composite.js";

  const { mapManager, dataLoader } = getContext("managers");
  console.log("🔍 Got context:", {
    mapManager: !!mapManager,
    dataLoader: !!dataLoader,
  });
  let { overlayData = [], clusterLabels = {} } = $props();
  let labeledLayer = $state(null);
  let layerGroup = $state(null);
  let isCompositeReady = $state(false);
  setContext("labeledLayer", {
    get instance() {
      return labeledLayer;
    },
    get isReady() {
      return !!labeledLayer && isCompositeReady;
    },
  });
  let hasOverlays = $derived(overlayData.length > 0);
  let hasLabels = $derived(Object.keys(clusterLabels).length > 0);
  let shouldHaveComposite = $derived(hasOverlays && hasLabels);
  $effect(() => {
    if (
      mapManager &&
      mapManager.map &&
      mapManager.layerControl &&
      !layerGroup
    ) {
      layerGroup = L.layerGroup();
      layerGroup.addTo(mapManager.map);
      mapManager.addOverlayLayer("Labeled Regions", layerGroup, false);
    }
  });
  $effect(() => {
    if (layerGroup && dataLoader && !labeledLayer) {
      labeledLayer = new LabeledCompositeLayer(
        mapManager,
        dataLoader,
        layerGroup
      );
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
        mapManager.removeOverlayLayer("Labeled Regions");
        mapManager.map.removeLayer(layerGroup);
      }
    };
  });
</script>
