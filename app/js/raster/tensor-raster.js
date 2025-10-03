import { Raster } from "./raster.js";
import { CLUSTER_ID_RANGES } from "../utils.js";

/**
 * TensorFlow.js integration for efficient raster operations.
 * Provides GPU-accelerated pixel counting and analysis.
 */
class TensorRaster {
  /**
   * Count pixels for each unique value in raster.
   * @param {Raster} raster - Raster to analyze
   * @param {number} nodataValue - Value to exclude from counts
   * @returns {Promise<Map<number, number>>} Map of value to pixel count
   */
  static async countPixels(raster, nodataValue = CLUSTER_ID_RANGES.NODATA) {
    const values = raster.cloneValues();
    const flatData = values.flat();
    const tensor = tf.tensor1d(flatData, "int32");
    const nodataMask = tf.notEqual(tensor, nodataValue);
    const validPixels = tf.where(nodataMask, tensor, tf.scalar(-999, "int32"));
    const pixelData = await validPixels.data();
    const counts = new Map();
    for (let i = 0; i < pixelData.length; i++) {
      const value = pixelData[i];
      if (value !== -999 && value !== nodataValue) {
        counts.set(value, (counts.get(value) || 0) + 1);
      }
    }
    tensor.dispose();
    nodataMask.dispose();
    validPixels.dispose();
    return counts;
  }

  /**
   * Count pixels excluding specific values.
   * @param {Raster} raster - Raster to analyze
   * @param {number[]} excludeValues - Values to exclude from counts
   * @returns {Promise<Map<number, number>>} Map of value to pixel count
   */
  static async countByValue(raster, excludeValues = []) {
    const excludeSet = new Set(excludeValues);
    const values = raster.cloneValues();
    const flatData = values.flat();
    const tensor = tf.tensor1d(flatData, "int32");
    const pixelData = await tensor.data();
    const counts = new Map();
    for (let i = 0; i < pixelData.length; i++) {
      const value = pixelData[i];
      if (!excludeSet.has(value)) {
        counts.set(value, (counts.get(value) || 0) + 1);
      }
    }
    tensor.dispose();
    return counts;
  }

  /**
   * Generate histogram of pixel values.
   * @param {Raster} raster - Raster to analyze
   * @param {number} bins - Number of histogram bins
   * @returns {Promise<{bins: number[], counts: number[]}>} Histogram data
   */
  static async histogram(raster, bins = 256) {
    const values = raster.cloneValues();
    const flatData = values.flat();
    const tensor = tf.tensor1d(flatData, "int32");
    const min = (await tf.min(tensor).data())[0];
    const max = (await tf.max(tensor).data())[0];
    const binSize = (max - min) / bins;
    const binEdges = Array.from(
      { length: bins + 1 },
      (_, i) => min + i * binSize
    );
    const pixelData = await tensor.data();
    const binCounts = new Array(bins).fill(0);
    for (let i = 0; i < pixelData.length; i++) {
      const value = pixelData[i];
      const binIndex = Math.min(Math.floor((value - min) / binSize), bins - 1);
      binCounts[binIndex]++;
    }
    tensor.dispose();
    return {
      bins: binEdges.slice(0, -1),
      counts: binCounts,
    };
  }
}

export { TensorRaster };
