import assert from "node:assert/strict";
import { test } from "node:test";
import { layoutMarkers, packRows } from "../../src/imaging/marker-sheet.js";
import { MEDIA } from "../../src/printers/brother-ql/media.js";

/** @param {string} id */
function media(id) {
  const found = MEDIA.find((label) => label.id === id);
  assert.ok(found, `unknown label ${id}`);
  return found;
}

const BOX = { width: 40, height: 10 };

test("boxes fill a row, then wrap, each row centred", () => {
  const [page] = packRows([BOX, BOX, BOX], { width: 100, height: 0 }, 10);
  assert.equal(page.height, 30);
  assert.deepEqual(page.places, [
    { index: 0, x: 5, y: 0 },
    { index: 1, x: 55, y: 0 },
    { index: 2, x: 30, y: 20 },
  ]);
});

test("a full page continues on the next one, centred vertically", () => {
  const pages = packRows([BOX, BOX, BOX], { width: 100, height: 25 }, 10);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[1].places, [{ index: 2, x: 30, y: 8 }]);
});

test("a few keywords fit on one label, many continue onto more", () => {
  assert.equal(layoutMarkers({ flying: 2, haste: 2 }, media("62x100")).length, 1);
  // A 62 × 100 mm label holds two keywords across and eight rows down.
  const pages = layoutMarkers({ flying: 20, haste: 20 }, media("62x100"));
  assert.deepEqual(
    pages.map((page) => page.markers.length),
    [16, 16, 8],
  );
});

test("a continuous roll prints one label as long as the markers need", () => {
  const few = layoutMarkers({ monarch: 1 }, media("62"));
  const many = layoutMarkers({ monarch: 10, poison: 4 }, media("62"));
  assert.equal(many.length, 1);
  assert.ok(many[0].height > few[0].height);
});

test("markers shrink to fit a narrow label and stay inside a round one", () => {
  const [narrow] = layoutMarkers({ energy: 1 }, media("29"));
  assert.ok(narrow.markers[0].width <= media("29").printableWidth);

  const round = media("d58");
  const [page] = layoutMarkers({ monarch: 4 }, round);
  const radius = round.printableWidth / 2;
  for (const { x, y, width, height } of page.markers) {
    for (const [cornerX, cornerY] of [
      [x, y],
      [x + width, y + height],
    ]) {
      assert.ok(Math.hypot(cornerX - radius, cornerY - radius) <= radius);
    }
  }
});
