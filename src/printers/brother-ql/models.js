/** @import { RasterModel } from "./raster.js" */

/** The QL-1050 and QL-1100 families have a wider print head, for labels up to 104 mm wide. */
const WIDE_HEAD = { bytesPerRow: 162, offsetRight: 44, modeSetting: true };

/**
 * Brother QL printers and what sets each apart. USB product IDs are from the USB ID repository
 * (http://www.linux-usb.org/usb.ids); raster details are from brother_ql's model table.
 * @type {RasterModel[]}
 */
export const MODELS = [
  model("QL-500", 0x2015, { minRows: 295, cutting: false }),
  model("QL-550", 0x2016, { minRows: 295 }),
  model("QL-560", 0x2027, { minRows: 295 }),
  model("QL-570", 0x2028),
  model("QL-600", 0x20c0, { modeSetting: true }),
  model("QL-650TD", 0x201b, { minRows: 295, modeSetting: true }),
  model("QL-700", 0x2042),
  model("QL-710W", 0x2043, { modeSetting: true }),
  model("QL-720NW", 0x2044, { modeSetting: true }),
  model("QL-800", 0x209b, { modeSetting: true, invalidateBytes: 400 }),
  model("QL-810W", 0x209c, { modeSetting: true, invalidateBytes: 400 }),
  model("QL-820NWB", 0x209d, { modeSetting: true, invalidateBytes: 400 }),
  model("QL-1050", 0x2020, { ...WIDE_HEAD, minRows: 295, maxRows: 35433 }),
  model("QL-1060N", 0x202a, { ...WIDE_HEAD, minRows: 295, maxRows: 35433 }),
  model("QL-1100", 0x20a7, { ...WIDE_HEAD, minRows: 301, maxRows: 35434 }),
  model("QL-1110NWB", 0x20a8, { ...WIDE_HEAD, minRows: 301, maxRows: 35434 }),
  model("QL-1115NWB", 0x20ab, { ...WIDE_HEAD, minRows: 301, maxRows: 35434 }),
];

/**
 * @param {string} name
 * @param {number} productId
 * @param {Partial<RasterModel>} [differences]  From a QL-700-like printer.
 * @returns {RasterModel}
 */
function model(name, productId, differences = {}) {
  return {
    name,
    productId,
    bytesPerRow: 90,
    offsetRight: 0,
    invalidateBytes: 200,
    minRows: 150,
    maxRows: 11811,
    modeSetting: false,
    cutting: true,
    ...differences,
  };
}

/** @param {string} name  e.g. "QL-700" */
export function modelNamed(name) {
  const found = MODELS.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Unknown Brother QL model ${name}`);
  return found;
}
