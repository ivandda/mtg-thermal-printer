/** @import { Bitmap, Media } from "../printers/types.js" */
import { ditherToBitmap } from "./bitmap.js";

const CARD_ASPECT = 88 / 63; // height ÷ width of a real Magic card

/**
 * The largest card-shaped box that fits the printable area.
 * @param {Media} media
 */
export function cardSize(media) {
  const height = Math.round(media.printableWidth * CARD_ASPECT);
  if (media.printableHeight && height > media.printableHeight) {
    return { width: Math.round(media.printableHeight / CARD_ASPECT), height: media.printableHeight };
  }
  return { width: media.printableWidth, height };
}

/**
 * Draws a card as large as the label allows, centered, and converts it for printing. The image is
 * cropped to card proportions, never stretched.
 * @param {ImageBitmap} image
 * @param {Media} media
 * @returns {Bitmap}
 */
export function renderCard(image, media) {
  const card = cardSize(media);
  const width = media.printableWidth;
  const height = media.printableHeight || card.height;
  const context = new OffscreenCanvas(width, height).getContext("2d");
  if (!context) throw new Error("Canvas is not available");

  const scale = Math.max(card.width / image.width, card.height / image.height);
  const cropWidth = card.width / scale;
  const cropHeight = card.height / scale;
  context.fillStyle = "white";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    (image.width - cropWidth) / 2,
    (image.height - cropHeight) / 2,
    cropWidth,
    cropHeight,
    Math.round((width - card.width) / 2),
    Math.round((height - card.height) / 2),
    card.width,
    card.height,
  );
  return ditherToBitmap(context.getImageData(0, 0, width, height));
}
