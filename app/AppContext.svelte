<script>
  import { mount, onMount } from "svelte";
  import DataController from "./controllers/DataController.svelte";
  import SegmentationController from "./controllers/SegmentationController.svelte";
  import MapController from "./controllers/MapController.svelte";
  import CompositeController from "./controllers/CompositeController.svelte";
  import ClassificationController from "./controllers/ClassificationController.svelte";
  import InteractiveController from "./controllers/InteractiveController.svelte";
  import LegendPanel from "./components/LegendPanel.svelte";
  import ControlsPanel from "./components/ControlsPanel.svelte";
  import MapInfoPanel from "./components/MapInfoPanel.svelte";

  let {} = $props();
  let dataController = $state();
  let segmentationController = $state();
  let mapController = $state();
  let compositeController = $state();
  let classificationController = $state();
  let interactiveController = $state();

  let dataState = $derived(dataController?.getState());
  let segmentationState = $derived(segmentationController?.getState());
  let mapState = $derived(mapController?.getState());
  let compositeState = $derived(compositeController?.getState());
  let classificationState = $derived(classificationController?.getState());
  let interactiveState = $derived(interactiveController?.getState());

  let hasCoordinated = $state(false);

  const appState = $derived({
    data: dataState,
    map: mapState,
    segmentation: segmentationState,
    composite: compositeState,
    classification: classificationState,
    interactive: interactiveState,
  });

  const callbacks = {
    onLabelChange: handleLabelChange,
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
    window.addEventListener("clearData", clearData);
    const controlsTarget = document.getElementById("svelte-controls-panel");
    if (controlsTarget) {
      mount(ControlsPanel, {
        target: controlsTarget,
        props: {
          segmentationState,
          mapState,
          classificationState: appState.classification,
          interactiveState: appState.interactive,
        },
      });
    }
  });

  function coordinateDataLoading(manifest, overlays) {
    const allSegmentationKeys = manifest.segmentation_keys;
    const allOverlays = overlays;
    mapState?.mapManager?.setDataLoader?.(dataState.dataIO);
    mapState?.mapManager?.fitBounds?.(manifest.metadata.bounds);
    segmentationState.setFrames?.(allSegmentationKeys, allOverlays);
    hideLoading();
  }

  function handleLabelChange(
    segmentationKey,
    clusterId,
    classificationPath,
    bulkLabels = null
  ) {
    if (bulkLabels !== null) {
      dataState?.setBulkLabels?.(bulkLabels);
    } else if (segmentationKey && clusterId !== null) {
      dataState?.setClusterLabel?.(
        segmentationKey,
        clusterId,
        classificationPath
      );
    }
  }

  function clearData() {
    if (!confirm("Clear all loaded data? This will reset the viewer.")) return;
    if (dataState.clearData) {
      dataState.clearData();
    }
    segmentationState.reset?.();
    mapState.clearSelectedCluster?.();
  }

  function hideLoading() {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) {
      overlay.classList.add("hidden");
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
    {segmentationController}
    {interactiveController}
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
    bind:this={classificationController}
    compositeState={compositeState.compositeState}
    {dataState}
    mapManager={mapState.mapManager}
    dataIO={dataState.dataIO}
  />
{/if}

{#if compositeState?.compositeState && mapState?.mapManager && classificationState?.hierarchyLevel}
  <InteractiveController
    bind:this={interactiveController}
    compositeState={compositeState.compositeState}
    {dataState}
    {mapState}
    mapManager={mapState.mapManager}
    {segmentationController}
    hierarchyLevel={classificationState.hierarchyLevel}
  />
{/if}

{#if dataState?.dataIO && mapState?.mapManager && segmentationController}
  <LegendPanel {appState} {callbacks} />
  <MapInfoPanel
    currentLabel={mapState.currentHoverLabel}
    isVisible={mapState.interactionMode === "composite"}
  />
{/if}
