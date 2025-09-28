<script>
  import TreeNode from "./TreeNode.svelte";

  let { node, onToggle, level = 0 } = $props();

  let hasChildren = $derived(node.children && node.children.length > 0);
  let canExpand = $derived(hasChildren && level < node.maxDepth);
  let showExpandIcon = $derived(canExpand);
  let nodeColor = $derived(node.hasDirectPixels ? node.color : "#666666");
  let indent = $derived(level * 20);

  function handleToggle() {
    if (canExpand && onToggle) {
      onToggle(node.path);
    }
  }

  function handleKeydown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleToggle();
    }
  }
</script>

<div class="tree-node" style="padding-left: {indent}px">
  {#if canExpand}
    <button
      class="node-header expandable"
      onclick={handleToggle}
      onkeydown={handleKeydown}
      aria-expanded={node.isExpanded}
      aria-label="Toggle {node.name} category"
    >
      <span class="expand-icon" class:expanded={node.isExpanded}>
        {node.isExpanded ? "▼" : "▶"}
      </span>
      <div
        class="node-color-swatch"
        style="background-color: {nodeColor}"
        class:has-pixels={node.hasDirectPixels}
        aria-hidden="true"
      ></div>
      <span class="node-name">{node.name}</span>
      {#if node.aggregatedCount > 0}
        <span class="node-count">({node.aggregatedCount} regions)</span>
      {/if}
    </button>
  {:else}
    <div class="node-header leaf">
      <span class="leaf-icon" aria-hidden="true">🏷️</span>
      <div
        class="node-color-swatch"
        style="background-color: {nodeColor}"
        class:has-pixels={node.hasDirectPixels}
        aria-hidden="true"
      ></div>
      <span class="node-name">{node.name}</span>
      {#if node.aggregatedCount > 0}
        <span class="node-count">({node.aggregatedCount} regions)</span>
      {/if}
    </div>
  {/if}
  {#if node.isExpanded && hasChildren}
    <div class="node-children">
      {#each node.children as child}
        <TreeNode node={child} {onToggle} level={level + 1} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .tree-node {
    font-family: inherit;
  }

  .node-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border-radius: 4px;
    transition: background-color 0.15s;
    width: 100%;
    text-align: left;
    border: none;
    background: none;
    font: inherit;
  }

  .node-header.expandable {
    cursor: pointer;
  }

  .node-header.expandable:hover,
  .node-header.expandable:focus {
    background-color: rgba(0, 0, 0, 0.1);
    outline: none;
  }

  .node-header.leaf {
    cursor: default;
  }

  .node-header.leaf:hover {
    background-color: rgba(0, 0, 0, 0.05);
  }

  .expand-icon {
    font-size: 12px;
    width: 16px;
    text-align: center;
    transition: transform 0.15s;
  }

  .leaf-icon {
    font-size: 12px;
    width: 16px;
    text-align: center;
  }

  .node-color-swatch {
    width: 16px;
    height: 16px;
    border-radius: 3px;
    border: 1px solid #ddd;
  }

  .node-color-swatch:not(.has-pixels) {
    background-color: #666666 !important;
    opacity: 0.5;
  }

  .node-name {
    font-weight: 500;
    flex: 1;
  }

  .node-count {
    font-size: 12px;
    color: #666;
    font-weight: normal;
  }

  .node-children {
    margin-left: 0;
  }
</style>
