/**
 * Contracts shared by every printer. A transport only moves bytes; a driver speaks one
 * printer's language. Supporting a new printer means writing a driver (and a transport if
 * it connects some other way than USB).
 */

/**
 * A 1-bit image, row by row. `pixels[y * width + x]` is 1 for black, 0 for white.
 * @typedef {object} Bitmap
 * @property {number} width
 * @property {number} height
 * @property {Uint8Array} pixels
 */

/**
 * A label a driver can print on. Lengths and heights are 0 for continuous rolls.
 * @typedef {object} Media
 * @property {string} id               Stable identifier, e.g. "62x100".
 * @property {string} name             Human-readable, e.g. "62 × 100 mm die-cut".
 * @property {number} widthMm
 * @property {number} lengthMm
 * @property {number} printableWidth   Printable area in dots.
 * @property {number} printableHeight  Printable area in dots.
 */

/**
 * @typedef {object} PrinterStatus
 * @property {Media | null} media  The loaded label, or null if none or unrecognized.
 * @property {string[]} errors
 */

/**
 * A connection to a printer.
 * @typedef {object} Transport
 * @property {(data: Uint8Array<ArrayBuffer>) => Promise<void>} write
 * @property {() => Promise<Uint8Array>} read  Resolves with the next packet the printer sends.
 * @property {() => Promise<void>} close
 */

/**
 * @typedef {object} PrinterDriver
 * @property {string} name
 * @property {USBDeviceFilter[]} usbFilters  USB devices this driver can talk to.
 * @property {Media[]} media
 * @property {(transport: Transport) => Promise<PrinterStatus>} readStatus
 * @property {(transport: Transport, pages: Bitmap[], media: Media) => Promise<void>} print
 *   Resolves once the printer reports the job printed. Each page must match the media's
 *   printable size (any height on continuous rolls).
 */

export {};
