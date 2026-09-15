/** @import { PrinterConnection } from "../printers/connection.js" */
/** @import { Media } from "../printers/types.js" */
import { drivers } from "../printers/index.js";
import { element } from "./dom.js";
import { readSetting, writeSetting } from "./settings.js";

/** Every label size some supported printer takes, once each. */
const LABELS = [
  ...new Map(drivers.flatMap((driver) => driver.media).map((media) => [media.id, media])).values(),
];
const DEFAULT_MEDIA = /** @type {Media} */ (LABELS.find(({ id }) => id === "62x100"));

/**
 * The label size to draw for: the roll loaded in the connected printer, otherwise the size picked
 * in the menu. Dispatches "change" when it changes.
 */
export class LabelSize extends EventTarget {
  #menu = element("#media", HTMLSelectElement);
  #printer;
  #shown;

  /** @param {PrinterConnection} printer */
  constructor(printer) {
    super();
    this.#printer = printer;
    this.#menu.append(
      optionGroup(
        "Continuous rolls",
        LABELS.filter((media) => !media.lengthMm),
      ),
      optionGroup(
        "Labels",
        LABELS.filter((media) => media.lengthMm),
      ),
    );
    const saved = readSetting("media");
    this.#menu.value = LABELS.some(({ id }) => id === saved) ? String(saved) : DEFAULT_MEDIA.id;
    this.#shown = this.current;

    this.#menu.addEventListener("change", () => {
      writeSetting("media", this.#menu.value);
      this.#update();
    });
    printer.addEventListener("change", () => {
      // The printer can only print on the roll it has loaded, so that roll replaces the menu choice.
      this.#menu.disabled = printer.state.kind === "ready";
      if (printer.state.kind === "ready" && this.#menu.value !== printer.state.media.id) {
        this.#menu.value = printer.state.media.id;
        writeSetting("media", this.#menu.value);
      }
      this.#update();
    });
  }

  /** @returns {Media} */
  get current() {
    if (this.#printer.state.kind === "ready") return this.#printer.state.media;
    return LABELS.find(({ id }) => id === this.#menu.value) ?? DEFAULT_MEDIA;
  }

  #update() {
    if (this.current === this.#shown) return;
    this.#shown = this.current;
    this.dispatchEvent(new Event("change"));
  }
}

/**
 * @param {string} label
 * @param {Media[]} media
 */
function optionGroup(label, media) {
  const group = Object.assign(document.createElement("optgroup"), { label });
  group.append(...media.map(({ id, name }) => new Option(name, id)));
  return group;
}
