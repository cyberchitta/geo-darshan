<script>
  import { onMount } from "svelte";
  import { DataLoader } from "../js/data-loader.js";
  import { Cluster } from "../js/cluster.js";

  let {} = $props();
  let isLoading = $state(false);
  let error = $state(null);
  let manifest = $state(null);
  let clusterData = $state({});
  let loader = $state(null);
  let overlays = [];

  export function getOverlays() {
    return overlays;
  }

  export function getState() {
    return {
      isLoading,
      error,
      manifest,
      clusterData,
      loader,
      loadFromFolder,
      clearData,
      getOverlays,
    };
  }

  onMount(() => {
    const rasterHandler = window.rasterHandler;
    if (!rasterHandler) {
      error = "Raster handler not found. Make sure it's injected from HTML.";
      return;
    }
    loader = new DataLoader(rasterHandler);
    setupEventListeners();
  });

  function setupEventListeners() {
    loader.on("loadComplete", handleLoadComplete);
    loader.on("loadError", handleLoadError);
    loader.on("loadProgress", handleLoadProgress);
  }

  async function handleLoadComplete(manifestData, overlayData) {
    try {
      console.log("DataController: Processing loaded data...");
      overlays = overlayData;
      clusterData = await Cluster.extractClusterData(
        overlayData,
        manifestData,
        loader
      );
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
    // Could expose progress state if needed in the future
    console.log(`DataController: Loading progress ${current}/${total}`);
  }

  function loadFromFolder(files) {
    if (!loader) {
      error = "Data loader not initialized";
      return;
    }
    console.log("DataController: Starting folder load...");
    isLoading = true;
    error = null;
    loader.loadFromFolder(files);
  }

  function clearData() {
    console.log("DataController: Clearing all data");
    manifest = null;
    overlays = [];
    clusterData = {};
    isLoading = false;
    error = null;
  }
</script>
