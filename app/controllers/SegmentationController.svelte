<script>
  import { onMount } from "svelte";
  import { ClusterRenderer } from "../js/raster/cluster-renderer";

  let { mapState, dataState } = $props();

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
  let pixelRenderers = $state(new Map());
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
      pixelRenderers.clear();
    },
    samplePixelAtCoordinate,
    selectClusterAt: async (latlng) => {
      const clusterValue = await samplePixelAtCoordinate(latlng);
      if (clusterValue !== null && clusterValue >= 0) {
        stateObject.emit("clusterSelected", clusterValue, latlng);
      } else {
        stateObject.emit("clusterSelected", null, null);
      }
    },
    clearSelection: () => {
      stateObject.emit("clusterSelected", null, null);
    },
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
    const pixel = currentLayer.georasters[0].latlngToPixel(latlng);
    if (!pixel) return null;
    return currentLayer.georasters[0].get(pixel.x, pixel.y);
  }

  async function preprocessOverlays() {
    if (!overlays || overlays.length === 0) {
      console.warn("No overlays to preprocess");
      return;
    }
    geoRasterLayers.clear();
    pixelRenderers.clear();
    if (!layerGroup) {
      layerGroup = L.layerGroup();
      mapManager.addOverlayLayer("Segmentations", layerGroup, true);
      layerGroup.on("add", () => {
        isLayerVisible = true;
      });
      layerGroup.on("remove", () => {
        isLayerVisible = false;
      });
      isLayerVisible = mapManager.map.hasLayer(layerGroup);
    }
    for (let i = 0; i < overlays.length; i++) {
      const overlayData = overlays[i];
      try {
        const { layer, renderer } = await createGeoRasterLayer(overlayData);
        layer.addTo(mapManager.map);
        layerGroup.addLayer(layer);
        layer.setOpacity(0);
        geoRasterLayers.set(i, layer);
        pixelRenderers.set(i, renderer);
        if (i === 0) {
          layersReady = true;
          showFrame(0);
        }
      } catch (error) {
        console.error(`Failed to preprocess layer ${i}:`, error);
        throw error;
      }
    }
  }

  async function createGeoRasterLayer(overlayData) {
    const { georaster, segmentationKey } = overlayData;
    const segmentation = dataState.segmentations?.get(segmentationKey);
    if (!segmentation) {
      throw new Error(`Segmentation not found: ${segmentationKey}`);
    }
    const segRaster = segmentation.toSegmentedRaster();
    const interactionMode = mapState?.interactionMode || "view";
    const grayscaleLabeled =
      interactionMode === "cluster" || interactionMode === "composite";
    const renderer = new ClusterRenderer(segRaster, segmentationKey, {
      interactionMode,
      selectedCluster,
      grayscaleLabeled,
    });
    const layer = mapManager.rasterHandler.createMapLayer(georaster, {
      opacity: 0,
      resolution: getOptimalResolution(georaster),
      pixelValuesToColorFn: (values) => renderer.render(values),
      zIndex: 1000,
    });
    layer._segmentationKey = segmentationKey;
    layer._bounds = georaster.bounds;
    return { layer, renderer };
  }

  function getOptimalResolution(georaster) {
    const totalPixels = georaster.width * georaster.height;
    if (totalPixels > 100_000_000) return 128;
    if (totalPixels > 25_000_000) return 256;
    return 512;
  }

  function showFrame(frameIndex) {
    if (!overlays || overlays.length === 0) {
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
    } catch (error) {
      console.error(`Failed to show frame ${frameIndex}:`, error);
    }
  }

  function updateCurrentFrame() {
    if (segmentationKeys.length > 0 && currentFrame < segmentationKeys.length) {
      currentSegmentationKey = segmentationKeys[currentFrame];
    }
  }

  function updateAllRenderers(options) {
    pixelRenderers.forEach((renderer, index) => {
      const updated = renderer.withOptions(options);
      pixelRenderers.set(index, updated);
    });
    geoRasterLayers.forEach((layer, index) => {
      if (index === currentFrame) {
        const currentOpacity = layer.options.opacity;
        layer.setOpacity(0);
        setTimeout(() => layer.setOpacity(currentOpacity), 0);
      }
    });
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

  $effect(() => {
    if (pixelRenderers.size > 0 && selectedCluster !== undefined) {
      updateAllRenderers({ selectedCluster });
    }
  });
  $effect(() => {
    const interactionMode = mapState?.interactionMode;
    if (pixelRenderers.size > 0 && interactionMode) {
      const grayscaleLabeled =
        interactionMode === "cluster" || interactionMode === "composite";
      updateAllRenderers({ interactionMode, grayscaleLabeled });
    }
  });

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
