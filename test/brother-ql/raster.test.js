import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { MEDIA } from "../../src/printers/brother-ql/media.js";
import { modelNamed } from "../../src/printers/brother-ql/models.js";
import { encodeJob } from "../../src/printers/brother-ql/raster.js";

/**
 * Same pattern as test/fixtures/brother-ql/generate.py.
 * @param {number} width
 * @param {number} height
 * @param {number} [shift]
 */
function pattern(width, height, shift = 0) {
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pixels[y * width + x] = x < 4 || y < 4 || (x * 7 + y * 13 + shift) % 17 < 5 ? 1 : 0;
    }
  }
  return { width, height, pixels };
}

/** @param {string} id */
function media(id) {
  const found = MEDIA.find((label) => label.id === id);
  assert.ok(found, `unknown label ${id}`);
  return found;
}

/** @param {string} name */
async function fixture(name) {
  return new Uint8Array(await readFile(new URL(`../fixtures/brother-ql/${name}`, import.meta.url)));
}

/**
 * @param {Uint8Array} actual
 * @param {Uint8Array} expected
 */
function assertSameBytes(actual, expected) {
  const index = actual.findIndex((byte, i) => byte !== expected[i]);
  assert.equal(index, -1, `first difference at byte ${index}`);
  assert.equal(actual.length, expected.length);
}

const QL_700 = modelNamed("QL-700");

test("die-cut label matches brother_ql", async () => {
  const job = encodeJob([pattern(696, 271)], media("62x29"), QL_700);
  assertSameBytes(job, await fixture("62x29.bin"));
});

test("several labels in one job match brother_ql", async () => {
  const job = encodeJob([pattern(696, 271), pattern(696, 271, 5)], media("62x29"), QL_700);
  assertSameBytes(job, await fixture("62x29-two-pages.bin"));
});

test("continuous roll matches brother_ql", async () => {
  const job = encodeJob([pattern(696, 150)], media("62"), QL_700);
  assertSameBytes(job, await fixture("62-continuous.bin"));
});

test("a printer that switches to raster mode matches brother_ql", async () => {
  const job = encodeJob([pattern(696, 271)], media("62x29"), modelNamed("QL-820NWB"));
  assertSameBytes(job, await fixture("ql-820nwb-62x29.bin"));
});

test("a printer without a cutter matches brother_ql", async () => {
  const job = encodeJob([pattern(696, 1109)], media("62x100"), modelNamed("QL-500"));
  assertSameBytes(job, await fixture("ql-500-62x100.bin"));
});

test("a wide print head matches brother_ql", async () => {
  const job = encodeJob([pattern(1164, 301)], media("102"), modelNamed("QL-1100"));
  assertSameBytes(job, await fixture("ql-1100-102-continuous.bin"));
});

test("rejects pages that don't fit the label", () => {
  assert.throws(() => encodeJob([pattern(600, 271)], media("62x29"), QL_700), RangeError);
  assert.throws(() => encodeJob([pattern(696, 300)], media("62x29"), QL_700), RangeError);
  assert.throws(() => encodeJob([pattern(696, 100)], media("62"), QL_700), RangeError);
});

test("rejects labels shorter than the printer prints", () => {
  assert.throws(() => encodeJob([pattern(94, 94)], media("d12"), QL_700), RangeError);
  assert.throws(() => encodeJob([pattern(696, 271)], media("62x29"), modelNamed("QL-500")), RangeError);
});
