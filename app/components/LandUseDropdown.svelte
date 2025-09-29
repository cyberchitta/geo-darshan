<script>
  import { ClassificationHierarchy } from "../js/classification.js";

  let {
    clusterId,
    currentSelection = "unlabeled",
    suggestions = [],
    disabled = false,
    onSelectionChange = null,
  } = $props();

  let selectElement = $state();
  let selectionState = $state("unlabeled");
  let options = $state([]);
  $effect(() => {
    if (!ClassificationHierarchy.isLoaded()) {
      options = [];
      return;
    }
    const allOptions =
      ClassificationHierarchy.getInstance().getSelectableOptions();
    if (!suggestions || suggestions.length === 0) {
      options = allOptions;
      return;
    }
    const suggestionOptions = suggestions
      .map(({ landUsePath, count }) => {
        const baseOption = allOptions.find((opt) => opt.path === landUsePath);
        return baseOption
          ? {
              ...baseOption,
              isSuggestion: true,
              suggestionCount: count,
              displayPath: `${baseOption.displayPath} (${count} nearby)`,
            }
          : null;
      })
      .filter(Boolean);
    const suggestionPaths = new Set(suggestions.map((s) => s.landUsePath));
    const remainingOptions = allOptions.filter(
      (opt) => !suggestionPaths.has(opt.path)
    );
    options = [
      ...suggestionOptions,
      { path: "---", displayPath: "─────────────", disabled: true },
      ...remainingOptions,
    ];
  });
  $effect(() => {
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
  });

  function handleChange(event) {
    const newValue = event.target.value;
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
  class="hierarchy-selector {selectionState}"
  class:disabled
  {disabled}
  value={currentSelection}
  onchange={handleChange}
  aria-label="Classification for cluster {clusterId}"
>
  {#each options as option}
    <option
      value={option.path}
      disabled={option.disabled}
      title={option.description}
      class:suggestion={option.isSuggestion}
      style="padding-left: {option.level * 20}px; font-weight: {option.isLeaf
        ? 'normal'
        : 'bold'};"
    >
      {formatOptionText(option)}
    </option>
  {/each}
</select>

<style>
  .hierarchy-selector {
    width: 100%;
    padding: 4px 6px;
    border: 1px solid #ddd;
    border-radius: 3px;
    font-size: 12px;
    background: white;
    cursor: pointer;
  }

  .hierarchy-selector.unlabeled {
    background-color: #f9f9f9;
    color: #999;
  }

  .hierarchy-selector.intermediate {
    background-color: #fff3cd;
    border-color: #ffeaa7;
  }

  .hierarchy-selector.leaf {
    background-color: #d4edda;
    border-color: #c3e6cb;
  }

  .hierarchy-selector:focus {
    outline: 2px solid #007cba;
    outline-offset: -2px;
  }

  .hierarchy-selector:disabled,
  .hierarchy-selector.disabled {
    background-color: #f5f5f5;
    color: #999;
    border-color: #e0e0e0;
    cursor: not-allowed;
    opacity: 0.7;
  }
</style>
