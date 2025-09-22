<script>
  import { onMount } from "svelte";
  import { SEGMENTATION_KEYS } from "./js/utils.js";
  import DataController from "./controllers/DataController.svelte";
  import SegmentationController from "./controllers/SegmentationController.svelte";
  import MapController from "./controllers/MapController.svelte";
  import CompositeController from "./controllers/CompositeController.svelte";
  import LegendPanel from "./components/LegendPanel.svelte";
  import ControlsPanel from "./components/ControlsPanel.svelte";
  import MapInfoPanel from "./components/MapInfoPanel.svelte";

  let {} = $props();
  let dataController = $state();
  let segmentationController = $state();
  let mapController = $state();
  let labeledCompositeController = $state();
  let labeledCompositeState = $derived(labeledCompositeController?.getState());
  let dataState = $derived(dataController?.getState());
  let segmentationState = $derived(segmentationController?.getState());
  let mapState = $derived(mapController?.getState());
  let labeledLayer = $derived(labeledCompositeState?.labeledLayer);
  let dataLabels = $derived(dataState?.clusterLabels || {});
  let hasCoordinated = $state(false);
  const appState = $derived({
    data: dataState,
    map: mapState,
    segmentation: segmentationState,
    labeledLayer,
  });
  const callbacks = {
    onLabelChange: handleLabelChange,
    onRegionCancel: handleRegionCancel,
    onRegionCommit: handleRegionCommit,
    onSegmentationChange: (frameIndex) =>
      appState.segmentation.goToFrame?.(frameIndex),
  };
  $effect(() => {
    if (dataState?.manifest && !hasCoordinated) {
      hasCoordinated = true;
      coordinateDataLoading(
        dataState.manifest,
        dataState.getAllOverlays?.() || []
      );
    }
  });

  onMount(async () => {
    console.log("AppContext mounted, loading saved labels...");
    window.addEventListener("clearData", clearData);
  });

  function coordinateDataLoading(manifest, overlays) {
    console.log("=== COORDINATING DATA LOADING ===");
    const allSegmentationKeys = [
      ...manifest.segmentation_keys,
      SEGMENTATION_KEYS.COMPOSITE,
    ];
    const allOverlays = [...overlays, null];
    segmentationState.setFrames?.(allSegmentationKeys, allOverlays);
    hideLoading();
    console.log("✅ Data loading coordination complete");
  }

  function handleLabelChange(
    segmentationKey,
    clusterId,
    landUsePath,
    bulkLabels = null
  ) {
    console.log("🔧 handleLabelChange called:", {
      segmentationKey,
      clusterId,
      landUsePath,
      bulkLabels,
    });
    if (bulkLabels !== null) {
      dataState?.setBulkLabels?.(bulkLabels);
    } else if (segmentationKey && clusterId !== null) {
      dataState?.setClusterLabel?.(segmentationKey, clusterId, landUsePath);
    }
  }

  function clearData() {
    if (!confirm("Clear all loaded data? This will reset the viewer.")) return;
    if (dataState.clearData) {
      dataState.clearData();
    }
    segmentationState.reset?.();
    mapState.clearSelectedCluster?.();
    console.log("✅ Data cleared");
  }

  function hideLoading() {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) {
      overlay.classList.add("hidden");
    }
  }

  function handleRegionCancel() {
    mapState.clearSelectedRegion?.();
    mapState.clearRegionHighlight?.();
  }

  function handleRegionCommit(landUsePath) {
    if (mapState.selectedRegion && labeledCompositeState) {
      labeledCompositeState.labelRegion(
        mapState.selectedRegion.region,
        landUsePath
      );
      mapState.clearSelectedRegion?.();
    }
  }
</script>

<DataController bind:this={dataController} />
<SegmentationController bind:this={segmentationController} />

{#if dataState?.dataIO}
  <MapController
    bind:this={mapController}
    {dataState}
    {segmentationController}
    {labeledLayer}
    clusterLabels={dataLabels}
  />
{/if}
{#if dataState?.dataIO && mapState?.mapManager && segmentationController && dataState?.manifest}
  <CompositeController
    bind:this={labeledCompositeController}
    clusterLabels={dataLabels}
    {dataState}
    mapManager={mapState.mapManager}
    dataLoader={dataState.dataIO}
  />
{/if}
{#if dataState?.dataIO && mapState?.mapManager && segmentationController}
  <LegendPanel {appState} clusterLabels={dataLabels} {callbacks} />
  <ControlsPanel {segmentationState} {mapState} />
  <MapInfoPanel
    currentLabel={mapState.currentHoverLabel}
    isVisible={mapState.interactionMode === "composite"}
  />
{/if}
