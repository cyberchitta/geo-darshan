import { LandUseDropdown, LandUseHierarchy } from "./land-use-hierarchy.js";
import { convertToGrayscale, rgbStringToObject } from "./utils.js";
import { TabRenderer } from "./tab-renderer.js";

class ClusterLegendRenderer extends TabRenderer {
  constructor(containerId) {
    super(containerId);
    this.clusterDropdowns = new Map();
    this.clusterLabelsBySegmentation = new Map();
    this.currentSegmentationKey = null;
    this.clusterColors = new Map();
    this.selectedClusterId = null;
  }

  render() {
    this.container = document.getElementById(this.containerId);
    this.container.innerHTML = `
      <div class="legend-header">
        <h3>Cluster Legend</h3>
        <div class="legend-stats">
          <span id="cluster-legend-progress">0 of 0 labeled</span>
        </div>
      </div>
      <div class="legend-controls">
        <button id="save-labels-btn" class="legend-btn">Save Labels</button>
        <button id="load-labels-btn" class="legend-btn">Load Labels</button>
        <input type="file" id="load-labels-input" accept=".json" style="display: none;">
        <button id="clear-labels-btn" class="legend-btn secondary">Clear All</button>
      </div>
      <div class="legend-clusters-container">
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
    if (!LandUseHierarchy.isLoaded()) {
      console.warn("Hierarchy data not loaded yet");
      return;
    }
    this.clusterColors = new Map(clusterColors);
    const clustersContainer = this.container.querySelector(
      ".legend-clusters-container"
    );
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
    item.dataset.clusterId = cluster.id;
    const currentLabels = this.currentSegmentationKey
      ? this.clusterLabelsBySegmentation.get(this.currentSegmentationKey)
      : null;
    const hasLabel =
      currentLabels &&
      currentLabels.has(cluster.id) &&
      currentLabels.get(cluster.id) !== "unlabeled";
    if (hasLabel) {
      item.classList.add("labeled");
    }
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
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      this.selectCluster(cluster.id);
    });
    if (LandUseHierarchy.isLoaded()) {
      const dropdown = new LandUseDropdown(
        cluster.id,
        (clusterId, selectedOption) =>
          this.onClusterLabeled(clusterId, selectedOption)
      );
      const dropdownContainer = item.querySelector(
        `#cluster-dropdown-${cluster.id}`
      );
      dropdownContainer.appendChild(dropdown.element);
      this.clusterDropdowns.set(cluster.id, dropdown);
      if (currentLabels && currentLabels.has(cluster.id)) {
        dropdown.setSelection(currentLabels.get(cluster.id));
      } else {
        dropdown.setSelection("unlabeled");
      }
    } else {
      console.warn("LandUseHierarchy not loaded - dropdown disabled");
    }
    return item;
  }

  selectCluster(clusterId) {
    this.clearSelection();
    const clusterItem = this.container.querySelector(
      `[data-cluster-id="${clusterId}"]`
    );
    if (clusterItem) {
      clusterItem.classList.add("selected");
      this.selectedClusterId = clusterId;
      clusterItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
      this.backgroundOtherClusters(clusterId);
      this.emit("clusterSelected", clusterId);
    }
  }

  clearSelection() {
    if (this.selectedClusterId) {
      const selected = this.container.querySelector(
        `[data-cluster-id="${this.selectedClusterId}"]`
      );
      if (selected) {
        selected.classList.remove("selected");
      }
      this.selectedClusterId = null;
    }
    this.container.querySelectorAll(".legend-cluster-item").forEach((item) => {
      item.classList.remove("backgrounded");
    });
  }

  backgroundOtherClusters(selectedClusterId) {
    this.container.querySelectorAll(".legend-cluster-item").forEach((item) => {
      const clusterId = parseInt(item.dataset.clusterId);
      if (clusterId !== selectedClusterId) {
        item.classList.add("backgrounded");
      }
    });
  }

  onClusterLabeled(clusterId, selectedOption) {
    if (!this.currentSegmentationKey) {
      console.warn("No current segmentation key set");
      return;
    }
    const currentLabels = this.clusterLabelsBySegmentation.get(
      this.currentSegmentationKey
    );
    currentLabels.set(clusterId, selectedOption.path);
    this.updateClusterItemAppearance(clusterId, selectedOption.path);
    this.updateProgressStats();
    this.emit("labelsChanged", this.getAllLabelsAsObject());
  }

  updateClusterItemAppearance(clusterId, label) {
    const clusterItem = this.container.querySelector(
      `[data-cluster-id="${clusterId}"]`
    );
    if (clusterItem) {
      const colorSwatch = clusterItem.querySelector(".cluster-color-swatch");
      const originalColor = this.clusterColors.get(clusterId);

      if (label !== "unlabeled") {
        clusterItem.classList.add("labeled");
        if (originalColor && colorSwatch) {
          const colorObj = rgbStringToObject(originalColor);
          if (colorObj) {
            const grayColor = convertToGrayscale(colorObj);
            colorSwatch.style.backgroundColor = `rgb(${grayColor.r}, ${grayColor.g}, ${grayColor.b})`;
          }
        }
      } else {
        clusterItem.classList.remove("labeled");
        if (originalColor && colorSwatch) {
          colorSwatch.style.backgroundColor = originalColor;
        }
      }
    }
  }

  updateProgressStats() {
    if (!this.currentSegmentationKey) return;
    const total = this.clusterDropdowns.size;
    const currentLabels = this.clusterLabelsBySegmentation.get(
      this.currentSegmentationKey
    );
    const labeled = currentLabels
      ? Array.from(currentLabels.values()).filter(
          (label) => label !== "unlabeled"
        ).length
      : 0;
    document.getElementById(
      "cluster-legend-progress"
    ).textContent = `${labeled} of ${total} labeled`;
  }

  switchToSegmentation(segmentationKey) {
    if (this.currentSegmentationKey === segmentationKey) return;
    this.currentSegmentationKey = segmentationKey;
    if (!this.clusterLabelsBySegmentation.has(segmentationKey)) {
      this.clusterLabelsBySegmentation.set(segmentationKey, new Map());
    }
    const currentLabels = this.clusterLabelsBySegmentation.get(segmentationKey);
    this.clusterDropdowns.forEach((dropdown, clusterId) => {
      const label = currentLabels.get(clusterId) || "unlabeled";
      dropdown.setSelection(label);
      this.updateClusterItemAppearance(clusterId, label);
    });
    this.updateProgressStats();
  }

  getAllLabelsAsObject() {
    const allLabels = {};
    this.clusterLabelsBySegmentation.forEach((labelsMap, segmentationKey) => {
      const segmentationLabels = {};
      labelsMap.forEach((path, clusterId) => {
        if (path !== "unlabeled") {
          segmentationLabels[clusterId] = path;
        }
      });
      if (Object.keys(segmentationLabels).length > 0) {
        allLabels[segmentationKey] = segmentationLabels;
      }
    });
    return allLabels;
  }

  async loadLabels(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const allLabels = JSON.parse(text);
      this.clusterLabelsBySegmentation.clear();
      Object.entries(allLabels).forEach(([segmentationKey, labels]) => {
        const labelsMap = new Map();
        Object.entries(labels).forEach(([clusterId, path]) => {
          labelsMap.set(parseInt(clusterId), path);
        });
        this.clusterLabelsBySegmentation.set(segmentationKey, labelsMap);
      });
      if (this.currentSegmentationKey) {
        this.switchToSegmentation(this.currentSegmentationKey);
      }
      this.emit("labelsChanged", allLabels);
      console.log("✅ Labels loaded:", allLabels);
    } catch (error) {
      console.error("Failed to load labels:", error);
      alert("Failed to load labels file");
    }
  }

  saveLabels() {
    const allLabels = this.getAllLabelsAsObject();
    const dataStr = JSON.stringify(allLabels, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(dataBlob);
    link.download = `cluster-labels-${
      new Date().toISOString().split("T")[0]
    }.json`;
    link.click();
    console.log("✅ Labels saved:", allLabels);
  }

  clearAllLabels() {
    if (!confirm("Clear all cluster labels for ALL segmentations?")) return;
    this.clusterLabelsBySegmentation.clear();
    this.clusterDropdowns.forEach((dropdown, clusterId) => {
      dropdown.setSelection("unlabeled");
      this.updateClusterItemAppearance(clusterId, "unlabeled");
    });
    this.updateProgressStats();
    this.emit("labelsChanged", {});
    console.log("✅ All labels cleared for all segmentations");
  }
}

export { ClusterLegendRenderer };
