import assert from "node:assert/strict";
import { test } from "node:test";
import { PrinterConnection } from "../../src/printers/connection.js";

/** @param {string} hex */
const bytes = (hex) => Uint8Array.from(hex.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));

// Captured from a QL-700 with a 62 × 100 mm die-cut roll loaded.
const IDLE = bytes("802042343530000000003e0b0000040000640000000000000000000000000000");
const PRINTED = Object.assign(IDLE.slice(), { 18: 0x01 });
const WAITING = Object.assign(IDLE.slice(), { 18: 0x06, 19: 0x00 });
const COVER_OPEN = Object.assign(IDLE.slice(), { 9: 0b0001_0000 });

const QL_700 = /** @type {USBDevice} */ (/** @type {unknown} */ ({ vendorId: 0x04f9, productId: 0x2042 }));

/**
 * A connection over fake WebUSB. `allowed` are printers the site may already use, `picked` is what
 * the user chooses in the picker, and the printer answers with `replies` in order.
 * @param {{ allowed?: USBDevice[], picked?: USBDevice, replies?: Uint8Array[] }} setup
 */
function connect({ allowed = [], picked, replies = [] }) {
  const usb = Object.assign(new EventTarget(), {
    getDevices: async () => allowed,
    requestDevice: async () => {
      if (!picked) throw new DOMException("No device selected.", "NotFoundError");
      return picked;
    },
  });
  /** @type {Uint8Array[]} */
  const written = [];
  const transport = {
    /** @param {Uint8Array<ArrayBuffer>} data */
    write: async (data) => {
      written.push(data);
    },
    read: async () => {
      const reply = replies.shift();
      if (!reply) throw new Error("The printer stopped responding");
      return reply;
    },
    close: async () => {},
  };
  const connection = new PrinterConnection({
    usb: /** @type {USB} */ (/** @type {unknown} */ (usb)),
    open: async () => transport,
  });
  return { connection, usb, written };
}

const BLANK_PAGE = { width: 696, height: 1109, pixels: new Uint8Array(696 * 1109) };

test("reconnects to a printer the site may already use and reads its label", async () => {
  const { connection } = connect({ allowed: [QL_700], replies: [IDLE] });
  await connection.restore();
  assert.equal(connection.state.kind, "ready");
  assert.equal(connection.state.kind === "ready" && connection.state.media.id, "62x100");
});

test("stays disconnected until a printer is allowed", async () => {
  const { connection } = connect({});
  await connection.restore();
  assert.deepEqual(connection.state, { kind: "disconnected" });
});

test("closing the printer picker changes nothing", async () => {
  const { connection } = connect({});
  await connection.choose();
  assert.deepEqual(connection.state, { kind: "disconnected" });
});

test("reports problems the printer describes", async () => {
  const { connection } = connect({ picked: QL_700, replies: [COVER_OPEN] });
  await connection.choose();
  assert.deepEqual(connection.state, { kind: "error", printer: "Brother QL-700", message: "Cover open" });
});

test("printing finishes when the printer reports the job done", async () => {
  const { connection, written } = connect({ allowed: [QL_700], replies: [IDLE, PRINTED, WAITING] });
  await connection.restore();
  await connection.print([BLANK_PAGE]);
  assert.equal(written.length, 2); // the status request, then the print job
});

test("unplugging the printer disconnects it", async () => {
  const { connection, usb } = connect({ allowed: [QL_700], replies: [IDLE] });
  await connection.restore();
  usb.dispatchEvent(Object.assign(new Event("disconnect"), { device: QL_700 }));
  assert.deepEqual(connection.state, { kind: "disconnected" });
});
