import { TabRenderer } from "./tab-renderer.js";
import { STORAGE_KEYS } from "./utils.js";

class DataSectionRenderer extends TabRenderer {
  constructor(containerId) {
    super(containerId);
    this.loadingCallbacks = {};
  }

  render() {
    this.container = document.getElementById(this.containerId);
    this.container.innerHTML = `
      <div class="data-header">
        <h3>Data Management</h3>
      </div>
      <div class="data-controls">
        <button id="load-data-btn">Select Data Folder</button>
        <input type="file" id="file-input" webkitdirectory multiple style="display: none;">
        <button id="clear-data-btn" class="data-btn secondary">Clear Data</button>
      </div>
      <div class="dataset-info">
        <div class="dataset-info-header" id="dataset-info-toggle">
          <h4>Dataset Info</h4>
          <span class="collapse-chevron">▼</span>
        </div>
        <div class="dataset-info-content" id="dataset-info-content">
          <div id="data-status">No data loaded</div>
          <div id="data-bounds"></div>
          <div id="data-shape"></div>
        </div>
      </div>
      <div class="loading-info">
        <div id="loading-progress"></div>
        <div id="loading-status"></div>
      </div>
    `;
    this.setupEventListeners();
    this.setupDatasetInfoCollapse();
  }

  setupEventListeners() {
    document.getElementById("load-data-btn").addEventListener("click", () => {
      document.getElementById("file-input").click();
    });
    document.getElementById("file-input").addEventListener("change", (e) => {
      this.emit("fileSelect", e.target.files);
    });
    document.getElementById("clear-data-btn").addEventListener("click", () => {
      this.emit("clearData");
    });
  }

  setupDatasetInfoCollapse() {
    const toggle = document.getElementById("dataset-info-toggle");
    const content = document.getElementById("dataset-info-content");
    toggle.addEventListener("click", () => {
      const isCollapsed = toggle.classList.toggle("collapsed");
      content.classList.toggle("collapsed", isCollapsed);
      localStorage.setItem(STORAGE_KEYS.DATASET_INFO_COLLAPSED, isCollapsed);
    });
    const isCollapsed =
      localStorage.getItem(STORAGE_KEYS.DATASET_INFO_COLLAPSED) !== "false";
    if (isCollapsed) {
      toggle.classList.add("collapsed");
      content.classList.add("collapsed");
    }
  }

  updateDataInfo(manifest) {
    const { metadata, segmentation_keys } = manifest;
    document.getElementById(
      "data-status"
    ).textContent = `${segmentation_keys.length} frames loaded`;
    document.getElementById(
      "data-bounds"
    ).textContent = `Bounds: ${metadata.bounds
      .map((b) => b.toFixed(6))
      .join(", ")}`;
    document.getElementById(
      "data-shape"
    ).textContent = `Shape: ${metadata.shape.join(" × ")}`;
  }

  updateLoadingProgress(loaded, total) {
    const percent = (loaded / total) * 100;
    document.getElementById("loading-progress").innerHTML = `
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${percent}%"></div>
      </div>
    `;
    document.getElementById(
      "loading-status"
    ).textContent = `Loading ${loaded}/${total} files...`;
  }

  clearDataDisplay() {
    document.getElementById("data-status").textContent = "No data loaded";
    document.getElementById("data-bounds").textContent = "";
    document.getElementById("data-shape").textContent = "";
    document.getElementById("loading-status").textContent = "";
    document.getElementById("loading-progress").innerHTML = "";
  }
}

export { DataSectionRenderer };
