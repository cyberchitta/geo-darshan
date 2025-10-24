<script>
  import { onMount } from "svelte";
  import { MapManager } from "../js/map-manager.js";
  import WorkflowModeToggle from "./components/WorkflowModeToggle.svelte";
  import RegionSelector from "./components/RegionSelector.svelte";
  import RegionFormatter from "./components/RegionFormatter.svelte";
  import ImageUploader from "./components/ImageUploader.svelte";
  import DetectionPanel from "./components/DetectionPanel.svelte";
  import ResultsViewer from "./components/ResultsViewer.svelte";

  let mapManager = $state(null);
  let workflowMode = $state("manual"); // "manual" or "automatic"
  let selectedRegion = $state(null);
  let uploadedImage = $state(null);
  let detectionResults = $state(null);
  let isProcessing = $state(false);
  let error = $state(null);

  const stateObject = {
    get mapManager() {
      return mapManager;
    },
    get selectedRegion() {
      return selectedRegion;
    },
    get uploadedImage() {
      return uploadedImage;
    },
    get detectionResults() {
      return detectionResults;
    },
    get isProcessing() {
      return isProcessing;
    },
    get workflowMode() {
      return workflowMode;
    },
    setSelectedRegion: (region) => {
      selectedRegion = region;
    },
    setUploadedImage: (image) => {
      uploadedImage = image;
    },
    clearResults: () => {
      detectionResults = null;
      error = null;
    },
  };

  export function getState() {
    return stateObject;
  }

  onMount(async () => {
    try {
      const rasterHandler = window.rasterHandler;
      if (!rasterHandler) {
        throw new Error("Raster handler not initialized");
      }
      mapManager = new MapManager("detection-map", rasterHandler);
      await mapManager.initialize();
      console.log("✅ Map initialized");
    } catch (err) {
      console.error("Failed to initialize detection controller:", err);
      error = err.message;
    }
  });
</script>

<div class="detection-container">
  <div id="detection-map"></div>

  {#if mapManager}
    <div class="detection-sidebar">
      <WorkflowModeToggle bind:mode={workflowMode} />

      <div class="workflow-section">
        {#if workflowMode === "manual"}
          <RegionSelector
            {mapManager}
            onRegionSelect={(region) => (selectedRegion = region)}
          />
          {#if selectedRegion}
            <RegionFormatter {selectedRegion} />
            <ImageUploader onImageUpload={(image) => (uploadedImage = image)} />
          {/if}
        {:else}
          <RegionSelector
            {mapManager}
            onRegionSelect={(region) => (selectedRegion = region)}
            automatic
          />
        {/if}
      </div>

      <DetectionPanel
        {selectedRegion}
        {uploadedImage}
        {workflowMode}
        {isProcessing}
        bind:detectionResults
        bind:error
        {mapManager}
      />

      {#if detectionResults}
        <ResultsViewer results={detectionResults} {mapManager} />
      {/if}
    </div>
  {/if}

  {#if error}
    <div class="error-banner">{error}</div>
  {/if}
</div>

<style>
  .detection-container {
    display: flex;
    width: 100%;
    height: 100%;
  }

  #detection-map {
    flex: 1;
    background: #f0f0f0;
  }

  .detection-sidebar {
    width: 350px;
    background: white;
    border-left: 1px solid #ddd;
    overflow-y: auto;
    padding: 16px;
    box-shadow: -2px 0 4px rgba(0, 0, 0, 0.1);
  }

  .workflow-section {
    margin-bottom: 20px;
  }

  .error-banner {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #e74c3c;
    color: white;
    padding: 12px 16px;
    border-radius: 4px;
    z-index: 1000;
  }
</style>
