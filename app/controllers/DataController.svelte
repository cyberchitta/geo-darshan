<script>
  import { onMount } from "svelte";
  import { DataIO } from "../js/data-io.js";
  import { Cluster } from "../js/cluster.js";

  let {} = $props();
  let dataIO = $state(null);
  let isLoading = $state(false);
  let error = $state(null);
  let manifest = $state(null);
  let segmentations = $state(new Map());
  let clusterLabels = $state({});
  let overlayMap = $state(new Map()); // segmentationKey -> overlay

  const stateObject = {
    get dataIO() {
      return dataIO;
    },
    get isLoading() {
      return isLoading;
    },
    get error() {
      return error;
    },
    get manifest() {
      return manifest;
    },
    get segmentations() {
      return segmentations;
    },
    get clusterLabels() {
      return clusterLabels;
    },
    addSegmentation: (key, segmentation) => {
      segmentations.set(key, segmentation);
    },
    removeSegmentation: (key) => {
      segmentations.delete(key);
      removeOverlay(key);
    },
    addOverlay: (segmentationKey, overlay) => {
      overlayMap.set(segmentationKey, overlay);
    },
    removeOverlay: (segmentationKey) => {
      overlayMap.delete(segmentationKey);
    },
    getOverlay: (segmentationKey) => overlayMap.get(segmentationKey),
    getAllOverlays: () => Array.from(overlayMap.values()),
    setClusterLabel,
    setBulkLabels,
    clearLabels,
    exportLabels,
    importLabels,
    loadFromFolder,
    clearData,
  };

  function removeOverlay(segmentationKey) {
    overlayMap.delete(segmentationKey);
  }

  export function getState() {
    return stateObject;
  }

  onMount(() => {
    const rasterHandler = window.rasterHandler;
    if (!rasterHandler) {
      error = "Raster handler not found. Make sure it's injected from HTML.";
      return;
    }
    dataIO = new DataIO(rasterHandler);
    clusterLabels = dataIO.loadLabelsFromStorage();
    setupEventListeners();
  });

  function setupEventListeners() {
    dataIO.on("loadComplete", handleLoadComplete);
    dataIO.on("loadError", handleLoadError);
    dataIO.on("loadProgress", handleLoadProgress);
  }

  async function handleLoadComplete(manifestData, overlayData) {
    try {
      console.log("DataController: Processing loaded data...");
      overlayData.forEach((overlay) => {
        overlayMap.set(overlay.segmentationKey, overlay);
      });
      segmentations = await Cluster.extractSegmentations(
        overlayData,
        manifestData,
        dataIO
      );
      isLoading = false;
      error = null;
      manifest = manifestData;
      console.log("✅ DataController: Data processing complete");
    } catch (err) {
      console.error("DataController: Failed to process data:", err);
      error = `Data processing failed: ${err.message}`;
      isLoading = false;
    }
  }

  function handleLoadError(err) {
    console.error("DataController: Load error:", err);
    error = err.message;
    isLoading = false;
  }

  function handleLoadProgress(current, total) {
    console.log(`DataController: Loading progress ${current}/${total}`);
  }

  function loadFromFolder(files) {
    if (!dataIO) {
      error = "Data dataIO not initialized";
      return;
    }
    console.log("DataController: Starting folder load...");
    isLoading = true;
    error = null;
    dataIO.loadFromFolder(files);
  }

  function setClusterLabel(segmentationKey, clusterId, landUsePath) {
    clusterLabels = {
      ...clusterLabels,
      [segmentationKey]: {
        ...clusterLabels[segmentationKey],
        [clusterId]: landUsePath,
      },
    };
    if (dataIO) {
      dataIO.saveLabelsToStorage(clusterLabels);
    }
  }

  function setBulkLabels(newLabels) {
    clusterLabels = newLabels;
    if (dataIO) {
      dataIO.saveLabelsToStorage(clusterLabels);
    }
  }

  function clearLabels() {
    clusterLabels = {};
    if (dataIO) {
      dataIO.saveLabelsToStorage(clusterLabels);
    }
  }

  function exportLabels() {
    if (dataIO) {
      dataIO.exportLabelsToFile(clusterLabels);
    }
  }

  async function importLabels(file) {
    if (dataIO) {
      const loadedLabels = await dataIO.importLabelsFromFile(file);
      clusterLabels = loadedLabels;
      dataIO.saveLabelsToStorage(clusterLabels);
      return loadedLabels;
    }
  }

  function clearData() {
    console.log("DataController: Clearing all data");
    manifest = null;
    overlayMap = new Map();
    segmentations = new Map();
    isLoading = false;
    error = null;
  }
</script>
