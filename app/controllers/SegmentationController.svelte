<script>
  import { onMount } from "svelte";
  import { ClusterRenderer } from "../js/raster/color-renderers.js";
  import { MapOverlay } from "../js/map-overlay.js";
  import { ShapefileIntersection } from "../js/shapefile-intersection.js";

  let { mapState, dataState } = $props();
  let mapManager = $derived(mapState?.mapManager);
  let interactionMode = $derived(mapState?.interactionMode);
  let selectedCluster = $state(null);
  let currentFrame = $state(0);
  let totalFrames = $state(0);
  let segmentationKeys = $state([]);
  let currentSegmentationKey = $state(null);
  let prevKey = $state(null);
  let layerGroup = $state(null);
  let isLayerVisible = $state(false);
  let geoRasterLayers = $state(new Map());
  let pixelRenderers = $state(new Map());
  let overlays = $state([]);
  let layersReady = $state(false);
  let targetOpacity = $state(0.8);
  let frameInfo = $derived({
    index: currentFrame,
    total: totalFrames,
    segmentationKey: currentSegmentationKey,
  });
  let filteredClusters = $state(null); // Map<clusterId, {intersectionPct, pixelCount}>
  let intersectionThreshold = $state(90);
  let lastFilteredFrame = $state(null);
  let activeFilterGeometry = $state(null);

  const stateObject = {
    get currentFrame() {
      return currentFrame;
    },
    get totalFrames() {
      return totalFrames;
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
    get selectedCluster() {
      return selectedCluster;
    },
    get filteredClusters() {
      return filteredClusters;
    },
    get intersectionThreshold() {
      return intersectionThreshold;
    },
    setIntersectionThreshold: (threshold) => {
      intersectionThreshold = threshold;
    },
    clearFilter: () => {
      filteredClusters = null;
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
      const currentLayer = geoRasterLayers.get(currentFrame);
      if (currentLayer) {
        currentLayer.setOpacity(targetOpacity);
      }
    },
    reset: () => {
      currentFrame = 0;
      layersReady = false;
      geoRasterLayers.clear();
      pixelRenderers.clear();
      selectedCluster = null;
    },
    samplePixelAtCoordinate,
    selectClusterAt: async (latlng) => {
      const clusterId = await samplePixelAtCoordinate(latlng);
      if (clusterId !== null && clusterId >= 0) {
        selectedCluster = clusterId;
      } else {
        selectedCluster = null;
      }
    },
    clearSelection: () => {
      selectedCluster = null;
    },
  };

  async function samplePixelAtCoordinate(latlng) {
    if (!layersReady || !currentSegmentationKey) {
      return null;
    }
    const segRaster = dataState.segmentedRasters?.get(currentSegmentationKey);
    if (!segRaster?.raster) {
      return null;
    }
    const pixel = segRaster.raster.latlngToPixel(latlng);
    if (!pixel) return null;
    return segRaster.raster.get(pixel.x, pixel.y);
  }

  async function preprocessOverlays() {
    if (!overlays || overlays.length === 0) {
      layersReady = false;
      console.warn("No overlays to preprocess");
      return;
    }
    geoRasterLayers.clear();
    pixelRenderers.clear();
    if (!layerGroup) {
      layerGroup = MapOverlay.create(mapManager, "Segmentations", {
        visible: true,
        onVisibilityChange: (val) => (isLayerVisible = val),
      });
    }
    for (let i = 0; i < overlays.length; i++) {
      const overlayData = overlays[i];
      try {
        const { layer, renderer } = await createGeoRasterLayer(overlayData);
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
    const segRaster = dataState.segmentedRasters?.get(segmentationKey);
    if (!segRaster) {
      throw new Error(`Segmented raster not found: ${segmentationKey}`);
    }
    const grayscaleLabeled =
      interactionMode === "cluster" || interactionMode === "composite";
    const filteredIds = filteredClusters
      ? new Set(filteredClusters.keys())
      : null;
    const renderer = new ClusterRenderer(segRaster, segmentationKey, {
      interactionMode,
      selectedCluster: selectedCluster ? { clusterId: selectedCluster } : null,
      grayscaleLabeled,
      filteredClusterIds: filteredIds,
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
      layerGroup._group.clearLayers();
      const targetLayer = geoRasterLayers.get(frameIndex);
      if (targetLayer) {
        layerGroup._group.addLayer(targetLayer);
        targetLayer.setOpacity(targetOpacity);
      }
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

  function handleShapefileSelection(geometry) {
    activeFilterGeometry = geometry;
    if (!layersReady || !currentSegmentationKey) return;
    const segRaster = dataState.segmentedRasters?.get(currentSegmentationKey);
    if (!segRaster) return;
    const results = ShapefileIntersection.findIntersectingClusters(
      geometry,
      segRaster,
      intersectionThreshold
    );
    if (results.length === 0) {
      filteredClusters = null;
      console.log("No clusters found above threshold");
      return;
    }
    filteredClusters = new Map(
      results.map((r) => [
        r.clusterId,
        {
          intersectionPct: r.intersectionPct,
          pixelCount: r.pixelCount,
          clusterSize: r.clusterSize,
        },
      ])
    );
    console.log(`✅ Found ${results.length} intersecting clusters`);
  }

  export function getState() {
    return stateObject;
  }

  let hasInitialized = $state(false);
  $effect(() => {
    if (hasInitialized) return;
    if (!overlays?.length || !mapManager || !layerGroup) return;
    preprocessOverlays();
    hasInitialized = true;
  });
  let lastFrame = $state(-1);
  $effect(() => {
    if (!hasInitialized || !layersReady) return;
    const frame = currentFrame;
    if (frame !== lastFrame) {
      showFrame(frame);
      lastFrame = frame;
    }
  });
  let lastRenderState = $state({
    clusterId: undefined,
    mode: undefined,
    grayscale: undefined,
    filteredVersion: undefined,
  });
  $effect(() => {
    if (!hasInitialized || !layersReady || !isLayerVisible) return;
    const grayscaleLabeled =
      interactionMode === "cluster" || interactionMode === "composite";
    const clusterId = selectedCluster;
    const mode = interactionMode;
    const filteredIds = filteredClusters
      ? new Set(filteredClusters.keys())
      : null;
    const filteredVersion = filteredClusters
      ? Array.from(filteredClusters.keys()).join(",")
      : null;
    const needsUpdate =
      clusterId !== lastRenderState.clusterId ||
      mode !== lastRenderState.mode ||
      grayscaleLabeled !== lastRenderState.grayscale ||
      filteredVersion !== lastRenderState.filteredVersion;
    if (needsUpdate) {
      const renderer = pixelRenderers.get(currentFrame);
      if (renderer) {
        renderer.update({
          selectedCluster: clusterId !== null ? { clusterId } : null,
          interactionMode: mode,
          grayscaleLabeled,
          filteredClusterIds: filteredIds,
        });
        const layer = geoRasterLayers.get(currentFrame);
        if (layer) {
          layer.setOpacity(0);
          setTimeout(() => layer.setOpacity(targetOpacity), 0);
        }
      }
      lastRenderState = {
        clusterId,
        mode,
        grayscale: grayscaleLabeled,
        filteredVersion,
      };
    }
  });
  $effect(() => {
    const shouldBeSelectable = isLayerVisible && interactionMode === "cluster";
    if (!shouldBeSelectable) {
      selectedCluster = null;
    }
  });
  $effect(() => {
    if (currentSegmentationKey !== prevKey) {
      selectedCluster = null;
    }
    prevKey = currentSegmentationKey;
  });
  $effect(() => {
    if (!hasInitialized || !layersReady) return;
    const frame = currentFrame;
    if (
      activeFilterGeometry &&
      frame !== lastFilteredFrame &&
      lastFilteredFrame !== null
    ) {
      handleShapefileSelection(activeFilterGeometry);
    }
    lastFilteredFrame = frame;
  });

  onMount(() => {
    if (mapManager) {
      mapManager.on("shapefileFeatureSelected", handleShapefileSelection);
    }
    return () => {
      if (layerGroup) {
        layerGroup._group.clearLayers();
        geoRasterLayers.forEach((layer) => mapManager.map.removeLayer(layer));
        layerGroup.destroy();
      }
    };
  });
</script>
