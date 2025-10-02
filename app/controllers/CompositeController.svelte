<script>
  import { ClassificationHierarchy } from "../js/classification.js";
  import { Segmentation } from "../js/segmentation.js";
  import { SEGMENTATION_KEYS, extractKValue } from "../js/utils.js";
  import { RasterTransform } from "../js/raster/raster-transform.js";

  let { dataState, segmentationController } = $props();
  let hasSegmentations = $derived(dataState?.segmentations?.size > 0);
  let lastProcessedUserVersion = $state(-1);
  let shouldRegenerateComposite = $derived(
    hasSegmentations && dataState.userLabelsVersion > lastProcessedUserVersion
  );
  let compositeState = $state(null);
  let currentSegmentationKey = $derived(
    segmentationController?.getState()?.currentSegmentationKey
  );

  const stateObject = {
    get compositeState() {
      return compositeState;
    },
  };

  export function getState() {
    return stateObject;
  }

  $effect(async () => {
    if (!shouldRegenerateComposite) return;
    try {
      if (!ClassificationHierarchy.isLoaded()) {
        console.log("Waiting for ClassificationHierarchy to load...");
        return;
      }
      const allLabelsMap = Segmentation.extractAllLabels(
        dataState.segmentations
      );
      const compositeResult = await generateComposite(
        dataState.segmentations,
        allLabelsMap
      );
      compositeState = compositeResult;
      lastProcessedUserVersion = dataState.userLabelsVersion;
      console.log("✅ Composite data generated, ready for other controllers");
    } catch (error) {
      console.error("Failed to generate composite:", error);
      lastProcessedUserVersion = dataState.userLabelsVersion;
      compositeState = null;
    }
  });

  async function generateComposite(segmentations, allLabels) {
    console.log("Generating composite raster with RasterTransform...");
    const startTime = performance.now();
    const segmentedRastersWithKeys = [];
    const regularKeys = Array.from(segmentations.keys())
      .filter(
        (key) =>
          key !== SEGMENTATION_KEYS.COMPOSITE &&
          key !== SEGMENTATION_KEYS.INTERACTIVE &&
          key !== SEGMENTATION_KEYS.SYNTHETIC
      )
      .sort((a, b) => {
        const kA = extractKValue(a);
        const kB = extractKValue(b);
        return kB - kA; // highest_k priority
      });
    for (const key of regularKeys) {
      const seg = segmentations.get(key);
      const segRaster = seg.toSegmentedRaster();
      segmentedRastersWithKeys.push({ segRaster, key });
    }
    const syntheticSeg = segmentations.get(SEGMENTATION_KEYS.SYNTHETIC);
    if (syntheticSeg) {
      const syntheticLabels = allLabels.get(SEGMENTATION_KEYS.SYNTHETIC);
      if (syntheticLabels && syntheticLabels.size > 0) {
        const segRaster = syntheticSeg.toSegmentedRaster();
        segmentedRastersWithKeys.unshift({
          segRaster,
          key: SEGMENTATION_KEYS.SYNTHETIC,
        });
      }
    }
    if (segmentedRastersWithKeys.length === 0) {
      throw new Error("No segmentations available");
    }
    console.log("Pre-aggregation state:", {
      numSegmentations: segmentedRastersWithKeys.length,
      totalLabelsInAllSegmentations: Array.from(allLabels.entries()).reduce(
        (sum, [key, labels]) => sum + labels.size,
        0
      ),
      labelsPerSegmentation: Array.from(allLabels.entries()).map(
        ([key, labels]) => ({ key, labelCount: labels.size })
      ),
    });
    const aggregated = RasterTransform.aggregate(segmentedRastersWithKeys, {
      priority: "highest_k",
    });
    console.log("Post-aggregation state:", {
      uniqueClusterIds: aggregated.registry.size(),
      sampleClusters: aggregated.getAllClusters().slice(0, 5),
    });
    const compositeSegmentation = Segmentation.fromSegmentedRaster(
      SEGMENTATION_KEYS.COMPOSITE,
      aggregated,
      { source: "composite", created: new Date().toISOString() }
    );
    compositeSegmentation.clusters.forEach((cluster) => {
      if (cluster.classificationPath !== "unlabeled") {
        cluster.color = ClassificationHierarchy.getColorForClassification(
          cluster.classificationPath
        );
      }
    });
    compositeSegmentation.finalize();
    dataState.addSegmentation(
      SEGMENTATION_KEYS.COMPOSITE,
      compositeSegmentation
    );
    const endTime = performance.now();
    console.log(
      `✅ Composite generated in ${(endTime - startTime).toFixed(2)}ms`
    );
    return {
      georaster: compositeSegmentation.georaster,
      clusterIdMapping: new Map(),
      highestKKey: regularKeys[0],
    };
  }
</script>
