import { LandUseHierarchy } from "./land-use-hierarchy.js";

class ExportUtility {
  constructor(labeledLayer, dataLoader) {
    this.labeledLayer = labeledLayer;
    this.dataLoader = dataLoader;
  }

  async exportLandCoverFiles() {
    try {
      console.log("Starting land cover export...");
      const pixelMapping = this.generatePixelMapping();
      const colorMapping = this.generateColorMapping();
      const geotiffBlob = await this.generateCompositeGeotiff();
      await this.downloadAsZip(pixelMapping, colorMapping, geotiffBlob);
      console.log("✅ Land cover export complete");
    } catch (error) {
      console.error("Export failed:", error);
      throw error;
    }
  }

  generatePixelMapping() {
    const pixelMapping = {};
    const landCoverToId = new Map();
    let nextId = 0;
    const uniqueLandCovers = new Set();
    for (const [segmentationKey, labels] of this.labeledLayer.allLabels) {
      for (const [clusterId, landUsePath] of labels) {
        if (landUsePath && landUsePath !== "unlabeled") {
          uniqueLandCovers.add(landUsePath);
        }
      }
    }
    Array.from(uniqueLandCovers)
      .sort()
      .forEach((landCover) => {
        landCoverToId.set(landCover, nextId);
        pixelMapping[nextId.toString()] = landCover;
        nextId++;
      });
    this.landCoverToPixelId = landCoverToId;
    this.maxLandCoverId = nextId - 1;
    return pixelMapping;
  }

  generateColorMapping() {
    if (!LandUseHierarchy.isLoaded()) {
      throw new Error("Land use hierarchy not loaded");
    }
    const hierarchy = LandUseHierarchy.getInstance();
    return hierarchy.colors;
  }

  async generateCompositeGeotiff() {
    if (
      !this.labeledLayer.compositeLayer ||
      !this.labeledLayer.compositeLayer.georasters
    ) {
      throw new Error(
        "No composite layer available. Please ensure labeled regions are visible."
      );
    }
    console.log("Extracting composite geotiff data...");
    const georaster = this.labeledLayer.compositeLayer.georasters[0];
    const data = georaster.values[0];
    const tiffArrayBuffer = await this.createGeoTiffWithLibrary(
      data,
      georaster
    );
    return new Blob([tiffArrayBuffer], { type: "image/tiff" });
  }

  validateProjectionMetadata(georaster) {
    const projectionMetadata = georaster._projectionMetadata;
    const sourceGeoKeys = projectionMetadata?.geoKeys;
    const checks = [
      {
        condition: !projectionMetadata,
        message: "missing projection metadata",
      },
      {
        condition: !sourceGeoKeys,
        message: "missing geoKeys",
      },
      {
        condition:
          !projectionMetadata?.modelPixelScale ||
          projectionMetadata.modelPixelScale.length < 3,
        message: "invalid ModelPixelScale",
      },
      {
        condition:
          !projectionMetadata?.modelTiepoint ||
          projectionMetadata.modelTiepoint.length < 6,
        message: "invalid ModelTiepoint",
      },
      {
        condition: sourceGeoKeys?.GeographicTypeGeoKey !== 4326,
        message: `not WGS84 (got ${sourceGeoKeys?.GeographicTypeGeoKey})`,
      },
      {
        condition: sourceGeoKeys?.GTModelTypeGeoKey !== 2,
        message: `not geographic model (got ${sourceGeoKeys?.GTModelTypeGeoKey})`,
      },
      {
        condition: sourceGeoKeys?.GTRasterTypeGeoKey !== 1,
        message: `not pixel area (got ${sourceGeoKeys?.GTRasterTypeGeoKey})`,
      },
    ];
    return checks
      .filter((check) => check.condition)
      .map((check) => check.message);
  }

  throwValidationError(issues) {
    if (issues.length > 0) {
      throw new Error(`Invalid source raster: ${issues.join(", ")}`);
    }
  }

  async createGeoTiffWithLibrary(data, georaster) {
    const useInt8 = this.maxLandCoverId < 127;
    const TypedArray = useInt8 ? Int8Array : Int16Array;
    const bitsPerSample = useInt8 ? 8 : 16;
    console.log(
      `Using ${useInt8 ? "int8" : "int16"} for ${
        this.maxLandCoverId + 1
      } land cover classes`
    );
    const validationIssues = this.validateProjectionMetadata(georaster);
    this.throwValidationError(validationIssues);
    console.log("✅ Validated WGS84 geographic raster");
    const projectionMetadata = georaster._projectionMetadata;
    const sourceGeoKeys = projectionMetadata.geoKeys;
    const landCoverData = new TypedArray(georaster.width * georaster.height);
    let index = 0;
    let unlabeledCount = 0;
    for (let y = 0; y < georaster.height; y++) {
      for (let x = 0; x < georaster.width; x++) {
        const clusterId = Array.isArray(data[y]) ? data[y][x] : null;
        let landCoverId = -1;
        if (clusterId !== null && clusterId !== undefined) {
          const segmentationIndex =
            this.labeledLayer.compositeSegmentationMap[y][x];
          const segmentationKey =
            this.labeledLayer.compositeSegmentations[segmentationIndex];
          const labels = this.labeledLayer.allLabels.get(segmentationKey);
          if (labels && labels.has(clusterId)) {
            const landCover = labels.get(clusterId);
            if (landCover && landCover !== "unlabeled") {
              landCoverId = this.landCoverToPixelId.get(landCover);
              if (landCoverId === undefined) landCoverId = -1;
            } else {
              unlabeledCount++;
            }
          } else {
            unlabeledCount++;
          }
        }
        landCoverData[index++] = landCoverId;
      }
    }
    if (unlabeledCount > 0) {
      console.warn(
        `⚠️ Found ${unlabeledCount} unlabeled pixels (will be stored as -1)`
      );
    }
    const metadata = {
      height: georaster.height,
      width: georaster.width,
      samplesPerPixel: 1,
      bitsPerSample: [bitsPerSample],
      sampleFormat: [2],
      photometricInterpretation: 1,
      planarConfiguration: 1,
      GTModelTypeGeoKey: sourceGeoKeys.GTModelTypeGeoKey,
      GTRasterTypeGeoKey: sourceGeoKeys.GTRasterTypeGeoKey,
      GeographicTypeGeoKey: sourceGeoKeys.GeographicTypeGeoKey,
      ModelPixelScale: projectionMetadata.modelPixelScale,
      ModelTiepoint: projectionMetadata.modelTiepoint,
      software: "geo-darshan",
    };
    const arrayBuffer = await GeoTIFF.writeArrayBuffer(landCoverData, metadata);
    const sizeMB = (arrayBuffer.byteLength / 1024 / 1024).toFixed(2);
    console.log(`✅ Generated GeoTIFF: ${sizeMB}MB`);
    return arrayBuffer;
  }

  async downloadAsZip(pixelMapping, colorMapping, geotiffBlob) {
    const files = [
      {
        name: "pixel-mapping.json",
        content: JSON.stringify(pixelMapping, null, 2),
      },
      {
        name: "land-cover-colors.json",
        content: JSON.stringify(colorMapping, null, 2),
      },
      {
        name: "land-cover.tif",
        blob: geotiffBlob,
      },
    ];
    files.forEach((file, index) => {
      setTimeout(() => {
        let blob;
        if (file.blob) {
          blob = file.blob;
        } else {
          blob = new Blob([file.content], { type: "application/json" });
        }
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = file.name;
        link.click();
        URL.revokeObjectURL(link.href);
      }, index * 500);
    });
    console.log("✅ Files downloaded individually");
  }

  getExportStats() {
    const totalSegmentations = this.labeledLayer.overlayData.size;
    const labeledSegmentations = this.labeledLayer.allLabels.size;
    const totalLabels = Array.from(this.labeledLayer.allLabels.values()).reduce(
      (sum, labels) => sum + labels.size,
      0
    );
    return {
      totalSegmentations,
      labeledSegmentations,
      totalLabels,
      hasComposite: !!this.labeledLayer.compositeLayer,
    };
  }
}

export { ExportUtility };
