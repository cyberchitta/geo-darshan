import { writable, derived } from "svelte/store";

// Animation state
export const currentFrame = writable(0);
export const totalFrames = writable(0);
export const isPlaying = writable(false);
export const animationSpeed = writable(1.0);

// Data state
export const overlayData = writable([]);
export const manifest = writable(null);
export const clusterData = writable({}); // Add this: stores cluster info by segmentation
export const allClusterData = writable({}); // Add this: raw cluster data from viewer

// Labels and selection
export const clusterLabels = writable({});
export const selectedClusterId = writable(null);
export const currentSegmentationKey = writable(null);

// UI state
export const activeTab = writable("clusters");
export const hierarchyLevel = writable(1);
export const overlayOpacity = writable(0.8);

// Derived stores
export const currentSegmentationData = derived(
  [allClusterData, currentSegmentationKey],
  ([$allClusterData, $currentSegmentationKey]) => {
    return $currentSegmentationKey
      ? $allClusterData[$currentSegmentationKey]
      : null;
  }
);

export const frameProgress = derived(
  [currentFrame, totalFrames],
  ([$currentFrame, $totalFrames]) => {
    return $totalFrames > 0 ? ($currentFrame / ($totalFrames - 1)) * 100 : 0;
  }
);
