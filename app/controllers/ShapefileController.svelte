<script>
  import { onMount } from "svelte";
  import { MapOverlay } from "../js/map-overlay.js";

  let { dataState, mapState, mapManager } = $props();
  let shapefileLayer = $state(null);
  let layerGroup = $state(null);
  let isLayerVisible = $state(false);
  let shapefile = $derived(dataState?.shapefile);
  let featureCount = $derived(shapefile?.features?.length || 0);
  let selectedFeature = $state(null);
  let interactionMode = $derived(mapState?.interactionMode);

  const stateObject = {
    get hasActiveLayer() {
      return shapefileLayer && isLayerVisible;
    },
    get featureCount() {
      return featureCount;
    },
    get selectedFeature() {
      return selectedFeature;
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
      style: (feature) => ({
        fillColor: feature === selectedFeature ? "#00ff00" : "#ff7800",
        fillOpacity: feature === selectedFeature ? 0.3 : 0.15,
        color: feature === selectedFeature ? "#00ff00" : "#ff7800",
        weight: feature === selectedFeature ? 3 : 2,
        opacity: 0.8,
      }),
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
          if (feature !== selectedFeature) {
            this.setStyle({
              fillOpacity: 0.3,
              weight: 3,
            });
          }
        });
        layer.on("mouseout", function () {
          if (feature !== selectedFeature) {
            this.setStyle({
              fillOpacity: 0.15,
              weight: 2,
            });
          }
        });
        layer.on("click", function (e) {
          L.DomEvent.stopPropagation(e);
          if (interactionMode === "shapefile") {
            handleFeatureClick(feature);
          }
        });
      },
    });
    layerGroup.addLayer(shapefileLayer);
    if (shapefileLayer.getPane()) {
      shapefileLayer.getPane().style.zIndex = 2500;
    }
    console.log("✅ Shapefile layer created with", featureCount, "features");
  }

  function handleFeatureClick(feature) {
    selectedFeature = feature;
    createShapefileLayer(shapefile);
    if (mapManager) {
      mapManager.emit("shapefileFeatureSelected", feature.geometry);
    }
  }

  $effect(() => {
    if (!isLayerVisible && selectedFeature) {
      selectedFeature = null;
      createShapefileLayer(shapefile);
    }
  });
</script>
