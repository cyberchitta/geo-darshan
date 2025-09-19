import { hexToRgb, SEGMENTATION_KEYS } from "./utils.js";
import { Compositor } from "./compositor.js";
import { LandUseHierarchy, LandUseMapper } from "./land-use.js";
import { RegionLabeler } from "./region-labeler.js";

class CompositeViewer {
  constructor(mapManager, dataLoader, layerGroup) {
    this.mapManager = mapManager;
    this.dataLoader = dataLoader;
    this.layerGroup = layerGroup;
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
    this.compositeSegmentationMap = null;
    this.compositeSegmentations = null;
    console.log("CompositeViewer initialized");
  }

  getCompositeState() {
    if (!this.compositeLayer || !this.compositeSegmentationMap) {
      return null;
    }
    return {
      georaster: this.compositeLayer.georasters[0],
      segmentationMap: this.compositeSegmentationMap,
      segmentations: this.compositeSegmentations,
    };
  }

  setHierarchyLevel(level) {
    if (level >= 1 && level <= 4 && level !== this.hierarchyLevel) {
      this.hierarchyLevel = level;
      this.landUseColorCache.clear();
      if (this.compositeLayer?.redraw) {
        this.compositeLayer.redraw();
      }
      console.log(`Hierarchy level set to ${level}`);
    }
  }

  async generateComposite(segmentations, allLabels) {
    try {
      console.log("Generating composite raster with TensorFlow.js...");
      const startTime = performance.now();
      const result = await Compositor.generateCompositeRaster(
        segmentations,
        allLabels,
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
            this.convertCompositePixelToColor(values, allLabels),
          zIndex: 2000,
        }
      );
      this.layerGroup.addLayer(this.compositeLayer);
      this.compositeLayer.setOpacity(this.mapManager.currentOpacity);
      const endTime = performance.now();
      console.log(
        `✅ Composite generated in ${(endTime - startTime).toFixed(2)}ms`
      );
      return {
        compositeLayer: this.compositeLayer,
        segmentationMap: result.segmentationIds,
        segmentations: result.segmentations,
        georaster: compositeGeoRaster,
      };
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
      throw error;
    }
  }

  generateSyntheticOverlay(
    compositeGeoRaster,
    segmentationMap,
    segmentations,
    allLabels
  ) {
    if (!LandUseHierarchy.isLoaded()) {
      throw new Error("LandUseHierarchy not loaded");
    }
    try {
      console.log("Generating synthetic overlay...");
      const startTime = performance.now();
      const hierarchy = LandUseHierarchy.getInstance();
      const mapper = new LandUseMapper(
        hierarchy,
        compositeGeoRaster,
        segmentationMap,
        segmentations,
        allLabels,
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
        segmentationKey: SEGMENTATION_KEYS.COMPOSITE,
        filename: "synthetic_clusters.tif",
        georaster: {
          ...compositeGeoRaster,
          values: [landUseRasterData],
          numberOfRasters: 1,
        },
        bounds: compositeGeoRaster.bounds,
        stats: {
          clusters: Object.keys(pixelMapping).length,
          unlabeled_pixels: this.countUnlabeledPixels(landUseRasterData),
        },
        colorMapping: {
          method: "cluster_specific",
          colors_rgb: this.convertColorMappingToRgbArray(colorMapping),
          nodata_value: -1,
        },
        pixelMapping,
      };
      const endTime = performance.now();
      console.log(
        `✅ Synthetic overlay generated in ${(endTime - startTime).toFixed(2)}ms`
      );
      console.log(
        `Generated ${Object.keys(pixelMapping).length} land-use clusters`
      );
      return syntheticOverlay;
    } catch (error) {
      console.error("❌ Failed to generate synthetic overlay:", error);
      throw error;
    }
  }

  convertColorMappingToRgbArray(colorMapping) {
    const rgbArray = [];
    Object.entries(colorMapping).forEach(([id, hexColor]) => {
      const index = parseInt(id);
      if (hexColor === null) {
        rgbArray[index] = null;
      } else {
        const rgb = hexToRgb(hexColor);
        const rgbValues = rgb.split(",").map((v) => parseInt(v.trim()) / 255);
        rgbArray[index] = rgbValues;
      }
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

  async handleCompositeClick(
    latlng,
    compositeGeoRaster,
    segmentationMap,
    segmentations,
    allLabels,
    segmentationsData
  ) {
    if (!compositeGeoRaster) {
      console.log("No composite layer available for labeling");
      return null;
    }
    this.regionLabeler.updateCompositeData(
      compositeGeoRaster,
      segmentationMap,
      segmentations,
      allLabels,
      segmentationsData
    );
    const pixelCoord = this.regionLabeler.latlngToPixelCoord(latlng);
    if (!pixelCoord) {
      console.log("Click outside composite bounds");
      return null;
    }
    const isUnlabeled = this.regionLabeler.isPixelUnlabeled(pixelCoord);
    if (!isUnlabeled) {
      console.log("Pixel is already labeled");
      return null;
    }
    const contiguousRegion =
      this.regionLabeler.findContiguousRegion(pixelCoord);
    if (contiguousRegion.length === 0) {
      console.log("No contiguous region found");
      return null;
    }
    const overlaps = this.regionLabeler.checkForOverlaps(contiguousRegion);
    if (overlaps.size > 0) {
      const choice = await this.showOverlapDialog(
        overlaps,
        contiguousRegion.length
      );
      if (!choice) {
        this.clearRegionHighlight();
        return null;
      }
      if (choice.action === "merge") {
        return this.handleMergeWithExisting(contiguousRegion, choice.clusterId);
      }
    }
    console.log(
      `Found contiguous region with ${contiguousRegion.length} pixels`
    );
    this.highlightRegion(contiguousRegion);
    return {
      action: "create_new",
      region: contiguousRegion,
      latlng,
    };
  }

  labelRegion(region, landUsePath) {
    const syntheticId = this.regionLabeler.labelRegion(region, landUsePath);
    console.log(
      `Created synthetic cluster ${syntheticId} with ${region.length} pixels`
    );
    if (this.compositeLayer && this.compositeLayer.redraw) {
      this.compositeLayer.redraw();
    }
    this.clearRegionHighlight();
    this.showBriefMessage(
      `Created synthetic cluster ${syntheticId}. Switch to SEGMENTATION_KEYS.COMPOSITE to label it.`
    );

    return syntheticId;
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
    this.clearRegionHighlight();
    return {
      action: "merged",
      clusterId: existingClusterId,
      pixelCount: region.length,
    };
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

  convertCompositePixelToColor(values, allLabels) {
    if (!values || values.length === 0 || values[0] === 0) {
      return null;
    }
    const clusterId = values[0];
    for (const [segKey, labels] of allLabels) {
      if (labels.has(clusterId)) {
        const landUseLabel = labels.get(clusterId);
        if (landUseLabel && landUseLabel !== "unlabeled") {
          return this.resolveLandUseColor(landUseLabel);
        }
      }
    }
    return "rgb(255, 255, 0)";
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
  }

  getRules() {
    return { ...this.rules };
  }

  getHierarchyLevel() {
    return this.hierarchyLevel;
  }

  getStats() {
    return {
      isVisible: this.mapManager.map.hasLayer(this.layerGroup),
      hierarchyLevel: this.hierarchyLevel,
      rules: this.rules,
    };
  }

  destroy() {
    this.clearRegionHighlight();
    if (this.compositeLayer) {
      this.layerGroup.removeLayer(this.compositeLayer);
    }
    this.compositeLayer = null;
    this.landUseColorCache.clear();
    this.regionLabeler = null;
    console.log("CompositeViewer destroyed");
  }
}

export { CompositeViewer };
