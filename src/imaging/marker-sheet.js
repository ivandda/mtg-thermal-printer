/** @import { Marker } from "../markers.js" */
/** @import { Bitmap, Media } from "../printers/types.js" */
import { MARKERS } from "../markers.js";
import { thresholdToBitmap } from "./bitmap.js";
import { canvasContext, fitLine, font, TEXT_THRESHOLD } from "./canvas-text.js";
import { parseRules, wrapParagraph } from "./rules-text.js";

/** Marker sizes in millimetres, before shrinking to fit a small label. */
const SIZES = {
  game: { width: 27, height: 22 },
  tracker: { width: 56, height: 14 },
  keyword: { width: 27, height: 9 },
};
const GAP_MM = 1.5;
const MARGIN_MM = 1.5;
/** Length of a continuous label that has no markers on it yet. */
const EMPTY_LENGTH_MM = 20;
const REMINDER_LINES = 4;

/** @typedef {{ width: number, height: number }} Size */

/**
 * @typedef {object} PlacedMarker
 * @property {Marker} marker
 * @property {number} unit  Dots per millimetre of the marker's design, after any shrinking.
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * Places boxes in rows, left to right and top to bottom, each row centred, starting a new page when
 * one is full. A page height of 0 means the page grows to fit everything. Positions are relative
 * to the area; on fixed-height pages the rows are centred vertically too.
 * @param {Size[]} boxes
 * @param {Size} area
 * @param {number} gap
 * @returns {{ height: number, places: { index: number, x: number, y: number }[] }[]}
 */
export function packRows(boxes, area, gap) {
  /** @typedef {{ width: number, height: number, items: number[] }} Row */
  /** @type {Row[][]} */
  const pages = [[]];
  /** @param {Row[]} rows */
  const used = (rows) =>
    rows.reduce((total, row) => total + row.height, 0) + gap * Math.max(0, rows.length - 1);

  boxes.forEach((box, index) => {
    let rows = /** @type {Row[]} */ (pages.at(-1));
    const row = rows.at(-1);
    if (row && row.width + gap + box.width <= area.width) {
      const grown = used(rows) - row.height + Math.max(row.height, box.height);
      if (!area.height || grown <= area.height) {
        row.items.push(index);
        row.width += gap + box.width;
        row.height = Math.max(row.height, box.height);
        return;
      }
    }
    if (area.height && rows.length > 0 && used(rows) + gap + box.height > area.height) {
      rows = [];
      pages.push(rows);
    }
    rows.push({ width: box.width, height: box.height, items: [index] });
  });

  return pages.map((rows) => {
    const height = used(rows);
    let y = area.height ? (area.height - height) / 2 : 0;
    const places = [];
    for (const row of rows) {
      let x = (area.width - row.width) / 2;
      for (const index of row.items) {
        places.push({ index, x: Math.round(x), y: Math.round(y + (row.height - boxes[index].height) / 2) });
        x += boxes[index].width + gap;
      }
      y += row.height + gap;
    }
    return { height, places };
  });
}

/**
 * Where markers go on labels: the counts, in catalogue order, packed onto as few labels as they
 * need. Round labels use the square inside the circle. Sizes are in dots.
 * @param {Record<string, number>} counts  By marker ID.
 * @param {Media} media
 * @returns {{ height: number, markers: PlacedMarker[] }[]}
 */
export function layoutMarkers(counts, media) {
  const dotsPerMm = media.dpi / 25.4;
  const margin = MARGIN_MM * dotsPerMm;
  const side = Math.floor(media.printableWidth / Math.SQRT2);
  const frame =
    media.shape === "round"
      ? {
          x: (media.printableWidth - side) / 2,
          y: (media.printableHeight - side) / 2,
          width: side,
          height: side,
        }
      : { x: 0, y: 0, width: media.printableWidth, height: media.printableHeight };
  const area = { width: frame.width - 2 * margin, height: frame.height && frame.height - 2 * margin };

  const boxes = MARKERS.flatMap((marker) =>
    Array.from({ length: counts[marker.id] ?? 0 }, () => {
      const size = SIZES[marker.kind];
      const fitWidth = area.width / (size.width * dotsPerMm);
      const fitHeight = area.height ? area.height / (size.height * dotsPerMm) : 1;
      const unit = dotsPerMm * Math.min(1, fitWidth, fitHeight);
      return { marker, unit, width: Math.floor(size.width * unit), height: Math.floor(size.height * unit) };
    }),
  );

  return packRows(boxes, area, Math.round(GAP_MM * dotsPerMm)).map((page) => ({
    height:
      media.printableHeight || Math.round(Math.max(page.height, EMPTY_LENGTH_MM * dotsPerMm) + 2 * margin),
    markers: page.places.map(({ index, x, y }) => ({
      ...boxes[index],
      x: Math.round(frame.x + margin + x),
      y: Math.round(frame.y + margin + y),
    })),
  }));
}

/**
 * Draws markers on as many labels as they need, each with a dashed outline to cut along.
 * @param {Record<string, number>} counts
 * @param {Media} media
 * @returns {Bitmap[]}
 */
export function renderMarkers(counts, media) {
  return layoutMarkers(counts, media).map(({ height, markers }) => {
    const context = canvasContext(media.printableWidth, height);
    context.fillStyle = "white";
    context.fillRect(0, 0, media.printableWidth, height);
    context.fillStyle = "black";
    context.strokeStyle = "black";
    context.textAlign = "center";
    for (const placed of markers) drawMarker(context, placed);
    return thresholdToBitmap(context.getImageData(0, 0, media.printableWidth, height), TEXT_THRESHOLD);
  });
}

/**
 * @param {OffscreenCanvasRenderingContext2D} context
 * @param {PlacedMarker} placed
 */
function drawMarker(context, { marker, unit, x, y, width, height }) {
  const line = Math.max(1, 0.3 * unit);
  context.lineWidth = line;
  context.setLineDash([1.2 * unit, 0.9 * unit]);
  context.beginPath();
  context.roundRect(x + line / 2, y + line / 2, width - line, height - line, 1.5 * unit);
  context.stroke();
  context.setLineDash([]);

  const inner = width - 3 * unit;
  const centerX = x + width / 2;

  if (marker.kind === "keyword") {
    const size = fitLine(context, marker.name, 700, 4.2 * unit, inner);
    context.font = font(700, size);
    context.fillText(marker.name, centerX, y + height / 2 + size * 0.36);
    return;
  }

  const nameSize = fitLine(context, marker.name, 700, 4 * unit, inner);
  context.font = font(700, nameSize);
  context.fillText(marker.name, centerX, y + 5.5 * unit);

  if (marker.kind === "game") {
    const [words = []] = parseRules(marker.reminder ?? "");
    let size = 2.3 * unit;
    let lines = reminderLines(context, words, size, inner);
    while (lines.length > REMINDER_LINES && size > 1.6 * unit) {
      size -= 0.1 * unit;
      lines = reminderLines(context, words, size, inner);
    }
    for (const [index, text] of lines.entries()) {
      context.fillText(text, centerX, y + 10 * unit + index * size * 1.25);
    }
    return;
  }

  // Trackers: a numbered box for each step, to mark with a pen or a clip.
  const count = marker.track ?? 0;
  const spacing = 0.8 * unit;
  const box = Math.min(5 * unit, (inner - spacing * (count - 1)) / count);
  let boxX = centerX - (count * box + (count - 1) * spacing) / 2;
  const boxY = y + height - 1.5 * unit - box;
  context.lineWidth = Math.max(1, 0.25 * unit);
  context.font = font(700, box * 0.55);
  for (let step = 1; step <= count; step++) {
    context.strokeRect(boxX, boxY, box, box);
    context.fillText(String(step), boxX + box / 2, boxY + box * 0.7);
    boxX += box + spacing;
  }
}

/**
 * @param {OffscreenCanvasRenderingContext2D} context
 * @param {import("./rules-text.js").Word[]} words
 * @param {number} size
 * @param {number} width
 */
function reminderLines(context, words, size, width) {
  context.font = font(400, size);
  /** @param {import("./rules-text.js").Word} word */
  const text = (word) => word.map((piece) => piece.text).join("");
  return wrapParagraph(
    words,
    width,
    (word) => context.measureText(text(word)).width,
    context.measureText(" ").width,
  ).map((line) => line.map(text).join(" "));
}
