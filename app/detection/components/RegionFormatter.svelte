<script>
  let { selectedRegion } = $props();
  let format = $state("kml");
  let copied = $state(false);

  function generateKML() {
    const { bbox } = selectedRegion;
    const coordinates = `
      ${bbox.west},${bbox.south}
      ${bbox.east},${bbox.south}
      ${bbox.east},${bbox.north}
      ${bbox.west},${bbox.north}
      ${bbox.west},${bbox.south}
    `.trim();

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Detection Region</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
${coordinates
  .split("\n")
  .map((c) => `              ${c.trim()}`)
  .join("\n")}
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;
  }

  function generateGeoJSON() {
    const { bbox } = selectedRegion;
    return JSON.stringify(
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [bbox.west, bbox.south],
              [bbox.east, bbox.south],
              [bbox.east, bbox.north],
              [bbox.west, bbox.north],
              [bbox.west, bbox.south],
            ],
          ],
        },
        properties: {
          name: "Detection Region",
        },
      },
      null,
      2
    );
  }

  function generateBounds() {
    const { bbox } = selectedRegion;
    return `North: ${bbox.north.toFixed(6)}
South: ${bbox.south.toFixed(6)}
East: ${bbox.east.toFixed(6)}
West: ${bbox.west.toFixed(6)}`;
  }

  function getFormattedText() {
    switch (format) {
      case "kml":
        return generateKML();
      case "geojson":
        return generateGeoJSON();
      case "bounds":
        return generateBounds();
      default:
        return "";
    }
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(getFormattedText());
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

<div class="region-formatter">
  <h3>Region Format</h3>

  <div class="format-selector">
    <select bind:value={format}>
      <option value="kml">KML (Google Earth)</option>
      <option value="geojson">GeoJSON</option>
      <option value="bounds">Lat/Lng Bounds</option>
    </select>
  </div>

  <div class="format-display">
    <pre>{getFormattedText()}</pre>
  </div>

  <button on:click={copyToClipboard} class="copy-button" class:copied>
    {copied ? "✓ Copied!" : "Copy to Clipboard"}
  </button>
</div>

<style>
  .region-formatter {
    margin-bottom: 16px;
    padding: 12px;
    background: #f9f9f9;
    border-radius: 4px;
  }

  h3 {
    margin: 0 0 8px 0;
    font-size: 13px;
    font-weight: 600;
  }

  .format-selector {
    margin-bottom: 8px;
  }

  select {
    width: 100%;
    padding: 6px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 12px;
  }

  .format-display {
    margin-bottom: 8px;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    overflow: hidden;
  }

  pre {
    margin: 0;
    padding: 8px;
    font-size: 10px;
    line-height: 1.4;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .copy-button {
    width: 100%;
    padding: 6px;
    background: #27ae60;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .copy-button:hover {
    background: #229954;
  }

  .copy-button.copied {
    background: #16a085;
  }
</style>
