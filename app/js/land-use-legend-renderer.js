import { TabRenderer } from "./tab-renderer.js";

class LandUseLegendRenderer extends TabRenderer {
  constructor(containerId) {
    super(containerId);
    this.hierarchyData = null;
    this.hierarchyLevel = 1;
    this.labeledLayer = null;
    this.landUseColorCache = new Map();
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

  setHierarchyData(hierarchyData) {
    this.hierarchyData = hierarchyData;
    this.updateLegendItems();
  }

  setHierarchyLevel(level) {
    if (level >= 1 && level <= 4 && level !== this.hierarchyLevel) {
      this.hierarchyLevel = level;
      this.updateHierarchyLevelLabel(level);
      this.updateLegendItems();
      this.emit("hierarchyLevelChange", level);
    }
  }

  updateHierarchyLevelLabel(level) {
    const labels = {
      1: "Broad Categories",
      2: "Sub Categories",
      3: "Detailed Types",
      4: "Specific Varieties",
    };
    document.getElementById("hierarchy-level-label").textContent =
      labels[level] || "Unknown";
  }

  updateLegendItems() {
    if (!this.hierarchyData) return;
    const container = document.getElementById("landuse-legend-items");
    const items = this.getHierarchyItemsAtLevel(this.hierarchyLevel);
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

  getHierarchyItemsAtLevel(level) {
    if (!this.hierarchyData) return [];
    const items = [];
    this.traverseHierarchy(this.hierarchyData, [], items, level);
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  traverseHierarchy(obj, currentPath, items, targetLevel) {
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith("_")) continue;
      const newPath = [...currentPath, key];
      if (newPath.length === targetLevel) {
        const color = this.findColorInHierarchy(newPath.join("."));
        items.push({
          path: newPath.join("."),
          name: key,
          displayPath: newPath.join(" > "),
          color: color ? `#${color.replace("#", "")}` : "#888888",
        });
      } else if (newPath.length < targetLevel) {
        this.traverseHierarchy(value, newPath, items, targetLevel);
      }
    }
  }

  findColorInHierarchy(path) {
    if (!this.hierarchyData || !path) return null;
    const pathParts = path.split(".");
    let current = this.hierarchyData;
    for (const part of pathParts) {
      if (current[part]) {
        current = current[part];
      } else {
        return null;
      }
    }
    let colorSearch = current;
    let searchPath = pathParts;
    while (searchPath.length > 0) {
      if (colorSearch._color) {
        return colorSearch._color;
      }
      searchPath.pop();
      colorSearch = this.hierarchyData;
      for (const part of searchPath) {
        colorSearch = colorSearch[part];
      }
    }
    return null;
  }

  setLabeledLayer(layer) {
    this.labeledLayer = layer;
  }
}

export { LandUseLegendRenderer };
