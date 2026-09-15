/** @import { Bitmap, Media } from "./printers/types.js" */
/** @import { ScryfallCard } from "./scryfall/client.js" */
import { renderCard, TONES } from "./imaging/card.js";
import { loadImage } from "./imaging/images.js";
import { cardFaces, imageUrl } from "./scryfall/client.js";

/**
 * What a label shows, as plain data: enough to draw it again on any label size, and to save it with
 * the print list.
 * @typedef {object} CardDesign
 * @property {"card"} type
 * @property {ScryfallCard} card  The chosen printing.
 * @property {number} face
 * @property {Darkness} darkness
 * @property {boolean} cropBorder
 */

/** @typedef {CardDesign} Design */
/** @typedef {keyof typeof TONES} Darkness */

export const DARKNESS = Object.keys(TONES);

/**
 * Draws a design for a label size. Most designs fill one label; the result is a list so a design
 * can continue onto more.
 * @param {Design} design
 * @param {Media} media
 * @returns {Promise<Bitmap[]>}
 */
export async function renderDesign(design, media) {
  const { card, face, darkness, cropBorder } = design;
  const url = imageUrl(card, face);
  if (!url) throw new Error(`Scryfall has no image of ${card.name}.`);
  const image = await loadImage(url);
  return [
    renderCard(image, media, {
      tone: TONES[darkness],
      cropBorder: cropBorder && card.border_color !== "borderless",
    }),
  ];
}

/**
 * A name and a short description of the choices made, e.g. for the print list.
 * @param {Design} design
 */
export function describeDesign({ card, face, darkness, cropBorder }) {
  const details = [`${card.set_name}, #${card.collector_number}`];
  if (darkness !== "normal") details.push(darkness);
  if (cropBorder) details.push("no border");
  return { name: cardFaces(card)[face]?.name ?? card.name, detail: details.join(", ") };
}
