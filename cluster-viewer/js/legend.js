import { LandUseHierarchy, LandUseDropdown } from "./land-use-hierarchy.js";

class LegendPanel {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.hierarchyData = null;
    this.clusterDropdowns = new Map();
    this.clusterLabels = new Map();
    this.clusterColors = new Map();
    this.onLabelsChanged = null;
    this.initializePanel();
    this.loadHierarchyData();
  }

  async loadHierarchyData() {
    try {
      const response = await fetch("land-use.json");
      this.hierarchyData = await response.json();
      console.log("✅ Loaded land use hierarchy");
    } catch (error) {
      console.error("Failed to load land-use.json:", error);
      this.hierarchyData = {
        forest: "Forest areas",
        agriculture: "Agricultural land",
        urban: "Built environment",
        water: "Water bodies",
      };
    }
  }

  initializePanel() {
    this.container.innerHTML = `
      <div class="legend-header">
        <h3>Cluster Legend</h3>
        <div class="legend-stats">
          <span id="legend-progress">0 of 0 labeled</span>
        </div>
      </div>
      <div class="legend-controls">
        <button id="save-labels-btn" class="legend-btn">Save Labels</button>
        <button id="load-labels-btn" class="legend-btn">Load Labels</button>
        <input type="file" id="load-labels-input" accept=".json" style="display: none;">
        <button id="clear-labels-btn" class="legend-btn secondary">Clear All</button>
      </div>
      <div id="legend-clusters" class="legend-clusters-container">
        <div class="legend-placeholder">Load cluster data to see legend</div>
      </div>
    `;

    this.setupEventListeners();
  }

  setupEventListeners() {
    document.getElementById("save-labels-btn").addEventListener("click", () => {
      this.saveLabels();
    });
    document.getElementById("load-labels-btn").addEventListener("click", () => {
      document.getElementById("load-labels-input").click();
    });
    document
      .getElementById("load-labels-input")
      .addEventListener("change", (e) => {
        this.loadLabels(e.target.files[0]);
      });

    document
      .getElementById("clear-labels-btn")
      .addEventListener("click", () => {
        this.clearAllLabels();
      });
  }

  updateClusters(clusterData, clusterColors) {
    if (!this.hierarchyData) {
      console.warn("Hierarchy data not loaded yet");
      return;
    }
    this.clusterColors = new Map(clusterColors);
    const clustersContainer = document.getElementById("legend-clusters");
    clustersContainer.innerHTML = "";
    this.clusterDropdowns.clear();
    const sortedClusters = [...clusterData].sort((a, b) => a.id - b.id);
    sortedClusters.forEach((cluster) => {
      const clusterItem = this.createClusterItem(cluster);
      clustersContainer.appendChild(clusterItem);
    });
    this.updateProgressStats();
  }

  createClusterItem(cluster) {
    const item = document.createElement("div");
    item.className = "legend-cluster-item";
    item.innerHTML = `
      <div class="cluster-info">
        <div class="cluster-color-swatch" style="background-color: ${
          this.clusterColors.get(cluster.id) || "#ccc"
        }"></div>
        <span class="cluster-id">Cluster ${cluster.id}</span>
        <span class="cluster-stats">(${cluster.pixelCount || 0} pixels)</span>
      </div>
      <div class="cluster-dropdown-container" id="cluster-dropdown-${
        cluster.id
      }"></div>
    `;
    const dropdown = new LandUseDropdown(
      cluster.id,
      this.hierarchyData,
      (clusterId, selectedOption) =>
        this.onClusterLabeled(clusterId, selectedOption)
    );
    const dropdownContainer = item.querySelector(
      `#cluster-dropdown-${cluster.id}`
    );
    dropdownContainer.appendChild(dropdown.element);
    this.clusterDropdowns.set(cluster.id, dropdown);
    if (this.clusterLabels.has(cluster.id)) {
      dropdown.setSelection(this.clusterLabels.get(cluster.id));
    }
    return item;
  }

  onClusterLabeled(clusterId, selectedOption) {
    this.clusterLabels.set(clusterId, selectedOption.path);
    this.updateProgressStats();
    if (this.onLabelsChanged) {
      this.onLabelsChanged(this.getLabelsAsObject());
    }
    console.log(
      `Cluster ${clusterId} labeled as: ${selectedOption.displayPath}`
    );
  }

  updateProgressStats() {
    const total = this.clusterDropdowns.size;
    const labeled = Array.from(this.clusterLabels.values()).filter(
      (label) => label !== "unlabeled"
    ).length;
    document.getElementById(
      "legend-progress"
    ).textContent = `${labeled} of ${total} labeled`;
  }

  getLabelsAsObject() {
    const labels = {};
    this.clusterLabels.forEach((path, clusterId) => {
      if (path !== "unlabeled") {
        labels[clusterId] = path;
      }
    });
    return labels;
  }

  saveLabels() {
    const labels = this.getLabelsAsObject();
    const dataStr = JSON.stringify(labels, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(dataBlob);
    link.download = `cluster-labels-${
      new Date().toISOString().split("T")[0]
    }.json`;
    link.click();
    console.log("✅ Labels saved:", labels);
  }

  async loadLabels(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const labels = JSON.parse(text);
      Object.entries(labels).forEach(([clusterId, path]) => {
        const id = parseInt(clusterId);
        this.clusterLabels.set(id, path);
        const dropdown = this.clusterDropdowns.get(id);
        if (dropdown) {
          dropdown.setSelection(path);
        }
      });
      this.updateProgressStats();
      if (this.onLabelsChanged) {
        this.onLabelsChanged(labels);
      }
      console.log("✅ Labels loaded:", labels);
    } catch (error) {
      console.error("Failed to load labels:", error);
      alert("Failed to load labels file");
    }
  }

  clearAllLabels() {
    if (!confirm("Clear all cluster labels?")) return;
    this.clusterLabels.clear();
    this.clusterDropdowns.forEach((dropdown) => {
      dropdown.setSelection("unlabeled");
    });
    this.updateProgressStats();
    if (this.onLabelsChanged) {
      this.onLabelsChanged({});
    }
    console.log("✅ All labels cleared");
  }
}

export { LegendPanel };
