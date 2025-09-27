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
    const firstSegmentation = segmentations.get(segmentationKeys[0]);
    const refGeoRaster = firstSegmentation.georaster;
    const height = refGeoRaster.height;
    const width = refGeoRaster.width;
    const nodataValue = refGeoRaster.noDataValue ?? CLUSTER_ID_RANGES.NODATA;

    let nextUniqueId = 1;
    const clusterIdMapping = new Map(); // originalId_segKey → {uniqueId, originalId, sourceSegmentation, landUsePath}
    // First pass: assign unique IDs to all labeled clusters
    for (const segKey of segmentationKeys) {
      const labels = allLabels.get(segKey) || new Map();
      for (const [originalId, landUsePath] of labels) {
        const key = `${originalId}_${segKey}`;
        clusterIdMapping.set(key, {
          uniqueId: nextUniqueId++,
          originalId,
          sourceSegmentation: segKey,
          landUsePath,
        });
      }
    }
    const refRasterData = refGeoRaster.values[0];
    const refTensor = tf.tensor2d(
      Array.from(refRasterData, (row) => Array.from(row)),
      [height, width],
      "int32"
    );
    const nodataMask = tf.equal(refTensor, nodataValue);
    let bestClusterIds = tf.where(
      nodataMask,
      tf.scalar(nodataValue),
      tf.scalar(CLUSTER_ID_RANGES.UNLABELED)
    );
    let hasLabel = tf.zeros([height, width], "bool");
    // Second pass: assign pixels to unique labeled cluster IDs
    for (const segKey of segmentationKeys) {
      const segmentation = segmentations.get(segKey);
      const labels = allLabels.get(segKey) || new Map();
      if (labels.size === 0) continue;
      const rasterData = segmentation.georaster.values[0];
      const regularArray = Array.from(rasterData, (row) => Array.from(row));
      const rasterTensor = tf.tensor2d(regularArray, [height, width], "int32");
      const maxOriginalId = Math.max(...labels.keys());
      const idMappingArray = new Array(maxOriginalId + 1).fill(0);
      for (const originalId of labels.keys()) {
        const key = `${originalId}_${segKey}`;
        const mapping = clusterIdMapping.get(key);
        idMappingArray[originalId] = mapping.uniqueId;
      }
      const idMappingTensor = tf.tensor1d(idMappingArray, "int32");
      const mappedIds = tf.gather(idMappingTensor, rasterTensor);
      let labelMask = tf.zeros([height, width], "bool");
      for (const originalId of labels.keys()) {
        const clusterMask = tf.equal(rasterTensor, originalId);
        labelMask = tf.logicalOr(labelMask, clusterMask);
        clusterMask.dispose();
      }
      const notHasLabel = tf.logicalNot(hasLabel);
      const shouldUpdate = tf.logicalAnd(labelMask, notHasLabel);
      bestClusterIds = tf.where(shouldUpdate, mappedIds, bestClusterIds);
      hasLabel = tf.logicalOr(hasLabel, labelMask);
      rasterTensor.dispose();
      mappedIds.dispose();
      idMappingTensor.dispose();
      labelMask.dispose();
      shouldUpdate.dispose();
      notHasLabel.dispose();
    }
    const compositeData = await bestClusterIds.array();
    bestClusterIds.dispose();
    hasLabel.dispose();
    refTensor.dispose();
    nodataMask.dispose();
    return {
      compositeData,
      clusterIdMapping,
      refGeoRaster,
      highestKKey: segmentationKeys[0],
    };
  }

  static compareSegmentationsByRule(segKeyA, segKeyB, rules) {
    const kA = extractKValue(segKeyA);
    const kB = extractKValue(segKeyB);
    switch (rules.priority) {
      case "highest_k":
        return kB - kA;
      case "lowest_k":
        return kA - kB;
      case "most_specific":
        return kB - kA;
      default:
        return kB - kA;
    }
  }
}
