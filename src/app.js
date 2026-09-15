/** @import { Bitmap, Media } from "./printers/types.js" */
/** @import { ScryfallCard } from "./scryfall/client.js" */
import { bitmapToRgba } from "./imaging/bitmap.js";
import { renderCard, TONES } from "./imaging/card.js";
import { PrinterConnection } from "./printers/connection.js";
import { drivers } from "./printers/index.js";
import { createScryfallClient, imageUrl, ScryfallError } from "./scryfall/client.js";

const SEARCH_DELAY_MS = 300;
const MAX_COPIES = 20;
const IMAGE_CACHE_SIZE = 12;
// Until a printer reports its loaded roll, previews use the QL-700's 62 × 100 mm labels.
const DEFAULT_MEDIA = /** @type {Media} */ (drivers[0].media.find(({ id }) => id === "62x100"));

/**
 * @template {Element} T
 * @param {string} selector
 * @param {new () => T} type
 * @returns {T}
 */
function element(selector, type) {
  const found = document.querySelector(selector);
  if (!(found instanceof type)) throw new Error(`Missing element ${selector}`);
  return found;
}

const ui = {
  printer: element("#printer", HTMLButtonElement),
  search: element("#search", HTMLFormElement),
  query: element("#query", HTMLInputElement),
  suggestions: element("#suggestions", HTMLElement),
  resultsStatus: element("#results-status", HTMLElement),
  results: element("#results", HTMLUListElement),
  more: element("#more", HTMLButtonElement),
  back: element("#back", HTMLButtonElement),
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
  copies: element("#copies", HTMLInputElement),
  print: element("#print", HTMLButtonElement),
  printStatus: element("#print-status", HTMLElement),
};

const scryfall = createScryfallClient();
const printer = new PrinterConnection();
/** @type {Map<string, Promise<ImageBitmap>>} */
const images = new Map();

const state = {
  /** @type {ScryfallCard[]} */
  results: [],
  nextPage: 0,
  /** The chosen printing. @type {ScryfallCard | undefined} */
  card: undefined,
  face: 0,
  /** The label as it will print. @type {Bitmap | undefined} */
  page: undefined,
  printing: false,
};

/** @type {ReturnType<typeof setTimeout> | undefined} */
let searchTimer;
let searchId = 0;
let renderId = 0;

/* Search */

ui.search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(search, SEARCH_DELAY_MS);
});

ui.search.addEventListener("submit", (event) => {
  event.preventDefault();
  clearTimeout(searchTimer);
  search();
});

ui.suggestions.addEventListener("click", (event) => {
  const button = event.target instanceof Element && event.target.closest("button");
  if (!button) return;
  ui.query.value = button.textContent ?? "";
  element('input[name="scope"][value="tokens"]', HTMLInputElement).checked = true;
  search();
});

ui.more.addEventListener("click", () => search(state.nextPage));

const tokensOnly = () => new FormData(ui.search).get("scope") !== "all";

async function search(page = 1) {
  const text = ui.query.value.trim();
  const id = ++searchId;
  rememberSearch(text);
  ui.suggestions.hidden = text !== "";
  if (!text) {
    state.results = [];
    state.nextPage = 0;
    ui.resultsStatus.textContent = "";
    renderResults();
    return;
  }

  if (page === 1) ui.resultsStatus.textContent = "Searching…";
  try {
    const list = await scryfall.search(`${tokensOnly() ? "t:token " : ""}game:paper (${text})`, { page });
    if (id !== searchId) return;
    state.results = page === 1 ? list.data : [...state.results, ...list.data];
    state.nextPage = list.has_more ? page + 1 : 0;
    const [one, many] = tokensOnly() ? ["token", "tokens"] : ["card", "cards"];
    if (list.total_cards === 0) {
      ui.resultsStatus.textContent = `No ${many} match “${text}”.${tokensOnly() ? " Try searching all cards." : ""}`;
    } else {
      ui.resultsStatus.textContent = `${list.total_cards} ${list.total_cards === 1 ? one : many}`;
    }
    renderResults();
  } catch (error) {
    if (id !== searchId) return;
    ui.resultsStatus.textContent =
      error instanceof ScryfallError
        ? error.message
        : "Couldn't reach Scryfall. Check your connection and try again.";
  }
}

/**
 * Keeps the search in the address bar, so reloading or sharing the page repeats it.
 * @param {string} text
 */
function rememberSearch(text) {
  const url = new URL(location.href);
  url.search = "";
  if (text) url.searchParams.set("q", text);
  if (!tokensOnly()) url.searchParams.set("scope", "all");
  history.replaceState(null, "", url);
}

function renderResults() {
  ui.results.replaceChildren(...state.results.map(resultItem));
  ui.more.hidden = !state.nextPage;
}

/** @param {ScryfallCard} card */
function resultItem(card) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "result";
  button.dataset.group = groupOf(card);
  button.setAttribute(
    "aria-pressed",
    String(state.card !== undefined && groupOf(state.card) === groupOf(card)),
  );
  button.append(
    cardImage(card, "normal", "result-image"),
    Object.assign(document.createElement("span"), { className: "result-name", textContent: card.name }),
  );
  button.addEventListener("click", () => select(card));
  const item = document.createElement("li");
  item.append(button);
  return item;
}

/**
 * @param {ScryfallCard} card
 * @param {"small" | "normal"} size
 * @param {string} className
 */
function cardImage(card, size, className) {
  const image = Object.assign(document.createElement("img"), {
    className,
    alt: "",
    loading: "lazy",
    decoding: "async",
  });
  const url = imageUrl(card, 0, size);
  if (url) image.src = url;
  return image;
}

/** Printings of the same card share an Oracle ID. @param {ScryfallCard} card */
const groupOf = (card) => card.oracle_id ?? card.id;

/* Selected card */

/** @param {ScryfallCard} card */
function select(card) {
  state.card = card;
  state.face = 0;
  document.body.dataset.view = "label";
  for (const button of ui.results.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.group === groupOf(card)));
  }
  ui.printings.replaceChildren();
  ui.printStatus.textContent = "";
  showCard();
  loadPrintings(card);
  if (matchMedia("(max-width: 52rem)").matches) window.scrollTo(0, 0);
}

/** @param {ScryfallCard} card */
async function loadPrintings(card) {
  if (!card.oracle_id) return;
  try {
    const { data } = await scryfall.search(`oracleid:${card.oracle_id} game:paper`, {
      unique: "prints",
      order: "released",
    });
    if (state.card === undefined || groupOf(state.card) !== card.oracle_id) return;
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
  button.append(cardImage(printing, "small", "printing-image"));
  button.addEventListener("click", () => {
    state.card = printing;
    showCard();
  });
  return button;
}

function markChosenPrinting() {
  for (const button of ui.printings.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.id === state.card?.id));
  }
}

/** The faces of a double-faced card, or an empty list. */
const facesOf = (/** @type {ScryfallCard} */ card) =>
  card.card_faces?.filter((face) => face.image_uris) ?? [];

function showCard() {
  const card = state.card;
  if (!card) return;
  ui.cardHeading.hidden = false;
  const faces = facesOf(card);
  if (state.face >= faces.length) state.face = 0;
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
  if (state.card) ui.cardName.textContent = facesOf(state.card)[state.face]?.name ?? state.card.name;
}

ui.back.addEventListener("click", () => {
  document.body.dataset.view = "results";
});

/* Preview */

ui.controls.addEventListener("change", (event) => {
  if (event.target === ui.copies) {
    ui.copies.value = String(copies());
    return updatePrintButton();
  }
  const face = new FormData(ui.controls).get("face");
  if (face !== null) state.face = Number(face);
  showCardName();
  updatePreview();
});

const darkness = () =>
  /** @type {keyof typeof TONES} */ (new FormData(ui.controls).get("darkness") ?? "normal");

const currentMedia = () => (printer.state.kind === "ready" ? printer.state.media : DEFAULT_MEDIA);

async function updatePreview() {
  const card = state.card;
  if (!card) return;
  const id = ++renderId;
  const media = currentMedia();
  state.page = undefined;
  ui.label.dataset.state = "loading";
  showLabelSize(media);
  updatePrintButton();

  try {
    const url = imageUrl(card, state.face);
    if (!url) throw new Error(`Scryfall has no image of ${card.name}.`);
    const image = await loadImage(url);
    if (id !== renderId) return;
    const page = renderCard(image, media, TONES[darkness()]);
    ui.preview.width = page.width;
    ui.preview.height = page.height;
    ui.preview
      .getContext("2d")
      ?.putImageData(new ImageData(bitmapToRgba(page), page.width, page.height), 0, 0);
    state.page = page;
    ui.label.dataset.state = "ready";
  } catch (error) {
    if (id !== renderId) return;
    ui.label.dataset.state = "empty";
    ui.printStatus.textContent =
      error instanceof TypeError
        ? "Couldn't download the card image. Check your connection and try again."
        : messageOf(error);
  }
  updatePrintButton();
}

/** @param {Media} media */
function showLabelSize(media) {
  ui.labelWidth.textContent = `${media.widthMm} mm`;
  ui.labelLength.textContent = media.lengthMm ? `${media.lengthMm} mm` : "continuous";
  ui.label.classList.toggle("continuous", !media.lengthMm);
}

/** @param {string} url */
function loadImage(url) {
  let image = images.get(url);
  if (!image) {
    image = fetch(url)
      .then((response) => {
        if (!response.ok) throw new TypeError(`Image download failed (${response.status})`);
        return response.blob();
      })
      .then((blob) => createImageBitmap(blob));
    images.set(url, image);
    image.catch(() => images.delete(url));
    const [oldest] = images.keys();
    if (images.size > IMAGE_CACHE_SIZE) images.delete(oldest);
  }
  return image;
}

/* Printing */

ui.controls.addEventListener("click", (event) => {
  const step = event.target instanceof Element && event.target.closest("[data-step]");
  if (!(step instanceof HTMLElement)) return;
  ui.copies.value = String(Math.min(Math.max(copies() + Number(step.dataset.step), 1), MAX_COPIES));
  updatePrintButton();
});

ui.copies.addEventListener("input", updatePrintButton);

ui.controls.addEventListener("submit", (event) => {
  event.preventDefault();
  printLabels();
});

const copies = () => Math.min(Math.max(Math.round(Number(ui.copies.value)) || 1, 1), MAX_COPIES);

/**
 * @param {Bitmap} page
 * @param {Media} media
 */
const fits = (page, media) =>
  page.width === media.printableWidth && (!media.printableHeight || page.height === media.printableHeight);

async function printLabels() {
  if (!state.page || state.printing) return;
  ui.printStatus.textContent = "";
  if (printer.state.kind === "disconnected") await printer.choose();
  else if (printer.state.kind === "error") await printer.refresh();
  if (printer.state.kind !== "ready") return;

  if (!state.page || !fits(state.page, printer.state.media)) await updatePreview();
  const page = state.page;
  if (!page) return;

  const count = copies();
  state.printing = true;
  ui.label.classList.add("feeding");
  updatePrintButton();
  try {
    await printer.print(Array.from({ length: count }, () => page));
    ui.printStatus.textContent = count === 1 ? "Printed." : `Printed ${count} labels.`;
  } catch (error) {
    ui.printStatus.textContent = messageOf(error);
  } finally {
    state.printing = false;
    ui.label.classList.remove("feeding");
    updatePrintButton();
  }
}

function updatePrintButton() {
  if (printer.state.kind === "unsupported") {
    ui.print.disabled = true;
    ui.print.textContent = "Printing needs Chrome or Edge";
    return;
  }
  const count = copies();
  ui.print.disabled = !state.page || state.printing || printer.state.kind === "connecting";
  ui.print.textContent = state.printing ? "Printing…" : count === 1 ? "Print label" : `Print ${count} labels`;
}

/* Printer */

printer.addEventListener("change", () => {
  showPrinter();
  if (state.page && !fits(state.page, currentMedia())) updatePreview();
  else updatePrintButton();
});

ui.printer.addEventListener("click", () =>
  printer.state.kind === "disconnected" ? printer.choose() : printer.refresh(),
);

function showPrinter() {
  const connection = printer.state;
  ui.printer.dataset.state = connection.kind;
  ui.printer.hidden = connection.kind === "unsupported";
  ui.printer.disabled = connection.kind === "connecting";
  if (connection.kind === "ready") showPrinterText(connection.printer, connection.media.name);
  else if (connection.kind === "error") showPrinterText(connection.printer, connection.message);
  else showPrinterText(connection.kind === "connecting" ? "Connecting…" : "Connect printer");
}

/**
 * @param {string} name
 * @param {string} [detail]
 */
function showPrinterText(name, detail) {
  const parts = detail
    ? [name, Object.assign(document.createElement("span"), { className: "detail", textContent: detail })]
    : [name];
  ui.printer.replaceChildren(...parts);
  ui.printer.title = detail ? `${name}: ${detail}` : name;
}

/* Keyboard */

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !(event.target instanceof HTMLInputElement)) {
    event.preventDefault();
    ui.query.focus();
  } else if (event.key === "Escape" && document.body.dataset.view === "label") {
    document.body.dataset.view = "results";
  }
});

/** @param {unknown} error */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/* Start */

const params = new URLSearchParams(location.search);
ui.query.value = params.get("q") ?? "";
if (params.get("scope") === "all")
  element('input[name="scope"][value="all"]', HTMLInputElement).checked = true;
showPrinter();
updatePrintButton();
printer.restore();
if (ui.query.value) search();
