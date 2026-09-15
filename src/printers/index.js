/** @import { PrinterDriver } from "./types.js" */
import { brotherQlDrivers } from "./brother-ql/driver.js";

/**
 * Every supported printer. To add one, write a driver and list it here.
 * @type {PrinterDriver[]}
 */
export const drivers = [...brotherQlDrivers];

/** @param {USBDevice} device */
export function driverFor(device) {
  return drivers.find((driver) =>
    driver.usbFilters.some(
      (filter) => filter.vendorId === device.vendorId && filter.productId === device.productId,
    ),
  );
}
