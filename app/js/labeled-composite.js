import { hexToRgb } from "./utils.js";
import { Compositor } from "./compositor.js";
import { LandUseHierarchy, LandUseMapper } from "./land-use.js";
import { RegionLabeler } from "./region-labeler.js";

class LabeledCompositeLayer {
  constructor(mapManager, dataLoader, layerGroup) {
    this.mapManager = mapManager;
    this.dataLoader = dataLoader;
    this.layerGroup = layerGroup;
    this.allLabels = new Map();
    this.overlayData = new Map();
    this.compositeLayer = null;
    this.hierarchyLevel = 1;
    this.landUseColorCache = new Map();
    this.rules = {
      priority: "highest_k",
      requireLabeled: true,
      fallbackToLower: true,
    };
    this.regionLabeler = new RegionLabeler();
    this.regionHighlightLayer = null;
    this.segmentationManager = null;
    this.hasSyntheticOverlay = false;
    console.log("LabeledCompositeLayer initialized");
  }

  setSegmentationManager(segmentationManager) {
    this.segmentationManager = segmentationManager;
  }

  setHierarchyLevel(level) {
    if (level >= 1 && level <= 4 && level !== this.hierarchyLevel) {
      this.hierarchyLevel = level;
      this.landUseColorCache.clear();
      console.log(`Hierarchy level set to ${level}`);
      if (this.hasSyntheticOverlay) {
        this.regenerateSyntheticOverlay();
      }
      if (this.overlayData.size > 0 && this.allLabels.size > 0) {
        this.regenerateComposite();
      }
    }
  }

  setOverlayData(overlays) {
    this.overlayData.clear();
    overlays.forEach((overlay) => {
      this.overlayData.set(overlay.segmentationKey, overlay);
    });
    console.log(`Loaded ${overlays.length} segmentations for composite`);
  }

  updateLabels(allLabels) {
    this.allLabels.clear();
    Object.entries(allLabels).forEach(([segmentationKey, labels]) => {
      const labelMap = new Map();
      Object.entries(labels).forEach(([clusterId, label]) => {
        labelMap.set(parseInt(clusterId), label);
      });
      this.allLabels.set(segmentationKey, labelMap);
    });
    if (this.hasSyntheticOverlay) {
      this.regenerateSyntheticOverlay();
    }
    console.log(`Updated labels for ${this.allLabels.size} segmentations`);
  }

  async regenerateComposite() {
    try {
      console.log("Generating composite raster with TensorFlow.js...");
      const startTime = performance.now();
      const result = await Compositor.generateCompositeRaster(
        this.overlayData,
        this.allLabels,
        this.rules
      );
      this.compositeSegmentationMap = result.segmentationIds;
      this.compositeSegmentations = result.segmentations;
      const compositeGeoRaster = {
        ...result.refGeoRaster,
        values: [result.compositeData],
        numberOfRasters: 1,
      };
      if (this.compositeLayer) {
        this.layerGroup.removeLayer(this.compositeLayer);
      }
      console.log("🏗️ Creating new composite layer...");
      this.compositeLayer = this.mapManager.rasterHandler.createMapLayer(
        compositeGeoRaster,
        {
          pixelValuesToColorFn: (values) =>
            this.convertCompositePixelToColor(values),
          zIndex: 2000,
        }
      );
      this.layerGroup.addLayer(this.compositeLayer);
      this.compositeLayer.setOpacity(this.mapManager.currentOpacity);
      await this.generateSyntheticOverlay();
      const endTime = performance.now();
      console.log(
        `✅ Composite generated in ${(endTime - startTime).toFixed(2)}ms`
      );
    } catch (error) {
      console.error("❌ Failed to generate composite:", error);
      console.error("❌ Stack trace:", error.stack);
      if (this.compositeLayer) {
        try {
          this.layerGroup.removeLayer(this.compositeLayer);
          this.compositeLayer = null;
        } catch (cleanupError) {
          console.error("❌ Failed to cleanup broken layer:", cleanupError);
        }
      }
    }
  }

  async generateSyntheticOverlay() {
    if (
      !this.compositeLayer ||
      !LandUseHierarchy.isLoaded() ||
      !this.segmentationManager
    ) {
      console.log("Cannot generate synthetic overlay - missing dependencies");
      return;
    }
    try {
      console.log("Generating synthetic overlay...");
      const startTime = performance.now();
      const hierarchy = LandUseHierarchy.getInstance();
      const compositeGeoRaster = this.compositeLayer.georasters[0];
      const mapper = new LandUseMapper(
        hierarchy,
        compositeGeoRaster,
        this.compositeSegmentationMap,
        this.compositeSegmentations,
        this.allLabels,
        this.hierarchyLevel
      );
      const pixelMapping = mapper.generatePixelMapping();
      const landUseRasterData = mapper.createLandUseRaster();
      const colorMapping = LandUseMapper.createColorMapping(
        pixelMapping,
        hierarchy,
        this.hierarchyLevel
      );
      const syntheticOverlay = {
        segmentationKey: "composite_regions",
        filename: "synthetic_clusters.tif",
        georaster: {
          ...compositeGeoRaster,
          values: [landUseRasterData],
          numberOfRasters: 1,
        },
        bounds:
          compositeGeoRaster.bounds ||
          this.overlayData.values().next().value?.bounds,
        stats: {
          clusters: Object.keys(pixelMapping).length,
          unlabeled_pixels: this.countUnlabeledPixels(landUseRasterData),
        },
        colorMapping: {
          method: "land_use_based",
          colors_rgb: this.convertColorMappingToRgbArray(colorMapping),
          nodata_value: -1,
        },
        pixelMapping,
      };
      if (this.hasSyntheticOverlay) {
        this.segmentationManager.removeOverlay("composite_regions");
        this.mapManager.removeOverlay("composite_regions");
      }
      await this.mapManager.addOverlay(syntheticOverlay);
      this.segmentationManager.addOverlay(
        "composite_regions",
        syntheticOverlay
      );
      this.hasSyntheticOverlay = true;
      const endTime = performance.now();
      console.log(
        `✅ Synthetic overlay generated in ${(endTime - startTime).toFixed(2)}ms`
      );
      console.log(
        `Generated ${Object.keys(pixelMapping).length} land-use clusters`
      );
    } catch (error) {
      console.error("❌ Failed to generate synthetic overlay:", error);
      this.hasSyntheticOverlay = false;
    }
  }

  async regenerateSyntheticOverlay() {
    if (this.hasSyntheticOverlay) {
      console.log("Regenerating synthetic overlay...");
      await this.generateSyntheticOverlay();
    }
  }

  removeSyntheticOverlay() {
    if (this.hasSyntheticOverlay) {
      console.log("Removing synthetic overlay...");
      this.segmentationManager.removeOverlay("composite_regions");
      this.mapManager.removeOverlay("composite_regions");
      this.hasSyntheticOverlay = false;
    }
  }

  convertColorMappingToRgbArray(colorMapping) {
    const rgbArray = [];
    Object.entries(colorMapping).forEach(([id, hexColor]) => {
      const index = parseInt(id);
      const rgb = hexToRgb(hexColor);
      const rgbValues = rgb.split(",").map((v) => parseInt(v.trim()) / 255);
      rgbArray[index] = rgbValues;
    });
    return rgbArray;
  }

  countUnlabeledPixels(rasterData) {
    let count = 0;
    for (let y = 0; y < rasterData.length; y++) {
      for (let x = 0; x < rasterData[y].length; x++) {
        if (rasterData[y][x] === -1) {
          count++;
        }
      }
    }
    return count;
  }

  resolveLandUseColor(landUsePath) {
    if (!landUsePath) return "rgba(128,128,128,0.8)";
    if (!LandUseHierarchy.isLoaded()) {
      console.warn("LandUseHierarchy not loaded");
      return "rgba(128,128,128,0.8)";
    }
    const cacheKey = `${landUsePath}:${this.hierarchyLevel}`;
    if (this.landUseColorCache.has(cacheKey)) {
      return this.landUseColorCache.get(cacheKey);
    }
    const hierarchy = LandUseHierarchy.getInstance();
    const color = hierarchy.getColorForPath(landUsePath, this.hierarchyLevel);
    const rgbColor = color ? `rgb(${hexToRgb(color)})` : "rgb(128,128,128)";
    this.landUseColorCache.set(cacheKey, rgbColor);
    return rgbColor;
  }

  async handleCompositeClick(latlng) {
    if (!this.compositeLayer || !this.compositeLayer.georasters[0]) {
      console.log("No composite layer available for labeling");
      return;
    }
    this.regionLabeler.updateCompositeData(
      this.compositeLayer.georasters[0],
      this.compositeSegmentationMap,
      this.compositeSegmentations,
      this.allLabels
    );
    const pixelCoord = this.regionLabeler.latlngToPixelCoord(latlng);
    if (!pixelCoord) {
      console.log("Click outside composite bounds");
      return;
    }
    const isUnlabeled = this.regionLabeler.isPixelUnlabeled(pixelCoord);
    if (!isUnlabeled) {
      console.log("Pixel is already labeled");
      return;
    }
    const contiguousRegion =
      this.regionLabeler.findContiguousRegion(pixelCoord);
    if (contiguousRegion.length === 0) {
      console.log("No contiguous region found");
      return;
    }
    const overlaps = this.regionLabeler.checkForOverlaps(contiguousRegion);
    if (overlaps.size > 0) {
      const choice = await this.showOverlapDialog(
        overlaps,
        contiguousRegion.length
      );
      if (!choice) {
        this.clearRegionHighlight();
        return;
      }
      if (choice.action === "merge") {
        this.handleMergeWithExisting(contiguousRegion, choice.clusterId);
        return;
      }
    }
    console.log(
      `Found contiguous region with ${contiguousRegion.length} pixels`
    );
    this.highlightRegion(contiguousRegion);
    this.showRegionLabelingUI(contiguousRegion, latlng);
  }

  highlightRegion(region) {
    this.clearRegionHighlight();
    const boundaryPoints = region.map((pixel) => {
      const coords = this.regionLabeler.pixelToLatLng(pixel);
      return [coords.lat, coords.lng];
    });
    if (boundaryPoints.length > 0) {
      this.regionHighlightLayer = L.polygon(boundaryPoints, {
        color: "#ff0000",
        weight: 2,
        fillOpacity: 0.1,
        fillColor: "#ff0000",
      }).addTo(this.mapManager.map);
    }
  }

  showRegionLabelingUI(region, clickLatlng) {
    const syntheticId = this.regionLabeler.labelRegion(region, "unlabeled");
    console.log(
      `Created synthetic cluster ${syntheticId} with ${region.length} pixels`
    );
    if (this.compositeLayer && this.compositeLayer.redraw) {
      this.compositeLayer.redraw();
    }
    this.regenerateSyntheticOverlay();
    this.clearRegionHighlight();
    this.showBriefMessage(
      `Created synthetic cluster ${syntheticId}. Switch to "composite_regions" to label it.`
    );
  }

  async showOverlapDialog(overlaps, regionSize) {
    return new Promise((resolve) => {
      const dialog = document.createElement("div");
      dialog.className = "overlap-dialog-overlay";
      dialog.innerHTML = `
      <div class="overlap-dialog">
        <h3>Region Overlap Detected</h3>
        <p>This ${regionSize}-pixel region overlaps with existing synthetic clusters:</p>
        <ul class="overlap-list">
          ${Array.from(overlaps.entries())
            .map(
              ([clusterId, landUsePath]) =>
                `<li>Cluster ${clusterId}: ${landUsePath}</li>`
            )
            .join("")}
        </ul>
        <div class="overlap-actions">
          <button class="dialog-btn primary" data-action="merge">Merge with Existing</button>
          <button class="dialog-btn secondary" data-action="new">Create New Cluster</button>
          <button class="dialog-btn cancel" data-action="cancel">Cancel</button>
        </div>
      </div>
    `;
      document.body.appendChild(dialog);
      dialog.addEventListener("click", (e) => {
        if (e.target.classList.contains("dialog-btn")) {
          const action = e.target.dataset.action;
          document.body.removeChild(dialog);
          if (action === "cancel") {
            resolve(null);
          } else if (action === "merge") {
            const firstClusterId = Array.from(overlaps.keys())[0];
            resolve({ action: "merge", clusterId: firstClusterId });
          } else if (action === "new") {
            resolve({ action: "new" });
          }
        }
      });
      const handleEscape = (e) => {
        if (e.key === "Escape") {
          document.removeEventListener("keydown", handleEscape);
          if (document.body.contains(dialog)) {
            document.body.removeChild(dialog);
          }
          resolve(null);
        }
      };
      document.addEventListener("keydown", handleEscape);
    });
  }

  handleMergeWithExisting(region, existingClusterId) {
    region.forEach((pixel) => {
      this.compositeLayer.georasters[0].values[0][pixel.y][pixel.x] =
        existingClusterId;
    });
    console.log(
      `Merged ${region.length} pixels into existing synthetic cluster ${existingClusterId}`
    );
    if (this.compositeLayer && this.compositeLayer.redraw) {
      this.compositeLayer.redraw();
    }
    this.regenerateSyntheticOverlay();
    this.clearRegionHighlight();
  }

  showBriefMessage(message) {
    const messageEl = document.createElement("div");
    messageEl.className = "brief-message";
    messageEl.textContent = message;
    messageEl.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #333;
    color: white;
    padding: 10px 15px;
    border-radius: 4px;
    z-index: 9999;
    font-size: 14px;
  `;
    document.body.appendChild(messageEl);
    setTimeout(() => {
      if (document.body.contains(messageEl)) {
        document.body.removeChild(messageEl);
      }
    }, 3000);
  }

  clearRegionHighlight() {
    if (this.regionHighlightLayer) {
      this.mapManager.map.removeLayer(this.regionHighlightLayer);
      this.regionHighlightLayer = null;
    }
  }

  convertCompositePixelToColor(values) {
    if (!values || values.length === 0 || values[0] === 0) {
      return null;
    }
    const clusterId = values[0];
    for (const [segKey, labels] of this.allLabels) {
      if (labels.has(clusterId)) {
        const landUseLabel = labels.get(clusterId);
        if (landUseLabel && landUseLabel !== "unlabeled") {
          return this.resolveLandUseColor(landUseLabel);
        }
      }
    }
    return "rgb(255, 255, 0)"; // Yellow for unlabeled
  }

  setOpacity(opacity) {
    opacity = Math.max(0, Math.min(1, opacity));
    if (this.compositeLayer) {
      this.compositeLayer.setOpacity(opacity);
    }
    console.log(`Labeled composite opacity set to ${opacity}`);
  }

  setRules(newRules) {
    this.rules = { ...this.rules, ...newRules };
    console.log("Updated combination rules:", this.rules);
    if (this.overlayData.size > 0 && this.allLabels.size > 0) {
      this.regenerateComposite();
    }
  }

  getRules() {
    return { ...this.rules };
  }

  getHierarchyLevel() {
    return this.hierarchyLevel;
  }

  getStats() {
    const totalSegmentations = this.overlayData.size;
    const labeledSegmentations = this.allLabels.size;
    const totalLabels = Array.from(this.allLabels.values()).reduce(
      (sum, labels) => sum + labels.size,
      0
    );
    return {
      totalSegmentations,
      labeledSegmentations,
      totalLabels,
      isVisible: this.mapManager.map.hasLayer(this.layerGroup),
      hierarchyLevel: this.hierarchyLevel,
      rules: this.rules,
      hasSyntheticOverlay: this.hasSyntheticOverlay,
    };
  }

  destroy() {
    this.clearRegionHighlight();
    this.removeSyntheticOverlay();
    if (this.compositeLayer) {
      this.layerGroup.removeLayer(this.compositeLayer);
    }
    this.compositeLayer = null;
    this.allLabels.clear();
    this.overlayData.clear();
    this.landUseColorCache.clear();
    this.regionLabeler = null;
    this.segmentationManager = null;
    console.log("LabeledCompositeLayer destroyed");
  }
}

export { LabeledCompositeLayer };
