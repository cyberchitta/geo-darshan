<script>
  import { onMount } from "svelte";
  import { SEGMENTATION_KEYS, hexToRgb } from "../js/utils.js";
  import { LandUseHierarchy, LandUseMapper } from "../js/land-use.js";

  let { compositeState, dataState, mapManager, dataIO } = $props();
  let landUseLayer = $state(null);
  let layerGroup = $state(null);
  let hierarchyLevel = $state(1);
  let landUseColorCache = $state(new Map());
  let isLayerVisible = $state(false);

  const stateObject = {
    get hierarchyLevel() {
      return hierarchyLevel;
    },
    get hasActiveLayer() {
      return landUseLayer && isLayerVisible;
    },
    setHierarchyLevel: (level) => {
      if (level >= 1 && level <= 4 && level !== hierarchyLevel) {
        hierarchyLevel = level;
        landUseColorCache.clear();
        refreshLayer();
      }
    },
    setOpacity: (opacity) => {
      if (landUseLayer) {
        landUseLayer.setOpacity(opacity);
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
        (c) => c.landUsePath !== "unlabeled"
      );
      return {
        totalLabels: labeledClusters.length,
        isVisible,
        hierarchyLevel,
      };
    },
    exportLandCoverFiles: async () => {
      try {
        console.log("Starting land cover export from LandUseController...");
        if (!window.LandUseHierarchy?.isLoaded()) {
          throw new Error("Land use hierarchy not loaded");
        }
        if (!compositeState?.georaster) {
          throw new Error("No composite data available for export");
        }
        const hierarchy = window.LandUseHierarchy.getInstance();
        const compositeSegmentation = dataState.segmentations?.get(
          SEGMENTATION_KEYS.COMPOSITE
        );
        if (!compositeSegmentation) {
          throw new Error("No composite segmentation available");
        }
        const mapper = new LandUseMapper(
          hierarchy,
          compositeState.georaster,
          compositeState.clusterIdMapping,
          dataState.segmentations,
          hierarchyLevel
        );
        const pixelMapping = mapper.generatePixelMapping();
        const colorMapping = LandUseMapper.createColorMapping(
          pixelMapping,
          hierarchy,
          hierarchyLevel
        );
        const geotiffBlob = await generateCompositeGeotiff(mapper);
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
      if (landUseLayer && layerGroup) {
        layerGroup.removeLayer(landUseLayer);
      }
      if (layerGroup && mapManager) {
        mapManager.removeOverlayLayer("Composite");
        mapManager.map.removeLayer(layerGroup);
      }
    };
  });

  $effect(() => {
    if (compositeState?.georaster && layerGroup && !landUseLayer) {
      createLandUseLayer();
    }
  });

  function createLandUseLayer() {
    if (!compositeState?.georaster) return;
    if (landUseLayer) {
      layerGroup.removeLayer(landUseLayer);
    }
    landUseLayer = mapManager.rasterHandler.createMapLayer(
      compositeState.georaster,
      {
        pixelValuesToColorFn: convertLandUsePixelToColor,
        zIndex: 2000,
      }
    );
    layerGroup.addLayer(landUseLayer);
    landUseLayer.setOpacity(mapManager.currentOpacity);
  }

  function refreshLayer() {
    if (landUseLayer && compositeState?.georaster) {
      createLandUseLayer();
    }
  }

  function convertLandUsePixelToColor(values) {
    if (!values || values.length === 0 || values[0] === 0) {
      return null;
    }
    const uniqueId = values[0];
    let mapping = null;
    for (const [key, value] of compositeState.clusterIdMapping) {
      if (value.uniqueId === uniqueId) {
        mapping = value;
        break;
      }
    }
    if (!mapping || mapping.landUsePath === "unlabeled") {
      return null;
    }
    const truncatedPath = truncateToHierarchyLevel(mapping.landUsePath);
    return resolveLandUseColor(truncatedPath);
  }

  function truncateToHierarchyLevel(landUsePath) {
    if (!landUsePath || landUsePath === "unlabeled") {
      return landUsePath;
    }
    const pathParts = landUsePath.split(".");
    if (pathParts.length <= hierarchyLevel) {
      return landUsePath;
    }
    return pathParts.slice(0, hierarchyLevel).join(".");
  }

  function resolveLandUseColor(landUsePath) {
    if (!landUsePath || landUsePath === "unlabeled") {
      return null;
    }
    if (!LandUseHierarchy.isLoaded()) {
      console.warn("LandUseHierarchy not loaded");
      return null;
    }
    const cacheKey = `${landUsePath}:${hierarchyLevel}`;
    if (landUseColorCache.has(cacheKey)) {
      return landUseColorCache.get(cacheKey);
    }
    const hierarchy = LandUseHierarchy.getInstance();
    const color = hierarchy.getColorForPath(landUsePath, hierarchyLevel);
    const rgbColor = color ? `rgb(${hexToRgb(color)})` : null;
    landUseColorCache.set(cacheKey, rgbColor);
    return rgbColor;
  }

  async function generateCompositeGeotiff(mapper) {
    if (!mapper || !compositeState?.georaster) {
      throw new Error(
        "No composite layer available. Please ensure labeled regions are visible."
      );
    }
    console.log("Extracting composite geotiff data...");
    const landUseRasterData = mapper.createLandUseRaster();
    const tiffArrayBuffer = await dataIO.createGeoTiffWithLibrary(
      landUseRasterData,
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
