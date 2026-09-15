/** @import { Bitmap, PrinterDriver, Transport } from "../types.js" */
/** @import { RasterModel } from "./raster.js" */
import { findMedia, mediaFor } from "./media.js";
import { MODELS } from "./models.js";
import { encodeJob } from "./raster.js";
import { PHASE_WAITING, parseStatus, STATUS_TYPE, statusRequest } from "./status.js";

const BROTHER = 0x04f9;
const REPLY_TIMEOUT_MS = 10_000;

/**
 * A driver for one Brother QL model.
 * @param {RasterModel} model
 * @returns {PrinterDriver}
 */
export function brotherQl(model) {
  const media = mediaFor(model);
  return {
    name: `Brother ${model.name}`,
    usbFilters: [{ vendorId: BROTHER, productId: model.productId }],
    media,
    setupTip: "If your Brother QL has Editor Lite, turn it off (its green light).",

    async readStatus(transport) {
      await transport.write(statusRequest(model));
      const status = await nextStatus(transport);
      return { media: findMedia(status, media), errors: status.errors };
    },

    async print(transport, pages, requested) {
      const label = media.find(({ id }) => id === requested.id);
      if (!label) throw new Error(`The ${model.name} can't print on ${requested.name}`);

      const fitted = label.lengthMm ? pages : pages.map((page) => lengthen(page, model.minRows));
      await transport.write(encodeJob(fitted, label, model));

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
}

/** Every Brother QL model. Only the QL-700 has been tested on a real printer. */
export const brotherQlDrivers = MODELS.map(brotherQl);

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
