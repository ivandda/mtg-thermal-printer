/** Brother QL status request and the 32-byte reply the printer sends back. */

export const STATUS_TYPE = { reply: 0x00, printed: 0x01, error: 0x02, phaseChange: 0x06 };
export const PHASE_WAITING = 0x00;

// Bits of reply bytes 8 and 9, lowest bit first. Unused bits are null.
const ERRORS = [
  "No label roll",
  "Out of labels",
  "Cutter jammed",
  null,
  "Printer busy",
  "Printer turned off",
  null,
  "Fan error",
  "Wrong label roll for this print",
  "Print job too large",
  "Communication error",
  "Printer buffer full",
  "Cover open",
  "Cancelled on the printer",
  "Labels can't feed",
  "System error",
];

/** @param {{ invalidateBytes: number }} model */
export function statusRequest(model) {
  const request = new Uint8Array(model.invalidateBytes + 3);
  request.set([0x1b, 0x69, 0x53], model.invalidateBytes);
  return request;
}

/** @param {Uint8Array} reply */
export function parseStatus(reply) {
  if (reply.length < 32 || reply[0] !== 0x80 || reply[1] !== 0x20 || reply[2] !== 0x42) {
    throw new Error("The printer sent an unexpected reply");
  }
  const flags = reply[8] | (reply[9] << 8);
  return {
    errors: ERRORS.flatMap((error, bit) => (error && flags & (1 << bit) ? [error] : [])),
    widthMm: reply[10],
    mediaType: reply[11],
    lengthMm: reply[17],
    statusType: reply[18],
    phase: reply[19],
  };
}
