<script>
  import { ClassificationHierarchy } from "../js/classification.js";
  import { Compositor } from "../js/compositor.js";
  import { Segmentation } from "../js/segmentation.js";

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
    console.log("Generating composite raster with TensorFlow.js...");
    const startTime = performance.now();
    const result = await Compositor.generateCompositeRaster(
      segmentations,
      allLabels,
      { priority: "highest_k", requireLabeled: true, fallbackToLower: true }
    );
    const compositeGeoRaster = {
      ...result.refGeoRaster,
      values: [result.compositeData],
      numberOfRasters: 1,
    };
    const endTime = performance.now();
    console.log(
      `✅ Composite generated in ${(endTime - startTime).toFixed(2)}ms`
    );
    return {
      georaster: compositeGeoRaster,
      clusterIdMapping: result.clusterIdMapping,
      highestKKey: result.highestKKey,
    };
  }
</script>
