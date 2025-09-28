<script>
  import { onMount } from "svelte";
  import { SEGMENTATION_KEYS } from "../js/utils.js";
  import { DataIO } from "../js/data-io.js";
  import { Cluster } from "../js/cluster.js";

  let {} = $props();
  let aoiName = $state("");
  let dataIO = $state(null);
  let isLoading = $state(false);
  let error = $state(null);
  let manifest = $state(null);
  let segmentations = $state(new Map());
  let userLabelsVersion = $state(0);
  let clusterLabels = $state({});
  let overlayMap = $state(new Map()); // segmentationKey -> overlay

  const stateObject = {
    get aoiName() {
      return aoiName;
    },
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
    get userLabelsVersion() {
      return userLabelsVersion;
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

  function restoreLabelsToSegmentations() {
    Object.entries(clusterLabels).forEach(([segKey, labels]) => {
      const segmentation = segmentations.get(segKey);
      if (segmentation) {
        Object.entries(labels).forEach(([clusterId, landUsePath]) => {
          const cluster = segmentation.getCluster(parseInt(clusterId));
          if (cluster) {
            cluster.landUsePath = landUsePath;
          }
        });
      }
    });
    console.log("✅ Restored labels to cluster objects");
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
      restoreLabelsToSegmentations();
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

  async function loadFromFolder(files) {
    try {
      if (!dataIO) {
        error = "Data dataIO not initialized";
        return;
      }
      const loadFiles = Array.from(files);
      if (loadFiles.length === 0) throw new Error("No files selected");
      const firstFile = loadFiles[0];
      const rootDir = firstFile.webkitRelativePath
        ? firstFile.webkitRelativePath.split("/")[0]
        : "unknown-aoi";
      const intermediatesPrefix = `${rootDir}/intermediates/`;
      const filteredFiles = loadFiles.filter((f) =>
        f.webkitRelativePath.startsWith(intermediatesPrefix)
      );
      if (filteredFiles.length === 0) {
        throw new Error(
          `No files in ${rootDir}/intermediates/ subfolder—ensure AOI structure is correct`
        );
      }
      aoiName = rootDir;
      console.log("DataController: Starting folder load...");
      isLoading = true;
      error = null;
      dataIO.loadFromFolder(filteredFiles);
    } catch (err) {
      console.error("Failed to load from folder:", err);
      error = err.message;
      isLoading = false;
    }
  }

  function setClusterLabel(segmentationKey, clusterId, landUsePath) {
    const segmentation = segmentations.get(segmentationKey);
    if (segmentation) {
      const cluster = segmentation.getCluster(clusterId);
      if (cluster) {
        cluster.landUsePath = landUsePath;
      }
    }
    clusterLabels = {
      ...clusterLabels,
      [segmentationKey]: {
        ...clusterLabels[segmentationKey],
        [clusterId]: landUsePath,
      },
    };
    if (segmentationKey !== SEGMENTATION_KEYS.COMPOSITE) {
      userLabelsVersion++;
    }
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
  function serializeLabelsFromSegmentations() {
    const serialized = {};
    segmentations.forEach((segmentation, segKey) => {
      const clusters = segmentation.getAllClusters();
      if (clusters.length > 0) {
        serialized[segKey] = {};
        clusters.forEach((cluster) => {
          if (cluster.landUsePath !== "unlabeled") {
            serialized[segKey][cluster.id] = cluster.landUsePath;
          }
        });
      }
    });
    return serialized;
  }

  function exportLabels() {
    if (dataIO) {
      const serializedLabels = serializeLabelsFromSegmentations();
      dataIO.exportLabelsToFile(serializedLabels);
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
