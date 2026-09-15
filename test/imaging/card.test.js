import assert from "node:assert/strict";
import { test } from "node:test";
import { cardSize } from "../../src/imaging/card.js";
import { MEDIA } from "../../src/printers/brother-ql/media.js";

/** @param {string} id */
function media(id) {
  const found = MEDIA.find((label) => label.id === id);
  assert.ok(found, `unknown label ${id}`);
  return found;
}

test("a card fills the label width when the label is long enough", () => {
  assert.deepEqual(cardSize(media("62x100")), { width: 696, height: 972 });
  assert.deepEqual(cardSize(media("62")), { width: 696, height: 972 });
});

test("a card fits the label height on short labels", () => {
  assert.deepEqual(cardSize(media("62x29")), { width: 194, height: 271 });
});

test("a card without its border keeps the cropped image's proportions", () => {
  assert.deepEqual(cardSize(media("62x100"), 1.3), { width: 696, height: 905 });
});

test("a card on a round label keeps its corners inside the circle", () => {
  const { width, height } = cardSize(media("d58"));
  assert.deepEqual({ width, height }, { width: 359, height: 501 });
  assert.ok(Math.hypot(width, height) <= media("d58").printableWidth);
});
