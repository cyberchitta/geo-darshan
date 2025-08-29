class DataLoader {
  constructor() {
    this.listeners = {};
    this.loadedOverlays = new Map();
    this.colorMapping = null; // Store the color mapping from manifest
    console.log("DataLoader initialized");
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

  async loadFromManifest(manifestFile) {
    try {
      console.log("Loading manifest:", manifestFile.name);

      // Parse manifest
      const manifestText = await this.readFileAsText(manifestFile);
      const manifest = JSON.parse(manifestText);

      this.validateManifest(manifest);
      console.log("Manifest validated:", manifest);

      // Load GeoTIFF files
      const overlays = await this.loadGeoTiffs(manifest);

      this.emit("loadComplete", manifest, overlays);
    } catch (error) {
      console.error("Failed to load from manifest:", error);
      this.emit("loadError", error);
    }
  }

  async loadFromFolder(files) {
    try {
      // Find manifest file
      const manifestFile = Array.from(files).find(
        (f) => f.name === "manifest.json"
      );
      if (!manifestFile) {
        throw new Error("manifest.json not found in selected files");
      }

      // Parse manifest
      const manifestText = await this.readFileAsText(manifestFile);
      const manifest = JSON.parse(manifestText);

      this.validateManifest(manifest);

      // Map GeoTIFF files by name
      const fileMap = new Map();
      Array.from(files).forEach((file) => {
        if (file.name.endsWith(".tif") || file.name.endsWith(".tiff")) {
          fileMap.set(file.name, file);
        }
      });

      // Load GeoTIFF overlays
      const overlays = await this.loadGeoTiffsFromFiles(manifest, fileMap);

      this.emit("loadComplete", manifest, overlays);
    } catch (error) {
      console.error("Failed to load from folder:", error);
      this.emit("loadError", error);
    }
  }

  validateManifest(manifest) {
    const required = ["k_values", "files", "metadata"];
    for (const field of required) {
      if (!manifest[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (!Array.isArray(manifest.k_values) || manifest.k_values.length === 0) {
      throw new Error("k_values must be a non-empty array");
    }

    if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
      throw new Error("files must be a non-empty array");
    }

    if (manifest.k_values.length !== manifest.files.length) {
      throw new Error("k_values and files arrays must have same length");
    }

    if (!manifest.metadata.bounds || !Array.isArray(manifest.metadata.bounds)) {
      throw new Error(
        "metadata.bounds must be an array [minx, miny, maxx, maxy]"
      );
    }

    // Validate bounds format - should be 4 numbers
    if (manifest.metadata.bounds.length !== 4) {
      throw new Error(
        "metadata.bounds must have exactly 4 values [minx, miny, maxx, maxy]"
      );
    }

    // Optional validation for additional fields
    if (manifest.processing_stats) {
      if (!Array.isArray(manifest.processing_stats)) {
        throw new Error("processing_stats must be an array");
      }

      // Verify processing_stats matches k_values
      if (manifest.processing_stats.length !== manifest.k_values.length) {
        console.warn("processing_stats length does not match k_values length");
      }
    }

    // Validate color_mapping if present
    if (manifest.color_mapping) {
      if (
        !manifest.color_mapping.colors_rgb ||
        !Array.isArray(manifest.color_mapping.colors_rgb)
      ) {
        throw new Error("color_mapping.colors_rgb must be an array");
      }

      console.log(`✅ Color mapping found: ${manifest.color_mapping.method}`);
      console.log(
        `Colors: ${manifest.color_mapping.colors_rgb.length} defined`
      );

      if (manifest.color_mapping.explained_variance) {
        const totalVariance = manifest.color_mapping.explained_variance.reduce(
          (a, b) => a + b,
          0
        );
        console.log(`PCA explained variance: ${totalVariance.toFixed(2)}%`);
      }
    }

    console.log("✅ Manifest validation passed");
    console.log(
      `Found ${manifest.k_values.length} k-values: ${manifest.k_values.join(
        ", "
      )}`
    );
    console.log(
      `Bounds: ${manifest.metadata.bounds.map((b) => b.toFixed(6)).join(", ")}`
    );
    console.log(`Shape: ${manifest.metadata.shape.join(" × ")}`);

    if (manifest.processing_stats) {
      const totalSize = manifest.processing_stats.reduce(
        (sum, stat) => sum + stat.file_size_mb,
        0
      );
      console.log(`Total data size: ${totalSize.toFixed(2)} MB`);
    }
  }

  async loadGeoTiffs(manifest) {
    // Store color mapping for use in color conversion
    this.colorMapping = manifest.color_mapping;

    const overlays = [];
    const total = manifest.files.length;

    console.log(`Loading ${total} GeoTIFF files...`);

    for (let i = 0; i < manifest.files.length; i++) {
      const filename = manifest.files[i];
      const kValue = manifest.k_values[i];
      const stats = manifest.processing_stats
        ? manifest.processing_stats[i]
        : null;

      try {
        console.log(
          `Loading ${filename} (k=${kValue}, ${stats?.file_size_mb.toFixed(
            2
          )}MB)...`
        );

        // For now, create placeholder overlay with proper colors
        // TODO: Replace with actual GeoTIFF loading when files are available
        const overlay = await this.createPlaceholderOverlay(
          filename,
          kValue,
          manifest.metadata
        );

        overlays.push({
          kValue,
          filename,
          overlay,
          bounds: manifest.metadata.bounds,
          stats,
        });

        this.emit("loadProgress", i + 1, total);
      } catch (error) {
        console.error(`Failed to load ${filename}:`, error);
        // Continue with other files, but log error
      }
    }

    console.log(`✅ Loaded ${overlays.length}/${total} overlays`);
    return overlays;
  }

  async loadGeoTiffsFromFiles(manifest, fileMap) {
    // Store color mapping for use in color conversion
    this.colorMapping = manifest.color_mapping;

    const overlays = [];
    const total = manifest.files.length;

    console.log(`Loading ${total} GeoTIFF files from selected files...`);

    for (let i = 0; i < manifest.files.length; i++) {
      const filename = manifest.files[i];
      const kValue = manifest.k_values[i];
      const stats = manifest.processing_stats
        ? manifest.processing_stats[i]
        : null;
      const file = fileMap.get(filename);

      if (!file) {
        console.warn(`File not found: ${filename}`);
        // Create placeholder instead of skipping
        const overlay = await this.createPlaceholderOverlay(
          filename,
          kValue,
          manifest.metadata
        );
        overlays.push({
          kValue,
          filename,
          overlay,
          bounds: manifest.metadata.bounds,
          stats,
          placeholder: true,
        });
        continue;
      }

      try {
        console.log(
          `Loading ${filename} (k=${kValue}, ${stats?.file_size_mb.toFixed(
            2
          )}MB)...`
        );

        const overlay = await this.loadGeoTiffFromFile(
          file,
          kValue,
          manifest.metadata
        );

        overlays.push({
          kValue,
          filename,
          overlay,
          bounds: manifest.metadata.bounds,
          stats,
        });

        this.emit("loadProgress", i + 1, total);
      } catch (error) {
        console.error(`Failed to load ${filename}:`, error);
        // Create placeholder on error
        const overlay = await this.createPlaceholderOverlay(
          filename,
          kValue,
          manifest.metadata
        );
        overlays.push({
          kValue,
          filename,
          overlay,
          bounds: manifest.metadata.bounds,
          stats,
          placeholder: true,
          error: error.message,
        });
      }
    }

    console.log(`✅ Loaded ${overlays.length}/${total} overlays`);
    return overlays;
  }

  async loadGeoTiffFromFile(file, kValue, metadata) {
    try {
      // Read file as ArrayBuffer
      const arrayBuffer = await this.readFileAsArrayBuffer(file);

      // Parse with GeoTIFF.js
      const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
      const image = await tiff.getImage();

      // Get image data
      const rasters = await image.readRasters();
      const { width, height } = image;

      // Create image data for canvas rendering
      const imageData = this.createImageDataFromRasters(rasters, width, height);

      // Get geographic bounds from GeoTIFF
      const bbox = image.getBoundingBox();
      const bounds = [
        [bbox[1], bbox[0]],
        [bbox[3], bbox[2]],
      ]; // Convert to Leaflet format

      return {
        imageData,
        bounds,
        width,
        height,
        kValue,
      };
    } catch (error) {
      console.error(`Error processing GeoTIFF ${file.name}:`, error);
      // Fallback to placeholder
      return this.createPlaceholderOverlay(file.name, kValue, metadata);
    }
  }

  createImageDataFromRasters(rasters, width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(width, height);

    // Handle different raster formats
    if (rasters.length >= 3) {
      // RGB data
      const [r, g, b] = rasters;
      for (let i = 0; i < width * height; i++) {
        const pixelIndex = i * 4;
        imageData.data[pixelIndex] = r[i] || 0; // R
        imageData.data[pixelIndex + 1] = g[i] || 0; // G
        imageData.data[pixelIndex + 2] = b[i] || 0; // B
        imageData.data[pixelIndex + 3] = 255; // A
      }
    } else if (rasters.length === 1) {
      // Single band - treat as grayscale or indexed
      const band = rasters[0];
      for (let i = 0; i < width * height; i++) {
        const pixelIndex = i * 4;
        const value = band[i] || 0;

        // Use color mapping for cluster visualization
        const color = this.mapClusterValueToColor(value);
        imageData.data[pixelIndex] = color.r;
        imageData.data[pixelIndex + 1] = color.g;
        imageData.data[pixelIndex + 2] = color.b;
        imageData.data[pixelIndex + 3] = color.a;
      }
    }

    return imageData;
  }

  mapClusterValueToColor(clusterValue) {
    // Use predefined colors from manifest if available
    if (this.colorMapping && this.colorMapping.colors_rgb) {
      const colors = this.colorMapping.colors_rgb;

      if (clusterValue === 0) {
        return { r: 0, g: 0, b: 0, a: 0 }; // Transparent for no-data
      }

      // Map cluster value to color index (1-based to skip no-data)
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

    // Fallback to generated colors if mapping not available
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

  async createPlaceholderOverlay(filename, kValue, metadata) {
    console.log(`Creating placeholder for ${filename} (k=${kValue})`);

    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");

    // Use color mapping if available
    let fillColor;
    if (
      this.colorMapping &&
      this.colorMapping.colors_rgb &&
      this.colorMapping.colors_rgb.length > 0
    ) {
      const colorIndex = (kValue - 1) % this.colorMapping.colors_rgb.length;
      const color = this.colorMapping.colors_rgb[colorIndex];
      if (color && color.length >= 3) {
        fillColor = `rgb(${Math.round(color[0] * 255)}, ${Math.round(
          color[1] * 255
        )}, ${Math.round(color[2] * 255)})`;
      } else {
        fillColor = `hsl(${(kValue * 30) % 360}, 70%, 50%)`;
      }
    } else {
      // Fallback to hue-based colors
      const hue = (kValue * 30) % 360;
      fillColor = `hsl(${hue}, 70%, 50%)`;
    }

    ctx.fillStyle = fillColor;
    ctx.fillRect(0, 0, 256, 256);

    // Add text label with good contrast
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 200, 256, 56);
    ctx.fillStyle = "white";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`K=${kValue}`, 128, 225);
    ctx.font = "12px Arial";
    ctx.fillText(`${this.colorMapping?.method || "Generated"}`, 128, 245);

    const imageData = ctx.getImageData(0, 0, 256, 256);

    return {
      imageData,
      bounds: [
        [metadata.bounds[1], metadata.bounds[0]],
        [metadata.bounds[3], metadata.bounds[2]],
      ],
      width: 256,
      height: 256,
      kValue,
    };
  }

  // Utility methods
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
