import { element } from "./dom.js";

/**
 * On small screens the results and the label take turns filling the screen. Opening the label adds
 * a history entry, so the browser's back button returns to the results where they were left.
 */
export function createViews() {
  const narrowScreen = matchMedia("(max-width: 52rem)");
  const results = element("#results", HTMLUListElement);
  const cardName = element("#card-name", HTMLElement);
  let resultsScrollY = 0;

  history.scrollRestoration = "manual";
  // A reload starts on the results, so an entry left from before it no longer opens the label.
  if (history.state?.view === "label") history.replaceState(null, "");

  addEventListener("popstate", showResults);
  element("#back", HTMLButtonElement).addEventListener("click", closeLabel);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.querySelector("dialog[open]")) closeLabel();
  });

  function openLabel() {
    if (document.body.dataset.view === "label") return;
    resultsScrollY = scrollY; // before the results are hidden and the page gets shorter
    document.body.dataset.view = "label";
    if (!narrowScreen.matches) return;
    history.pushState({ view: "label" }, "");
    window.scrollTo(0, 0);
    cardName.focus({ preventScroll: true });
  }

  function closeLabel() {
    if (document.body.dataset.view !== "label") return;
    if (history.state?.view === "label") {
      history.back(); // continues in the popstate listener
    } else {
      showResults();
    }
  }

  function showResults() {
    if (document.body.dataset.view !== "label") return;
    document.body.dataset.view = "results";
    if (!narrowScreen.matches) return;
    window.scrollTo(0, resultsScrollY);
    const chosen = results.querySelector('[aria-pressed="true"]');
    if (chosen instanceof HTMLElement) chosen.focus({ preventScroll: true });
  }

  return { openLabel };
}
