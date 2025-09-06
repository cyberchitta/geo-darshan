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
  return result
    ? `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(
        result[3],
        16
      )}`
    : "128,128,128";
}

export const STORAGE_KEYS = {
  CLUSTER_LABELS: "cluster-labels-v2",
  ACTIVE_PANEL: "activePanel-v1",
  DATASET_INFO_COLLAPSED: "datasetInfoCollapsed-v1",
  LABELED_REGIONS_VISIBLE: "labeledRegionsVisible-v1",
  LABELED_REGIONS_OPACITY: "labeledRegionsOpacity-v1",
};
