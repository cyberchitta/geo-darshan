import { ClusterLegendRenderer } from "./cluster-legend-renderer.js";
import { DataSectionRenderer } from "./data-section-renderer.js";
import { LandUseLegendRenderer } from "./land-use-legend-renderer.js";
import { STORAGE_KEYS } from "./utils.js";

class LegendPanel {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.activeTab = "clusters";
    this.clusterRenderer = new ClusterLegendRenderer("cluster-panel");
    this.landUseRenderer = new LandUseLegendRenderer("landuse-panel");
    this.dataRenderer = new DataSectionRenderer("data-panel");
    this.setupRenderers();
    this.render();
  }

  render() {
    this.container.innerHTML = `
        <div class="panel-tabs">
          <button class="panel-tab active" data-panel="clusters">Clusters</button>
          <button class="panel-tab" data-panel="landuse">Land Use</button>
          <button class="panel-tab" data-panel="data">Data</button>
        </div>
        <div class="panel-content">
          <div id="cluster-panel" class="tab-panel active"></div>
          <div id="landuse-panel" class="tab-panel"></div>
          <div id="data-panel" class="tab-panel"></div>
        </div>
    `;
    this.setupTabSwitching();
    this.clusterRenderer.render();
    this.landUseRenderer.render();
    this.dataRenderer.render();
    this.switchToTab("clusters");
  }

  setupRenderers() {
    this.clusterRenderer.on("labelsChanged", (labels) => {
      if (this.onLabelsChanged) this.onLabelsChanged(labels);
    });
    this.clusterRenderer.on("clusterSelected", (clusterId) => {
      if (this.onClusterSelected) this.onClusterSelected(clusterId);
    });
    this.landUseRenderer.on("hierarchyLevelChange", (level) => {
      this.emit("hierarchyLevelChange", level);
    });
    this.dataRenderer.on("fileSelect", (files) => {
      this.emit("fileSelect", files);
    });
    this.dataRenderer.on("clearData", () => {
      this.emit("clearData");
    });
  }

  setupTabSwitching() {
    const tabs = this.container.querySelectorAll(".panel-tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const panelId = tab.dataset.panel;
        this.switchToTab(panelId);
      });
    });
  }

  switchToTab(tabName) {
    if (this.activeTab === tabName) return;
    const tabs = this.container.querySelectorAll(".panel-tab");
    tabs.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.panel === tabName);
    });
    const panels = this.container.querySelectorAll(".tab-panel");
    panels.forEach((panel) => {
      panel.classList.remove("active");
    });
    const panelIds = {
      clusters: "cluster-panel",
      landuse: "landuse-panel",
      data: "data-panel",
    };
    const activePanel = this.container.querySelector(`#${panelIds[tabName]}`);
    if (activePanel) {
      activePanel.classList.add("active");
    }
    this.clusterRenderer.setVisible(tabName === "clusters");
    this.landUseRenderer.setVisible(tabName === "landuse");
    this.dataRenderer.setVisible(tabName === "data");
    this.activeTab = tabName;
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PANEL, tabName);
    console.log(`Switched to ${tabName} tab`);
  }

  updateClusters(clusterData, clusterColors) {
    this.clusterRenderer.updateClusters(clusterData, clusterColors);
  }

  switchToSegmentation(segmentationKey) {
    this.clusterRenderer.switchToSegmentation(segmentationKey);
  }

  selectCluster(clusterId) {
    this.clusterRenderer.selectCluster(clusterId);
    if (this.activeTab !== "clusters") {
      this.switchToTab("clusters");
    }
  }

  clearSelection() {
    this.clusterRenderer.clearSelection();
  }

  getAllLabelsAsObject() {
    return this.clusterRenderer.getAllLabelsAsObject();
  }

  async loadLabels(file) {
    return this.clusterRenderer.loadLabels(file);
  }

  setLabeledLayer(layer) {
    this.landUseRenderer.setLabeledLayer(layer);
  }

  updateDataInfo(manifest) {
    this.dataRenderer.updateDataInfo(manifest);
  }

  updateLoadingProgress(loaded, total) {
    this.dataRenderer.updateLoadingProgress(loaded, total);
  }

  setDataLoader(dataLoader) {
    this.landUseRenderer.setDataLoader(dataLoader);
  }

  clearDataDisplay() {
    this.dataRenderer.clearDataDisplay();
  }

  on(event, callback) {
    if (!this.listeners) this.listeners = {};
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  emit(event, ...args) {
    if (!this.listeners) this.listeners = {};
    if (this.listeners[event]) {
      this.listeners[event].forEach((callback) => callback(...args));
    }
  }

  destroy() {
    this.clusterRenderer.destroy();
    this.landUseRenderer.destroy();
    this.dataRenderer.destroy();
  }
}

export { LegendPanel };
