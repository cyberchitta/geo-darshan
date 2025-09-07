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

  updateHierarchyLevelLabel(level) {
    const labels = {
      1: "Broad Categories",
      2: "General Types",
      3: "Specific Uses",
      4: "Detailed Classification",
    };
    const labelElement = document.getElementById("hierarchy-level-label");
    if (labelElement) {
      labelElement.textContent = labels[level] || `Level ${level}`;
    }
  }

  extractLabeledPaths() {
    if (!this.labeledLayer || !this.labeledLayer.allLabels) {
      return new Set();
    }
    const labeledPaths = new Set();
    for (const [segmentationKey, labels] of this.labeledLayer.allLabels) {
      for (const [clusterId, landUsePath] of labels) {
        if (landUsePath && landUsePath !== "unlabeled") {
          labeledPaths.add(landUsePath);
        }
      }
    }
    return labeledPaths;
  }

  getRelevantPathsForLevel(labeledPaths, targetLevel) {
    const relevantPaths = new Set();
    for (const path of labeledPaths) {
      const pathParts = path.split(".");
      if (pathParts.length === targetLevel) {
        relevantPaths.add(path);
      } else if (pathParts.length > targetLevel) {
        const parentPath = pathParts.slice(0, targetLevel).join(".");
        relevantPaths.add(parentPath);
      } else if (pathParts.length < targetLevel) {
        relevantPaths.add(path);
      }
    }
    return relevantPaths;
  }

  updateLegendItems() {
    if (!LandUseHierarchy.isLoaded()) return;
    const hierarchy = LandUseHierarchy.getInstance();
    const container = document.getElementById("landuse-legend-items");
    const labeledPaths = this.extractLabeledPaths();
    if (labeledPaths.size === 0) {
      container.innerHTML =
        '<div class="legend-placeholder">No labeled regions to display</div>';
      return;
    }
    const relevantPaths = this.getRelevantPathsForLevel(
      labeledPaths,
      this.hierarchyLevel
    );
    const displayItems = [];
    const hierarchyItems = hierarchy.getHierarchyItemsAtLevel(
      this.hierarchyLevel
    );
    for (const item of hierarchyItems) {
      if (relevantPaths.has(item.path)) {
        displayItems.push(item);
      }
    }
    for (const path of relevantPaths) {
      const pathParts = path.split(".");
      if (pathParts.length < this.hierarchyLevel) {
        const existing = displayItems.find((item) => item.path === path);
        if (!existing) {
          const color = hierarchy.getColorForPath(path);
          displayItems.push({
            path: path,
            name: pathParts[pathParts.length - 1],
            displayPath: pathParts.join(" > "),
            color: color ? `#${color.replace("#", "")}` : "#888888",
            isPromoted: true,
          });
        }
      }
    }
    if (displayItems.length === 0) {
      container.innerHTML =
        '<div class="legend-placeholder">No items at this level</div>';
      return;
    }
    displayItems.sort((a, b) => this.compareHierarchicalPaths(a.path, b.path));
    container.innerHTML = displayItems
      .map(
        (item) => `
          <div class="landuse-legend-item ${
            item.isPromoted ? "promoted" : ""
          }" data-path="${item.path}">
              <div class="landuse-color-swatch" style="background-color: ${
                item.color
              }"></div>
              <span class="landuse-name">${item.name}</span>
              <span class="landuse-path">${item.displayPath}</span>
              ${
                item.isPromoted
                  ? '<span class="promoted-indicator">↑</span>'
                  : ""
              }
          </div>
          `
      )
      .join("");
    const statsElement = document.getElementById("landuse-legend-stats");
    if (statsElement) {
      const promotedCount = displayItems.filter(
        (item) => item.isPromoted
      ).length;
      const regularCount = displayItems.length - promotedCount;
      statsElement.textContent = `${regularCount} categories${
        promotedCount > 0 ? `, ${promotedCount} promoted` : ""
      }`;
    }
  }

  compareHierarchicalPaths(pathA, pathB) {
    const partsA = pathA.split(".");
    const partsB = pathB.split(".");
    const maxLength = Math.max(partsA.length, partsB.length);
    for (let i = 0; i < maxLength; i++) {
      const partA = partsA[i] || "";
      const partB = partsB[i] || "";
      if (partA !== partB) {
        return partA.localeCompare(partB);
      }
    }
    return partsA.length - partsB.length;
  }

  setLabeledLayer(layer) {
    this.labeledLayer = layer;
    this.updateLegendItems();
  }

  onLabelsChanged() {
    this.updateLegendItems();
  }
}

export { LandUseLegendRenderer };
