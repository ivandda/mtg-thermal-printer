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
const IN_USE = new DOMException(
  "Failed to execute 'claimInterface' on 'USBDevice': Unable to claim interface.",
  "NetworkError",
);

/**
 * A connection over fake WebUSB. `allowed` are printers the site may already use, `picked` is what
 * the user chooses in the picker, the first `openFailures` attempts to open the printer fail as if
 * another tab had it, and the printer answers with `replies` in order.
 * @param {{ allowed?: USBDevice[], picked?: USBDevice, openFailures?: number, replies?: Uint8Array[] }} setup
 */
function connect({ allowed = [], picked, openFailures = 0, replies = [] }) {
  const usb = Object.assign(new EventTarget(), {
    getDevices: async () => allowed,
    requestDevice: async () => {
      if (!picked) throw new DOMException("No device selected.", "NotFoundError");
      return picked;
    },
  });
  /** @type {Uint8Array[]} */
  const written = [];
  const opened = { count: 0 };
  const transport = {
    /** @param {Uint8Array<ArrayBuffer>} data */
    write: async (data) => {
      written.push(data);
    },
    read: async () => {
      await new Promise((resolve) => setTimeout(resolve)); // replies take a moment, like over USB
      const reply = replies.shift();
      if (!reply) throw new Error("The printer stopped responding");
      return reply;
    },
    close: async () => {},
  };
  const connection = new PrinterConnection({
    usb: /** @type {USB} */ (/** @type {unknown} */ (usb)),
    open: async () => {
      opened.count++;
      if (opened.count <= openFailures) throw IN_USE;
      return transport;
    },
  });
  return { connection, usb, written, opened };
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

test("explains when another tab or app is using the printer, and retrying reopens it", async () => {
  const { connection, opened } = connect({ allowed: [QL_700], openFailures: 1, replies: [IDLE] });
  await connection.restore();
  assert.deepEqual(connection.state, {
    kind: "error",
    printer: "Brother QL-700",
    message: "In use by another tab or app. Close it, then try again.",
  });
  await connection.refresh();
  assert.equal(connection.state.kind, "ready");
  assert.equal(opened.count, 2);
});

test("overlapping connection requests open the printer once", async () => {
  const { connection, opened } = connect({ allowed: [QL_700], picked: QL_700, replies: [IDLE] });
  await Promise.all([connection.restore(), connection.choose()]);
  assert.equal(opened.count, 1);
  assert.equal(connection.state.kind, "ready");
});

test("printing finishes when the printer reports the job done", async () => {
  const { connection, written } = connect({ allowed: [QL_700], replies: [IDLE, PRINTED, WAITING] });
  await connection.restore();
  await connection.print([BLANK_PAGE]);
  assert.equal(written.length, 2); // the status request, then the print job
});

test("checking the printer while it prints waits for the print to finish", async () => {
  const { connection, written } = connect({ allowed: [QL_700], replies: [IDLE, PRINTED, WAITING, IDLE] });
  await connection.restore();
  await Promise.all([connection.print([BLANK_PAGE]), connection.refresh()]);
  assert.equal(written.length, 3); // status request, print job, then the second status request
  assert.equal(written[1].length > written[2].length, true);
  assert.equal(connection.state.kind, "ready");
});

test("unplugging the printer disconnects it", async () => {
  const { connection, usb } = connect({ allowed: [QL_700], replies: [IDLE] });
  await connection.restore();
  usb.dispatchEvent(Object.assign(new Event("disconnect"), { device: QL_700 }));
  assert.deepEqual(connection.state, { kind: "disconnected" });
});
