import { RasterDataHandler } from "./raster-handler.js";

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
      const manifestText = await this.readFileAsText(manifestFile);
      const manifest = JSON.parse(manifestText);
      this.validateManifest(manifest);
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
      const kValue = manifest.k_values[i];
      const stats = manifest.processing_stats
        ? manifest.processing_stats[i]
        : null;
      const file = fileMap.get(filename);
      if (!file) {
        throw new Error(`Required file not found: ${filename}`);
      }
      try {
        console.log(
          `Loading ${filename} (k=${kValue}, ${stats?.file_size_mb.toFixed(
            2
          )}MB)...`
        );
        const georaster = await this.loadGeoRasterFromFile(file);
        overlays.push({
          kValue,
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
      const rasterData = await this.rasterHandler.parseGeoTIFF(arrayBuffer);
      console.log("Raster parsed:", {
        width: rasterData.width,
        height: rasterData.height,
        bands: rasterData.numberOfRasters,
        bounds: rasterData.bounds,
      });
      return rasterData;
    } catch (error) {
      console.error(`Error processing GeoTIFF ${file.name}:`, error);
      throw new Error(
        `GeoTIFF processing failed for ${file.name}: ${error.message}`
      );
    }
  }

  pixelValuesToColorFn(values, kValue) {
    if (!values || values.some((v) => v === null || v === undefined)) {
      return null;
    }
    if (values.length === 1) {
      const clusterValue = values[0];
      const color = this.mapClusterValueToColor(clusterValue);
      return `rgba(${color.r},${color.g},${color.b},${color.a / 255})`;
    }
    if (values.length >= 3) {
      return `rgb(${Math.round(values[0])},${Math.round(
        values[1]
      )},${Math.round(values[2])})`;
    }
    return null;
  }

  mapClusterValueToColor(clusterValue) {
    if (this.colorMapping && this.colorMapping.colors_rgb) {
      const colors = this.colorMapping.colors_rgb;
      if (clusterValue === 0) {
        return { r: 0, g: 0, b: 0, a: 0 };
      }
      const colorIndex = (clusterValue - 1) % colors.length;
      const color = colors[colorIndex];
      if (color && color.length >= 3) {
        return {
          r: Math.round(color[0] * 255),
          g: Math.round(color[1] * 255),
          b: Math.round(color[2] * 255),
          a: 255,
        };
      }
    }
    if (clusterValue === 0) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    const hue = (clusterValue * 137.508) % 360;
    const saturation = 70 + (clusterValue % 3) * 10;
    const lightness = 50 + (clusterValue % 2) * 20;
    return this.hslToRgb(hue, saturation, lightness);
  }

  hslToRgb(h, s, l) {
    h /= 360;
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + h * 12) % 12;
      return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    };
    return {
      r: Math.round(f(0) * 255),
      g: Math.round(f(8) * 255),
      b: Math.round(f(4) * 255),
      a: 255,
    };
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
