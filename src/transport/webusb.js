/** @import { Transport } from "../printers/types.js" */

const USB_PRINTER_CLASS = 0x07;

/**
 * Opens a USB printer for raw byte exchange.
 * @param {USBDevice} device
 * @returns {Promise<Transport>}
 */
export async function openUsbPrinter(device) {
  await device.open();
  if (!device.configuration) await device.selectConfiguration(1);

  const printer = device.configuration?.interfaces.find(
    (usbInterface) => usbInterface.alternate.interfaceClass === USB_PRINTER_CLASS,
  );
  const endpoints = printer?.alternate.endpoints.filter((endpoint) => endpoint.type === "bulk");
  const output = endpoints?.find((endpoint) => endpoint.direction === "out");
  const input = endpoints?.find((endpoint) => endpoint.direction === "in");
  if (!printer || !output || !input) {
    await device.close();
    throw new Error(`${device.productName ?? "This device"} has no USB printer interface`);
  }
  await device.claimInterface(printer.interfaceNumber);

  // A pending transferIn can't be cancelled, so a read that timed out is reused by the next
  // read instead of leaving an orphan that would swallow the printer's next reply.
  /** @type {Promise<Uint8Array> | null} */
  let pendingRead = null;

  return {
    async write(data) {
      const result = await device.transferOut(output.endpointNumber, data);
      if (result.status !== "ok") throw new Error(`USB write failed: ${result.status}`);
    },

    read() {
      pendingRead ??= device
        .transferIn(input.endpointNumber, input.packetSize)
        .then(({ data }) =>
          data ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(),
        )
        .finally(() => {
          pendingRead = null;
        });
      return pendingRead;
    },

    close: () => device.close(),
  };
}
