<script>
  import { onMount } from "svelte";
  import {
    CLUSTER_ID_RANGES,
    SEGMENTATION_KEYS,
    hexToRgb,
  } from "../js/utils.js";
  import { Segmentation } from "../js/segmentation.js";
  import { LandUseHierarchy } from "../js/land-use.js";
  import { RegionLabeler } from "../js/region-labeler.js";

  let { compositeState, clusterLabels, dataState, mapManager, dataLoader } =
    $props();
  let interactiveLayer = $state(null);
  let layerGroup = $state(null);
  let regionLabeler = $state(null);
  let regionHighlightLayer = $state(null);
  let interactiveSegmentation = $state(null);

  const stateObject = {
    get interactiveSegmentation() {
      return interactiveSegmentation;
    },
    analyzeClusterNeighborhood: (clusterId) => {
      return regionLabeler?.analyzeClusterNeighborhood(clusterId) || [];
    },
    handleCompositeClick: async (latlng, allLabels, segmentations) => {
      if (!compositeState?.georaster || !regionLabeler) return null;

      regionLabeler.updateCompositeData(
        compositeState.georaster,
        interactiveSegmentation,
        allLabels,
        segmentations
      );

      const pixelCoord = regionLabeler.latlngToPixelCoord(latlng);
      if (!pixelCoord) return null;

      const isUnlabeled = regionLabeler.isPixelUnlabeled(pixelCoord);
      if (!isUnlabeled) return null;

      const contiguousRegion = regionLabeler.findContiguousRegion(pixelCoord);
      if (contiguousRegion.length === 0) return null;

      const suggestions = regionLabeler.analyzeNeighborhood(contiguousRegion);
      highlightRegion(contiguousRegion);

      return {
        action: "create_new",
        region: contiguousRegion,
        latlng,
        suggestions,
      };
    },
    labelRegion: (region, landUsePath) => {
      if (!regionLabeler) return null;

      const syntheticId = regionLabeler.labelRegion(region, landUsePath);
      clearRegionHighlight();
      showBriefMessage(
        `Created synthetic cluster ${syntheticId}. Switch to Region Labeling to see it.`
      );
      return syntheticId;
    },
    clearRegionHighlight,
    setOpacity: (opacity) => {
      if (interactiveLayer) {
        interactiveLayer.setOpacity(opacity);
      }
    },
  };

  export function getState() {
    return stateObject;
  }

  onMount(() => {
    if (mapManager && mapManager.map && mapManager.layerControl) {
      layerGroup = L.layerGroup();
      mapManager.addOverlayLayer("Interactive Regions", layerGroup, false);
      regionLabeler = new RegionLabeler();
    }
    return () => {
      clearRegionHighlight();
      if (interactiveLayer && layerGroup) {
        layerGroup.removeLayer(interactiveLayer);
      }
      if (layerGroup && mapManager) {
        mapManager.removeOverlayLayer("Interactive Regions");
        mapManager.map.removeLayer(layerGroup);
      }
    };
  });

  $effect(() => {
    console.log("🔍 LabelRegionsController effect triggered", {
      hasComposite: !!compositeState?.georaster,
      hasLayerGroup: !!layerGroup,
      hasExistingLayer: !!interactiveLayer,
    });
    if (compositeState?.georaster && layerGroup && !interactiveLayer) {
      // Add !interactiveLayer guard
      console.log("🔍 About to create interactive segmentation");
      createInteractiveSegmentation();
      console.log("🔍 About to create interactive layer");
      createInteractiveLayer();
      console.log("🔍 Interactive layer created");
    }
  });

  function createInteractiveSegmentation() {
    if (!compositeState?.georaster || !compositeState?.clusterIdMapping) return;

    const segmentation = Segmentation.createComposite(compositeState.georaster);
    const compositeData = compositeState.georaster.values[0];

    // Count pixels for each cluster
    const pixelCounts = new Map();
    for (let y = 0; y < compositeData.length; y++) {
      for (let x = 0; x < compositeData[y].length; x++) {
        const clusterId = compositeData[y][x];
        if (clusterId !== CLUSTER_ID_RANGES.NODATA) {
          pixelCounts.set(clusterId, (pixelCounts.get(clusterId) || 0) + 1);
        }
      }
    }

    // Add clusters to segmentation
    for (const [key, mapping] of compositeState.clusterIdMapping) {
      const { uniqueId, originalId, sourceSegmentation, landUsePath } = mapping;
      const pixelCount = pixelCounts.get(uniqueId) || 0;

      let color;
      if (landUsePath === "unlabeled") {
        // Use original cluster color for unlabeled areas
        const sourceColorMapping =
          dataLoader.colorMappings.get(sourceSegmentation);
        const rgbArray = sourceColorMapping.colors_rgb[originalId];
        color = `rgb(${Math.round(rgbArray[0] * 255)}, ${Math.round(rgbArray[1] * 255)}, ${Math.round(rgbArray[2] * 255)})`;
      } else {
        // Use land use color for labeled areas
        color = getColorForLandUsePath(landUsePath);
      }

      segmentation.addCluster(uniqueId, pixelCount, landUsePath, color);
    }

    segmentation.finalize();
    interactiveSegmentation = segmentation;
    dataState.addSegmentation(SEGMENTATION_KEYS.COMPOSITE, segmentation);
    const compositeColorMapping = createCompositeColorMapping(segmentation);
    dataLoader.colorMappings.set(
      SEGMENTATION_KEYS.COMPOSITE,
      compositeColorMapping
    );
  }

  function createInteractiveLayer() {
    if (!compositeState?.georaster || !interactiveSegmentation) return;

    if (interactiveLayer) {
      layerGroup.removeLayer(interactiveLayer);
    }

    interactiveLayer = mapManager.rasterHandler.createMapLayer(
      compositeState.georaster,
      {
        pixelValuesToColorFn: convertInteractivePixelToColor,
        zIndex: 3000, // Above land use layer
      }
    );

    layerGroup.addLayer(interactiveLayer);
    interactiveLayer.setOpacity(mapManager.currentOpacity);
  }

  function convertInteractivePixelToColor(values) {
    if (!values || values.length === 0 || values[0] === 0) {
      return null;
    }

    const clusterId = values[0];
    if (!interactiveSegmentation) return null;

    const cluster = interactiveSegmentation.getCluster(clusterId);
    if (!cluster) return null;

    return cluster.color;
  }

  function createCompositeColorMapping(segmentation) {
    const clusters = segmentation.getAllClusters();
    const colors_rgb = [];
    clusters.forEach((cluster) => {
      const rgbArray = convertColorStringToArray(cluster.color);
      colors_rgb[cluster.id] = rgbArray;
    });
    return {
      method: "cluster_specific",
      colors_rgb,
      nodata_value: CLUSTER_ID_RANGES.NODATA,
    };
  }

  function getColorForLandUsePath(landUsePath) {
    const hierarchy = LandUseHierarchy.getInstance();
    const color = hierarchy.getColorForPath(landUsePath);
    return `rgb(${hexToRgb(color)})`;
  }

  function convertColorStringToArray(colorString) {
    const match = colorString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    return [
      parseInt(match[1]) / 255,
      parseInt(match[2]) / 255,
      parseInt(match[3]) / 255,
    ];
  }

  function highlightRegion(region) {
    clearRegionHighlight();
    if (!regionLabeler) return;

    const boundaryPoints = region.map((pixel) => {
      const coords = regionLabeler.pixelToLatLng(pixel);
      return [coords.lat, coords.lng];
    });

    if (boundaryPoints.length > 0) {
      regionHighlightLayer = L.polygon(boundaryPoints, {
        color: "#ff0000",
        weight: 2,
        fillOpacity: 0.1,
        fillColor: "#ff0000",
      }).addTo(mapManager.map);
    }
  }

  function clearRegionHighlight() {
    if (regionHighlightLayer) {
      mapManager.map.removeLayer(regionHighlightLayer);
      regionHighlightLayer = null;
    }
  }

  function showBriefMessage(message) {
    const messageEl = document.createElement("div");
    messageEl.className = "brief-message";
    messageEl.textContent = message;
    messageEl.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #333;
      color: white;
      padding: 10px 15px;
      border-radius: 4px;
      z-index: 9999;
      font-size: 14px;
    `;
    document.body.appendChild(messageEl);
    setTimeout(() => {
      if (document.body.contains(messageEl)) {
        document.body.removeChild(messageEl);
      }
    }, 3000);
  }
</script>
