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
