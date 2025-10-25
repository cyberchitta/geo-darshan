<script>
  let { mapManager, onRegionSelect } = $props();
  let selectionMode = $state(false);
  let isDrawing = $state(false);
  let startLatlng = $state(null);
  let currentRectangle = $state(null);

  function startSelection(e) {
    L.DomEvent.preventDefault(e);
    L.DomEvent.stopPropagation(e);
    isDrawing = true;
    startLatlng = e.latlng;
  }

  function updateRectangle(e) {
    if (!isDrawing || !startLatlng || !mapManager?.map) return;
    if (currentRectangle) {
      mapManager.map.removeLayer(currentRectangle);
    }
    currentRectangle = L.rectangle(
      [
        [startLatlng.lat, startLatlng.lng],
        [e.latlng.lat, e.latlng.lng],
      ],
      {
        color: "#00bfff",
        weight: 2,
        fillOpacity: 0.1,
        className: "selection-rectangle",
      }
    ).addTo(mapManager.map);
  }

  function endSelection(e) {
    if (!isDrawing || !startLatlng) return;
    onRegionSelect({
      bounds: [
        [startLatlng.lat, startLatlng.lng],
        [e.latlng.lat, e.latlng.lng],
      ],
      center: {
        lat: (startLatlng.lat + e.latlng.lat) / 2,
        lng: (startLatlng.lng + e.latlng.lng) / 2,
      },
      bbox: {
        north: Math.max(startLatlng.lat, e.latlng.lat),
        south: Math.min(startLatlng.lat, e.latlng.lat),
        east: Math.max(startLatlng.lng, e.latlng.lng),
        west: Math.min(startLatlng.lng, e.latlng.lng),
      },
    });
    isDrawing = false;
    startLatlng = null;
    selectionMode = false;
  }

  $effect(() => {
    if (!mapManager?.map) return;
    if (selectionMode) {
      mapManager.map.dragging.disable();
      mapManager.map.on("mousedown", startSelection);
      mapManager.map.on("mousemove", updateRectangle);
      mapManager.map.on("mouseup", endSelection);
      return () => {
        mapManager.map.off("mousedown", startSelection);
        mapManager.map.off("mousemove", updateRectangle);
        mapManager.map.off("mouseup", endSelection);
        mapManager.map.dragging.enable();
      };
    }
  });
  $effect(() => {
    if (!mapManager?.map) return;
    if (selectionMode) {
      mapManager.map.dragging.disable();
    } else {
      mapManager.map.dragging.enable();
    }
  });
  $effect(() => {
    const container = mapManager?.map?.getContainer();
    if (container) {
      container.style.cursor = selectionMode ? "crosshair" : "grab";
    }
  });
</script>

<div class="region-selector">
  <div class="header">
    <h3>1. Select Region</h3>
    <button
      onclick={() => (selectionMode = !selectionMode)}
      class="toggle-selection"
      class:active={selectionMode}
    >
      {selectionMode ? "Selection Active" : "Enable Selection"}
    </button>
  </div>
  <p class="hint">
    {selectionMode
      ? "Click and drag on the map to select a rectangular region"
      : "Enable selection mode to draw a region"}
  </p>
  {#if isDrawing}
    <div class="status drawing">Drawing...</div>
  {/if}
</div>

<style>
  .region-selector {
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid #eee;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  .toggle-selection {
    padding: 6px 12px;
    font-size: 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: white;
    cursor: pointer;
    transition: all 0.2s;
  }
  .toggle-selection.active {
    background: #00bfff;
    color: white;
    border-color: #00bfff;
  }
  .hint {
    margin: 8px 0 0 0;
    font-size: 12px;
    color: #666;
  }
  .status {
    margin-top: 8px;
    padding: 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    background: #e8f4fd;
    color: #00bfff;
  }
</style>
