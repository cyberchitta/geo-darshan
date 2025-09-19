import { STORAGE_KEYS } from "./utils.js";
class DataIO {
  constructor(rasterHandler = null) {
    this.listeners = {};
    this.loadedOverlays = new Map();
    this.colorMapping = null;
    this.rasterHandler = rasterHandler;
    if (this.rasterHandler) {
      console.log(`DataIO initialized with ${this.rasterHandler.name}`);
    } else {
      console.log("DataIO initialized (waiting for raster handler injection)");
    }
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  emit(event, ...args) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((callback) => callback(...args));
    }
  }

  async loadFromFolder(files) {
    try {
      const manifestFile = Array.from(files).find(
        (f) => f.name === "manifest.json"
      );
      if (!manifestFile) {
        throw new Error("manifest.json not found in selected files");
      }
      const colorLegendFile = Array.from(files).find(
        (f) => f.name === "color_legend.json"
      );
      if (!colorLegendFile) {
        throw new Error("color_legend.json not found in selected files");
      }
      const manifestText = await this.readFileAsText(manifestFile);
      const manifest = JSON.parse(manifestText);
      const colorLegendText = await this.readFileAsText(colorLegendFile);
      const colorLegend = JSON.parse(colorLegendText);
      this.validateManifest(manifest);
      this.processColorLegend(colorLegend, manifest);
      const fileMap = new Map();
      Array.from(files).forEach((file) => {
        if (file.name.endsWith(".tif") || file.name.endsWith(".tiff")) {
          fileMap.set(file.name, file);
        }
      });
      const overlays = await this.loadGeoRastersFromFiles(manifest, fileMap);
      this.emit("loadComplete", manifest, overlays);
    } catch (error) {
      console.error("Failed to load from folder:", error);
      this.emit("loadError", error);
    }
  }

  processColorLegend(colorLegend, manifest) {
    this.colorMappings = new Map();
    manifest.segmentation_keys.forEach((segKey) => {
      if (colorLegend.segmentations[segKey]) {
        const clusters = colorLegend.segmentations[segKey].clusters;
        const colorArray = [];
        Object.entries(clusters).forEach(([clusterId, clusterData]) => {
          const index = parseInt(clusterId);
          colorArray[index] = clusterData.rgb_255.map((c) => c / 255);
        });
        this.colorMappings.set(segKey, {
          method: "cluster_specific",
          colors_rgb: colorArray,
          nodata_value: colorLegend.nodata_value || -1,
        });
      } else {
        console.warn(`No color mapping found for segmentation: ${segKey}`);
      }
    });
    console.log(
      `✅ Processed color mappings for ${this.colorMappings.size} segmentations`
    );
  }

  getColorMappingForSegmentation(segmentationKey) {
    return this.colorMappings.get(segmentationKey);
  }

  validateManifest(manifest) {
    const required = ["segmentation_keys", "files", "metadata"];
    for (const field of required) {
      if (!manifest[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    if (
      !Array.isArray(manifest.segmentation_keys) ||
      manifest.segmentation_keys.length === 0
    ) {
      throw new Error("segmentation_keys must be a non-empty array");
    }
    if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
      throw new Error("files must be a non-empty array");
    }
    if (manifest.segmentation_keys.length !== manifest.files.length) {
      throw new Error(
        "segmentation_keys and files arrays must have same length"
      );
    }
    const k_values = manifest.segmentation_keys
      .map((key) => {
        const match = key.match(/k(\d+)/);
        return match ? parseInt(match[1]) : null;
      })
      .filter((k) => k !== null)
      .sort((a, b) => a - b);
    manifest.k_values = k_values;
    if (manifest.metadata.bounds && Array.isArray(manifest.metadata.bounds)) {
      if (manifest.metadata.bounds.length !== 4) {
        throw new Error(
          "metadata.bounds must have exactly 4 values [minx, miny, maxx, maxy]"
        );
      }
    } else {
      throw new Error(
        "metadata.bounds must be an array [minx, miny, maxx, maxy]"
      );
    }
    if (manifest.color_mapping) {
      if (
        !manifest.color_mapping.colors_rgb ||
        !Array.isArray(manifest.color_mapping.colors_rgb)
      ) {
        throw new Error("color_mapping.colors_rgb must be an array");
      }
      console.log(`✅ Color mapping found: ${manifest.color_mapping.method}`);
      this.colorMapping = manifest.color_mapping;
    }
    console.log("✅ Manifest validation passed");
    console.log(
      `Found ${
        manifest.segmentation_keys.length
      } segmentations: ${manifest.segmentation_keys.join(", ")}`
    );
    console.log(
      `Bounds: ${manifest.metadata.bounds.map((b) => b.toFixed(6)).join(", ")}`
    );
  }

  async loadGeoRastersFromFiles(manifest, fileMap) {
    const overlays = [];
    const total = manifest.files.length;
    console.log(`Loading ${total} GeoTIFF files using georaster...`);
    for (let i = 0; i < manifest.files.length; i++) {
      const filename = manifest.files[i];
      const segmentationKey = manifest.segmentation_keys[i];
      const stats = manifest.processing_stats
        ? manifest.processing_stats[i]
        : null;
      const file = fileMap.get(filename);
      if (!file) {
        throw new Error(`Required file not found: ${filename}`);
      }
      try {
        console.log(
          `Loading ${filename} (${segmentationKey}, ${stats?.file_size_mb.toFixed(
            2
          )}MB)...`
        );
        const georaster = await this.loadGeoRasterFromFile(file);
        overlays.push({
          segmentationKey,
          filename,
          georaster,
          bounds: manifest.metadata.bounds,
          stats,
        });
        this.emit("loadProgress", i + 1, total);
      } catch (error) {
        console.error(`Failed to process GeoTIFF ${file.name}:`, error);
        throw new Error(
          `GeoTIFF processing failed for ${file.name}: ${error.message}`
        );
      }
    }
    console.log(`✅ Loaded ${overlays.length}/${total} overlays`);
    return overlays;
  }

  async loadGeoRasterFromFile(file) {
    try {
      const arrayBuffer = await this.readFileAsArrayBuffer(file);
      const georasterBuffer = arrayBuffer.slice(0);
      const rawTiffBuffer = arrayBuffer.slice(0);
      const georaster = await this.rasterHandler.parseGeoTIFF(georasterBuffer);
      const rawTiff = await GeoTIFF.fromArrayBuffer(rawTiffBuffer);
      const firstImage = await rawTiff.getImage();
      const geoKeys = firstImage.getGeoKeys();
      const fileDirectory = firstImage.getFileDirectory();
      georaster._projectionMetadata = {
        geoKeys: { ...geoKeys },
        modelPixelScale: fileDirectory.ModelPixelScale
          ? Array.from(fileDirectory.ModelPixelScale)
          : null,
        modelTiepoint: fileDirectory.ModelTiepoint
          ? Array.from(fileDirectory.ModelTiepoint)
          : null,
      };
      console.log(
        `✅ Preserved projection metadata for ${file.name}:`,
        georaster._projectionMetadata
      );
      return georaster;
    } catch (error) {
      console.error(`Error processing GeoTIFF ${file.name}:`, error);
      throw new Error(
        `GeoTIFF processing failed for ${file.name}: ${error.message}`
      );
    }
  }

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  }

  readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error("Failed to read file"));
      reader.readAsArrayBuffer(file);
    });
  }

  loadLabelsFromStorage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CLUSTER_LABELS);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.labels && Object.keys(data.labels).length > 0) {
          return data.labels;
        }
      }
      console.log("🔄 No saved labels found");
      return {};
    } catch (error) {
      console.warn("Failed to load saved labels:", error);
      return {};
    }
  }

  saveLabelsToStorage(labels) {
    try {
      localStorage.setItem(
        STORAGE_KEYS.CLUSTER_LABELS,
        JSON.stringify({
          labels,
          timestamp: new Date().toISOString(),
        })
      );
    } catch (error) {
      console.warn("Failed to save labels to localStorage:", error);
    }
  }

  exportLabelsToFile(labels) {
    const dataStr = JSON.stringify(labels, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(dataBlob);
    link.download = `cluster-labels-${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    console.log("✅ Labels exported to file:", labels);
  }

  async importLabelsFromFile(file) {
    try {
      const text = await file.text();
      const loadedLabels = JSON.parse(text);
      const isValidFormat = Object.entries(loadedLabels).every(
        ([segKey, labels]) => {
          return typeof labels === "object" && !Array.isArray(labels);
        }
      );
      if (!isValidFormat) {
        throw new Error("Invalid label file format");
      }
      return loadedLabels;
    } catch (error) {
      throw new Error(`Failed to load labels: ${error.message}`);
    }
  }

  async exportLandCoverFiles(labeledLayer) {
    try {
      console.log("Starting land cover export...");
      if (!window.LandUseHierarchy?.isLoaded()) {
        throw new Error("Land use hierarchy not loaded");
      }
      const hierarchy = window.LandUseHierarchy.getInstance();
      const hierarchyLevel = labeledLayer.getHierarchyLevel();
      const { LandUseMapper } = await import("./land-use.js");
      const mapper = new LandUseMapper(
        hierarchy,
        labeledLayer.compositeLayer.georasters[0],
        labeledLayer.compositeSegmentationMap,
        labeledLayer.compositeSegmentations,
        labeledLayer.allLabels,
        hierarchyLevel
      );
      const pixelMapping = mapper.generatePixelMapping();
      const colorMapping = LandUseMapper.createColorMapping(
        pixelMapping,
        hierarchy,
        hierarchyLevel
      );
      const geotiffBlob = await this.generateCompositeGeotiff(mapper);
      await this.downloadLandCoverFiles(
        pixelMapping,
        colorMapping,
        geotiffBlob
      );
      console.log("✅ Land cover export complete");
    } catch (error) {
      console.error("Export failed:", error);
      throw error;
    }
  }

  async generateCompositeGeotiff(mapper) {
    if (!mapper || !mapper.compositeData) {
      throw new Error(
        "No composite layer available. Please ensure labeled regions are visible."
      );
    }
    console.log("Extracting composite geotiff data...");
    const georaster = mapper.compositeData;
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

  async downloadLandCoverFiles(pixelMapping, colorMapping, geotiffBlob) {
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
}

export { DataIO };
