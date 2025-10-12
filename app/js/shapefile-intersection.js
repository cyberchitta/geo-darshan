class ShapefileIntersection {
  static polygonToPixelMask(polygon, raster) {
    const pixelCoords = new Set();
    if (polygon.type === "Polygon") {
      this._addPolygonToMask(polygon.coordinates[0], raster, pixelCoords);
    } else if (polygon.type === "MultiPolygon") {
      polygon.coordinates.forEach((polyCoords) => {
        this._addPolygonToMask(polyCoords[0], raster, pixelCoords);
      });
    }
    return pixelCoords;
  }

  static _addPolygonToMask(coordinates, raster, pixelCoords) {
    const vertices = coordinates
      .map(([lng, lat]) => raster.latlngToPixel({ lat, lng }))
      .filter((p) => p !== null);
    if (vertices.length < 3) return;
    const minX = Math.floor(Math.min(...vertices.map((v) => v.x)));
    const maxX = Math.ceil(Math.max(...vertices.map((v) => v.x)));
    const minY = Math.floor(Math.min(...vertices.map((v) => v.y)));
    const maxY = Math.ceil(Math.max(...vertices.map((v) => v.y)));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (this._isPointInPolygon({ x, y }, vertices)) {
          pixelCoords.add(`${x},${y}`);
        }
      }
    }
  }

  static _isPointInPolygon(point, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x,
        yi = vertices[i].y;
      const xj = vertices[j].x,
        yj = vertices[j].y;
      const intersect =
        yi > point.y !== yj > point.y &&
        point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  static calculateClusterIntersection(pixelMask, segmentedRaster, clusterId) {
    let intersectionCount = 0;
    segmentedRaster.raster.forEach((coord, value) => {
      if (value === clusterId) {
        const key = `${coord.x},${coord.y}`;
        if (pixelMask.has(key)) {
          intersectionCount++;
        }
      }
    });
    const cluster = segmentedRaster.getClusterById(clusterId);
    const clusterSize = cluster?.pixelCount || 0;
    const percentage =
      clusterSize > 0 ? (intersectionCount / clusterSize) * 100 : 0;
    return { intersectionCount, clusterSize, percentage };
  }

  static findIntersectingClusters(polygon, segmentedRaster, threshold) {
    const pixelMask = this.polygonToPixelMask(polygon, segmentedRaster.raster);
    if (pixelMask.size === 0) return [];
    const results = [];
    const clusterIds = segmentedRaster.getAllClusterIds();
    for (const clusterId of clusterIds) {
      const { intersectionCount, clusterSize, percentage } =
        this.calculateClusterIntersection(
          pixelMask,
          segmentedRaster,
          clusterId
        );
      if (percentage >= threshold) {
        results.push({
          clusterId,
          intersectionPct: percentage,
          pixelCount: intersectionCount,
          clusterSize,
        });
      }
    }
    return results.sort((a, b) => b.intersectionPct - a.intersectionPct);
  }
}

export { ShapefileIntersection };
