<script>
  import { onMount } from "svelte";
  import { SEGMENTATION_KEYS } from "../js/utils.js";
  import { DataIO } from "../js/data-io.js";
  import { SegmentedRasterLoader } from "../js/raster/segmented-raster-loader.js";
  import { RasterFactory } from "../js/raster/raster-factory.js";
  import { Raster } from "../js/raster/raster.js";
  import { ClassificationHierarchy } from "../js/classification.js";

  let {} = $props();
  let aoiName = $state("");
  let dataIO = $state(null);
  let segmentedRasterLoader = $state(null);
  let isLoading = $state(false);
  let error = $state(null);
  let manifest = $state(null);
  let segmentedRasters = $state(new Map());
  let userLabelsVersion = $state(0);
  let clusterLabels = $state({});
  let overlayMap = $state(new Map());
  let segmentedRastersVersion = $state(0);
  let hierarchyData = $state(null);
  let hierarchyColors = $state(null);
  let shapefileData = $state(null);
  let intersectionCache = $state(null);
  let minIntersectionPct = $state(null);

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
    get segmentedRasters() {
      return segmentedRasters;
    },
    get segmentedRastersVersion() {
      return segmentedRastersVersion;
    },
    get userLabelsVersion() {
      return userLabelsVersion;
    },
    get hierarchy() {
      return hierarchyData;
    },
    get hierarchyColors() {
      return hierarchyColors;
    },
    get hasHierarchy() {
      return hierarchyData !== null && hierarchyColors !== null;
    },
    get shapefile() {
      return shapefileData;
    },
    get intersectionCache() {
      return intersectionCache;
    },
    get minIntersectionPct() {
      return minIntersectionPct;
    },
    addSegmentedRaster: (key, segRaster) => {
      segmentedRasters.set(key, segRaster);
    },
    updateSegmentedRaster: (key, segRaster) => {
      segmentedRasters.set(key, segRaster);
      segmentedRastersVersion++;
      const clusters = segRaster.getAllClusters();
      const labels = {};
      clusters.forEach((cluster) => {
        if (cluster.classificationPath !== "unlabeled") {
          labels[cluster.id] = cluster.classificationPath;
        }
      });
      clusterLabels = {
        ...clusterLabels,
        [key]: labels,
      };
      if (dataIO) {
        dataIO.saveLabelsToStorage(clusterLabels);
      }
    },
    removeSegmentedRaster: (key) => {
      segmentedRasters.delete(key);
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
    segmentedRasterLoader = new SegmentedRasterLoader(dataIO);
    clusterLabels = dataIO.loadLabelsFromStorage();
    setupEventListeners();
  });

  function setupEventListeners() {
    dataIO.on("loadComplete", handleLoadComplete);
    dataIO.on("loadError", handleLoadError);
    dataIO.on("loadProgress", handleLoadProgress);
  }

  function restoreLabelsToSegmentedRasters() {
    Object.entries(clusterLabels).forEach(([segKey, labels]) => {
      const segRaster = segmentedRasters.get(segKey);
      if (segRaster) {
        Object.entries(labels).forEach(([clusterId, classificationPath]) => {
          const id = parseInt(clusterId);
          const cluster = segRaster.registry.get(id);
          if (cluster) {
            cluster.classificationPath = classificationPath;
          }
        });
      }
    });
    console.log("✅ Restored labels to cluster registries");
  }

  async function handleLoadComplete(
    manifestData,
    overlayData,
    hierarchyResult,
    shapefile,
    intersectionCacheData
  ) {
    try {
      hierarchyData = hierarchyResult.hierarchy;
      hierarchyColors = hierarchyResult.colors;
      shapefileData = shapefile;
      console.log("✅ Loaded hierarchy and colors");
      if (shapefile) {
        console.log(
          "✅ Loaded shapefile with",
          shapefile.features.length,
          "features"
        );
      }
      intersectionCache = intersectionCacheData;
      if (intersectionCache) {
        console.log(
          `✅ Intersection cache available for ${intersectionCache.size} segmentations`
        );
        const firstCache = Array.from(intersectionCache.values())[0];
        if (firstCache?.config?.min_intersection_pct) {
          minIntersectionPct = firstCache.config.min_intersection_pct;
          console.log(`✅ Cache minimum intersection: ${minIntersectionPct}%`);
        }
      }
      overlayData.forEach((overlay) => {
        overlayMap.set(overlay.segmentationKey, overlay);
      });
      segmentedRasters = await segmentedRasterLoader.load(
        overlayData,
        manifestData
      );
      const refRaster = Raster.fromGeoRaster(overlayData[0].georaster);
      const syntheticSegRaster = RasterFactory.createSynthetic(
        SEGMENTATION_KEYS.SYNTHETIC,
        refRaster
      );
      segmentedRasters.set(SEGMENTATION_KEYS.SYNTHETIC, syntheticSegRaster);
      console.log("✅ Created synthetic segmented raster for user labels");
      restoreLabelsToSegmentedRasters();
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
      aoiName = rootDir;
      console.log("DataController: Starting folder load...");
      isLoading = true;
      error = null;
      dataIO.loadFromFolder(loadFiles);
    } catch (err) {
      console.error("Failed to load from folder:", err);
      error = err.message;
      isLoading = false;
    }
  }

  function setClusterLabel(segmentationKey, clusterId, classificationPath) {
    const segRaster = segmentedRasters.get(segmentationKey);
    if (segRaster) {
      const color = ClassificationHierarchy.getColorForClassification(
        classificationPath,
        hierarchyColors,
        null
      );
      const updated = segRaster.setClassification(
        clusterId,
        classificationPath,
        color
      );
      segmentedRasters.set(segmentationKey, updated);
      segmentedRastersVersion++;
    }
    clusterLabels = {
      ...clusterLabels,
      [segmentationKey]: {
        ...clusterLabels[segmentationKey],
        [clusterId]: classificationPath,
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

  function serializeLabelsFromSegmentedRasters() {
    const serialized = {};
    segmentedRasters.forEach((segRaster, segKey) => {
      const clusters = segRaster.getAllClusters();
      if (clusters.length > 0) {
        serialized[segKey] = {};
        clusters.forEach((cluster) => {
          if (cluster.classificationPath !== "unlabeled") {
            serialized[segKey][cluster.id] = cluster.classificationPath;
          }
        });
      }
    });
    return serialized;
  }

  function exportLabels() {
    if (dataIO) {
      const serializedLabels = serializeLabelsFromSegmentedRasters();
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
    segmentedRasters = new Map();
    shapefileData = null;
    isLoading = false;
    error = null;
  }
</script>
