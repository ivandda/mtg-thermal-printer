/** @import { PrinterDriver, Transport } from "../types.js" */
/** @import { RasterModel } from "./raster.js" */
import { findMedia, MEDIA } from "./media.js";
import { encodeJob } from "./raster.js";
import { PHASE_WAITING, parseStatus, STATUS_TYPE, statusRequest } from "./status.js";

/** @type {RasterModel} */
export const QL_700 = { bytesPerRow: 90, invalidateBytes: 200, minRows: 150, maxRows: 11811 };

const REPLY_TIMEOUT_MS = 10_000;

/** @type {PrinterDriver} */
export const brotherQl700 = {
  name: "Brother QL-700",
  usbFilters: [{ vendorId: 0x04f9, productId: 0x2042 }],
  media: MEDIA,

  async readStatus(transport) {
    await transport.write(statusRequest(QL_700));
    const status = await nextStatus(transport);
    return { media: findMedia(status), errors: status.errors };
  },

  async print(transport, pages, media) {
    const label = MEDIA.find(({ id }) => id === media.id);
    if (!label) throw new Error(`The QL-700 can't print on ${media.name}`);

    await transport.write(encodeJob(pages, label, QL_700));

    let printed = false;
    let ready = false;
    while (!ready) {
      const status = await nextStatus(transport);
      if (status.errors.length > 0) throw new Error(status.errors.join(", "));
      printed ||= status.statusType === STATUS_TYPE.printed;
      ready = printed && status.statusType === STATUS_TYPE.phaseChange && status.phase === PHASE_WAITING;
    }
  },
};

/** @param {Transport} transport */
async function nextStatus(transport) {
  let reply;
  do {
    reply = await withTimeout(transport.read(), REPLY_TIMEOUT_MS, "The printer stopped responding");
  } while (reply.length === 0);
  return parseStatus(reply);
}

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} message
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms, message) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return /** @type {Promise<T>} */ (Promise.race([promise, timeout])).finally(() => clearTimeout(timer));
}
