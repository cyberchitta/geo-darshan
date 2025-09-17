import { LandUseHierarchy, LandUseMapper } from "./land-use.js";

class ExportUtility {
  constructor(labeledLayer, dataLoader) {
    this.labeledLayer = labeledLayer;
    this.dataLoader = dataLoader;
  }

  async exportLandCoverFiles() {
    try {
      console.log("Starting land cover export...");
      if (!LandUseHierarchy.isLoaded()) {
        throw new Error("Land use hierarchy not loaded");
      }
      const hierarchy = LandUseHierarchy.getInstance();
      const hierarchyLevel = this.labeledLayer.getHierarchyLevel();
      const mapper = new LandUseMapper(
        hierarchy,
        this.labeledLayer.compositeLayer.georasters[0],
        this.labeledLayer.compositeSegmentationMap,
        this.labeledLayer.compositeSegmentations,
        this.labeledLayer.allLabels,
        hierarchyLevel
      );
      const pixelMapping = mapper.generatePixelMapping();
      const colorMapping = LandUseMapper.createColorMapping(
        pixelMapping,
        hierarchy,
        hierarchyLevel
      );
      const geotiffBlob = await this.generateCompositeGeotiff(mapper);
      await this.downloadAsZip(pixelMapping, colorMapping, geotiffBlob);
      console.log("✅ Land cover export complete");
    } catch (error) {
      console.error("Export failed:", error);
      throw error;
    }
  }

  async generateCompositeGeotiff(mapper) {
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
    const landUseRasterData = mapper.createLandUseRaster();
    const tiffArrayBuffer = await this.createGeoTiffWithLibrary(
      landUseRasterData,
      georaster
    );
    return new Blob([tiffArrayBuffer], { type: "image/tiff" });
  }

  async createGeoTiffWithLibrary(landUseRasterData, georaster) {
    const maxLandCoverId = Math.max(
      ...landUseRasterData.flat().filter((id) => id >= 0)
    );
    const useInt8 = maxLandCoverId < 127;
    const TypedArray = useInt8 ? Int8Array : Int16Array;
    const bitsPerSample = useInt8 ? 8 : 16;
    console.log(
      `Using ${useInt8 ? "int8" : "int16"} for ${maxLandCoverId + 1} land cover classes`
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
        const landCoverId = landUseRasterData[y][x];
        if (landCoverId === -1) {
          unlabeledCount++;
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
