/** @import { Media, PrinterDriver, Transport } from "./printers/types.js" */
import { thresholdToBitmap } from "./imaging/bitmap.js";
import { driverFor, drivers } from "./printers/index.js";
import { openUsbPrinter } from "./transport/webusb.js";

const connectButton = /** @type {HTMLButtonElement} */ (document.querySelector("#connect"));
const printButton = /** @type {HTMLButtonElement} */ (document.querySelector("#print"));
const output = /** @type {HTMLOutputElement} */ (document.querySelector("#output"));
const usbSupported = "usb" in navigator;

/** @type {{ driver: PrinterDriver, transport: Transport, media: Media } | undefined} */
let printer;

if (!usbSupported) {
  output.textContent = "This browser can't use USB printers. Open this page in Chrome or Edge.";
}
connectButton.disabled = !usbSupported;
connectButton.addEventListener("click", () => run(connect));
printButton.addEventListener("click", () => run(printTestLabel));

async function connect() {
  const device = await navigator.usb.requestDevice({
    filters: drivers.flatMap((driver) => driver.usbFilters),
  });
  const driver = driverFor(device);
  if (!driver) throw new Error(`${device.productName} isn't supported`);

  await printer?.transport.close();
  printer = undefined;
  const transport = await openUsbPrinter(device);
  const { media, errors } = await driver.readStatus(transport);
  if (!media) {
    await transport.close();
    throw new Error(`${driver.name}: ${errors.join(", ") || "unrecognized label roll"}`);
  }
  printer = { driver, transport, media };
  return `${driver.name} connected, ${media.name} labels loaded${errors.length ? ` (${errors.join(", ")})` : ""}`;
}

async function printTestLabel() {
  if (!printer) throw new Error("Connect a printer first");
  const { driver, transport, media } = printer;
  await driver.print(transport, [testPage(media)], media);
  return `Printed a test label on ${media.name}`;
}

/**
 * A border shows cropping or offset errors; text shows mirroring.
 * @param {Media} media
 */
function testPage(media) {
  const width = media.printableWidth;
  const height = media.printableHeight || 300;
  const context = new OffscreenCanvas(width, height).getContext("2d");
  if (!context) throw new Error("Canvas is not available");

  context.fillStyle = "white";
  context.fillRect(0, 0, width, height);
  context.lineWidth = 8;
  context.strokeRect(4, 4, width - 8, height - 8);
  context.fillStyle = "black";
  context.textAlign = "center";
  context.font = `bold ${Math.round(width / 12)}px system-ui, sans-serif`;
  context.fillText("MTG Thermal Printer", width / 2, height / 2, width - 48);
  context.font = `${Math.round(width / 20)}px system-ui, sans-serif`;
  context.fillText(media.name, width / 2, height / 2 + width / 10, width - 48);
  return thresholdToBitmap(context.getImageData(0, 0, width, height));
}

/** @param {() => Promise<string>} action */
async function run(action) {
  connectButton.disabled = true;
  printButton.disabled = true;
  try {
    output.textContent = await action();
  } catch (error) {
    output.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    connectButton.disabled = !usbSupported;
    printButton.disabled = !printer;
  }
}
