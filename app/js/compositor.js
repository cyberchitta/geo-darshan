import {
  extractKValue,
  SEGMENTATION_KEYS,
  CLUSTER_ID_RANGES,
} from "./utils.js";

export class Compositor {
  static async generateCompositeRaster(
    segmentations,
    allLabels,
    rules,
    fineGrainSegmentationKey
  ) {
    if (!fineGrainSegmentationKey) {
      throw new Error("fineGrainSegmentationKey is required");
    }

    const segmentationKeys = Array.from(segmentations.keys())
      .filter((key) => key !== SEGMENTATION_KEYS.COMPOSITE)
      .sort((a, b) => this.compareSegmentationsByRule(a, b, rules));

    if (segmentationKeys.length === 0) {
      throw new Error("No segmentations available");
    }

    if (!segmentations.has(fineGrainSegmentationKey)) {
      throw new Error(
        `Fine-grain segmentation key '${fineGrainSegmentationKey}' not found`
      );
    }

    const firstSegmentation = segmentations.get(segmentationKeys[0]);
    const fineGrainSegmentation = segmentations.get(fineGrainSegmentationKey);
    const refGeoRaster = firstSegmentation.georaster;
    const height = refGeoRaster.height;
    const width = refGeoRaster.width;
    const nodataValue = refGeoRaster.noDataValue ?? CLUSTER_ID_RANGES.NODATA;

    // Generate unique IDs for labeled clusters
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
    const fineGrainRasterData = fineGrainSegmentation.georaster.values[0];

    const refTensor = tf.tensor2d(
      Array.from(refRasterData, (row) => Array.from(row)),
      [height, width],
      "int32"
    );
    const fineGrainTensor = tf.tensor2d(
      Array.from(fineGrainRasterData, (row) => Array.from(row)),
      [height, width],
      "int32"
    );
    const nodataMask = tf.equal(refTensor, nodataValue);

    let bestClusterIds = tf.where(
      nodataMask,
      tf.scalar(nodataValue),
      tf.zeros([height, width], "int32")
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

      // Create tensor mapping original IDs to unique IDs for this segmentation
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

    // Handle unlabeled pixels with fine-grain IDs
    const unlabeledMask = tf.logicalAnd(
      tf.logicalNot(hasLabel),
      tf.logicalNot(nodataMask)
    );
    const fineGrainIds = tf.add(
      fineGrainTensor,
      tf.scalar(CLUSTER_ID_RANGES.FINE_GRAIN_START)
    );
    bestClusterIds = tf.where(unlabeledMask, fineGrainIds, bestClusterIds);

    const compositeData = await bestClusterIds.array();

    // Add fine-grain clusters to mapping
    const uniqueFineGrainIds = new Set();
    compositeData.flat().forEach((id) => {
      if (CLUSTER_ID_RANGES.isFineGrain(id)) {
        uniqueFineGrainIds.add(id);
      }
    });

    for (const fineGrainId of uniqueFineGrainIds) {
      const originalId = fineGrainId - CLUSTER_ID_RANGES.FINE_GRAIN_START;
      clusterIdMapping.set(`fine_${fineGrainId}`, {
        uniqueId: fineGrainId,
        originalId,
        sourceSegmentation: fineGrainSegmentationKey,
        landUsePath: "unlabeled",
      });
    }

    // Cleanup tensors
    bestClusterIds.dispose();
    hasLabel.dispose();
    refTensor.dispose();
    fineGrainTensor.dispose();
    nodataMask.dispose();
    unlabeledMask.dispose();
    fineGrainIds.dispose();

    return {
      compositeData,
      clusterIdMapping,
      refGeoRaster,
      fineGrainKey: fineGrainSegmentationKey,
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
