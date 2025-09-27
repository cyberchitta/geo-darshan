<script>
  import { onMount } from "svelte";
  import { convertToGrayscale } from "../js/utils.js";

  let { mapState, clusterLabels } = $props();

  let mapManager = $derived(mapState?.mapManager);
  let selectedCluster = $derived(mapState?.selectedCluster);

  let currentFrame = $state(0);
  let totalFrames = $state(0);
  let isPlaying = $state(false);
  let segmentationKeys = $state([]);
  let currentSegmentationKey = $state(null);
  let speed = $state(1.0);
  let baseFrameDuration = $state(1000);
  let animationTimer = $state(null);

  let layerGroup = $state(null);
  let isLayerVisible = $state(false);
  let geoRasterLayers = $state(new Map());
  let overlays = $state([]);
  let layersReady = $state(false);
  let targetOpacity = $state(0.8);

  let listeners = $state({});

  let frameInfo = $derived({
    index: currentFrame,
    total: totalFrames,
    segmentationKey: currentSegmentationKey,
    progress: totalFrames > 0 ? (currentFrame / (totalFrames - 1)) * 100 : 0,
  });

  const stateObject = {
    get currentFrame() {
      return currentFrame;
    },
    get totalFrames() {
      return totalFrames;
    },
    get isPlaying() {
      return isPlaying;
    },
    get currentSegmentationKey() {
      return currentSegmentationKey;
    },
    get frameInfo() {
      return frameInfo;
    },
    get hasActiveLayer() {
      return layerGroup && isLayerVisible && layersReady && totalFrames > 0;
    },
    togglePlayPause: () => {
      if (totalFrames > 1) {
        isPlaying = !isPlaying;
        if (isPlaying) {
          startAnimation();
        } else {
          stopAnimation();
        }
      }
    },
    stepForward: () => {
      if (totalFrames > 0) {
        currentFrame = currentFrame < totalFrames - 1 ? currentFrame + 1 : 0;
        showFrame(currentFrame);
      }
    },
    stepBack: () => {
      if (totalFrames > 0) {
        currentFrame = currentFrame > 0 ? currentFrame - 1 : totalFrames - 1;
        showFrame(currentFrame);
      }
    },
    goToFrame: (frameIndex) => {
      if (frameIndex >= 0 && frameIndex < totalFrames) {
        currentFrame = frameIndex;
        showFrame(frameIndex);
      }
    },
    setSpeed: (newSpeed) => {
      speed = Math.max(0.1, Math.min(5.0, newSpeed));
    },
    setFrames: (segKeys, overlayData) => {
      segmentationKeys = segKeys;
      overlays = overlayData;
      totalFrames = segmentationKeys.length;
      currentFrame = 0;
      if (mapManager && overlayData.length > 0) {
        preprocessOverlays();
      }
    },
    showInitialFrame: () => {
      if (totalFrames > 0) {
        currentFrame = 0;
        showFrame(0);
      }
    },
    setOpacity: (opacity) => {
      targetOpacity = Math.max(0, Math.min(1, opacity));
      if (layersReady && geoRasterLayers.size > 0) {
        geoRasterLayers.forEach((layer, index) => {
          const layerOpacity = index === currentFrame ? targetOpacity : 0;
          layer.setOpacity(layerOpacity);
        });
      }
    },
    reset: () => {
      stopAnimation();
      currentFrame = 0;
      isPlaying = false;
      layersReady = false;
      geoRasterLayers.clear();
    },
    samplePixelAtCoordinate,
    handleClusterInteraction,
    on: (event, callback) => {
      if (!listeners) listeners = {};
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(callback);
    },
    emit: (event, ...args) => {
      if (listeners?.[event]) {
        listeners[event].forEach((callback) => callback(...args));
      }
    },
  };

  async function samplePixelAtCoordinate(latlng) {
    if (!layersReady || geoRasterLayers.size === 0) {
      return null;
    }
    const currentLayer = geoRasterLayers.get(currentFrame);
    if (!currentLayer?.georasters?.[0]) {
      return null;
    }
    const georaster = currentLayer.georasters[0];
    const x = (latlng.lng - georaster.xmin) / georaster.pixelWidth;
    const y = (georaster.ymax - latlng.lat) / georaster.pixelHeight;
    if (x < 0 || x >= georaster.width || y < 0 || y >= georaster.height) {
      return null;
    }
    const pixelX = Math.floor(x);
    const pixelY = Math.floor(y);
    try {
      return georaster.values[0][pixelY][pixelX];
    } catch (error) {
      console.error("Error accessing pixel value:", error);
      return null;
    }
  }

  async function handleClusterInteraction(latlng) {
    const clusterValue = await samplePixelAtCoordinate(latlng);
    if (clusterValue !== null && clusterValue >= 0) {
      stateObject.emit("clusterClicked", clusterValue, latlng);
    }
  }

  async function preprocessOverlays() {
    if (!overlays || overlays.length === 0) {
      console.warn("No overlays to preprocess");
      return;
    }
    console.log("SegmentationController: Preprocessing georaster layers...");
    geoRasterLayers.clear();
    if (!layerGroup) {
      layerGroup = L.layerGroup();
      mapManager.addOverlayLayer("Segmentations", layerGroup, true);
      layerGroup.on("add", () => {
        isLayerVisible = true;
        console.log("Segmentations layer visible");
      });
      layerGroup.on("remove", () => {
        isLayerVisible = false;
        console.log("Segmentations layer hidden");
      });
      isLayerVisible = mapManager.map.hasLayer(layerGroup);
    }
    for (let i = 0; i < overlays.length; i++) {
      const overlayData = overlays[i];
      try {
        console.log(
          `Loading ${overlayData.filename} (${overlayData.segmentationKey})...`
        );
        const geoRasterLayer = await createGeoRasterLayer(overlayData);
        geoRasterLayer.addTo(mapManager.map);
        layerGroup.addLayer(geoRasterLayer);
        geoRasterLayer.setOpacity(0);
        geoRasterLayers.set(i, geoRasterLayer);
        console.log(
          `✅ Preprocessed and added layer ${i + 1}/${overlays.length}`
        );
        if (i === 0) {
          layersReady = true;
          showFrame(0);
          console.log("First segmentation layer ready");
        }
      } catch (error) {
        console.error(`Failed to preprocess layer ${i}:`, error);
        throw error;
      }
    }
    console.log("✅ All segmentation layer preprocessing complete");
  }

  async function createGeoRasterLayer(overlayData) {
    const { georaster } = overlayData;
    const segmentationKey = overlayData.segmentationKey;
    const layer = mapManager.rasterHandler.createMapLayer(georaster, {
      opacity: 0,
      resolution: getOptimalResolution(georaster),
      pixelValuesToColorFn: (values) =>
        convertPixelsToColor(
          values,
          overlayData,
          mapManager.interactionMode,
          segmentationKey
        ),
      zIndex: 1000,
    });
    layer._segmentationKey = segmentationKey;
    layer._bounds = georaster.bounds;
    return layer;
  }

  function convertPixelsToColor(
    values,
    overlayData,
    interactionMode,
    segmentationKey
  ) {
    if (!values || values.some((v) => v === null || v === undefined)) {
      return null;
    }
    if (values.length === 1) {
      const pixelValue = values[0];
      const colorMapping =
        overlayData.colorMapping ||
        mapManager.dataLoader?.getColorMappingForSegmentation(segmentationKey);
      if (!colorMapping) {
        throw new Error(
          `Color mapping not found for segmentation: ${segmentationKey}`
        );
      }
      const baseColor = mapClusterValueToColor(pixelValue, colorMapping);
      if (
        selectedCluster?.clusterId === pixelValue &&
        selectedCluster?.segmentationKey === segmentationKey
      ) {
        return "rgba(0, 0, 0, 1)";
      }
      if (
        (interactionMode === "cluster" || interactionMode === "composite") &&
        clusterLabels?.[segmentationKey]?.[pixelValue] &&
        clusterLabels[segmentationKey][pixelValue] !== "unlabeled"
      ) {
        const grayColor = convertToGrayscale(baseColor);
        return `rgba(${grayColor.r},${grayColor.g},${grayColor.b},${grayColor.a / 255})`;
      }
      return `rgba(${baseColor.r},${baseColor.g},${baseColor.b},${baseColor.a / 255})`;
    }
    if (values.length >= 3) {
      return `rgb(${Math.round(values[0])},${Math.round(values[1])},${Math.round(values[2])})`;
    }
    return null;
  }

  function mapClusterValueToColor(clusterValue, colorMapping) {
    if (!colorMapping || !colorMapping.colors_rgb) {
      throw new Error(
        "Color mapping is required but missing - check data pipeline"
      );
    }
    const colors = colorMapping.colors_rgb;
    if (clusterValue === colorMapping.nodata_value) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    const color = colors[clusterValue];
    if (color === null) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    if (color && color.length >= 3) {
      return {
        r: Math.round(color[0] * 255),
        g: Math.round(color[1] * 255),
        b: Math.round(color[2] * 255),
        a: 255,
      };
    }
    throw new Error(`No color defined for cluster ${clusterValue} in mapping`);
  }

  function getOptimalResolution(georaster) {
    const totalPixels = georaster.width * georaster.height;
    if (totalPixels > 100_000_000) return 128;
    if (totalPixels > 25_000_000) return 256;
    return 512;
  }

  function showFrame(frameIndex) {
    if (!overlays || overlays.length === 0) {
      console.warn("No overlays loaded yet, cannot show frame");
      return;
    }
    if (frameIndex < 0 || frameIndex >= overlays.length) {
      console.warn(
        `Invalid frame index: ${frameIndex}, available: 0-${overlays.length - 1}`
      );
      return;
    }
    try {
      geoRasterLayers.forEach((layer, index) => {
        const opacity = index === frameIndex ? targetOpacity : 0;
        layer.setOpacity(opacity);
      });
      updateCurrentFrame();
      console.log(
        `✅ Displayed frame ${frameIndex} (${overlays[frameIndex].segmentationKey})`
      );
    } catch (error) {
      console.error(`Failed to show frame ${frameIndex}:`, error);
    }
  }

  function updateCurrentFrame() {
    if (segmentationKeys.length > 0 && currentFrame < segmentationKeys.length) {
      currentSegmentationKey = segmentationKeys[currentFrame];
    }
  }

  function startAnimation() {
    if (animationTimer) {
      clearInterval(animationTimer);
    }
    const frameDuration = baseFrameDuration / speed;
    animationTimer = setInterval(() => {
      stateObject.stepForward();
    }, frameDuration);
  }

  function stopAnimation() {
    if (animationTimer) {
      clearInterval(animationTimer);
      animationTimer = null;
    }
  }

  export function getState() {
    return stateObject;
  }

  onMount(() => {
    return () => {
      stopAnimation();
      if (layerGroup) {
        geoRasterLayers.forEach((layer) => {
          if (mapManager.map.hasLayer(layer)) {
            mapManager.map.removeLayer(layer);
          }
        });
        if (mapManager.map.hasLayer(layerGroup)) {
          mapManager.removeOverlayLayer("Segmentations");
        }
      }
    };
  });
</script>
