/** @import { Media, PrinterDriver, Transport } from "./printers/types.js" */
import { bitmapToRgba, thresholdToBitmap } from "./imaging/bitmap.js";
import { renderCard } from "./imaging/card.js";
import { driverFor, drivers } from "./printers/index.js";
import { createScryfallClient, imageUrl } from "./scryfall/client.js";
import { openUsbPrinter } from "./transport/webusb.js";

const connectButton = /** @type {HTMLButtonElement} */ (document.querySelector("#connect"));
const printTestButton = /** @type {HTMLButtonElement} */ (document.querySelector("#print-test"));
const cardForm = /** @type {HTMLFormElement} */ (document.querySelector("#card-form"));
const cardName = /** @type {HTMLInputElement} */ (document.querySelector("#card-name"));
const printCardButton = /** @type {HTMLButtonElement} */ (document.querySelector("#print-card"));
const preview = /** @type {HTMLCanvasElement} */ (document.querySelector("#preview"));
const output = /** @type {HTMLOutputElement} */ (document.querySelector("#output"));

const usbSupported = "usb" in navigator;
const scryfall = createScryfallClient();
// Until a printer reports its loaded label, preview cards on the QL-700's 62 × 100 mm labels.
const previewMedia = /** @type {Media} */ (drivers[0].media.find(({ id }) => id === "62x100"));

/** @type {{ driver: PrinterDriver, transport: Transport, media: Media } | undefined} */
let printer;
/** @type {ImageBitmap | undefined} */
let cardImage;

if (!usbSupported) {
  output.textContent = "This browser can't use USB printers. Open this page in Chrome or Edge.";
}
updateButtons();
connectButton.addEventListener("click", () => run(connect));
printTestButton.addEventListener("click", () => run(printTestLabel));
printCardButton.addEventListener("click", () => run(printCard));
cardForm.addEventListener("submit", (event) => {
  event.preventDefault();
  run(previewCard);
});

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
  const { driver, transport, media } = connectedPrinter();
  await driver.print(transport, [testPage(media)], media);
  return `Printed a test label on ${media.name}`;
}

async function previewCard() {
  const card = await scryfall.cardNamed(cardName.value);
  const url = imageUrl(card);
  if (!url) throw new Error(`Scryfall has no image for ${card.name}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't download the image of ${card.name}`);
  cardImage = await createImageBitmap(await response.blob());

  const media = printer?.media ?? previewMedia;
  const started = performance.now();
  const page = renderCard(cardImage, media);
  const elapsed = Math.round(performance.now() - started);

  preview.width = page.width;
  preview.height = page.height;
  preview.getContext("2d")?.putImageData(new ImageData(bitmapToRgba(page), page.width, page.height), 0, 0);
  preview.hidden = false;
  return `${card.name}, converted for ${media.name} in ${elapsed} ms`;
}

async function printCard() {
  const { driver, transport, media } = connectedPrinter();
  if (!cardImage) throw new Error("Preview a card first");
  await driver.print(transport, [renderCard(cardImage, media)], media);
  return `Printed on ${media.name}`;
}

function connectedPrinter() {
  if (!printer) throw new Error("Connect a printer first");
  return printer;
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
  for (const button of [connectButton, printTestButton, printCardButton]) button.disabled = true;
  try {
    output.textContent = await action();
  } catch (error) {
    output.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    updateButtons();
  }
}

function updateButtons() {
  connectButton.disabled = !usbSupported;
  printTestButton.disabled = !printer;
  printCardButton.disabled = !printer || !cardImage;
}
