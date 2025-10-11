<script>
  import { ClassificationHierarchy } from "../js/classification.js";
  import { SegmentedRaster } from "../js/raster/segmented-raster.js";
  import { SEGMENTATION_KEYS, extractKValue } from "../js/utils.js";
  import { RasterTransform } from "../js/raster/raster-transform.js";

  let { dataState } = $props();
  let hasSegmentedRasters = $derived(dataState?.segmentedRasters?.size > 0);
  let hierarchy = $derived(dataState?.hierarchy);
  let hierarchyColors = $derived(dataState?.hierarchyColors);
  let hasHierarchy = $derived(dataState?.hasHierarchy);
  let compositeState = $state(null);
  let compositeGeneration = $state(0);
  let lastSegmentedRastersVersion = $state(-1);

  const stateObject = {
    get compositeState() {
      return compositeState;
    },
    get compositeGeneration() {
      return compositeGeneration;
    },
  };

  export function getState() {
    return stateObject;
  }

  $effect(async () => {
    if (!hasSegmentedRasters || !hasHierarchy) return;
    const currentVersion = dataState.segmentedRastersVersion;
    if (currentVersion !== lastSegmentedRastersVersion) {
      try {
        const allLabelsMap = SegmentedRaster.extractLabeledClusters(
          dataState.segmentedRasters
        );
        const compositeResult = await generateComposite(
          dataState.segmentedRasters,
          allLabelsMap
        );
        compositeGeneration++;
        compositeState = {
          ...compositeResult,
          generation: compositeGeneration,
        };
        lastSegmentedRastersVersion = currentVersion;
      } catch (error) {
        console.error("Failed to generate composite:", error);
        compositeState = null;
      }
    }
  });

  async function generateComposite(segmentedRasters, allLabels) {
    const startTime = performance.now();
    const segmentedRastersWithKeys = [];
    const regularKeys = Array.from(segmentedRasters.keys())
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
      const segRaster = segmentedRasters.get(key);
      segmentedRastersWithKeys.push({ segRaster, key });
    }
    const syntheticSegRaster = segmentedRasters.get(
      SEGMENTATION_KEYS.SYNTHETIC
    );
    if (syntheticSegRaster) {
      const syntheticLabels = allLabels.get(SEGMENTATION_KEYS.SYNTHETIC);
      if (syntheticLabels && syntheticLabels.size > 0) {
        segmentedRastersWithKeys.unshift({
          segRaster: syntheticSegRaster,
          key: SEGMENTATION_KEYS.SYNTHETIC,
        });
      }
    }
    if (segmentedRastersWithKeys.length === 0) {
      throw new Error("No segmented rasters available");
    }
    const aggregated = RasterTransform.aggregate(segmentedRastersWithKeys, {
      priority: "highest_k",
    });
    aggregated.getAllClusters().forEach((cluster) => {
      if (cluster.classificationPath !== "unlabeled") {
        const color = ClassificationHierarchy.getColorForClassification(
          cluster.classificationPath,
          hierarchyColors,
          null
        );
        aggregated.registry.updateClassification(
          cluster.id,
          cluster.classificationPath,
          color
        );
      }
    });
    dataState.addSegmentedRaster(SEGMENTATION_KEYS.COMPOSITE, aggregated);
    const endTime = performance.now();
    console.log(
      `✅ Composite generated in ${(endTime - startTime).toFixed(2)}ms`
    );
    return {
      compositeSegRaster: aggregated,
      clusterIdMapping: new Map(),
      highestKKey: regularKeys[0],
    };
  }
</script>
