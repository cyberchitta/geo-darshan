<script>
  import { getContext } from "svelte";
  import { manifest, overlayData } from "../stores.js";

  const { dataLoader } = getContext("managers");

  let fileInput;
  let isDatasetInfoCollapsed = false;

  function selectFolder() {
    fileInput.click();
  }

  function handleFileSelect(e) {
    const files = e.target.files;
    if (files && files.length > 0) {
      dataLoader.loadFromFolder(files);
    }
  }

  function clearData() {
    if (confirm("Clear all loaded data? This will reset the viewer.")) {
      window.dispatchEvent(new CustomEvent("clearData"));
    }
  }

  function toggleDatasetInfo() {
    isDatasetInfoCollapsed = !isDatasetInfoCollapsed;
  }

  function handleDatasetInfoKeydown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleDatasetInfo();
    }
  }

  $: dataStatus = $manifest
    ? `${$manifest.segmentation_keys.length} frames loaded`
    : "No data loaded";

  $: dataBounds = $manifest
    ? `Bounds: ${$manifest.metadata.bounds.map((b) => b.toFixed(6)).join(", ")}`
    : "";

  $: dataShape = $manifest
    ? `Shape: ${$manifest.metadata.shape.join(" × ")}`
    : "";
</script>

<div class="data-section">
  <div class="data-header">
    <h3>Data Management</h3>
  </div>

  <div class="data-controls">
    <button class="data-btn primary" on:click={selectFolder}>
      Select Data Folder
    </button>
    <input
      bind:this={fileInput}
      type="file"
      webkitdirectory
      multiple
      style="display: none"
      on:change={handleFileSelect}
    />
    <button class="data-btn secondary" on:click={clearData}>
      Clear Data
    </button>
  </div>

  <div class="dataset-info">
    <!-- Fix: Use button instead of div for interactive element -->
    <button
      class="dataset-info-header"
      class:collapsed={isDatasetInfoCollapsed}
      on:click={toggleDatasetInfo}
      on:keydown={handleDatasetInfoKeydown}
      aria-expanded={!isDatasetInfoCollapsed}
      aria-controls="dataset-info-content"
    >
      <h4>Dataset Info</h4>
      <span class="collapse-chevron" aria-hidden="true">
        {isDatasetInfoCollapsed ? "▶" : "▼"}
      </span>
    </button>

    {#if !isDatasetInfoCollapsed}
      <div class="dataset-info-content" id="dataset-info-content">
        <div class="info-item">{dataStatus}</div>
        {#if dataBounds}<div class="info-item">{dataBounds}</div>{/if}
        {#if dataShape}<div class="info-item">{dataShape}</div>{/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .data-section {
    padding: 15px;
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .data-header h3 {
    margin: 0;
    color: #333;
  }

  .data-controls {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .data-btn {
    padding: 8px 16px;
    border: 1px solid #ddd;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  }

  .data-btn.primary {
    background: #007cba;
    color: white;
    border-color: #007cba;
  }

  .data-btn.secondary {
    background: #f5f5f5;
    color: #666;
  }

  .data-btn:hover {
    opacity: 0.8;
  }

  .data-btn:focus {
    outline: 2px solid #007cba;
    outline-offset: 2px;
  }

  .dataset-info {
    border: 1px solid #ddd;
    border-radius: 4px;
  }

  .dataset-info-header {
    /* Style as button but look like original header */
    width: 100%;
    padding: 10px;
    background: #f9f9f9;
    border: none;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    text-align: left;
    border-radius: 4px 4px 0 0;
  }

  .dataset-info-header:hover {
    background: #f0f0f0;
  }

  .dataset-info-header:focus {
    outline: 2px solid #007cba;
    outline-offset: -2px;
  }

  .dataset-info-header.collapsed {
    border-radius: 4px;
  }

  .dataset-info-header h4 {
    margin: 0;
    font-size: 14px;
  }

  .collapse-chevron {
    transition: transform 0.2s ease;
  }

  .dataset-info-header.collapsed .collapse-chevron {
    transform: rotate(-90deg);
  }

  .dataset-info-content {
    padding: 10px;
    border-top: 1px solid #eee;
  }

  .info-item {
    margin: 5px 0;
    font-size: 13px;
    color: #666;
  }
</style>
