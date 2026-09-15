/** @import { Token } from "./designs.js" */

const DATABASE = "mtg-thermal-printer";

/** @type {Promise<IDBDatabase> | undefined} */
let opening;

/** @type {Map<string, Promise<ImageBitmap>>} */
const bitmaps = new Map();

function database() {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("tokens", { keyPath: "id" });
      request.result.createObjectStore("images");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  opening.catch(() => {
    opening = undefined;
  });
  return opening;
}

/**
 * @template T
 * @param {"tokens" | "images"} name
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => IDBRequest<T>} operation
 * @returns {Promise<T>}
 */
async function run(name, mode, operation) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = operation(db.transaction(name, mode).objectStore(name));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Custom tokens and the images added to them, saved in this browser's IndexedDB. */
export const tokenStore = {
  /** @returns {Promise<Token[]>} */
  list: () => run("tokens", "readonly", (store) => store.getAll()),

  /** @param {Token} token */
  save: (token) => run("tokens", "readwrite", (store) => store.put(token)),

  /** @param {string} id */
  delete: (id) => run("tokens", "readwrite", (store) => store.delete(id)),

  /**
   * @param {Blob} image
   * @returns {Promise<string>}  The image's ID.
   */
  async saveImage(image) {
    const id = crypto.randomUUID();
    await run("images", "readwrite", (store) => store.put(image, id));
    return id;
  },

  /** @returns {Promise<string[]>} */
  imageIds: () => run("images", "readonly", (store) => store.getAllKeys()).then((keys) => keys.map(String)),

  /** @param {string} id */
  deleteImage(id) {
    bitmaps.delete(id);
    return run("images", "readwrite", (store) => store.delete(id));
  },
};

/**
 * A saved image, decoded for drawing.
 * @param {string} id
 */
export function loadStoredImage(id) {
  let bitmap = bitmaps.get(id);
  if (!bitmap) {
    bitmap = run("images", "readonly", (store) => store.get(id)).then((blob) => {
      if (!(blob instanceof Blob)) throw new Error("This token's image is no longer saved in this browser.");
      return createImageBitmap(blob);
    });
    bitmaps.set(id, bitmap);
    bitmap.catch(() => bitmaps.delete(id));
  }
  return bitmap;
}
