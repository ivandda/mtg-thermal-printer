/**
 * The page address keeps the search and the chosen card, so reloading or sharing the page brings
 * them back.
 */

/** @param {string} name */
export const addressParam = (name) => new URLSearchParams(location.search).get(name);

/** @param {Record<string, string | undefined>} params  An undefined value removes the parameter. */
export function updateAddress(params) {
  const url = new URL(location.href);
  for (const [name, value] of Object.entries(params)) {
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
  }
  history.replaceState(history.state, "", url);
}
