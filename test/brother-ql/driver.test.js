import assert from "node:assert/strict";
import { test } from "node:test";
import { brotherQl } from "../../src/printers/brother-ql/driver.js";
import { MEDIA } from "../../src/printers/brother-ql/media.js";
import { modelNamed } from "../../src/printers/brother-ql/models.js";

const QL_700 = modelNamed("QL-700");

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

  await brotherQl(QL_700).print(transport, [page], media);

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

test("a reply that isn't a status is passed over instead of failing the job", async () => {
  const media = MEDIA.find(({ id }) => id === "62x100");
  assert.ok(media);
  const replies = [bytes("deadbeef"), IDLE.slice(0, 12), PRINTED, WAITING];
  const transport = {
    write: async () => {},
    read: async () => replies.shift() ?? new Uint8Array(),
    close: async () => {},
  };
  const page = { width: 696, height: 1109, pixels: new Uint8Array(696 * 1109) };

  await brotherQl(QL_700).print(transport, [page], media);

  assert.equal(replies.length, 0, "every reply was read, and the job still finished");
});
