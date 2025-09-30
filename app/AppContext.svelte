<script>
  import { onMount } from "svelte";
  import { SEGMENTATION_KEYS } from "./js/utils.js";
  import DataController from "./controllers/DataController.svelte";
  import SegmentationController from "./controllers/SegmentationController.svelte";
  import MapController from "./controllers/MapController.svelte";
  import CompositeController from "./controllers/CompositeController.svelte";
  import ClassificationController from "./controllers/ClassificationController.svelte";
  import LabelRegionsController from "./controllers/LabelRegionsController.svelte";
  import LegendPanel from "./components/LegendPanel.svelte";
  import ControlsPanel from "./components/ControlsPanel.svelte";
  import MapInfoPanel from "./components/MapInfoPanel.svelte";

  let {} = $props();
  let dataController = $state();
  let segmentationController = $state();
  let mapController = $state();
  let compositeController = $state();
  let landUseController = $state();
  let labelRegionsController = $state();

  let dataState = $derived(dataController?.getState());
  let segmentationState = $derived(segmentationController?.getState());
  let mapState = $derived(mapController?.getState());
  let compositeState = $derived(compositeController?.getState());
  let landUseState = $derived(landUseController?.getState());
  let labelRegionsState = $derived(labelRegionsController?.getState());

  let hasCoordinated = $state(false);

  const appState = $derived({
    data: dataState,
    map: mapState,
    segmentation: segmentationState,
    composite: compositeState,
    landUse: landUseState,
    labelRegions: labelRegionsState,
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
  $effect(() => {
    if (mapState?.interactionMode !== "cluster") {
      segmentationController?.getState()?.clearSelection?.();
      labelRegionsController?.getState()?.clearSelection?.();
    }
  });

  onMount(async () => {
    console.log("AppContext mounted, loading saved labels...");
    window.addEventListener("clearData", clearData);
  });

  function coordinateDataLoading(manifest, overlays) {
    console.log("=== COORDINATING DATA LOADING ===");
    const allSegmentationKeys = manifest.segmentation_keys;
    const allOverlays = overlays;
    mapState?.mapManager?.setDataLoader?.(dataState.dataIO);
    mapState?.mapManager?.fitBounds?.(manifest.metadata.bounds);
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
    mapState.cancelSelection?.();
  }

  function handleRegionCommit(landUsePath) {
    if (mapState.selectedRegion && labelRegionsState) {
      labelRegionsState.labelRegion(
        mapState.selectedRegion.region,
        landUsePath
      );
      mapState.clearSelectedRegion?.();
    }
  }
</script>

<DataController bind:this={dataController} />
<SegmentationController
  bind:this={segmentationController}
  {mapState}
  {dataState}
/>

{#if dataState?.dataIO}
  <MapController
    bind:this={mapController}
    {dataState}
    {segmentationController}
    {labelRegionsController}
  />
{/if}

{#if dataState?.dataIO && mapState?.mapManager && segmentationController && dataState?.manifest}
  <CompositeController
    bind:this={compositeController}
    {dataState}
    {segmentationController}
  />
{/if}

{#if compositeState?.compositeState && mapState?.mapManager}
  <ClassificationController
    bind:this={landUseController}
    compositeState={compositeState.compositeState}
    {dataState}
    mapManager={mapState.mapManager}
    dataIO={dataState.dataIO}
  />
{/if}

{#if compositeState?.compositeState && mapState?.mapManager && landUseState?.hierarchyLevel}
  <LabelRegionsController
    bind:this={labelRegionsController}
    compositeState={compositeState.compositeState}
    {dataState}
    {mapState}
    mapManager={mapState.mapManager}
    dataLoader={dataState.dataIO}
    {segmentationController}
    hierarchyLevel={landUseState.hierarchyLevel}
  />
{/if}

{#if dataState?.dataIO && mapState?.mapManager && segmentationController}
  <LegendPanel {appState} {callbacks} />
  <ControlsPanel
    {segmentationState}
    {mapState}
    landUseState={appState.landUse}
    labelRegionsState={appState.labelRegions}
  />
  <MapInfoPanel
    currentLabel={mapState.currentHoverLabel}
    isVisible={mapState.interactionMode === "composite"}
  />
{/if}
