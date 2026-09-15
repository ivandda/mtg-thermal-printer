import { addressParam, updateAddress } from "./address.js";
import { element } from "./dom.js";

/** @typedef {"find" | "create"} Mode */

/**
 * The tabs that switch between finding a card and creating a token. The choice is kept in the
 * address.
 * @param {(mode: Mode) => void} onChange
 */
export function createModes(onChange) {
  const find = element('input[name="mode"][value="find"]', HTMLInputElement);
  const create = element('input[name="mode"][value="create"]', HTMLInputElement);
  const back = element("#back", HTMLButtonElement);

  /** @param {Mode} mode */
  function show(mode) {
    find.checked = mode === "find";
    create.checked = mode === "create";
    document.body.dataset.mode = mode;
    back.textContent = mode === "create" ? "Back to the token" : "Back to results";
    updateAddress({ mode: mode === "create" ? "create" : undefined });
    onChange(mode);
  }

  for (const input of [find, create]) {
    input.addEventListener("change", () => show(create.checked ? "create" : "find"));
  }
  // Going back returns to an address saved before the mode may have changed, so it is written again.
  addEventListener("popstate", () => {
    updateAddress({ mode: document.body.dataset.mode === "create" ? "create" : undefined });
  });
  if (addressParam("mode") === "create") show("create");

  return { show };
}
