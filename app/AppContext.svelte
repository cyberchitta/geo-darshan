<script>
  import { onMount } from "svelte";
  import { STORAGE_KEYS } from "./js/utils.js";
  import DataController from "./controllers/DataController.svelte";
  import SegmentationController from "./controllers/SegmentationController.svelte";
  import MapController from "./controllers/MapController.svelte";
  import LabeledCompositeController from "./controllers/LabeledCompositeController.svelte";
  import LegendPanel from "./components/LegendPanel.svelte";
  import ControlsPanel from "./components/ControlsPanel.svelte";

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
  const appState = $derived({
    data: dataState,
    map: mapState,
    segmentation: segmentationState,
    labeledLayer,
  });
  let labelsReady = $state(false);
  let clusterLabels = $state({});
  $effect(() => {
    console.log("Effect running, manifest:", !!dataState.manifest);
    if (dataState?.manifest) {
      coordinateDataLoading(dataState.manifest, dataController.getOverlays());
    }
  });
  $effect(() => {
    if (labelsReady) {
      persistLabels();
      updateControllersWithLabels();
    }
  });

  onMount(async () => {
    console.log("AppContext mounted, loading saved labels...");
    loadSavedLabels();
    window.addEventListener("clearData", clearData);
  });

  function coordinateDataLoading(manifest, overlays) {
    console.log("=== COORDINATING DATA LOADING ===");
    if (labeledLayer) {
      labeledLayer.setOverlayData(overlays);
    }
    const allSegmentationKeys = [
      ...manifest.segmentation_keys,
      "composite_regions",
    ];
    const allOverlays = [...overlays, null];
    segmentationState.setFrames?.(allSegmentationKeys, allOverlays);
    setTimeout(() => {
      segmentationState.showInitialFrame?.();
      console.log("✅ Initial frame displayed");
    }, 100);
    hideLoading();
    console.log("✅ Data loading coordination complete");
  }

  function updateControllersWithLabels() {
    if (labeledLayer) {
      labeledLayer.updateLabels(clusterLabels);
    }
    if (mapController?.updateAllLayersWithLabels) {
      mapController.updateAllLayersWithLabels(clusterLabels);
    }
  }

  function persistLabels() {
    try {
      localStorage.setItem(
        STORAGE_KEYS.CLUSTER_LABELS,
        JSON.stringify({
          labels: clusterLabels,
          timestamp: new Date().toISOString(),
        })
      );
    } catch (error) {
      console.warn("Failed to save labels to localStorage:", error);
    }
  }

  function loadSavedLabels() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CLUSTER_LABELS);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.labels && Object.keys(data.labels).length > 0) {
          clusterLabels = data.labels;
          labelsReady = true;
          return;
        }
      }
      console.log("🔄 No saved labels found");
      labelsReady = true;
    } catch (error) {
      console.warn("Failed to load saved labels:", error);
      labelsReady = true;
    }
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
      clusterLabels = bulkLabels;
    } else if (segmentationKey && clusterId !== null) {
      clusterLabels = {
        ...clusterLabels,
        [segmentationKey]: {
          ...clusterLabels[segmentationKey],
          [clusterId]: landUsePath,
        },
      };
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
</script>

<DataController bind:this={dataController} />
<SegmentationController bind:this={segmentationController} />

{#if dataState?.loader}
  <MapController
    bind:this={mapController}
    {dataState}
    {segmentationController}
    {labeledLayer}
  />
{/if}
{#if dataState?.loader && mapState?.mapManager && segmentationController && dataState?.manifest}
  <LabeledCompositeController
    bind:this={labeledCompositeController}
    overlayData={dataController?.getOverlays()}
    {clusterLabels}
    segmentationManager={segmentationController?.getManager()}
    mapManager={mapState.mapManager}
    dataLoader={dataState.loader}
  />
{/if}

{#if dataState?.loader && mapState?.mapManager && segmentationController}
  <LegendPanel {appState} {clusterLabels} onLabelChange={handleLabelChange} />
  <ControlsPanel {segmentationState} {mapState} />
{/if}
