/**
 * Immutable container for 2D raster data with coordinate conversion.
 * Stores values and georeferencing but has no knowledge of what values mean.
 */
class Raster {
  /**
   * @param {number[][]} values - 2D array of raster values
   * @param {Georeferencing} georeferencing - Coordinate system metadata
   * @param {Object} metadata - Additional georaster metadata (projection, noDataValue, etc.)
   */
  constructor(values, georeferencing, metadata = {}) {
    this._values = values;
    this._georeferencing = georeferencing;
    this._metadata = metadata;
    this._height = values.length;
    this._width = values[0]?.length || 0;

    Object.freeze(this);
  }

  /**
   * Create Raster from georaster object (legacy format).
   * @param {Object} georaster - Legacy georaster with values and bounds
   * @returns {Raster}
   */
  static fromGeoRaster(georaster) {
    const georeferencing = Georeferencing.fromGeoRaster(georaster);
    const metadata = {
      projection: georaster.projection,
      noDataValue: georaster.noDataValue,
      _projectionMetadata: georaster._projectionMetadata,
      ...georaster.metadata,
    };
    return new Raster(georaster.values[0], georeferencing, metadata);
  }

  /**
   * Create empty Raster with same georeferencing.
   * @param {number} fillValue - Value to fill raster with
   * @returns {Raster}
   */
  createEmpty(fillValue = 0) {
    const values = Array(this._height)
      .fill(null)
      .map(() => Array(this._width).fill(fillValue));
    return new Raster(values, this._georeferencing, this._metadata);
  }

  get width() {
    return this._width;
  }

  get height() {
    return this._height;
  }

  get georeferencing() {
    return this._georeferencing;
  }

  get metadata() {
    return this._metadata;
  }

  /**
   * Get value at pixel coordinates.
   * @param {number} x - Pixel column
   * @param {number} y - Pixel row
   * @returns {number|null} Value or null if out of bounds
   */
  get(x, y) {
    if (x < 0 || x >= this._width || y < 0 || y >= this._height) {
      return null;
    }
    return this._values[y][x];
  }

  /**
   * Convert lat/lng to pixel coordinates.
   * @param {{lat: number, lng: number}} latlng
   * @returns {{x: number, y: number}|null} Pixel coords or null if out of bounds
   */
  latlngToPixel(latlng) {
    const x = Math.floor(
      (latlng.lng - this._georeferencing.xmin) / this._georeferencing.pixelWidth
    );
    const y = Math.floor(
      (this._georeferencing.ymax - latlng.lat) /
        this._georeferencing.pixelHeight
    );

    if (x < 0 || x >= this._width || y < 0 || y >= this._height) {
      return null;
    }

    return { x, y };
  }

  /**
   * Convert pixel coordinates to lat/lng (center of pixel).
   * @param {number} x - Pixel column
   * @param {number} y - Pixel row
   * @returns {{lat: number, lng: number}}
   */
  pixelToLatlng(x, y) {
    const lng =
      this._georeferencing.xmin + (x + 0.5) * this._georeferencing.pixelWidth;
    const lat =
      this._georeferencing.ymax - (y + 0.5) * this._georeferencing.pixelHeight;
    return { lat, lng };
  }

  /**
   * Get neighboring pixel coordinates.
   * @param {number} x - Pixel column
   * @param {number} y - Pixel row
   * @param {boolean} includeDiagonal - Include diagonal neighbors
   * @returns {{x: number, y: number}[]} Array of valid neighbor coordinates
   */
  getNeighbors(x, y, includeDiagonal = false) {
    const offsets = includeDiagonal
      ? [
          [-1, -1],
          [0, -1],
          [1, -1],
          [-1, 0],
          [1, 0],
          [-1, 1],
          [0, 1],
          [1, 1],
        ]
      : [
          [0, -1],
          [-1, 0],
          [1, 0],
          [0, 1],
        ];

    return offsets
      .map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
      .filter(
        (coord) =>
          coord.x >= 0 &&
          coord.x < this._width &&
          coord.y >= 0 &&
          coord.y < this._height
      );
  }

  /**
   * Iterate over all pixels with coordinates.
   * @param {function({x: number, y: number}, number): void} fn - Called with coord and value
   */
  forEach(fn) {
    for (let y = 0; y < this._height; y++) {
      for (let x = 0; x < this._width; x++) {
        fn({ x, y }, this._values[y][x]);
      }
    }
  }

  /**
   * Create new Raster by transforming each pixel value.
   * @param {function({x: number, y: number}, number): number} fn - Transform function
   * @returns {Raster}
   */
  map(fn) {
    const newValues = Array(this._height);
    for (let y = 0; y < this._height; y++) {
      newValues[y] = Array(this._width);
      for (let x = 0; x < this._width; x++) {
        newValues[y][x] = fn({ x, y }, this._values[y][x]);
      }
    }
    return new Raster(newValues, this._georeferencing, this._metadata);
  }

  /**
   * Create a mutable copy of the values array.
   * Use with caution - prefer immutable operations.
   * @returns {number[][]}
   */
  cloneValues() {
    return this._values.map((row) => [...row]);
  }

  /**
   * Export to legacy georaster format.
   * @returns {Object} Georaster-compatible object
   */
  toGeoRaster() {
    const result = {
      values: [this._values],
      width: this._width,
      height: this._height,
      numberOfRasters: 1,
      ...this._georeferencing.toGeoRasterProps(),
      projection: this._metadata.projection,
      noDataValue: this._metadata.noDataValue,
      _projectionMetadata: this._metadata._projectionMetadata,
    };
    return result;
  }
}

/**
 * Georeferencing information for a raster.
 */
class Georeferencing {
  constructor(xmin, ymin, xmax, ymax, pixelWidth, pixelHeight) {
    this.xmin = xmin;
    this.ymin = ymin;
    this.xmax = xmax;
    this.ymax = ymax;
    this.pixelWidth = pixelWidth;
    this.pixelHeight = pixelHeight;

    Object.freeze(this);
  }

  /**
   * Extract georeferencing from legacy georaster object.
   * @param {Object} georaster
   * @returns {Georeferencing}
   */
  static fromGeoRaster(georaster) {
    return new Georeferencing(
      georaster.xmin,
      georaster.ymin,
      georaster.xmax,
      georaster.ymax,
      georaster.pixelWidth,
      georaster.pixelHeight
    );
  }

  /**
   * Export as georaster-compatible properties.
   * @returns {Object}
   */
  toGeoRasterProps() {
    return {
      xmin: this.xmin,
      ymin: this.ymin,
      xmax: this.xmax,
      ymax: this.ymax,
      pixelWidth: this.pixelWidth,
      pixelHeight: this.pixelHeight,
    };
  }
}

export { Raster, Georeferencing };
