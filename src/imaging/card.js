/** @import { Bitmap, Media } from "../printers/types.js" */
import { ditherToBitmap } from "./bitmap.js";

const CARD_ASPECT = 88 / 63; // height ÷ width of a real Magic card

/**
 * The black border of a Scryfall card image, as a fraction of its size, measured on the card frame
 * used since 2015. Older frames keep a thin black edge when it is cropped.
 */
const BORDER = { side: 0.04, top: 0.029, bottom: 0.033 };

/** Tone presets behind the darkness control; see ditherToBitmap. */
export const TONES = {
  lighter: { black: 55, white: 185, gamma: 0.8 },
  normal: { black: 40, white: 195, gamma: 0.9 },
  darker: { black: 25, white: 215, gamma: 1.05 },
};

/**
 * The largest box with the given proportions that fits the printable area. On round labels its
 * corners must stay inside the circle.
 * @param {Media} media
 * @param {number} [aspect]  Height ÷ width; a whole card by default.
 */
export function cardSize(media, aspect = CARD_ASPECT) {
  if (media.shape === "round") {
    const width = Math.floor(media.printableWidth / Math.hypot(1, aspect));
    return { width, height: Math.floor(width * aspect) };
  }
  const height = Math.round(media.printableWidth * aspect);
  if (media.printableHeight && height > media.printableHeight) {
    return { width: Math.round(media.printableHeight / aspect), height: media.printableHeight };
  }
  return { width: media.printableWidth, height };
}

/**
 * Draws a card as large as the label allows, centered, and converts it for printing. The image is
 * cropped to fit, never stretched.
 * @param {ImageBitmap} image
 * @param {Media} media
 * @param {object} [options]
 * @param {{ black: number, white: number, gamma: number }} [options.tone]
 * @param {boolean} [options.cropBorder]  Leave out the black border, so the art and text print larger.
 * @returns {Bitmap}
 */
export function renderCard(image, media, { tone = TONES.normal, cropBorder = false } = {}) {
  const border = cropBorder ? BORDER : { side: 0, top: 0, bottom: 0 };
  const sourceWidth = image.width * (1 - 2 * border.side);
  const sourceHeight = image.height * (1 - border.top - border.bottom);
  const card = cardSize(media, cropBorder ? sourceHeight / sourceWidth : CARD_ASPECT);

  const scale = Math.max(card.width / sourceWidth, card.height / sourceHeight);
  const cropWidth = card.width / scale;
  const cropHeight = card.height / scale;
  const cropX = image.width * border.side + (sourceWidth - cropWidth) / 2;
  const cropY = image.height * border.top + (sourceHeight - cropHeight) / 2;

  const width = media.printableWidth;
  const height = media.printableHeight || card.height;
  const context = new OffscreenCanvas(width, height).getContext("2d");
  if (!context) throw new Error("Canvas is not available");
  context.fillStyle = "white";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    Math.round((width - card.width) / 2),
    Math.round((height - card.height) / 2),
    card.width,
    card.height,
  );
  return ditherToBitmap(context.getImageData(0, 0, width, height), tone);
}
