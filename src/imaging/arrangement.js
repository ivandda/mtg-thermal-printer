/**
 * How an image sits in its box. At zoom 1, "fill" covers the box and crops the image, and "fit"
 * shows all of it. `x` and `y` are the point of the image, as fractions of its width and height,
 * that sits at the centre of the box.
 * @typedef {{ fit: "fill" | "fit", zoom: number, x: number, y: number }} Arrangement
 */

/** @typedef {{ width: number, height: number }} Size */
/** @typedef {{ x: number, y: number }} Point */

export const MAX_ZOOM = 4;

/** @type {Arrangement} */
export const CENTERED = { fit: "fill", zoom: 1, x: 0.5, y: 0.5 };

/**
 * The nearest arrangement that keeps the zoom between 1 and MAX_ZOOM and the image over the box:
 * no gap opens at an edge, unless the image is smaller than the box that way, when it is centred.
 * @param {Arrangement} arrangement
 * @param {Size} image
 * @param {Size} box
 * @returns {Arrangement}
 */
export function clampArrangement(arrangement, image, box) {
  const zoom = Math.min(Math.max(arrangement.zoom, 1), MAX_ZOOM);
  const scale = scaleOf({ ...arrangement, zoom }, image, box);
  /**
   * @param {number} center
   * @param {number} boxSize
   * @param {number} imageSize
   */
  const clamp = (center, boxSize, imageSize) => {
    const half = boxSize / (2 * scale * imageSize); // half the box, as a fraction of the image
    return half >= 0.5 ? 0.5 : Math.min(Math.max(center, half), 1 - half);
  };
  return {
    fit: arrangement.fit,
    zoom,
    x: clamp(arrangement.x, box.width, image.width),
    y: clamp(arrangement.y, box.height, image.height),
  };
}

/**
 * Where to draw the image, relative to the box's top-left corner. Its proportions never change.
 * @param {Size} image
 * @param {Size} box
 * @param {Arrangement} arrangement
 */
export function placeImage(image, box, arrangement) {
  const clamped = clampArrangement(arrangement, image, box);
  const scale = scaleOf(clamped, image, box);
  const width = image.width * scale;
  const height = image.height * scale;
  return { x: box.width / 2 - clamped.x * width, y: box.height / 2 - clamped.y * height, width, height };
}

/**
 * Moves the image by a distance in box pixels.
 * @param {Arrangement} arrangement
 * @param {number} dx
 * @param {number} dy
 * @param {Size} image
 * @param {Size} box
 */
export function moveArrangement(arrangement, dx, dy, image, box) {
  const scale = scaleOf(arrangement, image, box);
  return clampArrangement(
    {
      ...arrangement,
      x: arrangement.x - dx / (image.width * scale),
      y: arrangement.y - dy / (image.height * scale),
    },
    image,
    box,
  );
}

/**
 * Zooms, keeping the point of the image under `focus` (in box pixels) where it is.
 * @param {Arrangement} arrangement
 * @param {number} zoom
 * @param {Point} focus
 * @param {Size} image
 * @param {Size} box
 */
export function zoomArrangement(arrangement, zoom, focus, image, box) {
  const before = scaleOf(arrangement, image, box);
  const zoomed = clampArrangement({ ...arrangement, zoom }, image, box);
  const after = scaleOf(zoomed, image, box);
  const dx = focus.x - box.width / 2;
  const dy = focus.y - box.height / 2;
  return clampArrangement(
    {
      ...zoomed,
      x: arrangement.x + dx / (image.width * before) - dx / (image.width * after),
      y: arrangement.y + dy / (image.height * before) - dy / (image.height * after),
    },
    image,
    box,
  );
}

/**
 * Image pixels to box pixels.
 * @param {Arrangement} arrangement
 * @param {Size} image
 * @param {Size} box
 */
function scaleOf({ fit, zoom }, image, box) {
  const ratios = [box.width / image.width, box.height / image.height];
  return (fit === "fill" ? Math.max(...ratios) : Math.min(...ratios)) * zoom;
}
