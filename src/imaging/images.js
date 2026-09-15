const CACHE_SIZE = 12;

/** @type {Map<string, Promise<ImageBitmap>>} */
const cache = new Map();

/**
 * Downloads and decodes an image, keeping the most recently used ones. A failed download rejects
 * with a TypeError, like fetch does, and is not kept.
 * @param {string} url
 */
export function loadImage(url) {
  let image = cache.get(url);
  if (image) {
    cache.delete(url); // re-inserted below as the most recently used
  } else {
    image = fetch(url)
      .then((response) => {
        if (!response.ok) throw new TypeError(`Image download failed (${response.status})`);
        return response.blob();
      })
      .then((blob) => createImageBitmap(blob));
    image.catch(() => cache.delete(url));
  }
  cache.set(url, image);
  const [oldest] = cache.keys();
  if (cache.size > CACHE_SIZE) cache.delete(oldest);
  return image;
}

const STORED_IMAGE_SIZE = 1600;

/**
 * Decodes an image the user added and shrinks it to at most 1600 pixels on its longer side: more
 * than a label needs, even zoomed in, and small enough to save in the browser.
 * @param {Blob} file
 * @returns {Promise<Blob>}
 */
export async function prepareImage(file) {
  const image = await createImageBitmap(file);
  const scale = Math.min(1, STORED_IMAGE_SIZE / Math.max(image.width, image.height));
  const canvas = new OffscreenCanvas(Math.round(image.width * scale), Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available");
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  return canvas.convertToBlob({ type: "image/webp", quality: 0.92 });
}
