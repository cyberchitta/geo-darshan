<script>
  let { mapState } = $props();
  let interactionMode = $state("view");

  let segmentationVisible = $derived(
    mapState?.segmentationLayerVisible ?? false
  );
  let interactiveVisible = $derived(mapState?.interactiveLayerVisible ?? false);

  const modes = $derived([
    {
      id: "view",
      label: "View Only",
      icon: "👁️",
      desc: "Navigate map without interactions",
      available: true,
    },
    {
      id: "cluster",
      label: "Label Clusters",
      icon: "🎯",
      desc: "Click to label clusters",
      available: segmentationVisible !== interactiveVisible,
    },
    {
      id: "composite",
      label: "Label Regions",
      icon: "🏷️",
      desc: "Click to label contiguous regions",
      available: interactiveVisible && !segmentationVisible,
    },
  ]);
  $effect(() => {
    if (mapState?.setInteractionMode) {
      mapState.setInteractionMode(interactionMode);
    }
  });
  $effect(() => {
    const currentMode = modes.find((mode) => mode.id === interactionMode);
    if (!currentMode?.available) {
      handleModeChange("view");
    }
  });

  function handleModeChange(modeId) {
    interactionMode = modeId;
  }

  function handleKeydown(event, modeId) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleModeChange(modeId);
    }
  }
</script>

<div
  class="interaction-mode-controls"
  role="group"
  aria-labelledby="interaction-mode-title"
>
  <span id="interaction-mode-title" class="control-label">
    Interaction Mode:
  </span>

  <div
    class="mode-buttons"
    role="radiogroup"
    aria-labelledby="interaction-mode-title"
  >
    {#each modes as mode}
      <button
        class="mode-btn"
        class:active={interactionMode === mode.id}
        class:disabled={!mode.available}
        disabled={!mode.available}
        onclick={() => mode.available && handleModeChange(mode.id)}
        onkeydown={(e) => mode.available && handleKeydown(e, mode.id)}
        role="radio"
        aria-checked={interactionMode === mode.id}
        aria-describedby="mode-{mode.id}-desc"
        title={mode.available
          ? mode.desc
          : `${mode.desc} (requires specific layer combination)`}
      >
        <span class="mode-icon" aria-hidden="true">{mode.icon}</span>
        <span class="mode-label">{mode.label}</span>
      </button>
      <span id="mode-{mode.id}-desc" class="sr-only">
        {mode.available ? mode.desc : `${mode.desc} - currently unavailable`}
      </span>
    {/each}
  </div>
</div>

<style>
  .interaction-mode-controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    background: rgba(255, 255, 255, 0.95);
    border-radius: 4px;
    border: 1px solid #ddd;
  }

  .control-label {
    font-size: 12px;
    font-weight: 600;
    color: #333;
    margin: 0;
  }

  .mode-buttons {
    display: flex;
    gap: 4px;
  }

  .mode-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: white;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 60px;
    font-size: 10px;
  }

  .mode-btn:hover:not(.disabled) {
    background: #f5f5f5;
    border-color: #999;
  }

  .mode-btn.active {
    background: #007bff;
    border-color: #0056b3;
    color: white;
  }

  .mode-btn.disabled {
    background: #f8f9fa;
    border-color: #e9ecef;
    color: #6c757d;
    cursor: not-allowed;
    opacity: 0.6;
  }

  .mode-btn:focus:not(.disabled) {
    outline: 2px solid #007bff;
    outline-offset: 2px;
  }

  .mode-icon {
    font-size: 14px;
    line-height: 1;
  }

  .mode-label {
    line-height: 1.2;
    text-align: center;
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
</style>
