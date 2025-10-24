export class LLMGeoJSONAdapter {
  /**
   * Convert model detections to georeferenced GeoJSON features.
   * @param {Object} detections - Model output with bbox/polygon coordinates
   * @param {Object} georeferencing - Geo metadata {xmin, ymax, pixelWidth, pixelHeight}
   * @param {Object} regionBbox - Region bounds {north, south, east, west}
   * @returns {Object} GeoJSON FeatureCollection
   */
  static toGeoJSON(detections, georeferencing, regionBbox) {
    const features = (detections.objects || []).map((detection) => {
      const geometry = this.pixelCoordsToGeometry(
        detection,
        georeferencing,
        regionBbox
      );

      return {
        type: "Feature",
        geometry,
        properties: {
          type: detection.class || "unknown",
          confidence: detection.confidence || 0.5,
          detectionId: detection.id,
        },
      };
    });

    return {
      type: "FeatureCollection",
      features,
    };
  }

  /**
   * Convert pixel/image coordinates to lat/lng geometry.
   * @private
   */
  static pixelCoordsToGeometry(detection, georeferencing, regionBbox) {
    if (detection.polygon) {
      const rings = detection.polygon.map((ring) =>
        ring.map(([x, y]) =>
          this.pixelToLatlng(x, y, georeferencing, regionBbox)
        )
      );
      return {
        type: "Polygon",
        coordinates: rings,
      };
    } else if (detection.bbox) {
      const [x1, y1, x2, y2] = detection.bbox;
      const sw = this.pixelToLatlng(x1, y2, georeferencing, regionBbox);
      const ne = this.pixelToLatlng(x2, y1, georeferencing, regionBbox);

      return {
        type: "Polygon",
        coordinates: [
          [
            [sw[0], sw[1]],
            [ne[0], sw[1]],
            [ne[0], ne[1]],
            [sw[0], ne[1]],
            [sw[0], sw[1]],
          ],
        ],
      };
    }
    return null;
  }

  /**
   * Convert image pixel coords to lat/lng.
   * @private
   */
  static pixelToLatlng(x, y, georeferencing, regionBbox) {
    // x, y are in image space (0,0 is top-left)
    // Convert to regional bbox space, then to actual lat/lng
    const imageWidth = regionBbox.east - regionBbox.west;
    const imageHeight = regionBbox.north - regionBbox.south;

    const lng = regionBbox.west + (x / georeferencing.imageWidth) * imageWidth;
    const lat =
      regionBbox.north - (y / georeferencing.imageHeight) * imageHeight;

    return [lng, lat];
  }
}
