import assert from "node:assert/strict";
import { test } from "node:test";
import { brotherQl700, QL_700 } from "../../src/printers/brother-ql/driver.js";
import { MEDIA } from "../../src/printers/brother-ql/media.js";

/** @param {string} hex */
const bytes = (hex) => Uint8Array.from(hex.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));

const IDLE = bytes("802042343530000000003e0b0000040000640000000000000000000000000000");
const PRINTED = Object.assign(IDLE.slice(), { 18: 0x01 });
const WAITING = Object.assign(IDLE.slice(), { 18: 0x06, 19: 0x00 });

test("a card too short for a continuous roll is centered on a label of the minimum length", async () => {
  const media = MEDIA.find(({ id }) => id === "12");
  assert.ok(media);
  /** @type {Uint8Array[]} */
  const written = [];
  const replies = [PRINTED, WAITING];
  const transport = {
    /** @param {Uint8Array<ArrayBuffer>} data */
    write: async (data) => {
      written.push(data);
    },
    read: async () => replies.shift() ?? new Uint8Array(),
    close: async () => {},
  };
  const page = { width: 106, height: 148, pixels: new Uint8Array(106 * 148).fill(1) };

  await brotherQl700.print(transport, [page], media);

  // The job ends with the raster lines, each 3 command bytes and 90 data bytes, then the print command.
  const [job] = written;
  const lineLength = 3 + QL_700.bytesPerRow;
  const firstLine = job.length - 1 - QL_700.minRows * lineLength;
  /** @param {number} row */
  const blank = (row) => {
    const line = firstLine + row * lineLength;
    return job.subarray(line + 3, line + lineLength).every((byte) => byte === 0);
  };
  assert.deepEqual(job.subarray(firstLine, firstLine + 3), Uint8Array.of(0x67, 0x00, 90));
  assert.ok(blank(0));
  assert.ok(!blank(1));
  assert.ok(!blank(148));
  assert.ok(blank(149));
});
