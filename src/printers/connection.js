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

  /** The printer in use, even if opening it failed. @type {USBDevice | undefined} */
  #device;
  /** @type {{ driver: PrinterDriver, transport: Transport } | undefined} */
  #session;
  /** An attempt to open a printer, shared by requests that overlap it. @type {Promise<void> | undefined} */
  #connecting;
  #usb;
  #openTransport;

  /**
   * @param {object} [dependencies]  Replaceable in tests.
   * @param {USB} [dependencies.usb]  Missing in browsers without WebUSB.
   * @param {typeof openUsbPrinter} [dependencies.open]
   */
  constructor({ usb = "usb" in navigator ? navigator.usb : undefined, open = openUsbPrinter } = {}) {
    super();
    this.#usb = usb;
    this.#openTransport = open;
    if (!usb) {
      this.state = { kind: "unsupported" };
      return;
    }
    usb.addEventListener("connect", () => this.restore());
    usb.addEventListener("disconnect", (event) => {
      if (event.device !== this.#device) return;
      this.#device = undefined;
      this.#session = undefined;
      this.#setState({ kind: "disconnected" });
    });
  }

  /** Connects to a printer the user already allowed on this site, without asking again. */
  async restore() {
    if (!this.#usb || this.#device) return;
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

  /** Tries again after a problem: reads the status again, or reopens a printer that failed to open. */
  async retry() {
    if (this.#session) await this.#readStatus();
    else if (this.#device) await this.#connect(this.#device);
    else await this.choose();
  }

  /** @param {Bitmap[]} pages */
  async print(pages) {
    if (!this.#session || this.state.kind !== "ready") throw new Error("Connect a printer first");
    const { driver, transport } = this.#session;
    try {
      await driver.print(transport, pages, this.state.media);
    } catch (error) {
      await this.#readStatus();
      throw error;
    }
  }

  /** @param {USBDevice} device */
  #connect(device) {
    this.#connecting ??= this.#open(device).finally(() => {
      this.#connecting = undefined;
    });
    return this.#connecting;
  }

  /** @param {USBDevice} device */
  async #open(device) {
    const driver = driverFor(device);
    if (!driver) return;
    await this.#session?.transport.close().catch(() => {}); // the previous printer may already be gone
    this.#device = device;
    this.#session = undefined;
    this.#setState({ kind: "connecting" });
    try {
      this.#session = { driver, transport: await this.#openTransport(device) };
    } catch (error) {
      this.#setState({ kind: "error", printer: driver.name, message: openFailure(error) });
      return;
    }
    await this.#readStatus();
  }

  async #readStatus() {
    if (!this.#session) return;
    const { driver, transport } = this.#session;
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

/**
 * Explains why a printer couldn't be opened. Browsers report a printer that another tab or program
 * is already using as a failure to claim its USB interface.
 * @param {unknown} error
 */
function openFailure(error) {
  if (error instanceof DOMException && /claim/i.test(error.message)) {
    return "In use by another tab or app. Close it, then try again.";
  }
  return messageOf(error);
}

/** @param {unknown} error */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
