import assert from "node:assert/strict";
import { test } from "node:test";
import { findMedia } from "../../src/printers/brother-ql/media.js";
import { parseStatus } from "../../src/printers/brother-ql/status.js";

/** @param {string} hex */
const bytes = (hex) => Uint8Array.from(hex.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));

// Captured from a QL-700 with a 62 × 100 mm die-cut roll loaded.
const IDLE_62X100 = bytes("802042343530000000003e0b0000040000640000000000000000000000000000");

test("reads the loaded label from a status reply", () => {
  const status = parseStatus(IDLE_62X100);
  assert.deepEqual(status.errors, []);
  assert.equal(findMedia(status)?.id, "62x100");
});

test("recognizes continuous rolls", () => {
  assert.equal(findMedia({ mediaType: 0x0a, widthMm: 62, lengthMm: 0 })?.id, "62");
});

test("lists every error flag that is set", () => {
  const reply = IDLE_62X100.slice();
  reply[8] = 0b0000_0001;
  reply[9] = 0b0001_0000;
  assert.deepEqual(parseStatus(reply).errors, ["No media", "Cover open"]);
});

test("rejects replies that are not status replies", () => {
  assert.throws(() => parseStatus(new Uint8Array(32)));
  assert.throws(() => parseStatus(IDLE_62X100.subarray(0, 16)));
});
