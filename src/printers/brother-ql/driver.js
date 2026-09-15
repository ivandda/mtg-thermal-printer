/** @import { Bitmap, PrinterDriver, Transport } from "../types.js" */
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
  setupTip: "On a Brother QL-700, turn Editor Lite off (its green light).",

  async readStatus(transport) {
    await transport.write(statusRequest(QL_700));
    const status = await nextStatus(transport);
    return { media: findMedia(status), errors: status.errors };
  },

  async print(transport, pages, media) {
    const label = MEDIA.find(({ id }) => id === media.id);
    if (!label) throw new Error(`The QL-700 can't print on ${media.name}`);

    const fitted = label.lengthMm ? pages : pages.map((page) => lengthen(page, QL_700.minRows));
    await transport.write(encodeJob(fitted, label, QL_700));

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

/**
 * Pads a page with blank rows above and below, keeping it centered, so a small image still makes a
 * label as long as a continuous roll allows.
 * @param {Bitmap} page
 * @param {number} rows
 * @returns {Bitmap}
 */
function lengthen(page, rows) {
  if (page.height >= rows) return page;
  const pixels = new Uint8Array(page.width * rows);
  pixels.set(page.pixels, Math.floor((rows - page.height) / 2) * page.width);
  return { width: page.width, height: rows, pixels };
}

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
