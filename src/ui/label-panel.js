/** @import { Darkness, Design, Token } from "../designs.js" */
/** @import { PrintList } from "../print-list.js" */
/** @import { PrinterConnection } from "../printers/connection.js" */
/** @import { Bitmap, Media } from "../printers/types.js" */
/** @import { ScryfallCard, ScryfallClient } from "../scryfall/client.js" */
/** @import { Rect } from "./art-arranger.js" */
/** @import { LabelSize } from "./label-size.js" */
import { artBoxOf, DARKNESS, isBlankToken, loadArt, renderDesign } from "../designs.js";
import { cardSize } from "../imaging/card.js";
import { clampCopies } from "../print-list.js";
import { cardFaces, pickCard } from "../scryfall/client.js";
import { updateAddress } from "./address.js";
import { bindArtArranger } from "./art-arranger.js";
import { cardThumbnail, drawBitmap, element, problemMessage } from "./dom.js";
import { preparePrinter } from "./printer-button.js";
import { readSetting, writeSetting } from "./settings.js";
import { bindStepper } from "./stepper.js";

/**
 * The label being made, from a card or a custom token: its preview, the print options, and
 * printing it or adding it to the print list.
 * @param {object} options
 * @param {ScryfallClient} options.scryfall
 * @param {PrinterConnection} options.printer
 * @param {LabelSize} options.labelSize
 * @param {PrintList} options.printList
 * @param {(token: Token) => void} options.onTokenChange  Called when the token's image is arranged.
 * @param {(card: ScryfallCard, face: number) => void} options.onCustomize
 */
export function createLabelPanel({ scryfall, printer, labelSize, printList, onTokenChange, onCustomize }) {
  const ui = {
    label: element("#label", HTMLElement),
    labelWidth: element("#label-width", HTMLElement),
    labelLength: element("#label-length", HTMLElement),
    preview: element("#preview", HTMLCanvasElement),
    arrangeHint: element("#arrange-hint", HTMLElement),
    heading: element("#card-heading", HTMLElement),
    cardName: element("#card-name", HTMLElement),
    cardSet: element("#card-set", HTMLElement),
    customize: element("#customize", HTMLButtonElement),
    printings: element("#printings", HTMLElement),
    controls: element("#controls", HTMLFormElement),
    facesField: element("#faces-field", HTMLFieldSetElement),
    faces: element("#faces", HTMLElement),
    styleField: element("#style-field", HTMLFieldSetElement),
    arrangeFields: element("#arrange-fields", HTMLElement),
    darknessField: element("#darkness-field", HTMLFieldSetElement),
    borderOption: element("#border-option", HTMLElement),
    cropBorder: element("#crop-border", HTMLInputElement),
    artOption: element("#art-option", HTMLElement),
    includeArt: element("#include-art", HTMLInputElement),
    copiesStepper: element("#copies-stepper", HTMLElement),
    copies: element("#copies", HTMLInputElement),
    addToList: element("#add-to-list", HTMLButtonElement),
    print: element("#print", HTMLButtonElement),
    status: element("#print-status", HTMLElement),
  };
  const darknessChoice = /** @type {RadioNodeList} */ (ui.controls.elements.namedItem("darkness"));
  const styleChoice = /** @type {RadioNodeList} */ (ui.controls.elements.namedItem("style"));

  const state = {
    /** What the label is made from. @type {"card" | "token"} */
    source: "card",
    /** The chosen printing. @type {ScryfallCard | undefined} */
    card: undefined,
    face: 0,
    /** @type {Token | undefined} */
    token: undefined,
    /** The label as it will print. @type {Bitmap | undefined} */
    page: undefined,
    /** The token's image and where it is on the label, for arranging it. @type {ImageBitmap | undefined} */
    artImage: undefined,
    /** @type {Rect | undefined} */
    artBox: undefined,
    printing: false,
  };
  let renderId = 0;
  let arrangeFrame = 0;

  const darkness = () => /** @type {Darkness} */ (darknessChoice.value || "normal");
  const style = () => (styleChoice.value === "text" ? "text" : "image");
  const copies = () => clampCopies(ui.copies.value);

  /** @returns {Design | undefined} */
  function design() {
    if (state.source === "token") {
      return state.token && { ...state.token, type: /** @type {const} */ ("token"), darkness: darkness() };
    }
    if (!state.card) return undefined;
    return {
      type: "card",
      card: pickCard(state.card),
      face: state.face,
      style: style(),
      darkness: darkness(),
      cropBorder: ui.cropBorder.checked,
      art: ui.includeArt.checked,
    };
  }

  /* Cards */

  /**
   * @param {ScryfallCard} card
   * @param {number} [face]
   */
  function showCard(card, face = 0) {
    state.source = "card";
    state.card = card;
    state.face = face;
    ui.printings.replaceChildren();
    ui.status.textContent = "";
    showPrinting();
    loadPrintings(card);
  }

  /** Goes back to the chosen card, if there is one, after making a token. */
  function showCards() {
    state.source = "card";
    if (state.card) {
      showPrinting();
      return;
    }
    renderId++;
    state.page = undefined;
    state.artBox = undefined;
    ui.label.dataset.state = "empty";
    ui.heading.hidden = true;
    showOptions();
    showArrangeable();
    showLabelSize(labelSize.current);
    updateButtons();
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
    if (!faces[state.face]) state.face = 0;
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
    showHeading();
    showOptions();
    markChosenPrinting();
    rememberCard();
    updatePreview();
  }

  /** Keeps the printing and side in the address, so the page can be bookmarked or shared. */
  function rememberCard() {
    updateAddress({ card: state.card?.id, face: state.face ? String(state.face) : undefined });
  }

  /* Tokens */

  /** @param {Token} token */
  function showToken(token) {
    const sameToken = state.source === "token" && state.token?.id === token.id;
    state.source = "token";
    state.token = token;
    showHeading();
    showOptions();
    updatePreview(sameToken && state.page !== undefined);
  }

  const arranger = bindArtArranger({
    canvas: ui.preview,
    target() {
      const { page, artBox, artImage, token } = state;
      if (state.source !== "token" || !page || !artBox || !artImage || !token?.art) return undefined;
      return { page, box: artBox, image: artImage, arrangement: token.art };
    },
    onArrange(arrangement) {
      if (!state.token?.art) return;
      state.token = { ...state.token, art: { ...state.token.art, ...arrangement } };
      onTokenChange(state.token);
      cancelAnimationFrame(arrangeFrame);
      arrangeFrame = requestAnimationFrame(() => updatePreview(true));
    },
  });

  /* What is shown */

  function showHeading() {
    ui.heading.hidden = false;
    let name = "";
    if (state.source === "token") {
      name = state.token?.name.trim() || "New token";
      ui.cardSet.textContent = "Custom token";
    } else if (state.card) {
      name = cardFaces(state.card)[state.face]?.name ?? state.card.name;
      ui.cardSet.textContent = `${state.card.set_name}, #${state.card.collector_number}`;
    }
    ui.cardName.textContent = name;
    ui.preview.setAttribute("aria-label", `Label preview of ${name}`);
  }

  /** Shows only the options that change the label. */
  function showOptions() {
    const token = state.source === "token";
    const text = token || style() === "text";
    const hasArt = token ? Boolean(state.token?.art) : !text || ui.includeArt.checked;
    ui.customize.hidden = token || !state.card;
    ui.printings.hidden = token;
    ui.facesField.hidden = token || !state.card || cardFaces(state.card).length < 2;
    ui.styleField.hidden = token;
    ui.borderOption.hidden = token || text;
    ui.artOption.hidden = token || !text;
    ui.arrangeFields.hidden = !(token && state.token?.art);
    ui.darknessField.hidden = !hasArt;
  }

  /** Lets the token's image be dragged on the preview, and focused to move it with keys. */
  function showArrangeable() {
    const arrangeable = state.source === "token" && Boolean(state.artBox);
    ui.label.classList.toggle("arrangeable", arrangeable);
    ui.arrangeHint.hidden = !arrangeable;
    if (arrangeable) ui.preview.tabIndex = 0;
    else ui.preview.removeAttribute("tabindex");
    if (arrangeable && state.token?.art) arranger.sync(state.token.art);
  }

  /* Preview */

  /** @param {boolean} [quiet]  Redraw without the loading state, e.g. while the image is moved. */
  async function updatePreview(quiet = false) {
    const current = design();
    if (!current) return;
    const id = ++renderId;
    const media = labelSize.current;
    if (!quiet) {
      state.page = undefined;
      ui.status.textContent = "";
      ui.label.dataset.state = "loading";
    }
    showLabelSize(media);
    updateButtons();

    try {
      const [page] = await renderDesign(current, media);
      const artImage = current.type === "token" && current.art ? await loadArt(current.art) : undefined;
      if (id !== renderId) return;
      state.page = page;
      state.artImage = artImage;
      state.artBox = artImage ? artBoxOf(current, media) : undefined;
      drawBitmap(ui.preview, page);
      ui.label.dataset.state = "ready";
    } catch (error) {
      if (id !== renderId) return;
      state.page = undefined;
      state.artBox = undefined;
      ui.label.dataset.state = "empty";
      ui.status.textContent = problemMessage(error);
    }
    showArrangeable();
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
    const nothingToPrint = state.source === "token" ? !state.token || isBlankToken(state.token) : !state.card;
    ui.addToList.disabled = nothingToPrint;
    if (printer.state.kind === "unsupported") {
      ui.print.disabled = true;
      ui.print.textContent = "Printing needs Chrome or Edge";
      return;
    }
    ui.print.disabled =
      nothingToPrint || !state.page || state.printing || printer.state.kind === "connecting";
    ui.print.textContent = state.printing
      ? "Printing…"
      : count === 1
        ? "Print label"
        : `Print ${count} labels`;
  }

  /* Events */

  ui.controls.addEventListener("change", (event) => {
    const target = event.target;
    // The label size menu, the copies stepper and the image controls have their own listeners.
    if (!(target instanceof HTMLInputElement) || target === ui.copies || ui.arrangeFields.contains(target))
      return;
    if (target.name === "face") state.face = Number(target.value);
    writeSetting("style", style());
    writeSetting("darkness", darkness());
    writeSetting("cropBorder", ui.cropBorder.checked);
    writeSetting("art", ui.includeArt.checked);
    if (state.source === "card") rememberCard();
    showHeading();
    showOptions();
    updatePreview();
  });

  ui.controls.addEventListener("submit", (event) => {
    event.preventDefault();
    printLabel();
  });

  ui.customize.addEventListener("click", () => {
    if (state.card) onCustomize(state.card, state.face);
  });
  ui.addToList.addEventListener("click", addToList);
  bindStepper(ui.copiesStepper, updateButtons);

  labelSize.addEventListener("change", () => {
    if (design()) updatePreview();
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
  styleChoice.value = readSetting("style") === "text" ? "text" : "image";
  ui.includeArt.checked = readSetting("art") === true;
  showOptions();
  showLabelSize(labelSize.current);
  updateButtons();

  return {
    showCard,
    showCards,
    showToken,
    /** @param {string} message */
    showStatus(message) {
      ui.status.textContent = message;
    },
  };
}
