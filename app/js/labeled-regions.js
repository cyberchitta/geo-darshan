class LabeledRegionsLayer {
  constructor(hierarchyData, mapManager) {
    this.hierarchyData = hierarchyData;
    this.mapManager = mapManager;
    this.layerGroup = L.layerGroup();
    this.labeledRegions = new Map(); // clusterId -> {kValue, landUsePath, geometry}
    this.isVisible = false;
    this.opacity = 0.7;
    this.strokeStyles = {
      low: { weight: 1, dashArray: "5,5", opacity: 0.7 },
      medium: { weight: 2, dashArray: "3,3", opacity: 0.8 },
      high: { weight: 3, dashArray: null, opacity: 0.9 },
    };
  }

  updateLabels(clusterLabels, currentSegmentationKey) {
    const kValue = this.extractKValue(currentSegmentationKey);
    Object.entries(clusterLabels).forEach(([clusterId, landUsePath]) => {
      if (landUsePath !== "unlabeled") {
        this.labeledRegions.set(parseInt(clusterId), {
          kValue,
          landUsePath,
          segmentationKey: currentSegmentationKey,
        });
      } else {
        this.labeledRegions.delete(parseInt(clusterId));
      }
    });
    if (this.isVisible) {
      this.render();
    }
  }

  render() {
    this.layerGroup.clearLayers();
    const regionsByK = new Map();
    this.labeledRegions.forEach((region, clusterId) => {
      if (!regionsByK.has(region.kValue)) {
        regionsByK.set(region.kValue, []);
      }
      regionsByK.get(region.kValue).push({ clusterId, ...region });
    });
    const sortedKValues = Array.from(regionsByK.keys()).sort((a, b) => a - b);
    sortedKValues.forEach((kValue) => {
      const regions = regionsByK.get(kValue);
      regions.forEach((region) => {
        this.renderRegion(region, kValue);
      });
    });
  }

  async renderRegion(region, kValue) {
    try {
      const geometry = await this.getClusterGeometry(
        region.clusterId,
        region.segmentationKey
      );
      if (geometry) {
        const fillColor = this.getColorForLandUse(region.landUsePath);
        const strokeStyle = this.getStrokeStyleForK(kValue);
        const layer = L.geoJSON(geometry, {
          style: {
            fillColor,
            fillOpacity: this.opacity,
            color: strokeStyle.color || "#000",
            weight: strokeStyle.weight,
            dashArray: strokeStyle.dashArray,
            opacity: strokeStyle.opacity,
          },
        });
        layer.bindPopup(`
          <strong>Cluster ${region.clusterId}</strong><br>
          Land Use: ${this.getDisplayPathForLandUse(region.landUsePath)}<br>
          K-value: ${kValue}
        `);
        this.layerGroup.addLayer(layer);
      }
    } catch (error) {
      console.error(`Failed to render region ${region.clusterId}:`, error);
    }
  }

  getColorForLandUse(landUsePath) {
    const pathParts = landUsePath.split(".");
    let current = this.hierarchyData;
    for (const part of pathParts) {
      if (current[part]) {
        current = current[part];
        if (current._color) {
          return current._color;
        }
      } else {
        break;
      }
    }
    return this.findParentColor(pathParts) || "#808080";
  }

  findParentColor(pathParts) {
    let current = this.hierarchyData;
    let lastColor = null;
    for (const part of pathParts) {
      if (current[part]) {
        current = current[part];
        if (current._color) {
          lastColor = current._color;
        }
      } else {
        break;
      }
    }
    return lastColor;
  }

  getStrokeStyleForK(kValue) {
    if (kValue <= 15) return this.strokeStyles.low;
    if (kValue <= 35) return this.strokeStyles.medium;
    return this.strokeStyles.high;
  }

  async getClusterGeometry(clusterId, segmentationKey) {
    // TODO: Extract cluster boundaries from raster data
    // For now, return placeholder geometry
    return {
      type: "Polygon",
      coordinates: [
        [
          [79.8, 12.0],
          [79.81, 12.0],
          [79.81, 12.01],
          [79.8, 12.01],
          [79.8, 12.0],
        ],
      ],
    };
  }

  setVisible(visible) {
    this.isVisible = visible;
    if (visible) {
      this.mapManager.map.addLayer(this.layerGroup);
      this.render();
    } else {
      this.mapManager.map.removeLayer(this.layerGroup);
    }
  }

  setOpacity(opacity) {
    this.opacity = Math.max(0, Math.min(1, opacity));
    if (this.isVisible) {
      this.render();
    }
  }

  extractKValue(segmentationKey) {
    const match = segmentationKey.match(/k(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  getDisplayPathForLandUse(landUsePath) {
    return landUsePath.split(".").join(" > ");
  }
}

export { LabeledRegionsLayer };
