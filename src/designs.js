/** @import { Bitmap, Media } from "./printers/types.js" */
/** @import { ScryfallCard } from "./scryfall/client.js" */
import { renderCard, TONES } from "./imaging/card.js";
import { loadImage } from "./imaging/images.js";
import { loadSymbols } from "./imaging/symbols.js";
import { loadFonts, renderTextCard } from "./imaging/text-card.js";
import { cardFaces, cardText, imageUrl } from "./scryfall/client.js";

/**
 * What a label shows, as plain data: enough to draw it again on any label size, and to save it with
 * the print list.
 * @typedef {object} CardDesign
 * @property {"card"} type
 * @property {ScryfallCard} card  The chosen printing.
 * @property {number} face
 * @property {"image" | "text"} [style]  Card image when missing, as saved before text style existed.
 * @property {Darkness} darkness
 * @property {boolean} cropBorder  Card image: leave out the black border.
 * @property {boolean} [art]  Text: include the art.
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
  const { card, face, darkness } = design;
  const tone = TONES[darkness];

  if (design.style === "text") {
    const text = cardText(card, face);
    const artUrl = design.art ? imageUrl(card, face, "art_crop") : undefined;
    const [art, symbols] = await Promise.all([
      artUrl ? loadImage(artUrl) : undefined,
      loadSymbols(`${text.manaCost} ${text.rules}`),
      loadFonts(),
    ]);
    return [renderTextCard({ ...text, art }, media, { tone, symbols })];
  }

  // The PNG is larger than the print head is wide and has no JPEG blur on small text.
  const url = imageUrl(card, face, "png") ?? imageUrl(card, face);
  if (!url) throw new Error(`Scryfall has no image of ${card.name}.`);
  const image = await loadImage(url);
  return [
    renderCard(image, media, { tone, cropBorder: design.cropBorder && card.border_color !== "borderless" }),
  ];
}

/**
 * A name and a short description of the choices made, e.g. for the print list.
 * @param {Design} design
 */
export function describeDesign({ card, face, style, darkness, cropBorder, art }) {
  const details = [`${card.set_name}, #${card.collector_number}`];
  if (style === "text") details.push(art ? "text with art" : "text");
  else if (cropBorder) details.push("no border");
  if (darkness !== "normal" && (style !== "text" || art)) details.push(darkness);
  return { name: cardFaces(card)[face]?.name ?? card.name, detail: details.join(", ") };
}
