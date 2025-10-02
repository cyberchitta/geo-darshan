import { ClassificationHierarchy } from "../classification.js";
import { hexToRgb, rgbToHex } from "../utils.js";

/**
 * Resolves classification paths to colors at specified hierarchy levels.
 * Caches results for performance.
 */
class ColorResolver {
  constructor(hierarchyLevel = 1) {
    this._hierarchyLevel = hierarchyLevel;
    this._cache = new Map();
  }

  /**
   * Get color for classification path at current hierarchy level.
   * @param {string} classificationPath - Classification path (e.g., "land.cropland.rice")
   * @returns {string|null} RGB color string or null for unlabeled
   */
  getColor(classificationPath) {
    if (!classificationPath || classificationPath === "unlabeled") {
      return null;
    }

    const cacheKey = `${classificationPath}:${this._hierarchyLevel}`;

    if (this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey);
    }

    const color = ClassificationHierarchy.getColorForClassification(
      classificationPath,
      this._hierarchyLevel
    );

    this._cache.set(cacheKey, color);
    return color;
  }

  /**
   * Get hex color for classification path.
   * @param {string} classificationPath
   * @returns {string|null} Hex color string or null
   */
  getHexColor(classificationPath) {
    const rgbColor = this.getColor(classificationPath);
    if (!rgbColor) return null;

    return rgbToHex(rgbColor);
  }

  /**
   * Get RGB array for classification path.
   * @param {string} classificationPath
   * @returns {number[]|null} [r, g, b] array or null
   */
  getRgbArray(classificationPath) {
    const rgbColor = this.getColor(classificationPath);
    if (!rgbColor) return null;

    const match = rgbColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) return null;

    return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
  }

  /**
   * Set hierarchy level and clear cache.
   * @param {number} level - Hierarchy level (1-4)
   */
  setHierarchyLevel(level) {
    if (level !== this._hierarchyLevel) {
      this._hierarchyLevel = level;
      this._cache.clear();
    }
  }

  /**
   * Get current hierarchy level.
   * @returns {number}
   */
  getHierarchyLevel() {
    return this._hierarchyLevel;
  }

  /**
   * Clear color cache.
   */
  clearCache() {
    this._cache.clear();
  }

  /**
   * Get cache statistics.
   * @returns {{size: number, level: number}}
   */
  getCacheStats() {
    return {
      size: this._cache.size,
      level: this._hierarchyLevel,
    };
  }
}

export { ColorResolver };
