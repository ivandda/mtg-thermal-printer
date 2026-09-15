/** @import { PrinterConnection } from "../printers/connection.js" */
import { drivers } from "../printers/index.js";
import { element } from "./dom.js";

const PRINTER_TIP = [
  "Printer not listed? Check that it's on and plugged in by USB.",
  ...new Set(drivers.flatMap((driver) => driver.setupTip ?? [])),
].join(" ");

/**
 * Gets a printer ready to print. If none is connected the user picks one; otherwise it is checked
 * again, which catches a roll swapped since the last check.
 * @param {PrinterConnection} printer
 * @returns {Promise<string>}  What the user should know if the printer isn't ready, otherwise "".
 */
export async function preparePrinter(printer) {
  if (printer.state.kind === "disconnected") await printer.choose();
  else await printer.refresh();

  const { state } = printer;
  if (state.kind === "disconnected") return PRINTER_TIP;
  if (state.kind === "error") return `${state.printer}: ${state.message}`;
  return "";
}

/**
 * The header button that shows the printer's state. Clicking it connects or checks the printer.
 * @param {PrinterConnection} printer
 * @param {(message: string) => void} showMessage
 */
export function bindPrinterButton(printer, showMessage) {
  const button = element("#printer", HTMLButtonElement);

  function show() {
    const { state } = printer;
    button.dataset.state = state.kind;
    button.hidden = state.kind === "unsupported";
    button.disabled = state.kind === "connecting";
    if (state.kind === "ready") showText(state.printer, state.media.name);
    else if (state.kind === "error") showText(state.printer, state.message);
    else showText(state.kind === "connecting" ? "Connecting…" : "Connect printer");
  }

  /**
   * @param {string} name
   * @param {string} [detail]
   */
  function showText(name, detail) {
    const parts = detail
      ? [name, Object.assign(document.createElement("span"), { className: "detail", textContent: detail })]
      : [name];
    button.replaceChildren(...parts);
    button.title = detail ? `${name}: ${detail}` : name;
  }

  printer.addEventListener("change", show);
  button.addEventListener("click", async () => {
    const message = await preparePrinter(printer);
    if (message) showMessage(message);
  });
  show();
}
