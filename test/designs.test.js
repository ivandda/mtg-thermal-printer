/** @import { Design } from "../src/designs.js" */
/** @import { Media } from "../src/printers/types.js" */
import assert from "node:assert/strict";
import { test } from "node:test";
import { labelLengths, paperLength } from "../src/designs.js";

/** @type {Media} */
const ROLL = {
  id: "62",
  name: "62 mm continuous",
  widthMm: 62,
  lengthMm: 0,
  printableWidth: 696,
  printableHeight: 0,
  shape: "rectangle",
  dpi: 300,
  feedMargin: 35,
};

/** @type {Media} */
const LABEL = { ...ROLL, id: "62x100", name: "62 × 100 mm die-cut", lengthMm: 100, printableHeight: 1109 };

/** @type {Design} */
const TREASURE = {
  type: "card",
  card: { id: "a1", name: "Treasure", set_name: "Tokens", collector_number: "1" },
  face: 0,
  darkness: "normal",
  cropBorder: false,
};

test("a card on a continuous roll is as long as the card, plus the feed at both ends", () => {
  assert.deepEqual(labelLengths(TREASURE, ROLL), [972]);
  assert.equal(paperLength([{ design: TREASURE, copies: 3 }], ROLL), (3 * (972 + 2 * 35) * 25.4) / 300);
});

test("markers count every label they continue onto", () => {
  /** @type {Design} */
  const markers = { type: "markers", counts: { monarch: 20 } };
  const lengths = labelLengths(markers, ROLL);
  assert.ok(lengths.length > 1 || lengths[0] > 972);
  const dots = lengths.reduce((total, length) => total + length + 2 * 35, 0);
  assert.equal(paperLength([{ design: markers, copies: 1 }], ROLL), (dots * 25.4) / 300);
});

test("a die-cut label is as long as its printable area", () => {
  assert.deepEqual(labelLengths(TREASURE, { ...LABEL, feedMargin: 0 }), [1109]);
});

test("both sides of a double-faced card take one folded piece on a roll and a label each otherwise", () => {
  /** @type {Design} */
  const delver = {
    ...TREASURE,
    card: {
      ...TREASURE.card,
      name: "Delver of Secrets // Insectile Aberration",
      card_faces: ["Delver of Secrets", "Insectile Aberration"].map((name) => ({
        name,
        image_uris: { small: "", normal: "", large: "", png: "", art_crop: "" },
      })),
    },
    bothSides: true,
  };
  assert.deepEqual(labelLengths(delver, ROLL), [2 * (972 + 35)]);
  assert.deepEqual(labelLengths(delver, LABEL), [1109, 1109]);
  assert.deepEqual(labelLengths({ ...delver, bothSides: false }, LABEL), [1109]);
  assert.deepEqual(labelLengths({ ...TREASURE, bothSides: true }, LABEL), [1109]);
});
