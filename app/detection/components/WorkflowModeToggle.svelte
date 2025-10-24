<script>
  let { mode = "manual" } = $props();
</script>

<div class="workflow-toggle">
  <label class="toggle-label">
    <span>Workflow Mode</span>
  </label>
  <div class="toggle-buttons">
    <button
      class="toggle-btn"
      class:active={mode === "manual"}
      onclick={() => (mode = "manual")}
    >
      Manual
    </button>
    <button
      class="toggle-btn"
      class:active={mode === "automatic"}
      onclick={() => (mode = "automatic")}
    >
      Automatic
    </button>
  </div>
  <p class="mode-description">
    {#if mode === "manual"}
      Export region to Google Earth, download satellite image, upload here
    {:else}
      Automatically capture satellite image from current map view
    {/if}
  </p>
</div>

<style>
  .workflow-toggle {
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid #eee;
  }

  .toggle-label {
    display: block;
    margin-bottom: 8px;
    font-size: 12px;
    font-weight: 600;
    color: #333;
  }

  .toggle-buttons {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }

  .toggle-btn {
    flex: 1;
    padding: 8px;
    border: 1px solid #ddd;
    background: white;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .toggle-btn:hover {
    border-color: #999;
  }

  .toggle-btn.active {
    background: #3498db;
    color: white;
    border-color: #3498db;
  }

  .mode-description {
    margin: 0;
    font-size: 11px;
    color: #666;
    font-style: italic;
  }
</style>
