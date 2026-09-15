/** @import { Bitmap, Media, PrinterDriver, Transport } from "./types.js" */
import { openUsbPrinter } from "../transport/webusb.js";
import { driverFor, drivers } from "./index.js";

/**
 * @typedef {{ kind: "unsupported" | "disconnected" | "connecting" }
 *   | { kind: "ready", printer: string, media: Media }
 *   | { kind: "error", printer: string, message: string }} ConnectionState
 */

/**
 * The app's link to its printer. It reconnects to printers the user already allowed, follows
 * plugging in and unplugging, and dispatches "change" whenever `state` changes.
 */
export class PrinterConnection extends EventTarget {
  /** @type {ConnectionState} */
  state = { kind: "disconnected" };

  /** @type {{ device: USBDevice, driver: PrinterDriver, transport: Transport } | undefined} */
  #printer;
  #usb;
  #open;

  /**
   * @param {object} [dependencies]  Replaceable in tests.
   * @param {USB} [dependencies.usb]  Missing in browsers without WebUSB.
   * @param {typeof openUsbPrinter} [dependencies.open]
   */
  constructor({ usb = "usb" in navigator ? navigator.usb : undefined, open = openUsbPrinter } = {}) {
    super();
    this.#usb = usb;
    this.#open = open;
    if (!usb) {
      this.state = { kind: "unsupported" };
      return;
    }
    usb.addEventListener("connect", () => this.restore());
    usb.addEventListener("disconnect", (event) => {
      if (event.device !== this.#printer?.device) return;
      this.#printer = undefined;
      this.#setState({ kind: "disconnected" });
    });
  }

  /** Connects to a printer the user already allowed on this site, without asking again. */
  async restore() {
    if (!this.#usb || this.#printer) return;
    const device = (await this.#usb.getDevices()).find((candidate) => driverFor(candidate));
    if (device) await this.#connect(device);
  }

  /** Lets the user pick a printer. Browsers only allow this in response to a click or key press. */
  async choose() {
    if (!this.#usb) return;
    try {
      const filters = drivers.flatMap((driver) => driver.usbFilters);
      await this.#connect(await this.#usb.requestDevice({ filters }));
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") return; // picker closed
      this.#setState({ kind: "error", printer: "Printer", message: messageOf(error) });
    }
  }

  /** Reads the printer's status again, e.g. after its cover was closed. */
  async refresh() {
    await this.#readStatus();
  }

  /** @param {Bitmap[]} pages */
  async print(pages) {
    if (!this.#printer || this.state.kind !== "ready") throw new Error("Connect a printer first");
    const { driver, transport } = this.#printer;
    try {
      await driver.print(transport, pages, this.state.media);
    } catch (error) {
      await this.#readStatus();
      throw error;
    }
  }

  /** @param {USBDevice} device */
  async #connect(device) {
    const driver = driverFor(device);
    if (!driver) return;
    await this.#printer?.transport.close().catch(() => {}); // the previous printer may already be gone
    this.#printer = undefined;
    this.#setState({ kind: "connecting" });
    try {
      this.#printer = { device, driver, transport: await this.#open(device) };
    } catch (error) {
      this.#setState({ kind: "error", printer: driver.name, message: messageOf(error) });
      return;
    }
    await this.#readStatus();
  }

  async #readStatus() {
    if (!this.#printer) return;
    const { driver, transport } = this.#printer;
    try {
      const { media, errors } = await driver.readStatus(transport);
      if (errors.length > 0) {
        this.#setState({ kind: "error", printer: driver.name, message: errors.join(", ") });
      } else if (!media) {
        this.#setState({ kind: "error", printer: driver.name, message: "Unrecognized label roll" });
      } else {
        this.#setState({ kind: "ready", printer: driver.name, media });
      }
    } catch (error) {
      this.#setState({ kind: "error", printer: driver.name, message: messageOf(error) });
    }
  }

  /** @param {ConnectionState} state */
  #setState(state) {
    this.state = state;
    this.dispatchEvent(new Event("change"));
  }
}

/** @param {unknown} error */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
