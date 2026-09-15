/** @import { Token, TokenArt } from "./designs.js" */

/**
 * Backups of My cards: the cards and the images added to them, in one JSON file that can be kept or
 * restored in another browser.
 */

const FORMAT = "mtg-thermal-printer/my-cards";
const VERSION = 1;
const NOT_A_BACKUP = "This file isn't a backup of My cards. Choose a file made with Back up.";
const SCRYFALL_IMAGE = /^https:\/\/[a-z0-9.-]+\.scryfall\.io\//;

/** @typedef {{ type: string, bytes: Uint8Array<ArrayBuffer> }} BackupImage */

/**
 * @param {Token[]} cards
 * @param {Map<string, BackupImage>} images  The images the cards use, by ID.
 * @returns {string}
 */
export function writeBackup(cards, images) {
  /** @type {Record<string, { type: string, data: string }>} */
  const encoded = {};
  for (const [id, { type, bytes }] of images) encoded[id] = { type, data: toBase64(bytes) };
  return JSON.stringify({ format: FORMAT, version: VERSION, cards, images: encoded });
}

/**
 * The cards and images in a backup. Damaged cards are left out, and a card whose image is missing
 * comes back without it.
 * @param {string} text
 * @returns {{ cards: Token[], images: Map<string, BackupImage> }}
 * @throws {Error} with a message to show, when the file isn't a backup.
 */
export function readBackup(text) {
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error(NOT_A_BACKUP);
  }
  if (backup?.format !== FORMAT || !Array.isArray(backup.cards)) throw new Error(NOT_A_BACKUP);
  if (!(backup.version <= VERSION)) {
    throw new Error("This backup was made by a newer version of this page. Reload the page and try again.");
  }

  /** @type {Map<string, BackupImage>} */
  const images = new Map();
  for (const [id, image] of Object.entries(backup.images ?? {})) {
    if (
      typeof image?.type !== "string" ||
      !image.type.startsWith("image/") ||
      typeof image.data !== "string"
    ) {
      continue;
    }
    try {
      images.set(id, { type: image.type, bytes: fromBase64(image.data) });
    } catch {
      // A damaged image is left out; its card comes back without it.
    }
  }

  /** @type {Token[]} */
  const cards = [];
  for (const value of backup.cards) {
    const card = cardOf(value);
    if (!card) continue;
    if (card.art && "image" in card.art.source && !images.has(card.art.source.image)) delete card.art;
    cards.push(card);
  }
  return { cards, images };
}

/**
 * A card read from a file or a link, with only the fields a card has, or undefined when it's damaged.
 * @param {any} value
 * @returns {Token | undefined}
 */
export function cardOf(value) {
  const texts = ["id", "name", "typeLine", "power", "toughness", "rules"];
  if (!texts.every((field) => typeof value?.[field] === "string")) return undefined;
  if (value.manaCost !== undefined && typeof value.manaCost !== "string") return undefined;
  const art = value.art === undefined ? undefined : artOf(value.art);
  if (value.art !== undefined && !art) return undefined;
  const { id, name, manaCost = "", typeLine, power, toughness, rules } = value;
  return { id, name, manaCost, typeLine, power, toughness, rules, ...(art && { art }) };
}

/**
 * @param {any} value
 * @returns {TokenArt | undefined}
 */
function artOf(value) {
  const { source, fit, zoom, x, y } = value ?? {};
  if ((fit !== "fill" && fit !== "fit") || ![zoom, x, y].every(Number.isFinite)) return undefined;
  if (typeof source?.image === "string") return { fit, zoom, x, y, source: { image: source.image } };
  if (typeof source?.url === "string" && SCRYFALL_IMAGE.test(source.url)) {
    return { fit, zoom, x, y, source: { url: source.url } };
  }
  return undefined;
}

/** @param {Uint8Array} bytes */
export function toBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let start = 0; start < bytes.length; start += chunk) {
    binary += String.fromCharCode(...bytes.subarray(start, start + chunk));
  }
  return btoa(binary);
}

/** @param {string} data */
export function fromBase64(data) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
