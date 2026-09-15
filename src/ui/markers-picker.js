/** @import { Marker } from "../markers.js" */
import { MARKER_GROUPS, MARKERS, markerCounts, markerTotal } from "../markers.js";
import { element } from "./dom.js";
import { readSetting, writeSetting } from "./settings.js";
import { bindStepper } from "./stepper.js";

/**
 * The markers to print and how many of each, remembered in this browser.
 * @param {object} options
 * @param {(counts: Record<string, number>) => void} options.onChange
 * @param {() => void} options.onPreview  Shows the label, on small screens.
 */
export function createMarkersPicker({ onChange, onPreview }) {
  const ui = {
    groups: element("#marker-groups", HTMLElement),
    template: element("#marker-row", HTMLTemplateElement),
    clear: element("#clear-markers", HTMLButtonElement),
    preview: element("#preview-markers", HTMLButtonElement),
  };
  let counts = markerCounts(readSetting("markers"));
  /** @type {HTMLInputElement[]} */
  const inputs = [];

  ui.groups.replaceChildren(
    ...MARKER_GROUPS.map(({ kind, name }) => {
      const group = Object.assign(document.createElement("section"), { className: "marker-group" });
      const list = document.createElement("ul");
      list.append(...MARKERS.filter((marker) => marker.kind === kind).map(markerRow));
      group.append(Object.assign(document.createElement("h2"), { textContent: name }), list);
      return group;
    }),
  );

  /** @param {Marker} marker */
  function markerRow(marker) {
    const row = /** @type {HTMLElement} */ (ui.template.content.firstElementChild?.cloneNode(true));
    const name = /** @type {HTMLElement} */ (row.querySelector(".marker-name"));
    const input = /** @type {HTMLInputElement} */ (row.querySelector("input"));
    const [fewer, more] = row.querySelectorAll("button");
    name.textContent = marker.name;
    name.id = `marker-${marker.id}`;
    input.setAttribute("aria-labelledby", name.id);
    input.value = String(counts[marker.id] ?? 0);
    fewer.setAttribute("aria-label", `One fewer: ${marker.name}`);
    more.setAttribute("aria-label", `One more: ${marker.name}`);
    inputs.push(input);
    bindStepper(
      /** @type {HTMLElement} */ (row.querySelector(".stepper")),
      (count) => update({ ...counts, [marker.id]: count }),
      { min: 0 },
    );
    return row;
  }

  /** @param {Record<string, number>} next */
  function update(next) {
    counts = markerCounts(next);
    writeSetting("markers", counts);
    ui.clear.hidden = markerTotal(counts) === 0;
    onChange(counts);
  }

  ui.clear.addEventListener("click", () => {
    for (const input of inputs) input.value = "0";
    update({});
    inputs[0]?.focus();
  });
  ui.preview.addEventListener("click", onPreview);
  ui.clear.hidden = markerTotal(counts) === 0;

  return { current: () => counts };
}
