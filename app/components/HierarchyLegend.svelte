<script>
  import { ClassificationHierarchy } from "../js/classification.js";
  import TreeNode from "./TreeNode.svelte";

  let { dataState, landUseController } = $props();
  let hierarchyLevel = $derived(landUseController?.hierarchyLevel || 1);
  let isExporting = $state(false);
  let expandedNodes = $state(new Set());
  const hierarchyLabels = {
    1: "Broad Categories",
    2: "General Types",
    3: "Specific Uses",
    4: "Detailed Classification",
  };
  let hierarchyLabelText = $derived(
    hierarchyLabels[hierarchyLevel] || `Level ${hierarchyLevel}`
  );
  let labeledPaths = $derived(extractLabeledPaths(dataState?.segmentations));
  let treeData = $derived(
    ClassificationHierarchy.isLoaded() && labeledPaths.size > 0
      ? buildHierarchyTree(labeledPaths, hierarchyLevel)
      : []
  );

  async function handleExport() {
    if (!landUseController) {
      alert("No land use controller available for export");
      return;
    }
    const stats = landUseController.getStats();
    if (stats.totalLabels === 0) {
      alert(
        "No labeled clusters available for export. Please label some clusters first."
      );
      return;
    }
    if (!stats.isVisible) {
      alert(
        "Land use layer is not visible. Please enable it first to generate export."
      );
      return;
    }
    try {
      isExporting = true;
      await landUseController.exportLandCoverFiles();
      alert("Land cover files exported successfully!");
    } catch (error) {
      console.error("Export failed:", error);
      alert(`Export failed: ${error.message}`);
    } finally {
      isExporting = false;
    }
  }

  function handleHierarchyLevelChange(event) {
    const level = parseInt(event.target.value);
    landUseController?.setHierarchyLevel(level);
    expandedNodes.clear();
    expandedNodes = new Set();
  }

  function handleNodeToggle(nodePath) {
    if (expandedNodes.has(nodePath)) {
      expandedNodes.delete(nodePath);
    } else {
      expandedNodes.add(nodePath);
    }
    expandedNodes = new Set(expandedNodes);
  }

  function extractLabeledPaths(segmentations) {
    const paths = new Set();
    if (!segmentations) return paths;
    segmentations.forEach((segmentation) => {
      const clusters = segmentation.getAllClusters();
      clusters.forEach((cluster) => {
        if (cluster.landUsePath && cluster.landUsePath !== "unlabeled") {
          paths.add(cluster.landUsePath);
        }
      });
    });
    return paths;
  }

  function buildHierarchyTree(labeledPaths, maxLevel) {
    if (!ClassificationHierarchy.isLoaded() || labeledPaths.size === 0) {
      return [];
    }
    const hierarchy = ClassificationHierarchy.getInstance();
    const pathCounts = new Map();
    for (const path of labeledPaths) {
      const pathParts = path.split(".");
      for (
        let level = 1;
        level <= Math.min(pathParts.length, maxLevel);
        level++
      ) {
        const truncatedPath = pathParts.slice(0, level).join(".");
        pathCounts.set(truncatedPath, (pathCounts.get(truncatedPath) || 0) + 1);
      }
    }
    const tree = [];
    const nodeMap = new Map();
    for (const [path, count] of pathCounts) {
      const pathParts = path.split(".");
      const level = pathParts.length;
      const name = pathParts[pathParts.length - 1];
      let color = null;
      try {
        const hierarchyColor = hierarchy.getColorForPath(path);
        color = hierarchyColor
          ? `#${hierarchyColor.replace("#", "")}`
          : "#888888";
      } catch (error) {
        color = "#888888";
      }
      const node = {
        path,
        name,
        level,
        children: [],
        hasDirectPixels: labeledPaths.has(path),
        hasDescendantPixels: count > 0,
        color,
        aggregatedCount: count,
        isExpanded: expandedNodes.has(path),
        maxDepth: maxLevel,
      };
      nodeMap.set(path, node);
    }
    for (const [path, node] of nodeMap) {
      const pathParts = path.split(".");
      if (pathParts.length === 1) {
        tree.push(node);
      } else if (pathParts.length <= maxLevel) {
        const parentPath = pathParts.slice(0, -1).join(".");
        const parent = nodeMap.get(parentPath);
        if (parent) {
          parent.children.push(node);
        }
      }
    }

    function sortNodeChildren(nodes) {
      nodes.sort((a, b) => a.name.localeCompare(b.name));
      nodes.forEach((node) => {
        if (node.children.length > 0) {
          sortNodeChildren(node.children);
        }
      });
    }

    sortNodeChildren(tree);
    return tree;
  }

  let totalCategories = $derived(
    treeData.reduce((count, node) => count + countTreeNodes(node), 0)
  );

  function countTreeNodes(node) {
    return (
      1 +
      node.children.reduce((count, child) => count + countTreeNodes(child), 0)
    );
  }

  let statsText = $derived(
    labeledPaths.size > 0
      ? `${totalCategories} categories from ${labeledPaths.size} labeled regions`
      : "No labeled regions"
  );
</script>

<div
  class="hierarchy-legend"
  role="region"
  aria-labelledby="hierarchy-legend-title"
>
  <div class="legend-header">
    <h3 id="hierarchy-legend-title">Classification Hierarchy</h3>
  </div>
  <div class="legend-stats-section">
    <div class="legend-stats" aria-live="polite">
      <span>{statsText}</span>
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
        value={hierarchyLevel}
        oninput={handleHierarchyLevelChange}
        aria-describedby="hierarchy-level-desc"
      />
      <span id="hierarchy-level-desc">{hierarchyLabelText}</span>
    </div>
    <div class="export-control">
      <button
        class="export-btn"
        class:loading={isExporting}
        disabled={isExporting || treeData.length === 0}
        onclick={handleExport}
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
    role="tree"
    aria-labelledby="hierarchy-tree-title"
  >
    <span id="hierarchy-tree-title" class="sr-only">
      Land use categories hierarchy - use Enter or Space to expand/collapse
      categories
    </span>
    {#if treeData.length === 0}
      <div class="legend-placeholder" role="status">
        {labeledPaths.size === 0
          ? "No labeled regions to display"
          : "No categories at this hierarchy level"}
      </div>
    {:else}
      {#each treeData as rootNode (rootNode.path)}
        <TreeNode node={rootNode} onToggle={handleNodeToggle} />
      {/each}
    {/if}
  </div>
</div>

<style>
  .hierarchy-legend {
    display: flex;
    flex-direction: column;
    height: 100%;
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

  .legend-stats-section {
    padding: 12px 16px;
    border-bottom: 1px solid #eee;
    background: #fafafa;
  }

  .legend-stats {
    color: #666;
    font-size: 13px;
    font-weight: 500;
    text-align: center;
  }

  .layer-control-group {
    padding: 15px;
    display: flex;
    flex-direction: column;
    gap: 15px;
    border-bottom: 1px solid #eee;
  }

  .hierarchy-control {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .hierarchy-control label {
    font-size: 12px;
    font-weight: 600;
    color: #333;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .hierarchy-control input[type="range"] {
    width: 100%;
    margin: 2px 0;
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
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
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
    margin: 0 15px 15px;
  }

  .legend-placeholder {
    text-align: center;
    color: #999;
    padding: 20px;
    font-style: italic;
    font-size: 12px;
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
    .legend-header {
      padding: 12px;
    }
  }

  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .export-btn {
      border: 2px solid;
    }
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .export-btn {
      transition: none;
    }
  }
</style>
