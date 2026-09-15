/** @import { Bitmap } from "../printers/types.js" */

/** @typedef {{ width: number, height: number, data: Uint8ClampedArray }} RgbaImage  e.g. canvas ImageData */

/**
 * Converts drawings (text, lines) to a 1-bit bitmap: anything darker than mid-grey prints black.
 * @param {RgbaImage} image
 * @returns {Bitmap}
 */
export function thresholdToBitmap(image) {
  const pixels = Uint8Array.from(paperBrightness(image), (value) => (value < 128 ? 1 : 0));
  return { width: image.width, height: image.height, pixels };
}

/**
 * Converts photos and card art to a 1-bit bitmap. A tone curve first turns everything darker than
 * `black` into pure black and lighter than `white` into pure white, so text and frames stay crisp;
 * Floyd–Steinberg dithering then renders the midtones.
 * @param {RgbaImage} image
 * @param {{ black?: number, white?: number, gamma?: number }} [tone]
 * @returns {Bitmap}
 */
export function ditherToBitmap(image, { black = 40, white = 195, gamma = 0.9 } = {}) {
  const { width, height } = image;
  const values = paperBrightness(image).map(
    (value) => Math.min(Math.max((value - black) / (white - black), 0), 1) ** gamma * 255,
  );
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const ink = values[i] < 128;
      pixels[i] = ink ? 1 : 0;
      const error = values[i] - (ink ? 0 : 255);
      if (x + 1 < width) values[i + 1] += (error * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) values[i + width - 1] += (error * 3) / 16;
        values[i + width] += (error * 5) / 16;
        if (x + 1 < width) values[i + width + 1] += error / 16;
      }
    }
  }
  return { width, height, pixels };
}

/**
 * Shrinks a bitmap for display by averaging the dots under each screen pixel into a grey, the way
 * they blend on paper at arm's length. Letting the browser scale 1-bit dots turns them into noise.
 * @param {Bitmap} bitmap
 * @param {number} width  Display width in device pixels.
 */
export function shrinkBitmap(bitmap, width) {
  const scale = bitmap.width / width;
  const height = Math.max(1, Math.round(bitmap.height / scale));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const top = Math.floor(y * scale);
    const bottom = Math.max(top + 1, Math.min(bitmap.height, Math.floor((y + 1) * scale)));
    for (let x = 0; x < width; x++) {
      const left = Math.floor(x * scale);
      const right = Math.max(left + 1, Math.min(bitmap.width, Math.floor((x + 1) * scale)));
      let ink = 0;
      for (let row = top; row < bottom; row++) {
        for (let column = left; column < right; column++) ink += bitmap.pixels[row * bitmap.width + column];
      }
      const grey = 255 - Math.round((255 * ink) / ((bottom - top) * (right - left)));
      data.set([grey, grey, grey, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

/**
 * Brightness of each pixel as it would look on white paper (transparent means paper), 0–255,
 * with the ITU-R 601 luma weights that Pillow's grayscale conversion also uses.
 * @param {RgbaImage} image
 */
function paperBrightness({ width, height, data }) {
  const values = new Float32Array(width * height);
  for (let i = 0; i < values.length; i++) {
    const offset = i * 4;
    const luma = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
    values[i] = 255 - (data[offset + 3] / 255) * (255 - luma);
  }
  return values;
}
