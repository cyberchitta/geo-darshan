<script>
  import { LLMGeoJSONAdapter } from "../../js/detection/llm-geojson-adapter.js";

  let { results, mapManager } = $props();
  let geoJsonLayer = $state(null);
  let selectedFeature = $state(null);

  async function saveResults() {
    if (!results) return;

    const geojson = {
      type: "FeatureCollection",
      features: results.features || [],
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `detection-results-${Date.now()}.geojson`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function displayOnMap() {
    if (!results?.features || !mapManager?.map) return;

    if (geoJsonLayer) {
      mapManager.map.removeLayer(geoJsonLayer);
    }

    geoJsonLayer = L.geoJSON(results, {
      style: {
        color: "#ff0000",
        weight: 2,
        opacity: 0.7,
        fillOpacity: 0.2,
      },
      onEachFeature: (feature, layer) => {
        layer.on("click", () => {
          selectedFeature = feature;
        });
      },
    }).addTo(mapManager.map);
  }

  $effect(() => {
    if (results && mapManager?.map && !geoJsonLayer) {
      displayOnMap();
    }
  });
</script>

<div class="results-viewer">
  <h3>3. Results ({results.features?.length || 0} objects)</h3>

  <div class="results-list">
    {#each results.features || [] as feature, idx}
      <div class="result-item" class:selected={selectedFeature === feature}>
        <div class="result-label">
          {feature.properties?.type || `Object ${idx + 1}`}
        </div>
        <div class="result-confidence">
          {feature.properties?.confidence
            ? `${(feature.properties.confidence * 100).toFixed(0)}%`
            : "—"}
        </div>
      </div>
    {/each}
  </div>

  <div class="results-actions">
    <button on:click={displayOnMap} class="action-btn">Show on Map</button>
    <button on:click={saveResults} class="action-btn primary"
      >Save as GeoJSON</button
    >
  </div>
</div>

<style>
  .results-viewer {
    margin-top: 24px;
  }

  h3 {
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
  }

  .results-list {
    max-height: 300px;
    overflow-y: auto;
    margin-bottom: 12px;
    border: 1px solid #eee;
    border-radius: 4px;
  }

  .result-item {
    padding: 8px;
    border-bottom: 1px solid #eee;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    transition: background 0.2s;
  }

  .result-item:hover {
    background: #f9f9f9;
  }

  .result-item.selected {
    background: #e3f2fd;
  }

  .result-label {
    font-weight: 500;
  }

  .result-confidence {
    color: #666;
  }

  .results-actions {
    display: flex;
    gap: 8px;
  }

  .action-btn {
    flex: 1;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: white;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .action-btn:hover {
    background: #f5f5f5;
  }

  .action-btn.primary {
    background: #27ae60;
    color: white;
    border-color: #27ae60;
  }

  .action-btn.primary:hover {
    background: #229954;
  }
</style>
