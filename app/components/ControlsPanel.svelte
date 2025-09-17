<script>
  import InteractionModeControls from "./InteractionModeControls.svelte";
  import AnimationControls from "./AnimationControls.svelte";
  import NavigationControls from "./NavigationControls.svelte";
  import OverlayControls from "./OverlayControls.svelte";

  let { segmentationState } = $props();

  let totalFrames = $derived(segmentationState.totalFrames || 0);
  let currentFrame = $derived(segmentationState.currentFrame || 0);
  let isPlaying = $derived(segmentationState.isPlaying || false);
  let currentSegmentationKey = $derived(
    segmentationState.currentSegmentationKey
  );
  let isCollapsed = $state(false);
  let showControls = $derived(totalFrames > 0);

  function toggleCollapsed() {
    isCollapsed = !isCollapsed;
  }

  function handleKeydownToggle(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleCollapsed();
    }
  }
</script>

{#if showControls}
  <div class="controls-panel" class:collapsed={isCollapsed}>
    <div class="controls-header">
      <h2 class="controls-title">Map Controls</h2>
      <button
        class="collapse-toggle"
        class:collapsed={isCollapsed}
        onclick={toggleCollapsed}
        onkeydown={handleKeydownToggle}
        aria-expanded={!isCollapsed}
        aria-controls="controls-content"
        aria-label={isCollapsed
          ? "Expand controls panel"
          : "Collapse controls panel"}
        title={isCollapsed ? "Expand Controls" : "Collapse Controls"}
      >
        <span class="chevron" aria-hidden="true">
          {isCollapsed ? "▲" : "▼"}
        </span>
      </button>
    </div>
    <div
      class="controls-content"
      id="controls-content"
      class:collapsed={isCollapsed}
    >
      <div class="controls-row">
        <div class="control-group overlay-group">
          <OverlayControls />
        </div>
        <div class="control-group interaction-group">
          <InteractionModeControls />
        </div>
        <div class="control-group navigation-group">
          <NavigationControls {segmentationState} />
        </div>
        <div class="control-group animation-group">
          <AnimationControls {segmentationState} />
        </div>
      </div>
    </div>
    {#if isCollapsed}
      <div class="collapsed-status" aria-live="polite">
        <span class="sr-only">Controls panel collapsed</span>
      </div>
    {/if}
  </div>
{/if}

<style>
  .controls-panel {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(255, 255, 255, 0.95);
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    z-index: 1000;
    transition: all 0.3s ease;
    max-width: 90vw;
    min-width: 320px;
  }

  .controls-panel.collapsed {
    transform: translateX(-50%) translateY(60px);
  }

  .controls-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 15px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    background: rgba(0, 124, 186, 0.05);
    border-radius: 8px 8px 0 0;
  }

  .controls-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #333;
    user-select: none;
  }

  .collapse-toggle {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    color: #666;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 30px;
  }

  .collapse-toggle:hover {
    background: rgba(0, 124, 186, 0.1);
    color: #007cba;
  }

  .collapse-toggle:focus {
    outline: 2px solid #007cba;
    outline-offset: 2px;
  }

  .chevron {
    font-size: 12px;
    transition: transform 0.3s ease;
  }

  .collapse-toggle.collapsed .chevron {
    transform: rotate(180deg);
  }

  .controls-content {
    overflow: hidden;
    transition: all 0.3s ease;
    max-height: 200px;
    opacity: 1;
  }

  .controls-content.collapsed {
    max-height: 0;
    opacity: 0;
    padding: 0;
  }

  .controls-row {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0;
  }

  .control-group {
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  }

  .control-group:last-child {
    border-bottom: none;
  }

  .collapsed-status {
    padding: 8px 15px;
    text-align: center;
    font-size: 12px;
    color: #666;
  }

  /* Responsive design for larger screens */
  @media (min-width: 768px) {
    .controls-row {
      flex-direction: row;
      align-items: center;
      padding: 5px;
      gap: 15px;
    }

    .control-group {
      border-bottom: none;
      border-right: 1px solid rgba(0, 0, 0, 0.1);
      padding: 5px 0;
    }

    .control-group:last-child {
      border-right: none;
    }

    .animation-group {
      flex: 0 0 auto;
    }

    .navigation-group {
      flex: 1 1 auto;
      min-width: 250px;
    }

    .overlay-group {
      flex: 0 0 auto;
    }
  }

  /* Extra large screens - more spacing */
  @media (min-width: 1200px) {
    .controls-panel {
      min-width: 600px;
    }

    .controls-row {
      gap: 25px;
      padding: 10px 15px;
    }
  }

  /* Mobile optimizations */
  @media (max-width: 767px) {
    .controls-panel {
      bottom: 10px;
      left: 10px;
      right: 10px;
      transform: none;
      max-width: none;
      min-width: auto;
    }

    .controls-panel.collapsed {
      transform: translateY(80%);
    }

    .controls-title {
      font-size: 13px;
    }

    .control-group {
      padding: 8px 5px;
    }
  }

  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .controls-panel {
      background: white;
      border: 2px solid black;
    }

    .controls-header {
      background: #f0f0f0;
      border-bottom: 2px solid black;
    }

    .control-group {
      border-bottom: 1px solid black;
    }
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .controls-panel,
    .controls-content,
    .chevron,
    .collapse-toggle {
      transition: none;
    }
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
