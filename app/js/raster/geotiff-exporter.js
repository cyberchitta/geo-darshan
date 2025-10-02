import { Raster } from "./raster.js";

/**
 * Export rasters to GeoTIFF format with projection metadata.
 */
class GeoTIFFExporter {
  /**
   * Export raster to GeoTIFF ArrayBuffer.
   * @param {Raster} raster - Raster to export
   * @param {Object} projectionMetadata - Projection metadata from source georaster
   * @returns {Promise<ArrayBuffer>} GeoTIFF file data
   */
  static async export(raster, projectionMetadata) {
    this._validateProjectionMetadata(projectionMetadata);

    const values = raster.cloneValues();
    const maxValue = Math.max(...values.flat().filter((id) => id >= 0));
    const useInt8 = maxValue < 127;
    const TypedArray = useInt8 ? Int8Array : Int16Array;
    const bitsPerSample = useInt8 ? 8 : 16;

    console.log(
      `Using ${useInt8 ? "int8" : "int16"} for ${maxValue + 1} unique values`
    );

    // Flatten to 1D typed array
    const flatData = new TypedArray(raster.width * raster.height);
    let index = 0;
    let unlabeledCount = 0;

    for (let y = 0; y < raster.height; y++) {
      for (let x = 0; x < raster.width; x++) {
        const value = values[y][x];
        if (value === -1) {
          unlabeledCount++;
        }
        flatData[index++] = value;
      }
    }

    if (unlabeledCount > 0) {
      console.warn(
        `⚠️ Found ${unlabeledCount} unlabeled pixels (stored as -1)`
      );
    }

    const sourceGeoKeys = projectionMetadata.geoKeys;

    const metadata = {
      height: raster.height,
      width: raster.width,
      samplesPerPixel: 1,
      bitsPerSample: [bitsPerSample],
      sampleFormat: [2], // Signed integer
      photometricInterpretation: 1,
      planarConfiguration: 1,
      GTModelTypeGeoKey: sourceGeoKeys.GTModelTypeGeoKey,
      GTRasterTypeGeoKey: sourceGeoKeys.GTRasterTypeGeoKey,
      GeographicTypeGeoKey: sourceGeoKeys.GeographicTypeGeoKey,
      ModelPixelScale: projectionMetadata.modelPixelScale,
      ModelTiepoint: projectionMetadata.modelTiepoint,
      software: "geo-darshan",
    };

    const arrayBuffer = await GeoTIFF.writeArrayBuffer(flatData, metadata);
    const sizeMB = (arrayBuffer.byteLength / 1024 / 1024).toFixed(2);
    console.log(`✅ Generated GeoTIFF: ${sizeMB}MB`);

    return arrayBuffer;
  }

  /**
   * Validate projection metadata has required fields.
   * @private
   * @param {Object} projectionMetadata - Metadata to validate
   * @throws {Error} If metadata is invalid
   */
  static _validateProjectionMetadata(projectionMetadata) {
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

    const issues = checks
      .filter((check) => check.condition)
      .map((check) => check.message);

    if (issues.length > 0) {
      throw new Error(`Invalid source raster: ${issues.join(", ")}`);
    }

    console.log("✅ Validated WGS84 geographic raster");
  }

  /**
   * Create Blob from raster for download.
   * @param {Raster} raster - Raster to export
   * @param {Object} projectionMetadata - Projection metadata
   * @returns {Promise<Blob>} GeoTIFF blob
   */
  static async createBlob(raster, projectionMetadata) {
    const arrayBuffer = await this.export(raster, projectionMetadata);
    return new Blob([arrayBuffer], { type: "image/tiff" });
  }
}

export { GeoTIFFExporter };
