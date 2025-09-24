import {
  CLUSTER_ID_RANGES,
  convertToGrayscale,
  hexToRgb,
  rgbStringToObject,
  SEGMENTATION_KEYS,
} from "./utils.js";
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
    if (!this.compositeLayer) {
      return null;
    }
    return {
      georaster: this.compositeLayer.georasters[0],
    };
  }

  setHierarchyLevel(level) {
    if (level >= 1 && level <= 4 && level !== this.hierarchyLevel) {
      this.hierarchyLevel = level;
      this.landUseColorCache.clear();
      console.log(`Hierarchy level set to ${level}`);
    }
  }

  async generateComposite(
    segmentations,
    allLabels,
    fineGrainSegmentationKey,
    pixelToColorFn = null
  ) {
    try {
      console.log("Generating composite raster with TensorFlow.js...");
      const startTime = performance.now();
      const result = await Compositor.generateCompositeRaster(
        segmentations,
        allLabels,
        this.rules,
        fineGrainSegmentationKey
      );
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
          pixelValuesToColorFn: pixelToColorFn,
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
        clusterIdMapping: result.clusterIdMapping,
        georaster: compositeGeoRaster,
        highestKKey: result.highestKKey,
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

  mergeLandUseAndFineGrain(landUseRaster, compositeRaster) {
    const height = landUseRaster.length;
    const width = landUseRaster[0].length;
    const merged = new Array(height);
    for (let y = 0; y < height; y++) {
      merged[y] = new Array(width);
      for (let x = 0; x < width; x++) {
        const landUseValue = landUseRaster[y][x];
        const compositeValue = compositeRaster[y][x];
        merged[y][x] =
          landUseValue !== CLUSTER_ID_RANGES.UNLABELED
            ? landUseValue
            : compositeValue;
      }
    }
    return merged;
  }

  extractFineGrainClusters(compositeGeoRaster) {
    const clusters = new Set();
    const rasterData = compositeGeoRaster.values[0];
    for (let y = 0; y < rasterData.length; y++) {
      for (let x = 0; x < rasterData[y].length; x++) {
        const clusterId = rasterData[y][x];
        if (CLUSTER_ID_RANGES.isFineGrain(clusterId)) {
          clusters.add(clusterId);
        }
      }
    }
    return Array.from(clusters);
  }

  addFineGrainColors(colorMapping, fineGrainClusters, highestKKey) {
    const highestKColorMapping =
      this.dataLoader.getColorMappingForSegmentation(highestKKey);
    fineGrainClusters.forEach((clusterId) => {
      const originalClusterId = clusterId - CLUSTER_ID_RANGES.FINE_GRAIN_START;
      const color = highestKColorMapping.colors_rgb[originalClusterId];
      colorMapping[clusterId] = color;
    });
  }

  convertColorMappingToRgbArray(colorMapping) {
    const rgbArray = [];
    Object.entries(colorMapping).forEach(([id, color]) => {
      const index = parseInt(id);
      if (color === null) {
        rgbArray[index] = null;
      } else if (Array.isArray(color)) {
        rgbArray[index] = color;
      } else {
        const rgb = hexToRgb(color);
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
    allLabels,
    segmentationsData
  ) {
    if (!compositeGeoRaster) {
      console.log("No composite layer available for labeling");
      return null;
    }
    this.regionLabeler.updateCompositeData(
      compositeGeoRaster,
      segmentationsData.get(SEGMENTATION_KEYS.COMPOSITE),
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
    const suggestions =
      this.regionLabeler.analyzeNeighborhood(contiguousRegion);
    this.highlightRegion(contiguousRegion);
    return {
      action: "create_new",
      region: contiguousRegion,
      latlng,
      suggestions,
    };
  }

  labelRegion(region, landUsePath) {
    const syntheticId = this.regionLabeler.labelRegion(region, landUsePath);
    console.log(
      `Created synthetic cluster ${syntheticId} with ${region.length} pixels`
    );
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

  analyzeClusterNeighborhood(clusterId) {
    if (!this.regionLabeler) {
      return [];
    }
    return this.regionLabeler.analyzeClusterNeighborhood(clusterId);
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

  convertCompositePixelToColor(values, allLabels, fineGrainKey) {
    if (!values || values.length === 0 || values[0] === 0) {
      return null;
    }
    const clusterId = values[0];
    const compositeSegmentation = this.dataLoader.segmentations?.get(
      SEGMENTATION_KEYS.COMPOSITE
    );
    const cluster = compositeSegmentation.getCluster(clusterId);
    if (cluster.landUsePath === "unlabeled") {
      return cluster.color;
    } else {
      const truncatedPath = this.truncateToHierarchyLevel(cluster.landUsePath);
      return this.resolveLandUseColor(truncatedPath);
    }
  }

  truncateToHierarchyLevel(landUsePath) {
    if (!landUsePath || landUsePath === "unlabeled") {
      return landUsePath;
    }
    const pathParts = landUsePath.split(".");
    if (pathParts.length <= this.hierarchyLevel) {
      return landUsePath;
    }
    return pathParts.slice(0, this.hierarchyLevel).join(".");
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
