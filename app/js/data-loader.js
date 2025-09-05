class DataLoader {
  constructor(rasterHandler = null) {
    this.listeners = {};
    this.loadedOverlays = new Map();
    this.colorMapping = null;
    this.rasterHandler = rasterHandler;
    if (this.rasterHandler) {
      console.log(`DataLoader initialized with ${this.rasterHandler.name}`);
    } else {
      console.log(
        "DataLoader initialized (waiting for raster handler injection)"
      );
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
      return await this.rasterHandler.parseGeoTIFF(arrayBuffer);
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
}

export { DataLoader };
