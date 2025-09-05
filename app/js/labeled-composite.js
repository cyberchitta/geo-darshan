import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-cpu";
import { extractKValue } from "./utils.js";

class LabeledCompositeLayer {
  constructor(mapManager, dataLoader) {
    this.mapManager = mapManager;
    this.dataLoader = dataLoader;
    this.allLabels = new Map();
    this.overlayData = new Map();
    this.compositeLayer = null;
    this.isVisible = false;
    this.opacity = 0.7;
    this.layerGroup = L.layerGroup();
    this.layerGroup.addTo(this.mapManager.map);
    this.mapManager.addOverlayLayer("Labeled Regions", this.layerGroup, false);
    this.rules = {
      priority: "highest_k",
      requireLabeled: true,
      fallbackToLower: true,
    };
    console.log("LabeledCompositeLayer initialized and registered with map");
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
    console.log(`Updated labels for ${this.allLabels.size} segmentations`);
    if (this.isVisible && this.overlayData.size > 0) {
      this.regenerateComposite();
    }
  }

  async regenerateComposite() {
    if (this.overlayData.size === 0) {
      console.warn("No overlay data available for composite generation");
      return;
    }
    try {
      console.log("Generating composite raster with TensorFlow.js...");
      const startTime = performance.now();
      const composite = await this.generateCompositeRaster();
      if (this.compositeLayer) {
        this.layerGroup.removeLayer(this.compositeLayer);
      }
      this.compositeLayer = this.mapManager.rasterHandler.createMapLayer(
        composite,
        {
          opacity: this.isVisible ? this.opacity : 0,
          pixelValuesToColorFn: (values) =>
            this.convertCompositePixelToColor(values),
          zIndex: 2000,
        }
      );
      this.layerGroup.addLayer(this.compositeLayer);
      setTimeout(() => {
        if (this.compositeLayer && this.isVisible) {
          this.compositeLayer.setOpacity(this.opacity);
        }
      }, 10);
      const endTime = performance.now();
      console.log(
        `✅ Composite generated in ${(endTime - startTime).toFixed(2)}ms`
      );
    } catch (error) {
      console.error("Failed to generate composite:", error);
    }
  }

  async generateCompositeRaster() {
    const segmentations = Array.from(this.overlayData.keys()).sort((a, b) =>
      this.compareSegmentationsByRule(a, b)
    );
    if (segmentations.length === 0) {
      throw new Error("No segmentations available");
    }
    const firstOverlay = this.overlayData.get(segmentations[0]);
    const refGeoRaster = firstOverlay.georaster;
    const height = refGeoRaster.height;
    const width = refGeoRaster.width;
    console.log(
      `Compositing ${segmentations.length} segmentations at ${width}x${height}`
    );
    let bestClusterIds = tf.zeros([height, width], "int32");
    let bestSegmentationIds = tf.zeros([height, width], "int32");
    let hasLabel = tf.zeros([height, width], "bool");
    for (let i = 0; i < segmentations.length; i++) {
      const segKey = segmentations[i];
      const overlay = this.overlayData.get(segKey);
      const labels = this.allLabels.get(segKey) || new Map();
      if (labels.size === 0) continue;
      const rasterData = overlay.georaster.values[0];
      const regularArray = Array.from(rasterData, (row) => Array.from(row));
      const rasterTensor = tf.tensor2d(regularArray, [height, width], "int32");
      const labeledClusterIds = Array.from(labels.keys());
      let labelMask = tf.zeros([height, width], "bool");
      for (const clusterId of labeledClusterIds) {
        const clusterMask = tf.equal(rasterTensor, clusterId);
        labelMask = tf.logicalOr(labelMask, clusterMask);
        clusterMask.dispose();
      }
      const notHasLabel = tf.logicalNot(hasLabel);
      const shouldUpdate = tf.logicalAnd(labelMask, notHasLabel);
      bestClusterIds = tf.where(shouldUpdate, rasterTensor, bestClusterIds);
      bestSegmentationIds = tf.where(
        shouldUpdate,
        tf.fill([height, width], i),
        bestSegmentationIds
      );
      hasLabel = tf.logicalOr(hasLabel, labelMask);
      rasterTensor.dispose();
      labelMask.dispose();
      shouldUpdate.dispose();
      notHasLabel.dispose();
    }
    const compositeData = await bestClusterIds.array();
    const segmentationIds = await bestSegmentationIds.array();
    this.compositeSegmentationMap = segmentationIds;
    this.compositeSegmentations = segmentations;
   const compositeGeoRaster = {
      ...refGeoRaster,
      values: [compositeData],
      numberOfRasters: 1,
    };
    bestClusterIds.dispose();
    bestSegmentationIds.dispose();
    hasLabel.dispose();
    return compositeGeoRaster;
  }

  compareSegmentationsByRule(segKeyA, segKeyB) {
    const kA = extractKValue(segKeyA);
    const kB = extractKValue(segKeyB);
    switch (this.rules.priority) {
      case "highest_k":
        return kB - kA; // Higher K first
      case "lowest_k":
        return kA - kB; // Lower K first
      case "most_specific":
        return kB - kA; // Default to highest K
      default:
        return kB - kA;
    }
  }

  convertCompositePixelToColor(values) {
    if (!values || values.length === 0 || values[0] === 0) {
      return null;
    }
    const clusterId = values[0];

    // Find which segmentation this pixel came from
    // Note: This is simplified - in practice you'd need to pass pixel coordinates
    // to look up in compositeSegmentationMap

    // For now, use a fallback approach - try to find the cluster in any segmentation
    for (const [segKey, labels] of this.allLabels) {
      if (labels.has(clusterId)) {
        const colorMapping =
          this.dataLoader.getColorMappingForSegmentation(segKey);
        if (colorMapping) {
          return this.mapClusterValueToColor(clusterId, colorMapping);
        }
      }
    }
    return "rgba(128,128,128,0.8)";
  }

  mapClusterValueToColor(clusterValue, colorMapping) {
    if (!colorMapping || !colorMapping.colors_rgb) {
      return "rgba(128,128,128,0.8)";
    }
    const colors = colorMapping.colors_rgb;
    const color = colors[clusterValue];
    if (color && color.length >= 3) {
      const r = Math.round(color[0] * 255);
      const g = Math.round(color[1] * 255);
      const b = Math.round(color[2] * 255);
      return `rgba(${r},${g},${b},${this.opacity})`;
    }
    return "rgba(128,128,128,0.8)";
  }

  setVisible(visible) {
    this.isVisible = visible;
    if (this.compositeLayer) {
      if (visible) {
        this.compositeLayer.setOpacity(this.opacity);
      } else {
        this.compositeLayer.setOpacity(0);
      }
    }
    console.log(`Labeled composite layer ${visible ? "enabled" : "disabled"}`);
  }

  setOpacity(opacity) {
    this.opacity = Math.max(0, Math.min(1, opacity));
    if (this.compositeLayer && this.isVisible) {
      this.compositeLayer.setOpacity(this.opacity);
    }
    console.log(`Labeled composite opacity set to ${this.opacity}`);
  }

  setRules(newRules) {
    this.rules = { ...this.rules, ...newRules };
    console.log("Updated combination rules:", this.rules);
    if (this.isVisible && this.overlayData.size > 0) {
      this.regenerateComposite();
    }
  }

  getRules() {
    return { ...this.rules };
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
      isVisible: this.isVisible,
      opacity: this.opacity,
      rules: this.rules,
    };
  }

  destroy() {
    if (this.compositeLayer) {
      this.compositeLayer.setOpacity(0);
      this.layerGroup.removeLayer(this.compositeLayer);
    }
    this.layerGroup.clearLayers();
    this.compositeLayer = null;
    this.allLabels.clear();
    this.overlayData.clear();
    console.log("LabeledCompositeLayer destroyed");
  }
}

export { LabeledCompositeLayer };
