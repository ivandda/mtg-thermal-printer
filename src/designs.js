/** @import { Arrangement } from "./imaging/arrangement.js" */
/** @import { TextCard } from "./imaging/text-card.js" */
/** @import { Bitmap, Media } from "./printers/types.js" */
/** @import { ScryfallCard } from "./scryfall/client.js" */
import { CENTERED } from "./imaging/arrangement.js";
import { loadFonts } from "./imaging/canvas-text.js";
import { renderCard, TONES } from "./imaging/card.js";
import { loadImage } from "./imaging/images.js";
import { layoutMarkers, renderMarkers } from "./imaging/marker-sheet.js";
import { loadSymbols } from "./imaging/symbols.js";
import { layoutTextCard, renderTextCard } from "./imaging/text-card.js";
import { MARKERS } from "./markers.js";
import { cardFaces, cardText, imageUrl } from "./scryfall/client.js";
import { loadStoredImage } from "./token-store.js";

/**
 * What a label shows, as plain data: enough to draw it again on any label size, and to save it with
 * the print list.
 * @typedef {CardDesign | TokenDesign | MarkersDesign} Design
 */

/**
 * @typedef {object} CardDesign
 * @property {"card"} type
 * @property {ScryfallCard} card  The chosen printing.
 * @property {number} face
 * @property {"image" | "text"} [style]  Card image when missing, as saved before text style existed.
 * @property {Darkness} darkness
 * @property {boolean} cropBorder  Card image: leave out the black border.
 * @property {boolean} [art]  Text: include the art.
 */

/**
 * A custom token, as saved in this browser.
 * @typedef {object} Token
 * @property {string} id
 * @property {string} name
 * @property {string} typeLine
 * @property {string} power
 * @property {string} toughness
 * @property {string} rules
 * @property {TokenArt} [art]
 */

/**
 * A token's image, and how it is arranged in the art box. It is either an image the user added,
 * saved in this browser under an ID, or art from Scryfall.
 * @typedef {Arrangement & { source: { image: string } | { url: string } }} TokenArt
 */

/** @typedef {Token & { type: "token", darkness: Darkness }} TokenDesign */

/**
 * Markers packed onto as few labels as they need.
 * @typedef {{ type: "markers", counts: Record<string, number> }} MarkersDesign
 */

/** @typedef {keyof typeof TONES} Darkness */

export const DARKNESS = Object.keys(TONES);

/**
 * Draws a design for a label size. Most designs fill one label; markers can continue onto more.
 * @param {Design} design
 * @param {Media} media
 * @returns {Promise<Bitmap[]>}
 */
export async function renderDesign(design, media) {
  if (design.type === "markers") {
    await loadFonts();
    return renderMarkers(design.counts, media);
  }

  const tone = TONES[design.darkness];
  if (design.type === "token") {
    const art = design.art && { image: await loadArt(design.art), arrangement: design.art };
    const text = {
      name: design.name,
      manaCost: "",
      typeLine: design.typeLine,
      rules: design.rules,
      stats: statsOf(design),
    };
    return [await renderText({ ...text, art }, media, tone)];
  }

  const { card, face } = design;
  if (design.style === "text") {
    const artUrl = design.art ? imageUrl(card, face, "art_crop") : undefined;
    const art = artUrl ? { image: await loadImage(artUrl), arrangement: CENTERED } : undefined;
    const { name, manaCost, typeLine, rules, stats } = cardText(card, face);
    return [await renderText({ name, manaCost, typeLine, rules, stats, art }, media, tone)];
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
 * How many labels a design prints on, without drawing it.
 * @param {Design} design
 * @param {Media} media
 */
export function pageCount(design, media) {
  return design.type === "markers" ? layoutMarkers(design.counts, media).length : 1;
}

/**
 * @param {TextCard} card
 * @param {Media} media
 * @param {{ black: number, white: number, gamma: number }} tone
 */
async function renderText(card, media, tone) {
  const [symbols] = await Promise.all([loadSymbols(`${card.manaCost} ${card.rules}`), loadFonts()]);
  return renderTextCard(card, media, { tone, symbols });
}

/**
 * A token's image, decoded.
 * @param {TokenArt} art
 */
export function loadArt(art) {
  return "url" in art.source ? loadImage(art.source.url) : loadStoredImage(art.source.image);
}

/**
 * Where a token's image goes on the label, so it can be arranged there.
 * @param {Design} design
 * @param {Media} media
 */
export function artBoxOf(design, media) {
  if (design.type !== "token" || !design.art) return undefined;
  return layoutTextCard({ rules: design.rules, stats: statsOf(design), hasArt: true }, media).art;
}

/**
 * Whether a token has nothing on it yet.
 * @param {Token} token
 */
export function isBlankToken(token) {
  const { name, typeLine, power, toughness, rules, art } = token;
  return !name.trim() && !typeLine.trim() && !power && !toughness && !rules.trim() && !art;
}

/** @param {{ power: string, toughness: string }} token */
const statsOf = ({ power, toughness }) => (power || toughness ? `${power}/${toughness}` : "");

/**
 * A name and a short description of the choices made, e.g. for the print list.
 * @param {Design} design
 */
export function describeDesign(design) {
  if (design.type === "markers") {
    const chosen = MARKERS.filter(({ id }) => design.counts[id]).map(({ id, name }) =>
      design.counts[id] > 1 ? `${name} ×${design.counts[id]}` : name,
    );
    const detail =
      chosen.length > 3
        ? `${chosen.slice(0, 3).join(", ")} and ${chosen.length - 3} more`
        : chosen.join(", ");
    return { name: "Markers", detail };
  }
  if (design.type === "token") {
    const details = ["Custom token"];
    if (design.art && design.darkness !== "normal") details.push(design.darkness);
    return { name: design.name.trim() || "Untitled token", detail: details.join(", ") };
  }
  const { card, face, style, darkness, cropBorder, art } = design;
  const details = [`${card.set_name}, #${card.collector_number}`];
  if (style === "text") details.push(art ? "text with art" : "text");
  else if (cropBorder) details.push("no border");
  if (darkness !== "normal" && (style !== "text" || art)) details.push(darkness);
  return { name: cardFaces(card)[face]?.name ?? card.name, detail: details.join(", ") };
}
