/** @import { Media } from "../types.js" */

/**
 * @typedef {Media & { offsetRight: number, feedMargin: number }} BrotherMedia
 *   `offsetRight`: dots between the printable area and the right end of the print head.
 *   `feedMargin`: extra feed in dots, needed by continuous rolls and some small labels.
 */

export const MEDIA_TYPE = { continuous: 0x0a, dieCut: 0x0b };

/**
 * @param {string} id
 * @param {"continuous" | "die-cut" | "round"} kind
 * @param {[number, number]} sizeMm  Width and length.
 * @param {[number, number]} printable  Printable width and height in dots.
 * @param {number} offsetRight
 * @param {number} [feedMargin]
 * @returns {BrotherMedia}
 */
function label(
  id,
  kind,
  [widthMm, lengthMm],
  [printableWidth, printableHeight],
  offsetRight,
  feedMargin = 0,
) {
  const names = {
    continuous: `${widthMm} mm continuous`,
    "die-cut": `${widthMm} × ${lengthMm} mm die-cut`,
    round: `${widthMm} mm round`,
  };
  return {
    id,
    name: names[kind],
    widthMm,
    lengthMm,
    printableWidth,
    printableHeight,
    offsetRight,
    feedMargin,
  };
}

/** Labels the QL-700 takes. Dimensions from brother_ql's label table. */
export const MEDIA = [
  label("12", "continuous", [12, 0], [106, 0], 29, 35),
  label("18", "continuous", [18, 0], [234, 0], 171, 14),
  label("29", "continuous", [29, 0], [306, 0], 6, 35),
  label("38", "continuous", [38, 0], [413, 0], 12, 35),
  label("50", "continuous", [50, 0], [554, 0], 12, 35),
  label("54", "continuous", [54, 0], [590, 0], 0, 35),
  label("62", "continuous", [62, 0], [696, 0], 12, 35),
  label("17x54", "die-cut", [17, 54], [165, 566], 0),
  label("17x87", "die-cut", [17, 87], [165, 956], 0),
  label("23x23", "die-cut", [23, 23], [202, 202], 42),
  label("29x42", "die-cut", [29, 42], [306, 425], 6),
  label("29x90", "die-cut", [29, 90], [306, 991], 6),
  label("39x90", "die-cut", [38, 90], [413, 991], 12),
  label("39x48", "die-cut", [39, 48], [425, 495], 6),
  label("52x29", "die-cut", [52, 29], [578, 271], 0),
  label("54x29", "die-cut", [54, 29], [598, 271], 60),
  label("60x86", "die-cut", [60, 87], [672, 954], 18),
  label("62x29", "die-cut", [62, 29], [696, 271], 12),
  label("62x100", "die-cut", [62, 100], [696, 1109], 12),
  label("d12", "round", [12, 12], [94, 94], 113, 35),
  label("d24", "round", [24, 24], [236, 236], 42),
  label("d58", "round", [58, 58], [618, 618], 51),
];

/**
 * Finds the label described by a status reply.
 * @param {{ mediaType: number, widthMm: number, lengthMm: number }} status
 */
export function findMedia({ mediaType, widthMm, lengthMm }) {
  const length = mediaType === MEDIA_TYPE.continuous ? 0 : lengthMm;
  return MEDIA.find((media) => media.widthMm === widthMm && media.lengthMm === length) ?? null;
}
