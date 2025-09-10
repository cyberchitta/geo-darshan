<script>
  import { LandUseHierarchy } from "../js/land-use-hierarchy.js";

  export let clusterId;
  export let currentSelection = "unlabeled";
  export let onSelectionChange = null;

  let options = [];
  let selectElement;
  let selectionState = "unlabeled"; // Track current state for CSS

  // Load hierarchy options
  $: if (LandUseHierarchy.isLoaded()) {
    options = LandUseHierarchy.getInstance().getSelectableOptions();
  }

  // Update selection state when currentSelection changes
  $: {
    if (currentSelection === "unlabeled") {
      selectionState = "unlabeled";
    } else {
      const option = options.find((opt) => opt.path === currentSelection);
      if (option) {
        selectionState = option.isLeaf ? "leaf" : "intermediate";
      } else {
        selectionState = "unlabeled";
      }
    }
  }

  function handleChange(event) {
    const newValue = event.target.value;
    currentSelection = newValue;

    if (onSelectionChange) {
      const selectedOption = options.find((opt) => opt.path === newValue);
      onSelectionChange(clusterId, selectedOption);
    }
  }

  function formatOptionText(option) {
    const indent = "  ".repeat(option.level);
    const prefix = option.isLeaf ? "• " : "▶ ";
    return `${indent}${prefix}${option.displayPath.split(" > ").pop()}`;
  }
</script>

<select
  bind:this={selectElement}
  class="land-use-dropdown {selectionState}"
  value={currentSelection}
  on:change={handleChange}
  aria-label="Land use classification for cluster {clusterId}"
>
  {#each options as option}
    <option
      value={option.path}
      title={option.description}
      style="padding-left: {option.level * 20}px; font-weight: {option.isLeaf
        ? 'normal'
        : 'bold'};"
    >
      {formatOptionText(option)}
    </option>
  {/each}
</select>

<style>
  .land-use-dropdown {
    width: 100%;
    padding: 4px 6px;
    border: 1px solid #ddd;
    border-radius: 3px;
    font-size: 12px;
    background: white;
    cursor: pointer;
  }

  .land-use-dropdown.unlabeled {
    background-color: #f9f9f9;
    color: #999;
  }

  .land-use-dropdown.intermediate {
    background-color: #fff3cd;
    border-color: #ffeaa7;
  }

  .land-use-dropdown.leaf {
    background-color: #d4edda;
    border-color: #c3e6cb;
  }

  .land-use-dropdown:focus {
    outline: 2px solid #007cba;
    outline-offset: -2px;
  }
</style>
