/** @import { Bitmap } from "../printers/types.js" */

/**
 * Converts RGBA pixels (e.g. canvas ImageData) to a 1-bit bitmap: anything darker than mid-grey
 * prints black. Transparent pixels count as white paper.
 * @param {{ width: number, height: number, data: Uint8ClampedArray }} image
 * @returns {Bitmap}
 */
export function thresholdToBitmap({ width, height, data }) {
  const pixels = new Uint8Array(width * height);
  for (let i = 0; i < pixels.length; i++) {
    const [red, green, blue, alpha] = data.subarray(i * 4, i * 4 + 4);
    const luma = 0.299 * red + 0.587 * green + 0.114 * blue;
    const onPaper = 255 - (alpha / 255) * (255 - luma);
    pixels[i] = onPaper < 128 ? 1 : 0;
  }
  return { width, height, pixels };
}
