<script>
  import { getContext } from "svelte";
  import {
    clusterLabels,
    currentSegmentationKey,
    hierarchyLevel,
  } from "../stores.js";
  import { LandUseHierarchy } from "../js/land-use-hierarchy.js";

  const { dataLoader } = getContext("managers");

  let labeledLayer = null;
  let displayItems = [];
  let isExporting = false;
  let labeledPaths = new Set(); // FIX: Declare as regular variable

  // Reactive hierarchy level with labels
  const hierarchyLabels = {
    1: "Broad Categories",
    2: "General Types",
    3: "Specific Uses",
    4: "Detailed Classification",
  };

  $: hierarchyLabelText =
    hierarchyLabels[$hierarchyLevel] || `Level ${$hierarchyLevel}`;

  // FIX: Extract labeled paths reactively
  $: {
    console.log("🔍 LandUseLegend - Raw cluster labels:", $clusterLabels);
    labeledPaths = extractLabeledPaths($clusterLabels);
    console.log(
      "🔍 LandUseLegend - Extracted paths:",
      Array.from(labeledPaths)
    );
  }

  // Update display items when hierarchy level or labels change
  $: {
    if (LandUseHierarchy.isLoaded() && labeledPaths.size > 0) {
      updateDisplayItems(labeledPaths, $hierarchyLevel);
      console.log("🔍 LandUseLegend - Display items:", displayItems);
    } else {
      displayItems = [];
      console.log(
        "🔍 LandUseLegend - No items to display, hierarchy loaded:",
        LandUseHierarchy.isLoaded(),
        "paths:",
        labeledPaths.size
      );
    }
  }

  function extractLabeledPaths(allLabels) {
    console.log("🔍 Extracting paths from:", allLabels);
    const paths = new Set();

    if (!allLabels || typeof allLabels !== "object") {
      console.log("🔍 No valid labels object");
      return paths;
    }

    // Handle the nested structure: { segmentationKey: { clusterId: landUsePath } }
    Object.entries(allLabels).forEach(
      ([segmentationKey, segmentationLabels]) => {
        console.log(
          `🔍 Processing segmentation ${segmentationKey}:`,
          segmentationLabels
        );
        if (segmentationLabels && typeof segmentationLabels === "object") {
          Object.entries(segmentationLabels).forEach(
            ([clusterId, landUsePath]) => {
              if (landUsePath && landUsePath !== "unlabeled") {
                paths.add(landUsePath);
                console.log(`🔍 Added path: ${landUsePath}`);
              }
            }
          );
        }
      }
    );

    console.log("🔍 Final extracted paths:", Array.from(paths));
    return paths;
  }

  function updateDisplayItems(labeledPaths, targetLevel) {
    if (!LandUseHierarchy.isLoaded() || labeledPaths.size === 0) {
      displayItems = [];
      return;
    }

    const hierarchy = LandUseHierarchy.getInstance();
    const relevantPaths = getRelevantPathsForLevel(labeledPaths, targetLevel);
    const items = [];

    // Get hierarchy items at target level
    const hierarchyItems = hierarchy.getHierarchyItemsAtLevel(targetLevel);

    for (const item of hierarchyItems) {
      if (relevantPaths.has(item.path)) {
        items.push(item);
      }
    }

    // Add promoted items (from deeper levels)
    for (const path of relevantPaths) {
      const pathParts = path.split(".");
      if (pathParts.length < targetLevel) {
        const existing = items.find((item) => item.path === path);
        if (!existing) {
          const color = hierarchy.getColorForPath(path);
          items.push({
            path: path,
            name: pathParts[pathParts.length - 1],
            displayPath: pathParts.join(" > "),
            color: color ? `#${color.replace("#", "")}` : "#888888",
            isPromoted: true,
          });
        }
      }
    }

    displayItems = items.sort((a, b) =>
      compareHierarchicalPaths(a.path, b.path)
    );
  }

  function getRelevantPathsForLevel(labeledPaths, targetLevel) {
    const relevantPaths = new Set();
    for (const path of labeledPaths) {
      const pathParts = path.split(".");
      if (pathParts.length === targetLevel) {
        relevantPaths.add(path);
      } else if (pathParts.length > targetLevel) {
        const parentPath = pathParts.slice(0, targetLevel).join(".");
        relevantPaths.add(parentPath);
      } else if (pathParts.length < targetLevel) {
        relevantPaths.add(path);
      }
    }
    return relevantPaths;
  }

  function compareHierarchicalPaths(pathA, pathB) {
    const partsA = pathA.split(".");
    const partsB = pathB.split(".");
    const maxLength = Math.max(partsA.length, partsB.length);

    for (let i = 0; i < maxLength; i++) {
      const partA = partsA[i] || "";
      const partB = partsB[i] || "";
      if (partA !== partB) {
        return partA.localeCompare(partB);
      }
    }
    return partsA.length - partsB.length;
  }

  function handleHierarchyLevelChange(event) {
    const newLevel = parseInt(event.target.value);
    hierarchyLevel.set(newLevel);

    // Emit to labeled layer if available
    if (labeledLayer) {
      labeledLayer.setHierarchyLevel(newLevel);
    }
  }

  async function handleExport() {
    if (!labeledLayer) {
      alert("No labeled layer available for export");
      return;
    }

    const stats = labeledLayer.getStats();
    if (stats.totalLabels === 0) {
      alert(
        "No labeled clusters available for export. Please label some clusters first."
      );
      return;
    }

    if (!stats.isVisible) {
      alert(
        "Labeled regions layer is not visible. Please enable it first to generate composite."
      );
      return;
    }

    try {
      isExporting = true;

      // Dynamic import of ExportUtility
      const { ExportUtility } = await import("../js/export-utility.js");
      const exporter = new ExportUtility(labeledLayer, dataLoader);
      await exporter.exportLandCoverFiles();

      alert("Land cover files exported successfully!");
    } catch (error) {
      console.error("Export failed:", error);
      alert(`Export failed: ${error.message}`);
    } finally {
      isExporting = false;
    }
  }

  // Allow parent to set labeled layer
  export function setLabeledLayer(layer) {
    labeledLayer = layer;
  }

  // Calculate stats
  $: promotedCount = displayItems.filter((item) => item.isPromoted).length;
  $: regularCount = displayItems.length - promotedCount;
  $: statsText = `${regularCount} categories${promotedCount > 0 ? `, ${promotedCount} promoted` : ""}`;
</script>

<div
  class="land-use-legend"
  role="region"
  aria-labelledby="landuse-legend-title"
>
  <div class="legend-header">
    <h3 id="landuse-legend-title">Land Use Legend</h3>
    <div class="legend-stats" aria-live="polite">
      <span
        >{labeledPaths.size > 0
          ? statsText
          : "Hierarchical Classification"}</span
      >
    </div>
  </div>

  <div class="layer-control-group">
    <div class="hierarchy-control">
      <label for="hierarchy-level-slider">Detail Level:</label>
      <input
        type="range"
        id="hierarchy-level-slider"
        min="1"
        max="4"
        step="1"
        value={$hierarchyLevel}
        on:input={handleHierarchyLevelChange}
        aria-describedby="hierarchy-level-desc"
      />
      <span id="hierarchy-level-desc">{hierarchyLabelText}</span>
    </div>

    <div class="export-control">
      <button
        class="export-btn"
        class:loading={isExporting}
        disabled={isExporting || displayItems.length === 0}
        on:click={handleExport}
        aria-describedby="export-btn-desc"
      >
        {isExporting ? "Exporting..." : "Export Land Cover"}
      </button>
      <span id="export-btn-desc" class="sr-only">
        Export labeled regions as GeoTIFF and mapping files
      </span>
    </div>
  </div>

  <div
    class="legend-items-container"
    role="list"
    aria-labelledby="landuse-items-title"
  >
    <span id="landuse-items-title" class="sr-only">
      Land use categories currently in use
    </span>

    {#if displayItems.length === 0}
      <div class="legend-placeholder" role="status">
        {labeledPaths.size === 0
          ? "No labeled regions to display"
          : "No items at this hierarchy level"}
      </div>
    {:else}
      {#each displayItems as item (item.path)}
        <div
          class="landuse-legend-item"
          class:promoted={item.isPromoted}
          role="listitem"
          data-path={item.path}
        >
          <div
            class="landuse-color-swatch"
            style="background-color: {item.color}"
            aria-hidden="true"
          ></div>
          <div class="landuse-text">
            <span class="landuse-name">{item.name}</span>
            <span class="landuse-path">{item.displayPath}</span>
            {#if item.isPromoted}
              <span
                class="promoted-indicator"
                aria-label="Promoted from deeper level">↑</span
              >
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .land-use-legend {
    padding: 15px;
    display: flex;
    flex-direction: column;
    gap: 15px;
    height: 100%;
  }

  .legend-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .legend-header h3 {
    margin: 0;
    color: #333;
  }

  .legend-stats {
    font-size: 12px;
    color: #666;
  }

  .layer-control-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .hierarchy-control {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .hierarchy-control label {
    font-size: 12px;
    font-weight: bold;
    color: #333;
  }

  .hierarchy-control input[type="range"] {
    width: 100%;
  }

  .hierarchy-control span {
    font-size: 11px;
    color: #666;
    font-style: italic;
  }

  .export-control {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .export-btn {
    padding: 8px 12px;
    border: 1px solid #28a745;
    background: #28a745;
    color: white;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s ease;
  }

  .export-btn:hover:not(:disabled) {
    background: #218838;
  }

  .export-btn:focus {
    outline: 2px solid #28a745;
    outline-offset: 2px;
  }

  .export-btn:disabled {
    background: #6c757d;
    border-color: #6c757d;
    cursor: not-allowed;
    opacity: 0.6;
  }

  .export-btn.loading {
    background: #ffc107;
    border-color: #ffc107;
    color: #212529;
  }

  .legend-items-container {
    flex: 1;
    overflow-y: auto;
    border: 1px solid #eee;
    border-radius: 4px;
  }

  .legend-placeholder {
    text-align: center;
    color: #999;
    padding: 20px;
    font-style: italic;
    font-size: 12px;
  }

  .landuse-legend-item {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid #f0f0f0;
    gap: 10px;
  }

  .landuse-legend-item:last-child {
    border-bottom: none;
  }

  .landuse-legend-item.promoted {
    background-color: #fff3cd;
  }

  .landuse-color-swatch {
    width: 20px;
    height: 15px;
    border: 1px solid #ccc;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .landuse-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .landuse-name {
    font-weight: bold;
    font-size: 12px;
    color: #333;
  }

  .landuse-path {
    font-size: 10px;
    color: #666;
  }

  .promoted-indicator {
    font-size: 12px;
    color: #856404;
    font-weight: bold;
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
</style>
