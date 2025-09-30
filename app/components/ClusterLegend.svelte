<script>
  import { CLUSTER_ID_RANGES, SEGMENTATION_KEYS } from "../js/utils.js";
  import HierarchySelector from "./HierarchySelector.svelte";
  import { ClassificationHierarchy } from "../js/classification.js";
  let { appState, callbacks } = $props();
  const {
    onLabelChange,
    onRegionCancel,
    onRegionCommit,
    onSegmentationChange,
  } = callbacks;
  let segmentationState = $derived(appState.segmentation);
  let dataState = $derived(appState.data);
  let labelRegionsState = $derived(appState.labelRegions);
  let hierarchyLevel = $derived(appState.classification?.hierarchyLevel || 1);
  let selectedCluster = $derived(appState.map?.selectedCluster);
  let selectedRegion = $derived(appState.map?.selectedRegion);
  let interactionMode = $derived(appState.map?.interactionMode || "view");
  let currentSegmentation = $derived(
    dataState.segmentations?.get(segmentationState.currentSegmentationKey)
  );
  let clusters = $derived(currentSegmentation?.getAllClusters?.() || []);
  let clusterColors = $derived(currentSegmentation?.getColors() || new Map());
  let availableSegmentations = $derived(
    dataState.manifest ? dataState.manifest.segmentation_keys : []
  );
  let currentLabels = $derived(
    clusters.reduce((acc, cluster) => {
      acc[cluster.id] = cluster.classificationPath;
      return acc;
    }, {})
  );
  let currentSegmentationKey = $derived(
    segmentationState.currentSegmentationKey
  );
  let selectedSegmentationKey = $derived(currentSegmentationKey);
  let hasSyntheticClusters = $derived(
    labelRegionsState?.interactiveSegmentation != null
  );
  let syntheticSegmentation = $derived(
    labelRegionsState?.interactiveSegmentation
  );
  let syntheticClusters = $derived(
    syntheticSegmentation?.getAllClusters?.() || []
  );
  let syntheticClusterColors = $derived(
    syntheticSegmentation
      ? calculateSyntheticColors(syntheticSegmentation, hierarchyLevel)
      : new Map()
  );
  let syntheticLabels = $derived(
    syntheticClusters.reduce((acc, cluster) => {
      acc[cluster.id] = cluster.classificationPath;
      return acc;
    }, {})
  );
  let labeledCount = $derived(
    Object.keys(currentLabels).filter((id) => {
      const label = currentLabels[id];
      return label && label !== "unlabeled";
    }).length
  );
  let totalCount = $derived(clusters.length);
  let progressText = $derived(
    `${labeledCount} of ${totalCount} clusters labeled`
  );
  let syntheticLabeledCount = $derived(
    Object.keys(syntheticLabels).filter((id) => {
      const label = syntheticLabels[id];
      return label && label !== "unlabeled";
    }).length
  );
  let syntheticTotalCount = $derived(syntheticClusters.length);
  let syntheticProgressText = $derived(
    `${syntheticLabeledCount} of ${syntheticTotalCount} synthetic clusters labeled`
  );
  let focusedClusterId = $state(null);
  let announcementText = $state("");
  let clusterAvailable = $derived(
    segmentationState?.hasActiveLayer && !labelRegionsState?.hasActiveLayer
  );
  let compositeAvailable = $derived(
    labelRegionsState?.hasActiveLayer && !segmentationState?.hasActiveLayer
  );
  let showClusterLegend = $derived(
    (interactionMode === "cluster" &&
      segmentationState?.hasActiveLayer &&
      !labelRegionsState?.hasActiveLayer) ||
      (interactionMode === "view" && clusterAvailable)
  );
  let showCompositeLegend = $derived(
    (interactionMode === "cluster" && labelRegionsState?.hasActiveLayer) ||
      interactionMode === "composite" ||
      (interactionMode === "view" && compositeAvailable)
  );
  let sortedSyntheticClusters = $derived(
    (syntheticClusters || [])
      .slice()
      .sort((a, b) => {
        const aIsFine = CLUSTER_ID_RANGES.isFineGrain(a.id);
        const bIsFine = CLUSTER_ID_RANGES.isFineGrain(b.id);
        if (aIsFine !== bIsFine) return aIsFine ? 1 : -1;
        return a.id - b.id;
      })
      .map((cluster) => ({
        ...cluster,
        displayLabel: CLUSTER_ID_RANGES.isFineGrain(cluster.id)
          ? `Synthetic ${cluster.id}`
          : `Cluster ${cluster.id}`,
        dataId: CLUSTER_ID_RANGES.isFineGrain(cluster.id)
          ? `synthetic-${cluster.id}`
          : `regular-${cluster.id}`,
      }))
  );
  $effect(() => {
    if (!selectedCluster) return;
    const isRegularCluster =
      selectedCluster.segmentationKey === currentSegmentationKey;
    const isCompositeCluster =
      selectedCluster.segmentationKey === SEGMENTATION_KEYS.COMPOSITE;
    if (isRegularCluster) {
      scrollToCluster(selectedCluster.clusterId, false);
      highlightCluster(selectedCluster.clusterId, false);
    } else if (isCompositeCluster) {
      scrollToCluster(selectedCluster.clusterId, true);
      highlightCluster(selectedCluster.clusterId, true);
    }
  });
  function handleRegionCommit(clusterId, selectedOption) {
    onRegionCommit?.(selectedOption.path);
  }
  function handleRegionCancel() {
    onRegionCancel?.();
  }
  function handleSegmentationChange(event) {
    const newSegmentationKey = event.target.value;
    const frameIndex = availableSegmentations.indexOf(newSegmentationKey);
    if (frameIndex >= 0) {
      onSegmentationChange?.(frameIndex);
    }
  }
  function handleClusterClick(clusterId) {
    selectCluster(clusterId);
  }
  function handleSyntheticClusterClick(clusterId) {
    focusedClusterId = clusterId;
    console.log("Synthetic cluster selected:", clusterId);
    announceChange(`Selected synthetic cluster ${clusterId}`);
    if (labelRegionsState?.selectClusterAt) {
      const compositeSegmentation = dataState.segmentations?.get(
        SEGMENTATION_KEYS.COMPOSITE
      );
      if (!compositeSegmentation?.georaster) return;
      const georaster = compositeSegmentation.georaster;
      const rasterData = georaster.values[0];
      for (let y = 0; y < georaster.height; y++) {
        for (let x = 0; x < georaster.width; x++) {
          if (rasterData[y][x] === clusterId) {
            const lng = georaster.xmin + (x + 0.5) * georaster.pixelWidth;
            const lat = georaster.ymax - (y + 0.5) * georaster.pixelHeight;
            labelRegionsState.selectClusterAt({ lat, lng });
            return;
          }
        }
      }
    }
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
  function scrollToCluster(clusterId, isComposite) {
    let selector;
    if (isComposite) {
      const isFineGrain = CLUSTER_ID_RANGES.isFineGrain(clusterId);
      const dataId = isFineGrain
        ? `synthetic-${clusterId}`
        : `regular-${clusterId}`;
      selector = `[data-cluster-id="${dataId}"]`;
    } else {
      selector = `[data-cluster-id="${clusterId}"]`;
    }
    const element = document.querySelector(selector);
    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      element.focus();
    }
  }
  function highlightCluster(clusterId, isComposite) {
    document
      .querySelectorAll(".legend-cluster-item.highlighted")
      .forEach((el) => el.classList.remove("highlighted"));
    let selector;
    if (isComposite) {
      const isFineGrain = CLUSTER_ID_RANGES.isFineGrain(clusterId);
      const dataId = isFineGrain
        ? `synthetic-${clusterId}`
        : `regular-${clusterId}`;
      selector = `[data-cluster-id="${dataId}"]`;
    } else {
      selector = `[data-cluster-id="${clusterId}"]`;
    }
    const element = document.querySelector(selector);
    if (element) {
      element.classList.add("highlighted");
      setTimeout(() => {
        element.classList.remove("highlighted");
      }, 3000);
    }
  }
  function handleLabelChange(clusterId, selectedOption) {
    console.log("Label changed:", clusterId, selectedOption.path);
    if (onLabelChange) {
      onLabelChange(currentSegmentationKey, clusterId, selectedOption.path);
    }
    const labelText =
      selectedOption.path === "unlabeled"
        ? "unlabeled"
        : selectedOption.displayPath.split(" > ").pop();
    announceChange(`Cluster ${clusterId} labeled as ${labelText}`);
  }
  function handleSyntheticLabelChange(clusterId, selectedOption) {
    console.log("Synthetic label changed:", clusterId, selectedOption.path);
    if (onLabelChange) {
      onLabelChange(
        SEGMENTATION_KEYS.COMPOSITE,
        clusterId,
        selectedOption.path
      );
    }
    const labelText =
      selectedOption.path === "unlabeled"
        ? "unlabeled"
        : selectedOption.displayPath.split(" > ").pop();
    announceChange(`Synthetic cluster ${clusterId} labeled as ${labelText}`);
  }
  function calculateSyntheticColors(segmentation, level) {
    const colorMap = new Map();
    if (!ClassificationHierarchy.isLoaded()) return colorMap;
    const hierarchy = ClassificationHierarchy.getInstance();
    const clusters = segmentation.getAllClusters();
    clusters.forEach((cluster) => {
      if (
        !cluster.classificationPath ||
        cluster.classificationPath === "unlabeled"
      ) {
        colorMap.set(cluster.id, null);
        return;
      }
      const pathParts = cluster.classificationPath.split(".");
      const truncatedPath = pathParts
        .slice(0, Math.min(pathParts.length, level))
        .join(".");
      try {
        const color = hierarchy.getColorForPath(truncatedPath, level);
        colorMap.set(
          cluster.id,
          color ? `#${color.replace("#", "")}` : "#888888"
        );
      } catch (error) {
        colorMap.set(cluster.id, "#888888");
      }
    });
    return colorMap;
  }
  function announceChange(message) {
    announcementText = message;
    setTimeout(() => {
      announcementText = "";
    }, 1000);
  }
  function getColorDescription(clusterId, colorMap) {
    const color = colorMap.get(clusterId);
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
  function saveLabels() {
    dataState?.exportLabels?.();
  }
  async function loadLabelsFromFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        await dataState?.importLabels?.(file);
        console.log("📁 Labels loaded from file");
      } catch (error) {
        console.error("Failed to load labels file:", error);
        alert(`Failed to load labels: ${error.message}`);
      }
    };
    input.click();
  }
  function clearAllLabels() {
    if (!confirm("Clear all cluster labels for ALL segmentations?")) return;
    dataState?.clearLabels?.();
    console.log("✅ All labels cleared");
  }
</script>

<div aria-live="polite" aria-atomic="true" class="sr-only">
  {announcementText}
</div>
<div class="cluster-legend" role="region" aria-labelledby="legend-title">
  <div class="legend-header">
    {#if interactionMode === "cluster"}
      <h3 id="legend-title">Cluster Labeling</h3>
    {:else if interactionMode === "composite"}
      <h3 id="legend-title">Region Labeling</h3>
    {/if}
  </div>
  <div class="label-management-controls">
    <div class="label-controls-row">
      <button
        class="label-btn"
        onclick={loadLabelsFromFile}
        aria-describedby="load-labels-desc"
      >
        Load Labels
      </button>
      <button
        class="label-btn"
        onclick={saveLabels}
        aria-describedby="save-labels-desc"
      >
        Save Labels
      </button>
      <button
        class="label-btn secondary"
        onclick={clearAllLabels}
        aria-describedby="clear-labels-desc"
      >
        Clear All
      </button>
    </div>
  </div>
  {#if showClusterLegend}
    <div class="segmentation-selector">
      <label for="segmentation-select">Current Segmentation:</label>
      <select
        id="segmentation-select"
        class="segmentation-dropdown"
        value={selectedSegmentationKey || ""}
        onchange={handleSegmentationChange}
      >
        {#each availableSegmentations as segKey}
          <option value={segKey}>{segKey}</option>
        {/each}
      </select>
    </div>
    <div class="legend-stats-section">
      <div class="legend-stats" aria-live="polite">
        <span aria-label="Progress: {progressText}">{progressText}</span>
      </div>
    </div>
    <div
      class="legend-clusters-container"
      role="list"
      aria-labelledby="clusters-list-title"
    >
      <span id="clusters-list-title" class="sr-only">
        List of {totalCount} clusters. Use arrow keys to navigate, Enter or Space
        to select.
      </span>
      {#if clusters.length === 0}
        <div class="legend-placeholder" role="status">
          No clusters in current segmentation
        </div>
      {:else}
        {#each clusters as cluster (cluster.id)}
          {@const isSelected =
            selectedCluster?.clusterId === cluster.id &&
            selectedCluster?.segmentationKey === currentSegmentationKey}
          {@const clusterSuggestions =
            isSelected && appState.map?.clusterSuggestions
              ? appState.map.clusterSuggestions
              : []}
          <button
            class="legend-cluster-item"
            class:labeled={currentLabels[cluster.id] &&
              currentLabels[cluster.id] !== "unlabeled"}
            class:focused={focusedClusterId === cluster.id}
            data-cluster-id={cluster.id}
            aria-labelledby="cluster-{cluster.id}-label"
            aria-describedby="cluster-{cluster.id}-desc"
            onclick={() => handleClusterClick(cluster.id)}
            onkeydown={(e) => handleClusterKeydown(e, cluster.id)}
          >
            <div class="cluster-info">
              <div
                class="cluster-color-swatch"
                style="background-color: {selectedCluster?.clusterId ===
                  cluster.id &&
                selectedCluster?.segmentationKey === currentSegmentationKey
                  ? '#000000'
                  : clusterColors.get(cluster.id) || '#ccc'}"
                aria-hidden="true"
              ></div>
              <span id="cluster-{cluster.id}-label" class="cluster-id">
                Cluster {cluster.id}
              </span>
              <span class="cluster-stats"
                >({cluster.pixelCount || 0} pixels)</span
              >
            </div>
            <span id="cluster-{cluster.id}-desc" class="sr-only">
              {getColorDescription(cluster.id, clusterColors)}, {cluster.pixelCount ||
                0} pixels,
              {currentLabels[cluster.id] === "unlabeled" ||
              !currentLabels[cluster.id]
                ? "not labeled"
                : `labeled as ${currentLabels[cluster.id]}`}
            </span>
            <div class="cluster-dropdown-container">
              <HierarchySelector
                clusterId={cluster.id}
                currentSelection={currentLabels[cluster.id]}
                suggestions={clusterSuggestions}
                onSelectionChange={handleLabelChange}
              />
            </div>
          </button>
        {/each}
      {/if}
    </div>
  {:else if showCompositeLegend}
    {#if hasSyntheticClusters}
      <div class="synthetic-section">
        {#if selectedRegion}
          <div class="selected-region-panel">
            <div class="region-header">
              <h5>Selected Region</h5>
              <span class="region-stats"
                >{selectedRegion.pixelCount} pixels</span
              >
            </div>
            <div class="region-dropdown-container">
              <HierarchySelector
                clusterId="temp-region"
                currentSelection="unlabeled"
                suggestions={selectedRegion.suggestions || []}
                onSelectionChange={handleRegionCommit}
              />
            </div>
            <div class="region-actions">
              <button class="region-btn cancel" onclick={handleRegionCancel}>
                Cancel
              </button>
            </div>
          </div>
        {/if}
        <div class="synthetic-stats-section">
          <div class="legend-stats" aria-live="polite">
            <span aria-label="Synthetic progress: {syntheticProgressText}">
              {syntheticProgressText}
            </span>
          </div>
        </div>
        <div class="synthetic-clusters-container" role="list">
          {#if sortedSyntheticClusters.length === 0}
            <div class="legend-placeholder" role="status">
              {selectedRegion
                ? "Select land use for region to create synthetic clusters"
                : "Click unlabeled regions to create synthetic clusters"}
            </div>
          {:else}
            {#each sortedSyntheticClusters as cluster (cluster.id)}
              <button
                class="legend-cluster-item synthetic"
                class:labeled={syntheticLabels[cluster.id] &&
                  syntheticLabels[cluster.id] !== "unlabeled"}
                class:focused={focusedClusterId === cluster.id}
                data-cluster-id={cluster.dataId}
                onclick={() => handleSyntheticClusterClick(cluster.id)}
              >
                <div class="cluster-info">
                  <div
                    class="cluster-color-swatch"
                    style="background-color: {syntheticClusterColors.get(
                      cluster.id
                    ) || '#ccc'}"
                    aria-hidden="true"
                  ></div>
                  <span class="cluster-id">
                    {cluster.displayLabel}
                  </span>
                  <span class="cluster-stats"
                    >({cluster.pixelCount || 0} pixels)</span
                  >
                </div>
                <div class="cluster-dropdown-container">
                  <HierarchySelector
                    clusterId={cluster.id}
                    currentSelection={syntheticLabels[cluster.id] ||
                      "unlabeled"}
                    onSelectionChange={handleSyntheticLabelChange}
                  />
                </div>
              </button>
            {/each}
          {/if}
        </div>
      </div>
    {:else}
      <div class="legend-placeholder" role="status">
        Label regions to create synthetic clusters
      </div>
    {/if}
  {:else if interactionMode === "view"}
    <div class="view-mode-message" role="status">
      Enable labeling mode to interact with clusters.
    </div>
  {/if}
</div>

<style>
  .cluster-legend {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .synthetic-section {
    display: flex;
    flex-direction: column;
    flex: 1;
    border-top: 2px solid #007cba;
    background: #f0f8ff;
  }
  .synthetic-header {
    padding: 12px 16px;
    background: #e3f2fd;
    border-bottom: 1px solid #bbb;
  }
  .synthetic-header h4 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #1976d2;
  }
  .selected-region-panel {
    padding: 12px 16px;
    background: #fff3e0;
    border: 1px solid #ffb74d;
    border-radius: 4px;
    margin: 12px 16px;
  }
  .region-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .region-header h5 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #e65100;
  }
  .region-stats {
    font-size: 12px;
    color: #bf360c;
    font-weight: 500;
  }
  .region-dropdown-container {
    margin-bottom: 8px;
  }
  .region-actions {
    display: flex;
    justify-content: flex-end;
  }
  .region-btn {
    padding: 6px 12px;
    font-size: 12px;
    border-radius: 3px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.2s ease;
  }
  .region-btn.cancel {
    background: #f44336;
    color: white;
    border: 1px solid #f44336;
  }
  .region-btn.cancel:hover {
    background: #d32f2f;
    border-color: #d32f2f;
  }
  .synthetic-stats-section {
    padding: 8px 16px;
    background: #e8f4fd;
    border-bottom: 1px solid #bbb;
  }
  .synthetic-clusters-container {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    min-height: 0;
    background: #f0f8ff;
  }
  .legend-cluster-item.synthetic {
    background: #ffffff;
    border-color: #2196f3;
  }
  .legend-cluster-item.synthetic:hover {
    background: #e3f2fd;
    border-color: #1976d2;
  }
  .legend-cluster-item.synthetic.labeled {
    background: #f8f9fa;
    opacity: 0.8;
  }
  .legend-header {
    flex-shrink: 0;
    padding: 16px;
    border-bottom: 1px solid #eee;
    background: #f8f9fa;
  }
  .legend-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #222;
  }
  .segmentation-selector {
    padding: 12px 16px;
    border-bottom: 1px solid #eee;
    background: #fafafa;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .segmentation-selector label {
    font-size: 12px;
    font-weight: 600;
    color: #333;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .segmentation-dropdown {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: white;
    font-size: 14px;
    color: #333;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .segmentation-dropdown:hover {
    border-color: #007cba;
    box-shadow: 0 0 0 2px rgba(0, 124, 186, 0.1);
  }
  .segmentation-dropdown:focus {
    outline: none;
    border-color: #007cba;
    box-shadow: 0 0 0 3px rgba(0, 124, 186, 0.2);
  }
  .label-management-controls {
    padding: 12px 16px;
    border-bottom: 1px solid #eee;
    background: #fafafa;
  }
  .label-controls-row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }
  .label-btn {
    padding: 8px 12px;
    font-size: 14px;
    border: 1px solid #007bff;
    background: #007bff;
    color: white;
    border-radius: 4px;
    cursor: pointer;
    flex: 1;
    min-width: 80px;
    font-weight: 500;
    transition: all 0.2s ease;
  }
  .label-btn:hover {
    background: #0056b3;
    border-color: #0056b3;
  }
  .label-btn:focus {
    outline: 2px solid #007bff;
    outline-offset: 2px;
  }
  .label-btn.secondary {
    background: #6c757d;
    border-color: #6c757d;
  }
  .label-btn.secondary:hover {
    background: #5a6268;
    border-color: #545b62;
  }
  .legend-stats-section {
    padding: 8px 16px;
    background: #f8f9fa;
    border-bottom: 1px solid #eee;
  }
  .legend-stats {
    color: #666;
    font-size: 13px;
    font-weight: 500;
    text-align: center;
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
  .view-mode-message {
    text-align: center;
    color: #555;
    font-style: italic;
    margin-top: 50px;
    font-size: 14px;
    line-height: 1.5;
    background: #f8f9fa;
    border-radius: 4px;
    padding: 16px;
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
    display: block;
    width: 100%;
    text-align: left;
  }
  .legend-cluster-item.highlighted {
    background-color: #ffeb3b !important;
    border: 2px solid #ff9800 !important;
    box-shadow: 0 0 10px rgba(255, 152, 0, 0.5);
    transition: all 0.3s ease;
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
  /* Responsive design */
  @media (max-width: 900px) {
    .segmentation-selector {
      padding: 8px 12px;
    }
    .legend-header {
      padding: 12px;
    }
    .label-controls-row {
      flex-direction: column;
    }
    .label-btn {
      flex: none;
      width: 100%;
    }
  }
  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .legend-cluster-item {
      border: 2px solid #000;
    }
    .segmentation-dropdown {
      border: 2px solid #000;
    }
    .label-btn {
      border: 2px solid;
    }
  }
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .legend-cluster-item,
    .segmentation-dropdown,
    .label-btn {
      transition: none;
    }
    .legend-cluster-item:hover {
      transform: none;
    }
  }
</style>
