/** @import { Darkness, Design } from "../designs.js" */
/** @import { PrintList } from "../print-list.js" */
/** @import { PrinterConnection } from "../printers/connection.js" */
/** @import { Bitmap, Media } from "../printers/types.js" */
/** @import { ScryfallCard, ScryfallClient } from "../scryfall/client.js" */
/** @import { LabelSize } from "./label-size.js" */
import { DARKNESS, renderDesign } from "../designs.js";
import { cardSize } from "../imaging/card.js";
import { clampCopies } from "../print-list.js";
import { cardFaces, pickCard } from "../scryfall/client.js";
import { cardThumbnail, drawBitmap, element, problemMessage } from "./dom.js";
import { preparePrinter } from "./printer-button.js";
import { readSetting, writeSetting } from "./settings.js";
import { bindStepper } from "./stepper.js";

/**
 * The chosen card as a label: its preview, the print options, and printing or adding it to the list.
 * @param {object} options
 * @param {ScryfallClient} options.scryfall
 * @param {PrinterConnection} options.printer
 * @param {LabelSize} options.labelSize
 * @param {PrintList} options.printList
 */
export function createLabelPanel({ scryfall, printer, labelSize, printList }) {
  const ui = {
    label: element("#label", HTMLElement),
    labelWidth: element("#label-width", HTMLElement),
    labelLength: element("#label-length", HTMLElement),
    preview: element("#preview", HTMLCanvasElement),
    cardHeading: element("#card-heading", HTMLElement),
    cardName: element("#card-name", HTMLElement),
    cardSet: element("#card-set", HTMLElement),
    printings: element("#printings", HTMLElement),
    controls: element("#controls", HTMLFormElement),
    facesField: element("#faces-field", HTMLFieldSetElement),
    faces: element("#faces", HTMLElement),
    cropBorder: element("#crop-border", HTMLInputElement),
    copiesStepper: element("#copies-stepper", HTMLElement),
    copies: element("#copies", HTMLInputElement),
    addToList: element("#add-to-list", HTMLButtonElement),
    print: element("#print", HTMLButtonElement),
    status: element("#print-status", HTMLElement),
  };
  const darknessChoice = /** @type {RadioNodeList} */ (ui.controls.elements.namedItem("darkness"));

  const state = {
    /** The chosen printing. @type {ScryfallCard | undefined} */
    card: undefined,
    face: 0,
    /** The label as it will print. @type {Bitmap | undefined} */
    page: undefined,
    printing: false,
  };
  let renderId = 0;

  const darkness = () => /** @type {Darkness} */ (darknessChoice.value || "normal");
  const copies = () => clampCopies(ui.copies.value);

  /** @returns {Design | undefined} */
  function design() {
    if (!state.card) return undefined;
    return {
      type: "card",
      card: pickCard(state.card),
      face: state.face,
      darkness: darkness(),
      cropBorder: ui.cropBorder.checked,
    };
  }

  /* Card and printings */

  /** @param {ScryfallCard} card */
  function showCard(card) {
    state.card = card;
    state.face = 0;
    ui.printings.replaceChildren();
    ui.status.textContent = "";
    showPrinting();
    loadPrintings(card);
  }

  /** @param {ScryfallCard} card */
  async function loadPrintings(card) {
    if (!card.oracle_id) return;
    try {
      const { data } = await scryfall.search(`oracleid:${card.oracle_id} game:paper`, {
        unique: "prints",
        order: "released",
      });
      if (state.card?.oracle_id !== card.oracle_id) return;
      if (data.length > 1) ui.printings.replaceChildren(...data.map(printingButton));
      markChosenPrinting();
    } catch {
      // Other printings are optional: the card that was picked can still be printed.
    }
  }

  /** @param {ScryfallCard} printing */
  function printingButton(printing) {
    const button = document.createElement("button");
    const description = `${printing.set_name}, #${printing.collector_number}`;
    Object.assign(button, { type: "button", title: description });
    button.dataset.id = printing.id;
    button.setAttribute("aria-label", description);
    button.append(cardThumbnail(printing, "small", "printing-image"));
    button.addEventListener("click", () => {
      state.card = printing;
      showPrinting();
    });
    return button;
  }

  function markChosenPrinting() {
    for (const button of ui.printings.querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.id === state.card?.id));
    }
  }

  function showPrinting() {
    const card = state.card;
    if (!card) return;
    const faces = cardFaces(card);
    if (state.face >= faces.length) state.face = 0;
    ui.cardHeading.hidden = false;
    ui.cardSet.textContent = `${card.set_name}, #${card.collector_number}`;
    ui.facesField.hidden = faces.length < 2;
    ui.faces.replaceChildren(
      ...faces.map((face, index) => {
        const input = Object.assign(document.createElement("input"), {
          type: "radio",
          name: "face",
          value: String(index),
          checked: index === state.face,
        });
        const label = document.createElement("label");
        label.append(input, Object.assign(document.createElement("span"), { textContent: face.name }));
        return label;
      }),
    );
    showCardName();
    markChosenPrinting();
    updatePreview();
  }

  function showCardName() {
    if (!state.card) return;
    const name = cardFaces(state.card)[state.face]?.name ?? state.card.name;
    ui.cardName.textContent = name;
    ui.preview.setAttribute("aria-label", `Label preview of ${name}`);
  }

  /* Preview */

  async function updatePreview() {
    const current = design();
    if (!current) return;
    const id = ++renderId;
    const media = labelSize.current;
    state.page = undefined;
    ui.status.textContent = "";
    ui.label.dataset.state = "loading";
    showLabelSize(media);
    updateButtons();

    try {
      const [page] = await renderDesign(current, media);
      if (id !== renderId) return;
      state.page = page;
      drawBitmap(ui.preview, page);
      ui.label.dataset.state = "ready";
    } catch (error) {
      if (id !== renderId) return;
      ui.label.dataset.state = "empty";
      ui.status.textContent = problemMessage(error);
    }
    updateButtons();
  }

  /**
   * Labels the dimension lines and gives the blank label the roll's shape.
   * @param {Media} media
   */
  function showLabelSize(media) {
    ui.labelWidth.textContent = `${media.widthMm} mm`;
    ui.labelLength.textContent = media.lengthMm ? `${media.lengthMm} mm` : "continuous";
    ui.label.classList.toggle("continuous", !media.lengthMm);
    ui.label.classList.toggle("round", media.shape === "round");
    if (!state.page) {
      ui.preview.width = media.printableWidth;
      ui.preview.height = media.printableHeight || cardSize(media).height;
    }
  }

  /* Printing */

  async function printLabel() {
    const current = design();
    if (!current || state.printing) return;
    ui.status.textContent = "";
    const advice = await preparePrinter(printer);
    if (printer.state.kind !== "ready") {
      ui.status.textContent = advice;
      return;
    }

    const { media } = printer.state;
    const count = copies();
    state.printing = true;
    ui.label.classList.add("feeding");
    updateButtons();
    try {
      const pages = await renderDesign(current, media);
      await printer.print(Array.from({ length: count }, () => pages).flat());
      ui.status.textContent = count === 1 ? "Printed." : `Printed ${count} labels.`;
    } catch (error) {
      ui.status.textContent = problemMessage(error);
    } finally {
      state.printing = false;
      ui.label.classList.remove("feeding");
      updateButtons();
    }
  }

  function addToList() {
    const current = design();
    if (!current) return;
    const count = copies();
    printList.add(current, count);
    ui.status.textContent =
      count === 1 ? "Added to the print list." : `Added ${count} labels to the print list.`;
  }

  function updateButtons() {
    const count = copies();
    ui.addToList.disabled = !state.card;
    if (printer.state.kind === "unsupported") {
      ui.print.disabled = true;
      ui.print.textContent = "Printing needs Chrome or Edge";
      return;
    }
    ui.print.disabled = !state.page || state.printing || printer.state.kind === "connecting";
    ui.print.textContent = state.printing
      ? "Printing…"
      : count === 1
        ? "Print label"
        : `Print ${count} labels`;
  }

  /* Events */

  ui.controls.addEventListener("change", (event) => {
    // The label size menu and the copies stepper have their own listeners.
    if (!(event.target instanceof HTMLInputElement) || event.target === ui.copies) return;
    const face = new FormData(ui.controls).get("face");
    if (face !== null) state.face = Number(face);
    writeSetting("darkness", darkness());
    writeSetting("cropBorder", ui.cropBorder.checked);
    showCardName();
    updatePreview();
  });

  ui.controls.addEventListener("submit", (event) => {
    event.preventDefault();
    printLabel();
  });

  ui.addToList.addEventListener("click", addToList);
  bindStepper(ui.copiesStepper, updateButtons);

  labelSize.addEventListener("change", () => {
    if (state.card) updatePreview();
    else showLabelSize(labelSize.current);
  });

  printer.addEventListener("change", () => {
    if (printer.state.kind === "ready" && !state.printing) ui.status.textContent = "";
    updateButtons();
  });

  new ResizeObserver(() => {
    if (state.page) drawBitmap(ui.preview, state.page);
  }).observe(ui.preview);

  /* Start */

  const savedDarkness = readSetting("darkness");
  if (typeof savedDarkness === "string" && DARKNESS.includes(savedDarkness))
    darknessChoice.value = savedDarkness;
  ui.cropBorder.checked = readSetting("cropBorder") === true;
  showLabelSize(labelSize.current);
  updateButtons();

  return {
    showCard,
    /** @param {string} message */
    showStatus(message) {
      ui.status.textContent = message;
    },
  };
}
