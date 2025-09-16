import { extractKValue } from "./utils.js";

export class Compositor {
  static async generateCompositeRaster(overlayData, allLabels, rules) {
    const segmentations = Array.from(overlayData.keys()).sort((a, b) =>
      this.compareSegmentationsByRule(a, b, rules)
    );
    if (segmentations.length === 0) {
      throw new Error("No segmentations available");
    }
    const firstOverlay = overlayData.get(segmentations[0]);
    const refGeoRaster = firstOverlay.georaster;
    const height = refGeoRaster.height;
    const width = refGeoRaster.width;
    let bestClusterIds = tf.zeros([height, width], "int32");
    let bestSegmentationIds = tf.zeros([height, width], "int32");
    let hasLabel = tf.zeros([height, width], "bool");
    for (let i = 0; i < segmentations.length; i++) {
      const segKey = segmentations[i];
      const overlay = overlayData.get(segKey);
      const labels = allLabels.get(segKey) || new Map();
      if (labels.size === 0) continue;
      const rasterData = overlay.georaster.values[0];
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
    const compositeData = await bestClusterIds.array();
    const segmentationIds = await bestSegmentationIds.array();
    bestClusterIds.dispose();
    bestSegmentationIds.dispose();
    hasLabel.dispose();
    return {
      compositeData,
      segmentationIds,
      segmentations,
      refGeoRaster,
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
