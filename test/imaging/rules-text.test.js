/** @import { Word } from "../../src/imaging/rules-text.js" */
import assert from "node:assert/strict";
import { test } from "node:test";
import { fitRules, parseRules, wrapParagraph } from "../../src/imaging/rules-text.js";

/** Each character is one unit wide and a symbol is two. @param {Word} word */
const measure = (word) => word.reduce((width, piece) => width + (piece.symbol ? 2 : piece.text.length), 0);

/** @param {Word[]} line */
const show = (line) => line.map((word) => word.map((piece) => piece.text).join("")).join(" ");

test("symbols stay attached to the punctuation next to them", () => {
  const [paragraph] = parseRules("{1}, {T}: Draw a card.");
  assert.deepEqual(paragraph[0], [
    { text: "{1}", symbol: true },
    { text: ",", symbol: false },
  ]);
  assert.deepEqual(paragraph[1], [
    { text: "{T}", symbol: true },
    { text: ":", symbol: false },
  ]);
  assert.equal(paragraph.length, 5);
});

test("each line of rules text is a paragraph, and blank lines are dropped", () => {
  assert.equal(parseRules("Flying\n\nLifelink ").length, 2);
  assert.deepEqual(parseRules(""), []);
});

test("paragraphs break between words", () => {
  const [paragraph] = parseRules("This creature can't block.");
  assert.deepEqual(wrapParagraph(paragraph, 14, measure, 1).map(show), ["This creature", "can't block."]);
});

test("a word longer than the line gets a line of its own", () => {
  const [paragraph] = parseRules("a indestructible b");
  assert.deepEqual(wrapParagraph(paragraph, 5, measure, 1).map(show), ["a", "indestructible", "b"]);
});

test("text shrinks until it fits the box", () => {
  const paragraphs = parseRules("one two three four");
  /** At size s a character is s/10 wide. */
  const measureAt = (/** @type {Word} */ word, /** @type {number} */ size) => (measure(word) * size) / 10;
  const box = { width: 20, height: 24, largest: 30, smallest: 10, lineHeight: 1.2 };
  const { size, paragraphs: lines } = fitRules(paragraphs, box, measureAt, (s) => s / 10);
  assert.equal(size, 11);
  assert.deepEqual(lines[0].map(show), ["one two three four"]);
});

test("at the smallest size the text is kept even if it overflows", () => {
  const paragraphs = parseRules("a b c d e f g h");
  const box = { width: 1, height: 1, largest: 12, smallest: 10, lineHeight: 1.2 };
  assert.equal(fitRules(paragraphs, box, measure, () => 1).size, 10);
});
