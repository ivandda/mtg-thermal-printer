import { localStore } from "../storage.js";

const STORAGE_KEY = "settings";

/** Choices remembered in this browser, such as the label size. */
function readAll() {
  try {
    return JSON.parse(localStore()?.getItem(STORAGE_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

/**
 * @param {string} name
 * @returns {unknown}
 */
export function readSetting(name) {
  return readAll()[name];
}

/**
 * @param {string} name
 * @param {unknown} value
 */
export function writeSetting(name, value) {
  try {
    localStore()?.setItem(STORAGE_KEY, JSON.stringify({ ...readAll(), [name]: value }));
  } catch {
    // Unavailable storage means the choice lasts for this visit.
  }
}
