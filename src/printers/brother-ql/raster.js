/**
 * Brother QL raster command encoding. The output is byte-for-byte what the brother_ql Python
 * library sends, which is proven on real printers; the tests compare against files it generated.
 */

/** @import { Bitmap } from "../types.js" */
/** @import { BrotherMedia } from "./media.js" */
import { MEDIA_TYPE } from "./media.js";

/**
 * @typedef {object} RasterModel
 * @property {number} bytesPerRow  Raster line length; the print head is bytesPerRow × 8 dots wide.
 * @property {number} invalidateBytes  Zero bytes sent first, to flush any half-received job.
 * @property {number} minRows  Shortest label a continuous roll can print, in dots.
 * @property {number} maxRows  Longest label a continuous roll can print, in dots.
 */

const ESC = 0x1b;
const RASTER_LINE = 0x67;
const PRINT = 0x1a;

/** @param {number} n */
const uint16 = (n) => [n & 0xff, (n >> 8) & 0xff];
/** @param {number} n */
const uint32 = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24];

/**
 * Encodes pages as one print job that cuts after every label.
 * @param {Bitmap[]} pages
 * @param {BrotherMedia} media
 * @param {RasterModel} model
 * @returns {Uint8Array<ArrayBuffer>}
 */
export function encodeJob(pages, media, model) {
  const chunks = [new Uint8Array(model.invalidateBytes), Uint8Array.of(ESC, 0x40)];
  for (const page of pages) {
    assertFits(page, media, model);
    chunks.push(pageHeader(page, media), rasterLines(page, media, model), Uint8Array.of(PRINT));
  }
  return concat(chunks);
}

/**
 * @param {Bitmap} page
 * @param {BrotherMedia} media
 */
function pageHeader(page, media) {
  const type = media.lengthMm ? MEDIA_TYPE.dieCut : MEDIA_TYPE.continuous;
  // Media & quality: 0xce marks type, width, length and high quality as set; the two trailing
  // bytes are the page flag and a reserved byte.
  // biome-ignore format: one command per line
  return Uint8Array.of(
    ESC, 0x69, 0x53, // status request
    ESC, 0x69, 0x7a, 0xce, type, media.widthMm, media.lengthMm, ...uint32(page.height), 0, 0,
    ESC, 0x69, 0x4d, 0x40, // auto cut
    ESC, 0x69, 0x41, 0x01, // cut every label
    ESC, 0x69, 0x4b, 0x08, // cut at end
    ESC, 0x69, 0x64, ...uint16(media.feedMargin), // margin
  );
}

/**
 * One raster line per row. The printer expects rows mirrored, placed `offsetRight` dots in from
 * the right end of the print head.
 * @param {Bitmap} page
 * @param {BrotherMedia} media
 * @param {RasterModel} model
 */
function rasterLines(page, media, model) {
  const lineLength = 3 + model.bytesPerRow;
  const lines = new Uint8Array(page.height * lineLength);
  for (let y = 0; y < page.height; y++) {
    const line = y * lineLength;
    lines.set([RASTER_LINE, 0x00, model.bytesPerRow], line);
    for (let x = 0; x < page.width; x++) {
      if (!page.pixels[y * page.width + x]) continue;
      const dot = page.width - 1 - x + media.offsetRight;
      lines[line + 3 + (dot >> 3)] |= 0x80 >> (dot & 7);
    }
  }
  return lines;
}

/**
 * @param {Bitmap} page
 * @param {BrotherMedia} media
 * @param {RasterModel} model
 */
function assertFits(page, media, model) {
  if (page.width !== media.printableWidth) {
    throw new RangeError(`${media.name} needs pages ${media.printableWidth} dots wide, got ${page.width}`);
  }
  if (media.printableHeight) {
    if (page.height !== media.printableHeight) {
      throw new RangeError(
        `${media.name} needs pages ${media.printableHeight} dots tall, got ${page.height}`,
      );
    }
  } else if (page.height < model.minRows || page.height > model.maxRows) {
    throw new RangeError(`Pages must be ${model.minRows}–${model.maxRows} dots tall, got ${page.height}`);
  }
}

/** @param {Uint8Array[]} chunks */
function concat(chunks) {
  const bytes = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
