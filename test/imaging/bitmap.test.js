import assert from "node:assert/strict";
import { test } from "node:test";
import { thresholdToBitmap } from "../../src/imaging/bitmap.js";

test("dark pixels print black; light and transparent pixels stay white", () => {
  // biome-ignore format: one RGBA pixel per line
  const data = Uint8ClampedArray.of(
    0, 0, 0, 255, // black
    255, 255, 255, 255, // white
    90, 90, 90, 255, // dark grey
    0, 0, 0, 0, // transparent
  );
  const bitmap = thresholdToBitmap({ width: 2, height: 2, data });
  assert.deepEqual([...bitmap.pixels], [1, 0, 1, 0]);
});
