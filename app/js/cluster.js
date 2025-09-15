export class Cluster {
  static async extractClusterData(overlays, manifest, dataLoader) {
    const clusterData = {};
    for (let index = 0; index < overlays.length; index++) {
      const overlay = overlays[index];
      const segmentationKey = manifest.segmentation_keys[index];
      const colorMapping =
        dataLoader.getColorMappingForSegmentation(segmentationKey);
      const pixelCounts = await this.countPixelsPerCluster(
        overlay.georaster,
        colorMapping
      );
      const clusters = [];
      const colors = new Map();
      Object.entries(pixelCounts).forEach(([clusterId, count]) => {
        const id = parseInt(clusterId);
        clusters.push({
          id,
          pixelCount: count,
          segmentationKey,
          area_ha: (count * 0.01).toFixed(2),
        });
        if (colorMapping?.colors_rgb[id]) {
          const rgb = colorMapping.colors_rgb[id];
          colors.set(
            id,
            `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(
              rgb[1] * 255
            )}, ${Math.round(rgb[2] * 255)})`
          );
        }
      });
      clusterData[segmentationKey] = { clusters, colors };
    }
    return clusterData;
  }

  static async countPixelsPerCluster(georaster, colorMapping) {
    const rasterData = georaster.values[0];
    const height = georaster.height;
    const width = georaster.width;
    const flatData = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        flatData.push(rasterData[y][x]);
      }
    }
    const tensor = tf.tensor1d(flatData, "int32");
    const nodataValue = colorMapping?.nodata_value || -1;
    const validMask = tf.notEqual(tensor, nodataValue);
    const validPixels = tf.where(validMask, tensor, tf.scalar(-999, "int32"));
    const pixelData = await validPixels.data();
    const pixelCounts = {};
    for (let i = 0; i < pixelData.length; i++) {
      const clusterId = pixelData[i];
      if (clusterId !== -999 && clusterId !== nodataValue) {
        pixelCounts[clusterId] = (pixelCounts[clusterId] || 0) + 1;
      }
    }
    tensor.dispose();
    validMask.dispose();
    validPixels.dispose();
    return pixelCounts;
  }
}
