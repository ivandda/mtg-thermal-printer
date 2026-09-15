/** @import { PrinterDriver } from "./types.js" */
import { brotherQl700 } from "./brother-ql/driver.js";

/**
 * Every supported printer. To add one, write a driver and list it here.
 * @type {PrinterDriver[]}
 */
export const drivers = [brotherQl700];

/** @param {USBDevice} device */
export function driverFor(device) {
  return drivers.find((driver) =>
    driver.usbFilters.some(
      (filter) => filter.vendorId === device.vendorId && filter.productId === device.productId,
    ),
  );
}
