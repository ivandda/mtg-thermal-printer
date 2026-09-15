/** @import { Media } from "../../src/printers/types.js" */
import assert from "node:assert/strict";
import { test } from "node:test";
import { foldedPage, foldMargin } from "../../src/imaging/fold.js";

/** 10 dots per millimetre, so the dashed line is 3 dots thick, with 12-dot dashes and 9-dot gaps. */
/** @type {Media} */
const ROLL = {
  id: "roll",
  name: "Test roll",
  widthMm: 3,
  lengthMm: 0,
  printableWidth: 30,
  printableHeight: 0,
  shape: "rectangle",
  dpi: 254,
  feedMargin: 3,
};

/**
 * A bitmap with ink only at the given dots.
 * @param {number} width
 * @param {number} height
 * @param {[number, number][]} dots
 */
function bitmap(width, height, dots) {
  const pixels = new Uint8Array(width * height);
  for (const [x, y] of dots) pixels[y * width + x] = 1;
  return { width, height, pixels };
}

test("the back goes below the front, upside down, with the fold in the middle", () => {
  const front = bitmap(30, 4, [[0, 0]]);
  const back = bitmap(30, 4, [[0, 0]]);
  const page = foldedPage(front, back, ROLL);
  assert.equal(page.height, 4 + 3 + 3 + 4);
  assert.equal(page.pixels[0], 1, "front's top-left stays put");
  assert.equal(page.pixels[13 * 30 + 29], 1, "back's top-left ends at the bottom-right");
  assert.equal(page.pixels[10 * 30], 0);
});

test("the fold is a dashed line, never a solid one", () => {
  const page = foldedPage(bitmap(30, 4, []), bitmap(30, 4, []), ROLL);
  /** @param {number} y */
  const row = (y) => [...page.pixels.subarray(y * 30, (y + 1) * 30)].join("");
  const dashed = `${"1".repeat(12)}${"0".repeat(9)}${"1".repeat(9)}`;
  assert.deepEqual(
    [row(5), row(6), row(7), row(8), row(9)],
    ["0".repeat(30), dashed, dashed, dashed, "0".repeat(30)],
  );
});

test("without a known feed, the fold gets 3 mm on each side", () => {
  const { feedMargin, ...unknownFeed } = ROLL;
  assert.equal(foldMargin(unknownFeed), 30);
});
