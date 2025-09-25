<script>
  let { dataState } = $props();
  let isDatasetInfoCollapsed = $state(false);
  let fileInput = $state();
  let manifest = $derived(dataState.manifest);
  let isLoading = $derived(dataState.isLoading);
  let error = $derived(dataState.error);
  let dataStatus = $derived(
    manifest
      ? `${manifest.segmentation_keys.length} frames loaded`
      : "No data loaded"
  );
  let dataBounds = $derived(
    manifest
      ? `Bounds: ${manifest.metadata.bounds.map((b) => b.toFixed(6)).join(", ")}`
      : ""
  );
  let dataShape = $derived(
    manifest ? `Shape: ${manifest.metadata.shape.join(" × ")}` : ""
  );
  let aoiName = $derived(dataState?.aoiName || "");

  function selectFolder() {
    fileInput.click();
  }

  function handleFileSelect(e) {
    const files = e.target.files;
    if (files && files.length > 0 && dataState.loadFromFolder) {
      dataState.loadFromFolder(files);
    }
  }

  function clearData() {
    if (confirm("Clear all loaded data? This will reset the viewer.")) {
      if (dataState.clearData) {
        dataState.clearData();
      }
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
</script>

<div class="data-section">
  <div class="data-header">
    <h3>Data Management</h3>
  </div>

  <div class="data-controls">
    <button
      class="data-btn primary"
      disabled={isLoading}
      onclick={selectFolder}
    >
      {isLoading ? "Loading..." : "Select Data Folder"}
    </button>
    <input
      bind:this={fileInput}
      type="file"
      webkitdirectory
      multiple
      style="display: none"
      onchange={handleFileSelect}
    />
    <button class="data-btn secondary" onclick={clearData}> Clear Data </button>
  </div>
  {#if error}
    <div class="error-message">
      Error: {error}
    </div>
  {/if}

  <div class="dataset-info">
    <button
      class="dataset-info-header"
      class:collapsed={isDatasetInfoCollapsed}
      onclick={toggleDatasetInfo}
      onkeydown={handleDatasetInfoKeydown}
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
        <div class="info-item">AOI: {aoiName}</div>
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
