import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CENTERED,
  clampArrangement,
  MAX_ZOOM,
  moveArrangement,
  placeImage,
  zoomArrangement,
} from "../../src/imaging/arrangement.js";

const WIDE = { width: 400, height: 200 };
const BOX = { width: 100, height: 100 };

test("filling the box crops a wide image at its sides, centred", () => {
  assert.deepEqual(placeImage(WIDE, BOX, CENTERED), { x: -50, y: 0, width: 200, height: 100 });
});

test("fitting shows the whole image, centred between white bars", () => {
  assert.deepEqual(placeImage(WIDE, BOX, { ...CENTERED, fit: "fit" }), {
    x: 0,
    y: 25,
    width: 100,
    height: 50,
  });
});

test("the image can't be moved so far that a gap opens at an edge", () => {
  const moved = moveArrangement(CENTERED, 500, 500, WIDE, BOX);
  assert.deepEqual(placeImage(WIDE, BOX, moved), { x: 0, y: 0, width: 200, height: 100 });
});

test("zooming keeps the point under the pointer where it was", () => {
  const focus = { x: 25, y: 50 };
  const before = placeImage(WIDE, BOX, CENTERED);
  const after = placeImage(WIDE, BOX, zoomArrangement(CENTERED, 2, focus, WIDE, BOX));
  assert.equal(after.width, 400);
  assert.equal((focus.x - after.x) / after.width, (focus.x - before.x) / before.width);
});

test("zoom stays between 1 and the maximum", () => {
  assert.equal(clampArrangement({ ...CENTERED, zoom: 0.2 }, WIDE, BOX).zoom, 1);
  assert.equal(clampArrangement({ ...CENTERED, zoom: 99 }, WIDE, BOX).zoom, MAX_ZOOM);
});
