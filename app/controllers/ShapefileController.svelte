<script>
  import { onMount } from "svelte";
  import { MapOverlay } from "../js/map-overlay.js";

  let { dataState, mapManager } = $props();
  let shapefileLayer = $state(null);
  let layerGroup = $state(null);
  let isLayerVisible = $state(false);
  let shapefile = $derived(dataState?.shapefile);
  let featureCount = $derived(shapefile?.features?.length || 0);
  let initialized = $state(false);

  const stateObject = {
    get hasActiveLayer() {
      return shapefileLayer && isLayerVisible;
    },
    get featureCount() {
      return featureCount;
    },
    setOpacity: (opacity) => {
      if (layerGroup) {
        layerGroup.setOpacity(opacity);
      }
    },
  };

  export function getState() {
    return stateObject;
  }

  onMount(() => {
    layerGroup = MapOverlay.create(mapManager, "Reference Labels", {
      visible: true,
      onVisibilityChange: (val) => (isLayerVisible = val),
    });
    createShapefileLayer(shapefile);
    return () => {
      if (shapefileLayer && layerGroup) {
        layerGroup.removeLayer(shapefileLayer);
      }
      if (layerGroup) {
        layerGroup.destroy();
      }
    };
  });

  function createShapefileLayer(geojson) {
    if (shapefileLayer) {
      layerGroup.removeLayer(shapefileLayer);
    }
    shapefileLayer = L.geoJSON(geojson, {
      style: {
        fillColor: "#ff7800",
        fillOpacity: 0.15,
        color: "#ff7800",
        weight: 2,
        opacity: 0.8,
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};
        const tooltipContent = Object.entries(props)
          .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
          .join("<br>");
        if (tooltipContent) {
          layer.bindTooltip(tooltipContent, {
            sticky: true,
            className: "shapefile-tooltip",
          });
        }
        layer.on("mouseover", function () {
          this.setStyle({
            fillOpacity: 0.3,
            weight: 3,
          });
        });
        layer.on("mouseout", function () {
          this.setStyle({
            fillOpacity: 0.15,
            weight: 2,
          });
        });
      },
    });
    layerGroup.addLayer(shapefileLayer);
    if (shapefileLayer.getPane()) {
      shapefileLayer.getPane().style.zIndex = 2500;
    }
    console.log("✅ Shapefile layer created with", featureCount, "features");
  }
</script>
