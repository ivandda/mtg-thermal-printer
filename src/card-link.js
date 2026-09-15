/** @import { Token } from "./designs.js" */
import { cardOf, fromBase64, toBase64 } from "./backup.js";

/**
 * Links that carry a custom card, so it can be sent to someone and added to their My cards. The card
 * is written into the address itself, so nothing is uploaded; images added from a device stay there.
 */

export const LINK_PARAM = "shared";

/**
 * @param {Token} token
 * @param {string} page  The app's address.
 */
export function cardLink(token, page) {
  const { id, name, manaCost = "", typeLine, power, toughness, rules, art } = token;
  const card = {
    id,
    name,
    manaCost,
    typeLine,
    power,
    toughness,
    rules,
    ...(art && "url" in art.source && { art }),
  };
  const url = new URL(page);
  url.search = new URLSearchParams({ mode: "create", [LINK_PARAM]: encode(JSON.stringify(card)) }).toString();
  url.hash = "";
  return url.href;
}

/**
 * The card a link carries, or undefined when the link is damaged.
 * @param {string} value  The link's parameter.
 * @returns {Token | undefined}
 */
export function readCardLink(value) {
  let card;
  try {
    card = cardOf(JSON.parse(decode(value)));
  } catch {
    return undefined;
  }
  if (card?.art && !("url" in card.art.source)) delete card.art;
  return card;
}

/**
 * Base64 with the URL-safe alphabet and no padding, so it needs no escaping in an address.
 * @param {string} text
 */
const encode = (text) =>
  toBase64(new TextEncoder().encode(text)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

/** @param {string} value */
const decode = (value) =>
  new TextDecoder("utf-8", { fatal: true }).decode(
    fromBase64(value.replaceAll("-", "+").replaceAll("_", "/")),
  );
