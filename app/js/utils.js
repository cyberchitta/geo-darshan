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
