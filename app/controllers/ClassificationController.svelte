<script>
  import { onMount } from "svelte";
  import { CLUSTER_ID_RANGES, SEGMENTATION_KEYS } from "../js/utils.js";
  import { MapOverlay } from "../js/map-overlay.js";
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
      if (!compositeState?.compositeSegRaster)
        return { totalLabels: 0, isVisible: false };
      const isVisible = layerGroup && mapManager.map.hasLayer(layerGroup);
      const compositeSegRaster = dataState.segmentedRasters?.get(
        SEGMENTATION_KEYS.COMPOSITE
      );
      const clusters = compositeSegRaster?.getAllClusters() || [];
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
        if (!window.ClassificationHierarchy?.isLoaded()) {
          throw new Error("Classification hierarchy not loaded");
        }
        if (!compositeState?.compositeSegRaster) {
          throw new Error("No composite data available for export");
        }
        const hierarchy = window.ClassificationHierarchy.getInstance();
        const compositeSegRaster = dataState.segmentedRasters?.get(
          SEGMENTATION_KEYS.COMPOSITE
        );
        if (!compositeSegRaster) {
          throw new Error("No composite segmented raster available");
        }
        const classifier = new PixelClassifier(
          hierarchy,
          compositeState.compositeSegRaster.raster.toGeoRaster(),
          compositeState.clusterIdMapping,
          dataState.segmentedRasters,
          hierarchyLevel
        );
        const pixelMapping = classifier.generatePixelMapping();
        const colorMapping = PixelClassifier.createColorMapping(
          pixelMapping,
          hierarchy,
          hierarchyLevel
        );
        const geotiffBlob = await generateCompositeGeotiff(classifier);
        const { blob, filename } = await downloadLandCoverFiles(
          pixelMapping,
          colorMapping,
          geotiffBlob,
          dataState.aoiName
        );
        return { blob, filename };
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
      layerGroup = MapOverlay.create(mapManager, "Composite", {
        visible: false,
        onVisibilityChange: (val) => (isLayerVisible = val),
      });
    }
    return () => {
      if (classificationLayer && layerGroup) {
        layerGroup.removeLayer(classificationLayer);
      }
      if (layerGroup && mapManager) {
        layerGroup.destroy();
      }
    };
  });

  $effect(() => {
    if (
      compositeState?.compositeSegRaster &&
      layerGroup &&
      !classificationLayer
    ) {
      createClassificationLayer();
    }
  });

  function createClassificationLayer() {
    if (!compositeState?.compositeSegRaster) return;
    if (classificationLayer) {
      layerGroup.removeLayer(classificationLayer);
    }
    const georaster = compositeState.compositeSegRaster.raster.toGeoRaster();
    classificationLayer = mapManager.rasterHandler.createMapLayer(georaster, {
      pixelValuesToColorFn: convertClassificationPixelToColor,
      zIndex: 2000,
    });
    layerGroup.addLayer(classificationLayer);
    classificationLayer.setOpacity(mapManager.currentOpacity);
  }

  function refreshLayer() {
    if (classificationLayer && compositeState?.compositeSegRaster) {
      createClassificationLayer();
    }
  }

  function convertClassificationPixelToColor(values) {
    if (!values || values.length === 0 || values[0] === 0) {
      return null;
    }
    const uniqueId = values[0];
    if (
      CLUSTER_ID_RANGES.isNoData(uniqueId) ||
      CLUSTER_ID_RANGES.isUnlabeled(uniqueId)
    ) {
      return null;
    }
    const compositeSegRaster = dataState.segmentedRasters?.get(
      SEGMENTATION_KEYS.COMPOSITE
    );
    if (!compositeSegRaster) {
      console.warn("Composite segmented raster not available");
      return null;
    }
    const cluster = compositeSegRaster.getClusterById(uniqueId);
    if (!cluster) {
      console.warn(`Unexpected: cluster not found: ${uniqueId}`);
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
    if (!classifier || !compositeState?.compositeSegRaster) {
      throw new Error(
        "No composite layer available. Please ensure labeled regions are visible."
      );
    }
    const classificationRasterData = classifier.createClassificationRaster();
    const georaster = compositeState.compositeSegRaster.raster.toGeoRaster();
    const tiffArrayBuffer = await dataIO.createGeoTiffWithLibrary(
      classificationRasterData,
      georaster
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
  }
</script>
