/** @import { TextMeasure } from "../../src/imaging/text-card.js" */
import assert from "node:assert/strict";
import { test } from "node:test";
import { layoutTextCard } from "../../src/imaging/text-card.js";
import { MEDIA } from "../../src/printers/brother-ql/media.js";

const LABEL = MEDIA.find((label) => label.id === "62x100");
assert.ok(LABEL);

/** Each character is half the text size wide. @type {TextMeasure} */
const measure = {
  word: (word, size) => word.reduce((width, piece) => width + piece.text.length * size * 0.5, 0),
  space: (size) => size * 0.5,
};

/** @param {string} rules */
const layout = (rules) => layoutTextCard({ rules, stats: "1/1", hasArt: true }, LABEL, measure);

/** @param {ReturnType<typeof layout>} card */
const artHeight = (card) => card.art?.height ?? 0;

test("short rules text leaves most of the card to the art", () => {
  const none = layout("");
  const short = layout("Flying");
  const long = layout("When this token enters, draw a card. ".repeat(12));
  assert.ok(artHeight(none) - artHeight(short) < 12 * none.mm);
  assert.ok(artHeight(short) > artHeight(long));
});

test("the rules box fits one line of text at its largest size", () => {
  const card = layout("Flying");
  const oneLine = card.rulesSize.largest * 1.25;
  assert.ok(card.rulesBottom - card.rulesTop >= oneLine);
  assert.ok(card.rulesBottom - card.rulesTop < oneLine + card.mm);
});

test("long rules text shrinks the art only down to half its width", () => {
  const card = layout("When this token enters, draw a card. ".repeat(40));
  assert.ok(card.art);
  assert.equal(card.art.height, Math.floor(card.art.width * 0.5));
});
