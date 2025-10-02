<script>
  import { onMount } from "svelte";
  import { CLUSTER_ID_RANGES, SEGMENTATION_KEYS } from "../js/utils.js";
  import {
    ClassificationHierarchy,
    PixelClassifier,
  } from "../js/classification.js";

  let { compositeState, dataState, mapManager, dataIO } = $props();
  let classificationLayer = $state(null);
  let layerGroup = $state(null);
  let hierarchyLevel = $state(1);
  let classificationColorCache = $state(new Map());
  let isLayerVisible = $state(false);

  const stateObject = {
    get hierarchyLevel() {
      return hierarchyLevel;
    },
    get hasActiveLayer() {
      return classificationLayer && isLayerVisible;
    },
    setHierarchyLevel: (level) => {
      if (level >= 1 && level <= 4 && level !== hierarchyLevel) {
        hierarchyLevel = level;
        classificationColorCache.clear();
        refreshLayer();
      }
    },
    setOpacity: (opacity) => {
      if (classificationLayer) {
        classificationLayer.setOpacity(opacity);
      }
    },
    getStats: () => {
      if (!compositeState?.georaster)
        return { totalLabels: 0, isVisible: false };
      const isVisible = layerGroup && mapManager.map.hasLayer(layerGroup);
      const compositeSegmentation = dataState.segmentations?.get(
        SEGMENTATION_KEYS.COMPOSITE
      );
      const clusters = compositeSegmentation?.getAllClusters() || [];
      const labeledClusters = clusters.filter(
        (c) => c.classificationPath !== "unlabeled"
      );
      return {
        totalLabels: labeledClusters.length,
        isVisible,
        hierarchyLevel,
      };
    },
    exportLandCoverFiles: async () => {
      try {
        console.log(
          "Starting land cover export from ClassificationController..."
        );
        if (!window.ClassificationHierarchy?.isLoaded()) {
          throw new Error("Classification hierarchy not loaded");
        }
        if (!compositeState?.georaster) {
          throw new Error("No composite data available for export");
        }
        const hierarchy = window.ClassificationHierarchy.getInstance();
        const compositeSegmentation = dataState.segmentations?.get(
          SEGMENTATION_KEYS.COMPOSITE
        );
        if (!compositeSegmentation) {
          throw new Error("No composite segmentation available");
        }
        const classifier = new PixelClassifier(
          hierarchy,
          compositeState.georaster,
          compositeState.clusterIdMapping,
          dataState.segmentations,
          hierarchyLevel
        );
        const pixelMapping = classifier.generatePixelMapping();
        const colorMapping = PixelClassifier.createColorMapping(
          pixelMapping,
          hierarchy,
          hierarchyLevel
        );
        const geotiffBlob = await generateCompositeGeotiff(classifier);
        await downloadLandCoverFiles(
          pixelMapping,
          colorMapping,
          geotiffBlob,
          dataState.aoiName
        );
        console.log("✅ Land cover export complete");
      } catch (error) {
        console.error("Export failed:", error);
        throw error;
      }
    },
  };

  export function getState() {
    return stateObject;
  }

  onMount(() => {
    if (mapManager && mapManager.map && mapManager.layerControl) {
      layerGroup = L.layerGroup();
      mapManager.addOverlayLayer("Composite", layerGroup, false);
      layerGroup.on("add", () => {
        isLayerVisible = true;
        console.log("Composite layer visible");
      });
      layerGroup.on("remove", () => {
        isLayerVisible = false;
        console.log("Composite layer hidden");
      });
      isLayerVisible = mapManager.map.hasLayer(layerGroup);
    }
    return () => {
      if (classificationLayer && layerGroup) {
        layerGroup.removeLayer(classificationLayer);
      }
      if (layerGroup && mapManager) {
        mapManager.removeOverlayLayer("Composite");
        mapManager.map.removeLayer(layerGroup);
      }
    };
  });

  $effect(() => {
    if (compositeState?.georaster && layerGroup && !classificationLayer) {
      createClassificationLayer();
    }
  });

  function createClassificationLayer() {
    if (!compositeState?.georaster) return;
    if (classificationLayer) {
      layerGroup.removeLayer(classificationLayer);
    }
    classificationLayer = mapManager.rasterHandler.createMapLayer(
      compositeState.georaster,
      {
        pixelValuesToColorFn: convertClassificationPixelToColor,
        zIndex: 2000,
      }
    );
    layerGroup.addLayer(classificationLayer);
    classificationLayer.setOpacity(mapManager.currentOpacity);
  }

  function refreshLayer() {
    if (classificationLayer && compositeState?.georaster) {
      createClassificationLayer();
    }
  }

  function convertClassificationPixelToColor(values) {
    if (!values || values.length === 0 || values[0] === 0) {
      return null;
    }
    const clusterId = values[0];

    // Look up directly in composite segmentation instead of clusterIdMapping
    const compositeSegmentation = dataState.segmentations?.get(
      SEGMENTATION_KEYS.COMPOSITE
    );

    if (!compositeSegmentation) {
      console.warn("Composite segmentation not found");
      return null;
    }

    const cluster = compositeSegmentation.getCluster(clusterId);

    if (!cluster) {
      // UNLABELED pixels (9999) won't have a cluster entry - this is expected
      if (clusterId !== CLUSTER_ID_RANGES.UNLABELED) {
        console.warn("Unexpected: cluster not found:", clusterId);
      }
      return null;
    }

    if (
      !cluster.classificationPath ||
      cluster.classificationPath === "unlabeled"
    ) {
      return null;
    }

    return resolveClassificationColor(cluster.classificationPath);
  }

  function resolveClassificationColor(classificationPath) {
    const cacheKey = `${classificationPath}:${hierarchyLevel}`;
    if (classificationColorCache.has(cacheKey)) {
      return classificationColorCache.get(cacheKey);
    }
    const rgbColor = ClassificationHierarchy.getColorForClassification(
      classificationPath,
      hierarchyLevel
    );
    classificationColorCache.set(cacheKey, rgbColor);
    return rgbColor;
  }

  async function generateCompositeGeotiff(classifier) {
    if (!classifier || !compositeState?.georaster) {
      throw new Error(
        "No composite layer available. Please ensure labeled regions are visible."
      );
    }
    console.log("Extracting composite geotiff data...");
    const classificationRasterData = classifier.createClassificationRaster();
    const tiffArrayBuffer = await dataIO.createGeoTiffWithLibrary(
      classificationRasterData,
      compositeState.georaster
    );
    return new Blob([tiffArrayBuffer], { type: "image/tiff" });
  }

  async function downloadLandCoverFiles(
    pixelMapping,
    colorMapping,
    geotiffBlob
  ) {
    const files = [
      {
        name: "pixel-mapping.json",
        content: JSON.stringify(pixelMapping, null, 2),
      },
      {
        name: "land-cover-colors.json",
        content: JSON.stringify(colorMapping, null, 2),
      },
      {
        name: "land-cover.tif",
        blob: geotiffBlob,
      },
    ];
    files.forEach((file, index) => {
      setTimeout(() => {
        let blob;
        if (file.blob) {
          blob = file.blob;
        } else {
          blob = new Blob([file.content], { type: "application/json" });
        }
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = file.name;
        link.click();
        URL.revokeObjectURL(link.href);
      }, index * 500);
    });
    console.log("✅ Files downloaded individually");
  }
</script>
