<script>
  import { getContext } from "svelte";
  import {
    currentSegmentationKey,
    clusterLabels,
    currentSegmentationData,
  } from "../stores.js";
  import LandUseDropdown from "./LandUseDropdown.svelte";

  const { dataLoader } = getContext("managers");
  let clusters = [];
  let clusterColors = new Map();
  let focusedClusterId = null;
  let announcementText = "";
  let fileInput;
  $: if ($currentSegmentationData) {
    clusters = $currentSegmentationData.clusters || [];
    clusterColors = $currentSegmentationData.colors || new Map();
    console.log("ClusterLegend updated with:", clusters.length, "clusters");
  }
  $: currentLabels =
    $currentSegmentationKey && $clusterLabels[$currentSegmentationKey]
      ? $clusterLabels[$currentSegmentationKey]
      : {};
  $: labeledCount = Object.keys(currentLabels).filter((id) => {
    const label = currentLabels[id];
    return label && label !== "unlabeled";
  }).length;
  $: totalCount = clusters.length;
  $: progressText = `${labeledCount} of ${totalCount} clusters labeled`;

  function handleClusterClick(clusterId) {
    selectCluster(clusterId);
  }

  function handleClusterKeydown(event, clusterId) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectCluster(clusterId);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      navigateToNextCluster(clusterId, 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      navigateToNextCluster(clusterId, -1);
    }
  }

  function selectCluster(clusterId) {
    focusedClusterId = clusterId;
    console.log("Cluster selected:", clusterId);
    announceChange(`Selected cluster ${clusterId}`);
  }

  function navigateToNextCluster(currentId, direction) {
    const currentIndex = clusters.findIndex((c) => c.id === currentId);
    const nextIndex = currentIndex + direction;
    if (nextIndex >= 0 && nextIndex < clusters.length) {
      const nextCluster = clusters[nextIndex];
      focusedClusterId = nextCluster.id;
      setTimeout(() => {
        const nextElement = document.querySelector(
          `[data-cluster-id="${nextCluster.id}"]`
        );
        if (nextElement) {
          nextElement.focus();
        }
      }, 0);
    }
  }

  function handleLabelChange(clusterId, selectedOption) {
    console.log("Label changed:", clusterId, selectedOption.path);
    clusterLabels.update((allLabels) => {
      const updated = { ...allLabels };
      if (!updated[$currentSegmentationKey]) {
        updated[$currentSegmentationKey] = {};
      }
      updated[$currentSegmentationKey][clusterId] = selectedOption.path;
      return updated;
    });
    const labelText =
      selectedOption.path === "unlabeled"
        ? "unlabeled"
        : selectedOption.displayPath.split(" > ").pop();
    announceChange(`Cluster ${clusterId} labeled as ${labelText}`);
  }

  function announceChange(message) {
    announcementText = message;
    setTimeout(() => {
      announcementText = "";
    }, 1000);
  }

  function saveLabels() {
    const allLabels = $clusterLabels;
    const dataStr = JSON.stringify(allLabels, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(dataBlob);
    link.download = `cluster-labels-${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    console.log("✅ Labels saved to file:", allLabels);
    announceChange("Labels saved successfully");
  }

  function loadLabelsFromFile() {
    fileInput.click();
  }

  async function handleFileLoad(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const loadedLabels = JSON.parse(text);
      console.log("📁 Loading labels from file:", loadedLabels);
      const isValidFormat = Object.entries(loadedLabels).every(
        ([segKey, labels]) => {
          return typeof labels === "object" && !Array.isArray(labels);
        }
      );
      if (!isValidFormat) {
        throw new Error("Invalid label file format");
      }
      clusterLabels.set(loadedLabels);
      announceChange(
        `Labels loaded: ${Object.keys(loadedLabels).length} segmentations`
      );
      event.target.value = "";
    } catch (error) {
      console.error("Failed to load labels file:", error);
      alert(`Failed to load labels: ${error.message}`);
    }
  }

  function clearAllLabels() {
    if (!confirm("Clear all cluster labels for ALL segmentations?")) return;
    clusterLabels.set({});
    console.log("✅ All labels cleared");
    announceChange("All labels cleared");
  }

  function getColorDescription(clusterId) {
    const color = clusterColors.get(clusterId);
    if (!color) return "No color";
    const colorNames = {
      "rgb(255, 0, 0)": "red",
      "rgb(0, 255, 0)": "green",
      "rgb(0, 0, 255)": "blue",
      "rgb(255, 255, 0)": "yellow",
      "rgb(255, 0, 255)": "magenta",
      "rgb(0, 255, 255)": "cyan",
    };
    return colorNames[color] || `color ${color}`;
  }
</script>

<div aria-live="polite" aria-atomic="true" class="sr-only">
  {announcementText}
</div>
<div class="cluster-legend" role="region" aria-labelledby="legend-title">
  <div class="legend-header">
    <h3 id="legend-title">Cluster Legend</h3>
    <div class="legend-stats" aria-live="polite">
      <span aria-label="Progress: {progressText}">{progressText}</span>
    </div>
  </div>
  <div
    class="legend-controls"
    role="group"
    aria-labelledby="legend-controls-title"
  >
    <span id="legend-controls-title" class="sr-only"
      >Legend management controls</span
    >
    <button
      class="legend-btn"
      on:click={loadLabelsFromFile}
      aria-describedby="load-labels-desc"
    >
      Load Labels
    </button>
    <span id="load-labels-desc" class="sr-only"
      >Load cluster labels from JSON file</span
    >
    <input
      bind:this={fileInput}
      type="file"
      accept=".json"
      style="display: none"
      on:change={handleFileLoad}
    />
    <button
      class="legend-btn"
      on:click={saveLabels}
      aria-describedby="save-labels-desc"
    >
      Save Labels
    </button>
    <span id="save-labels-desc" class="sr-only"
      >Download current cluster labels as JSON file</span
    >
    <button
      class="legend-btn secondary"
      on:click={clearAllLabels}
      aria-describedby="clear-labels-desc"
    >
      Clear All
    </button>
    <span id="clear-labels-desc" class="sr-only"
      >Remove all cluster labels from all segmentations</span
    >
  </div>
  <div
    class="legend-clusters-container"
    role="list"
    aria-labelledby="clusters-list-title"
  >
    <span id="clusters-list-title" class="sr-only">
      List of {totalCount} clusters. Use arrow keys to navigate, Enter or Space to
      select.
    </span>
    {#if clusters.length === 0}
      <div class="legend-placeholder" role="status">
        Load cluster data to see legend
      </div>
    {:else}
      {#each clusters as cluster (cluster.id)}
        <button
          class="legend-cluster-item"
          class:labeled={currentLabels[cluster.id] &&
            currentLabels[cluster.id] !== "unlabeled"}
          class:focused={focusedClusterId === cluster.id}
          data-cluster-id={cluster.id}
          aria-labelledby="cluster-{cluster.id}-label"
          aria-describedby="cluster-{cluster.id}-desc"
          on:click={() => handleClusterClick(cluster.id)}
          on:keydown={(e) => handleClusterKeydown(e, cluster.id)}
        >
          <div class="cluster-info">
            <div
              class="cluster-color-swatch"
              style="background-color: {clusterColors.get(cluster.id) ||
                '#ccc'}"
              aria-hidden="true"
            ></div>
            <span id="cluster-{cluster.id}-label" class="cluster-id">
              Cluster {cluster.id}
            </span>
            <span class="cluster-stats">({cluster.pixelCount || 0} pixels)</span
            >
          </div>
          <span id="cluster-{cluster.id}-desc" class="sr-only">
            {getColorDescription(cluster.id)}, {cluster.pixelCount || 0} pixels,
            {currentLabels[cluster.id] === "unlabeled" ||
            !currentLabels[cluster.id]
              ? "not labeled"
              : `labeled as ${currentLabels[cluster.id]}`}
          </span>
          <div class="cluster-dropdown-container">
            <LandUseDropdown
              clusterId={cluster.id}
              currentSelection={currentLabels[cluster.id] || "unlabeled"}
              onSelectionChange={handleLabelChange}
            />
          </div>
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .cluster-legend {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .legend-header {
    flex-shrink: 0;
    padding: 16px;
    border-bottom: 1px solid #eee;
    background: #f8f9fa;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .legend-header h3 {
    margin: 0 0 6px 0;
    font-size: 18px;
    font-weight: 600;
    color: #222;
  }

  .legend-stats {
    color: #333;
    font-size: 14px;
    font-weight: 500;
  }

  .legend-controls {
    padding: 12px;
    border-bottom: 1px solid #eee;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .legend-btn {
    padding: 8px 12px;
    font-size: 14px;
    border: 1px solid #007bff;
    background: #007bff;
    color: white;
    border-radius: 4px;
    cursor: pointer;
    flex: 1;
    min-width: 85px;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .legend-btn:hover {
    background: #0056b3;
    border-color: #0056b3;
  }

  .legend-btn:focus {
    outline: 2px solid #007bff;
    outline-offset: 2px;
  }

  .legend-btn.secondary {
    background: #6c757d;
    border-color: #6c757d;
  }

  .legend-btn.secondary:hover {
    background: #5a6268;
    border-color: #545b62;
  }

  .legend-clusters-container {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    min-height: 0;
  }

  .legend-placeholder {
    text-align: center;
    color: #555;
    font-style: italic;
    margin-top: 50px;
    font-size: 14px;
    line-height: 1.5;
  }

  .legend-cluster-item {
    margin-bottom: 14px;
    padding: 12px;
    transition: all 0.2s ease;
    cursor: pointer;
    border: 1px solid #eee;
    border-radius: 6px;
    background: #fafafa;
    position: relative;
  }

  .legend-cluster-item:hover {
    background: #f0f8ff;
    border-color: rgba(0, 123, 255, 0.3);
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .legend-cluster-item:focus {
    outline: 2px solid #007bff;
    outline-offset: 2px;
  }

  .legend-cluster-item.focused {
    background: rgba(0, 123, 255, 0.1);
    border-color: #007bff;
    box-shadow: 0 2px 8px rgba(0, 123, 255, 0.25);
    transform: translateY(-1px);
  }

  .legend-cluster-item.focused:hover {
    background: rgba(0, 123, 255, 0.15);
  }

  .legend-cluster-item.labeled {
    background: #f8f9fa;
    border-color: #dee2e6;
    opacity: 0.7;
  }

  .legend-cluster-item.labeled .cluster-color-swatch {
    opacity: 0.6;
    filter: grayscale(20%);
  }

  .legend-cluster-item.labeled .cluster-id,
  .legend-cluster-item.labeled .cluster-stats {
    color: #6c757d;
  }

  .legend-cluster-item.labeled.focused {
    background: rgba(40, 167, 69, 0.1);
    border-color: #28a745;
    box-shadow: 0 2px 8px rgba(40, 167, 69, 0.25);
    opacity: 1;
  }

  .legend-cluster-item.labeled.focused .cluster-color-swatch {
    opacity: 1;
    filter: none;
  }

  .legend-cluster-item.labeled.focused .cluster-id,
  .legend-cluster-item.labeled.focused .cluster-stats {
    color: inherit;
  }

  .cluster-info {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
    gap: 10px;
  }

  .cluster-color-swatch {
    width: 18px;
    height: 18px;
    border-radius: 3px;
    border: 1px solid #bbb;
    flex-shrink: 0;
  }

  .cluster-id {
    font-weight: 600;
    font-size: 14px;
    color: #222;
  }

  .cluster-stats {
    color: #333;
    font-size: 14px;
    margin-left: auto;
    font-weight: 500;
  }

  .cluster-dropdown-container {
    margin-bottom: 6px;
  }

  /* Screen reader only content */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* Loading and interaction states */
  .legend-cluster-item.click-feedback {
    animation: clickPulse 0.2s ease-out;
  }

  @keyframes clickPulse {
    0% {
      transform: translateY(-1px) scale(1);
    }
    50% {
      transform: translateY(-2px) scale(1.01);
    }
    100% {
      transform: translateY(-1px) scale(1);
    }
  }

  /* Responsive design */
  @media (max-width: 900px) {
    .legend-controls {
      flex-direction: column;
    }

    .legend-btn {
      flex: none;
      width: 100%;
    }
  }

  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .legend-cluster-item {
      border: 2px solid #000;
    }

    .legend-cluster-item.focused {
      border: 2px solid #0066cc;
      background: #e6f3ff;
    }

    .legend-cluster-item.labeled {
      border: 2px solid #666;
    }
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .legend-cluster-item,
    .legend-btn {
      transition: none;
    }

    .legend-cluster-item:hover {
      transform: none;
    }

    .click-feedback {
      animation: none;
    }
  }
</style>
