/**
 * Capture the selected region from the map view as an image blob.
 * @param {L.Map} map - Leaflet map instance
 * @param {Object} region - Selected region with bbox {north, south, east, west}
 * @param {number} delay - Wait time (ms) for tiles/overlays to render
 * @returns {Promise<Blob>} PNG image blob
 */
export async function captureMapView(map, region = null, delay = 500) {
  if (!map) throw new Error("Map instance required");
  if (region?.bbox) {
    map.invalidateSize();
    const bounds = L.latLngBounds(
      [region.bbox.south, region.bbox.west],
      [region.bbox.north, region.bbox.east]
    );
    map.fitBounds(bounds, {
      padding: [0, 0],
      animate: false,
    });
    await new Promise((resolve) => setTimeout(resolve, delay * 2));
  } else {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  const container = map.getContainer();
  const canvas = await window.html2canvas(container, {
    useCORS: true,
    allowTaint: true,
    backgroundColor: null,
    ignoreElements: (element) => {
      return (
        element.classList.contains("leaflet-control-container") ||
        element.classList.contains("leaflet-control") ||
        element.classList.contains("selection-rectangle")
      );
    },
  });
  if (region?.bbox) {
    const croppedCanvas = cropToRegion(canvas, map, region.bbox);
    return new Promise((resolve) => croppedCanvas.toBlob(resolve, "image/png"));
  }

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function cropToRegion(canvas, map, bbox) {
  const nw = map.latLngToContainerPoint([bbox.north, bbox.west]);
  const se = map.latLngToContainerPoint([bbox.south, bbox.east]);
  const dpr = window.devicePixelRatio || 1;
  const x = Math.min(nw.x, se.x) * dpr;
  const y = Math.min(nw.y, se.y) * dpr;
  const width = Math.abs(se.x - nw.x) * dpr;
  const height = Math.abs(se.y - nw.y) * dpr;
  const croppedCanvas = document.createElement("canvas");
  croppedCanvas.width = width;
  croppedCanvas.height = height;
  const ctx = croppedCanvas.getContext("2d");
  ctx.drawImage(canvas, x, y, width, height, 0, 0, width, height);
  return croppedCanvas;
}
