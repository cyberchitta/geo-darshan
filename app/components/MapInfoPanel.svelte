<script>
  let { currentLabel, isVisible } = $props();
</script>

{#if isVisible}
  <div class="map-info-panel">
    <span class="info-text">{currentLabel || "Unlabeled region"}</span>
  </div>
{/if}

<style>
  .map-info-panel {
    position: absolute;
    bottom: 20px;
    left: 20px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    font-family: Arial, sans-serif;
    z-index: 1000;
    pointer-events: none;
    max-width: 200px;
    word-wrap: break-word;
  }

  .info-text {
    display: block;
  }
</style>
