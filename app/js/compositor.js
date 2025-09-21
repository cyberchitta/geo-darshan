import {
  extractKValue,
  SEGMENTATION_KEYS,
  CLUSTER_ID_RANGES,
} from "./utils.js";

export class Compositor {
  static async generateCompositeRaster(segmentations, allLabels, rules) {
    const segmentationKeys = Array.from(segmentations.keys())
      .filter((key) => key !== SEGMENTATION_KEYS.COMPOSITE)
      .sort((a, b) => this.compareSegmentationsByRule(a, b, rules));
    if (segmentationKeys.length === 0) {
      throw new Error("No segmentations available");
    }
    const highestKKey = segmentationKeys.reduce((highest, current) => {
      const currentK = extractKValue(current);
      const highestK = extractKValue(highest);
      return currentK > highestK ? current : highest;
    });
    const firstSegmentation = segmentations.get(segmentationKeys[0]);
    const highestKSegmentation = segmentations.get(highestKKey);
    const refGeoRaster = firstSegmentation.georaster;
    const height = refGeoRaster.height;
    const width = refGeoRaster.width;
    const nodataValue = refGeoRaster.noDataValue ?? CLUSTER_ID_RANGES.NODATA;
    const refRasterData = refGeoRaster.values[0];
    const highestKRasterData = highestKSegmentation.georaster.values[0];
    const refTensor = tf.tensor2d(
      Array.from(refRasterData, (row) => Array.from(row)),
      [height, width],
      "int32"
    );
    const highestKTensor = tf.tensor2d(
      Array.from(highestKRasterData, (row) => Array.from(row)),
      [height, width],
      "int32"
    );
    const nodataMask = tf.equal(refTensor, nodataValue);
    let bestClusterIds = tf.where(
      nodataMask,
      tf.scalar(nodataValue),
      tf.zeros([height, width], "int32")
    );
    let bestSegmentationIds = tf.zeros([height, width], "int32");
    let hasLabel = tf.zeros([height, width], "bool");
    for (let i = 0; i < segmentationKeys.length; i++) {
      const segKey = segmentationKeys[i];
      const segmentation = segmentations.get(segKey);
      const labels = allLabels.get(segKey) || new Map();
      if (labels.size === 0) continue;
      const rasterData = segmentation.georaster.values[0];
      const regularArray = Array.from(rasterData, (row) => Array.from(row));
      const rasterTensor = tf.tensor2d(regularArray, [height, width], "int32");
      const labeledClusterIds = Array.from(labels.keys());
      let labelMask = tf.zeros([height, width], "bool");
      for (const clusterId of labeledClusterIds) {
        const clusterMask = tf.equal(rasterTensor, clusterId);
        labelMask = tf.logicalOr(labelMask, clusterMask);
        clusterMask.dispose();
      }
      const notHasLabel = tf.logicalNot(hasLabel);
      const shouldUpdate = tf.logicalAnd(labelMask, notHasLabel);
      bestClusterIds = tf.where(shouldUpdate, rasterTensor, bestClusterIds);
      bestSegmentationIds = tf.where(
        shouldUpdate,
        tf.fill([height, width], i),
        bestSegmentationIds
      );
      hasLabel = tf.logicalOr(hasLabel, labelMask);
      rasterTensor.dispose();
      labelMask.dispose();
      shouldUpdate.dispose();
      notHasLabel.dispose();
    }
    const unlabeledMask = tf.logicalAnd(
      tf.logicalNot(hasLabel),
      tf.logicalNot(nodataMask)
    );
    const fineGrainIds = tf.add(
      highestKTensor,
      tf.scalar(CLUSTER_ID_RANGES.FINE_GRAIN_START)
    );
    bestClusterIds = tf.where(unlabeledMask, fineGrainIds, bestClusterIds);
    const compositeData = await bestClusterIds.array();
    const segmentationIds = await bestSegmentationIds.array();
    bestClusterIds.dispose();
    bestSegmentationIds.dispose();
    hasLabel.dispose();
    refTensor.dispose();
    highestKTensor.dispose();
    nodataMask.dispose();
    unlabeledMask.dispose();
    fineGrainIds.dispose();
    return {
      compositeData,
      segmentationIds,
      segmentations: segmentationKeys,
      refGeoRaster,
      highestKKey,
    };
  }

  static compareSegmentationsByRule(segKeyA, segKeyB, rules) {
    const kA = extractKValue(segKeyA);
    const kB = extractKValue(segKeyB);
    switch (rules.priority) {
      case "highest_k":
        return kB - kA; // Higher K first
      case "lowest_k":
        return kA - kB; // Lower K first
      case "most_specific":
        return kB - kA; // Default to highest K
      default:
        return kB - kA;
    }
  }
}
