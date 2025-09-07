import { TabRenderer } from "./tab-renderer.js";
import { LandUseHierarchy } from "./land-use-hierarchy.js";

class LandUseLegendRenderer extends TabRenderer {
  constructor(containerId) {
    super(containerId);
    this.hierarchyLevel = 1;
    this.labeledLayer = null;
  }

  render() {
    this.container = document.getElementById(this.containerId);
    this.container.innerHTML = `
      <div class="legend-header">
        <h3>Land Use Legend</h3>
        <div class="legend-stats">
          <span id="landuse-legend-stats">Hierarchical Classification</span>
        </div>
      </div>
      <div class="layer-control-group">
        <label class="layer-toggle">
          <input type="checkbox" id="labeled-regions-toggle">
          <span class="toggle-slider"></span>
          Show Labeled Regions
        </label>
        <div class="hierarchy-control">
          <label for="hierarchy-level">Detail Level:</label>
          <input type="range" id="hierarchy-level" min="1" max="4" step="1" value="1">
          <span id="hierarchy-level-label">Broad Categories</span>
        </div>
        <div class="opacity-control" id="labeled-regions-opacity-control">
          <label for="labeled-regions-opacity">Opacity:</label>
          <input type="range" id="labeled-regions-opacity" min="0" max="1" step="0.1" value="0.7">
          <span id="labeled-regions-opacity-value">70%</span>
        </div>
      </div>
      <div id="landuse-legend-items" class="legend-items-container">
        <div class="legend-placeholder">Load hierarchy data to see legend</div>
      </div>
    `;
    this.setupEventListeners();
    if (LandUseHierarchy.isLoaded()) {
      this.updateLegendItems();
    }
  }

  setupEventListeners() {
    document
      .getElementById("labeled-regions-toggle")
      .addEventListener("change", (e) => {
        this.emit("labeledRegionsToggle", e.target.checked);
      });
    document
      .getElementById("labeled-regions-opacity")
      .addEventListener("input", (e) => {
        const opacity = parseFloat(e.target.value);
        this.emit("labeledRegionsOpacityChange", opacity);
        document.getElementById(
          "labeled-regions-opacity-value"
        ).textContent = `${Math.round(opacity * 100)}%`;
      });
    document
      .getElementById("hierarchy-level")
      .addEventListener("input", (e) => {
        const level = parseInt(e.target.value);
        this.setHierarchyLevel(level);
      });
  }

  setHierarchyLevel(level) {
    if (level >= 1 && level <= 4 && level !== this.hierarchyLevel) {
      this.hierarchyLevel = level;
      this.updateHierarchyLevelLabel(level);
      this.updateLegendItems();
      this.emit("hierarchyLevelChange", level);
    }
  }

  updateLegendItems() {
    if (!LandUseHierarchy.isLoaded()) return;
    const hierarchy = LandUseHierarchy.getInstance();
    const container = document.getElementById("landuse-legend-items");
    const items = hierarchy.getHierarchyItemsAtLevel(this.hierarchyLevel);
    if (items.length === 0) {
      container.innerHTML =
        '<div class="legend-placeholder">No items at this level</div>';
      return;
    }
    container.innerHTML = items
      .map(
        (item) => `
            <div class="landuse-legend-item" data-path="${item.path}">
                <div class="landuse-color-swatch" style="background-color: ${item.color}"></div>
                <span class="landuse-name">${item.name}</span>
                <span class="landuse-path">${item.displayPath}</span>
            </div>
            `
      )
      .join("");
  }

  setLabeledLayer(layer) {
    this.labeledLayer = layer;
  }
}

export { LandUseLegendRenderer };
