/**
 * Managed overlay layer with visibility and opacity control.
 * Wraps Leaflet layer group and integrates with map's layer control.
 */
class MapOverlay {
  constructor(group, mapManager, name, isVisible, opacity) {
    this._group = group;
    this._mapManager = mapManager;
    this._name = name;
    this._isVisible = isVisible;
    this._opacity = opacity;
  }

  static create(mapManager, name, options = {}) {
    const group = L.layerGroup();
    const isVisible = options.visible ?? false;
    const opacity = options.opacity ?? 0.8;
    mapManager.addOverlayLayer(name, group, isVisible);
    const overlay = new MapOverlay(group, mapManager, name, isVisible, opacity);
    if (options.onVisibilityChange) {
      group.on("add", () => {
        overlay._isVisible = true;
        options.onVisibilityChange(true);
      });
      group.on("remove", () => {
        overlay._isVisible = false;
        options.onVisibilityChange(false);
      });
      options.onVisibilityChange(isVisible);
    }
    return overlay;
  }

  get isVisible() {
    return this._isVisible;
  }

  addLayer(layer) {
    this._group.addLayer(layer);
    if (layer.setOpacity) {
      layer.setOpacity(this._opacity);
    }
  }

  removeLayer(layer) {
    this._group.removeLayer(layer);
  }

  setOpacity(opacity) {
    this._opacity = Math.max(0, Math.min(1, opacity));
    this._group.eachLayer((layer) => {
      if (layer.setOpacity) {
        layer.setOpacity(this._opacity);
      }
    });
  }

  destroy() {
    this._mapManager.removeOverlayLayer(this._name);
    this._group.clearLayers();
  }
}

export { MapOverlay };
