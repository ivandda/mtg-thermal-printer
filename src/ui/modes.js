import { addressParam, updateAddress } from "./address.js";
import { element } from "./dom.js";

/** @typedef {"find" | "create" | "markers"} Mode */

/** @type {Record<Mode, string>} */
const BACK_LABELS = { find: "Back to results", create: "Back to the token", markers: "Back to the markers" };

/**
 * The tabs that switch between finding a card, creating a token and picking markers. The choice is
 * kept in the address.
 * @param {(mode: Mode) => void} onChange
 */
export function createModes(onChange) {
  const inputs = [...document.querySelectorAll('input[name="mode"]')].filter(
    (input) => input instanceof HTMLInputElement,
  );
  const back = element("#back", HTMLButtonElement);
  const current = () => /** @type {Mode} */ (document.body.dataset.mode);

  /** @param {Mode} mode */
  function show(mode) {
    for (const input of inputs) input.checked = input.value === mode;
    document.body.dataset.mode = mode;
    back.textContent = BACK_LABELS[mode];
    rememberMode();
    onChange(mode);
  }

  function rememberMode() {
    updateAddress({ mode: current() === "find" ? undefined : current() });
  }

  for (const input of inputs) {
    input.addEventListener("change", () => show(/** @type {Mode} */ (input.value)));
  }
  // Going back returns to an address saved before the mode may have changed, so it is written again.
  addEventListener("popstate", rememberMode);

  const linked = addressParam("mode");
  if (linked === "create" || linked === "markers") show(linked);

  return { show };
}
