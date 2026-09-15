import assert from "node:assert/strict";
import { test } from "node:test";
import { layoutMarkers } from "../../src/imaging/marker-sheet.js";
import { MEDIA } from "../../src/printers/brother-ql/media.js";

/** @param {string} id */
function media(id) {
  const found = MEDIA.find((label) => label.id === id);
  assert.ok(found, `unknown label ${id}`);
  return found;
}

test("markers side by side touch and fill the label's width", () => {
  const label = media("62");
  const [page] = layoutMarkers({ flying: 1, haste: 1 }, label);
  const [left, right] = page.markers;
  assert.equal(left.x, 0);
  assert.equal(right.x, left.x + left.width);
  assert.equal(right.x + right.width, label.printableWidth);
  assert.equal(right.y, left.y);
});

test("a marker alone in its row stretches across it", () => {
  const label = media("62");
  const [page] = layoutMarkers({ haste: 3 }, label);
  assert.deepEqual(page.markers.map(({ x, width }) => [x, width]).at(-1), [0, label.printableWidth]);
});

test("rows stack with no space and continue onto the next label when one is full", () => {
  const label = media("62x100");
  const pages = layoutMarkers({ flying: 20, haste: 20 }, label);
  const rowHeight = pages[0].markers[0].height;
  const perPage = 2 * Math.floor(label.printableHeight / rowHeight);
  assert.deepEqual(
    pages.map((page) => page.markers.length),
    [perPage, perPage, 40 - 2 * perPage].filter(Boolean),
  );
  for (const page of pages) {
    for (const [index, { y }] of page.markers.entries()) assert.equal(y, Math.floor(index / 2) * rowHeight);
  }
});

test("a continuous roll prints one label exactly as long as the markers", () => {
  const [few] = layoutMarkers({ monarch: 10 }, media("62"));
  const pages = layoutMarkers({ monarch: 10, poison: 4 }, media("62"));
  assert.equal(pages.length, 1);
  const last = pages[0].markers.at(-1);
  assert.ok(last);
  assert.equal(pages[0].height, last.y + last.height);
  assert.ok(pages[0].height > few.height);
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
