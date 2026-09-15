/** @import { PrintList, PrintListItem } from "../print-list.js" */
/** @import { PrinterConnection } from "../printers/connection.js" */
/** @import { Bitmap, Media } from "../printers/types.js" */
/** @import { LabelSize } from "./label-size.js" */
import { describeDesign, renderDesign } from "../designs.js";
import { drawBitmap, element, problemMessage } from "./dom.js";
import { preparePrinter } from "./printer-button.js";
import { bindStepper } from "./stepper.js";

/**
 * The print list, in a side sheet: saved labels with their copies, printed together in one job.
 * @param {object} options
 * @param {PrinterConnection} options.printer
 * @param {LabelSize} options.labelSize
 * @param {PrintList} options.printList
 */
export function createPrintListDialog({ printer, labelSize, printList }) {
  const ui = {
    open: element("#open-list", HTMLButtonElement),
    count: element("#list-count", HTMLElement),
    dialog: element("#print-list", HTMLDialogElement),
    clear: element("#clear-list", HTMLButtonElement),
    close: element("#close-list", HTMLButtonElement),
    empty: element("#list-empty", HTMLElement),
    items: element("#list-items", HTMLUListElement),
    template: element("#list-item", HTMLTemplateElement),
    printAll: element("#print-all", HTMLButtonElement),
    status: element("#list-status", HTMLElement),
  };
  /** Rows by item ID, with previews drawn for `rowsMedia`. @type {Map<string, HTMLElement>} */
  const rows = new Map();
  /** @type {Media | undefined} */
  let rowsMedia;
  let printing = false;

  ui.open.addEventListener("click", () => {
    ui.status.textContent = "";
    ui.dialog.showModal();
    showItems();
  });
  ui.close.addEventListener("click", () => ui.dialog.close());
  // A click on the dimmed page around the sheet closes it.
  ui.dialog.addEventListener("click", (event) => {
    if (event.target === ui.dialog) ui.dialog.close();
  });
  ui.clear.addEventListener("click", () => {
    printList.clear();
    ui.close.focus();
  });
  ui.printAll.addEventListener("click", printAll);

  printList.addEventListener("change", () => {
    showCount();
    if (ui.dialog.open) showItems();
  });
  labelSize.addEventListener("change", () => {
    if (ui.dialog.open) showItems();
  });
  printer.addEventListener("change", updatePrintAll);

  function showCount() {
    const count = printList.items.length;
    ui.count.textContent = String(count);
    ui.count.hidden = count === 0;
    ui.open.setAttribute("aria-label", `Print list, ${count} ${count === 1 ? "item" : "items"}`);
  }

  function showItems() {
    const media = labelSize.current;
    if (media !== rowsMedia) {
      rows.clear();
      ui.items.replaceChildren();
      rowsMedia = media;
    }
    for (const [id, row] of rows) {
      if (printList.items.some((item) => item.id === id)) continue;
      row.remove();
      rows.delete(id);
    }
    for (const item of printList.items) {
      const copies = /** @type {HTMLInputElement} */ (
        (rows.get(item.id) ?? addRow(item, media)).querySelector("input")
      );
      if (document.activeElement !== copies) copies.value = String(item.copies);
    }
    ui.empty.hidden = printList.items.length > 0;
    ui.clear.hidden = printList.items.length === 0;
    updatePrintAll();
  }

  /**
   * @param {PrintListItem} item
   * @param {Media} media
   */
  function addRow(item, media) {
    const row = /** @type {HTMLElement} */ (ui.template.content.firstElementChild?.cloneNode(true));
    /** @param {string} selector */
    const part = (selector) => /** @type {HTMLElement} */ (row.querySelector(selector));
    const { name, detail } = describeDesign(item.design);
    part(".list-name").textContent = name;
    part(".list-detail").textContent = detail;

    const preview = /** @type {HTMLCanvasElement} */ (part("canvas"));
    preview.setAttribute("aria-label", `Label preview of ${name}`);
    renderDesign(item.design, media)
      .then(([page]) => drawBitmap(preview, page))
      .catch(() => {
        // The row works without its preview, e.g. while offline.
      });

    bindStepper(part(".stepper"), (copies) => printList.setCopies(item.id, copies));
    const remove = part(".remove");
    remove.setAttribute("aria-label", `Remove ${name}`);
    remove.addEventListener("click", () => {
      // Keep keyboard focus in the sheet: on a neighbouring row's Remove button, or on Close.
      const neighbour = (row.nextElementSibling ?? row.previousElementSibling)?.querySelector(".remove");
      (neighbour instanceof HTMLElement ? neighbour : ui.close).focus();
      printList.remove(item.id);
    });

    rows.set(item.id, row);
    ui.items.append(row);
    return row;
  }

  async function printAll() {
    if (printing || printList.items.length === 0) return;
    ui.status.textContent = "";
    const advice = await preparePrinter(printer);
    if (printer.state.kind !== "ready") {
      ui.status.textContent = advice;
      return;
    }

    const { media } = printer.state;
    printing = true;
    updatePrintAll();
    try {
      /** @type {Bitmap[]} */
      const pages = [];
      for (const item of printList.items) {
        const rendered = await renderDesign(item.design, media);
        for (let copy = 0; copy < item.copies; copy++) pages.push(...rendered);
      }
      await printer.print(pages);
      ui.status.textContent = pages.length === 1 ? "Printed." : `Printed ${pages.length} labels.`;
    } catch (error) {
      ui.status.textContent = problemMessage(error);
    } finally {
      printing = false;
      updatePrintAll();
    }
  }

  function updatePrintAll() {
    const labels = printList.items.reduce((sum, item) => sum + item.copies, 0);
    if (printer.state.kind === "unsupported") {
      ui.printAll.disabled = true;
      ui.printAll.textContent = "Printing needs Chrome or Edge";
      return;
    }
    ui.printAll.disabled = printing || labels === 0 || printer.state.kind === "connecting";
    ui.printAll.textContent = printing
      ? "Printing…"
      : labels === 1
        ? "Print 1 label"
        : `Print ${labels} labels`;
  }

  showCount();
}
