export function convertToGrayscale(color) {
  const gray = Math.round(0.299 * color.r + 0.587 * color.g + 0.114 * color.b);
  return { r: gray, g: gray, b: gray, a: color.a };
}

export function extractKValue(segmentationKey) {
  const match = segmentationKey.match(/k(\d+)/);
  return match ? parseInt(match[1]) : null;
}

export function compareSegmentationKeys(a, b) {
  return extractKValue(a) - extractKValue(b);
}

export function rgbStringToObject(rgbString) {
  const match = rgbString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  return match
    ? {
        r: parseInt(match[1]),
        g: parseInt(match[2]),
        b: parseInt(match[3]),
        a: 255,
      }
    : null;
}

export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}`;
}

export function rgbToHex(rgbString) {
  const match = rgbString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!match) return null;
  const [_, r, g, b] = match;
  return `#${[r, g, b].map((n) => parseInt(n).toString(16).padStart(2, "0")).join("")}`;
}

export const STORAGE_KEYS = {
  CLUSTER_LABELS: "cluster-labels-v2",
  ACTIVE_PANEL: "activePanel-v1",
  DATASET_INFO_COLLAPSED: "datasetInfoCollapsed-v1",
  LABELED_REGIONS_VISIBLE: "labeledRegionsVisible-v1",
  LABELED_REGIONS_OPACITY: "labeledRegionsOpacity-v1",
};

export const SEGMENTATION_KEYS = {
  SYNTHETIC: "synthetic_seg",
  COMPOSITE: "composite_seg",
  INTERACTIVE: "interactive_seg",
};

export const CLUSTER_ID_RANGES = {
  NODATA: -1,
  UNLABELED: 9999,
  SYNTHETIC_START: 10000,
  FINE_GRAIN_START: 50000,
  SELECTED_REGION: -2,

  isSelected(clusterId) {
    return clusterId === this.SELECTED_REGION;
  },

  isSynthetic(clusterId) {
    return (
      clusterId >= this.SYNTHETIC_START && clusterId < this.FINE_GRAIN_START
    );
  },

  isFineGrain(clusterId) {
    return clusterId >= this.FINE_GRAIN_START;
  },

  isRegular(clusterId) {
    return clusterId >= 0 && clusterId < this.SYNTHETIC_START;
  },

  isNoData(clusterId) {
    return clusterId === this.NODATA;
  },

  isUnlabeled(clusterId) {
    return clusterId === this.UNLABELED;
  },
};
