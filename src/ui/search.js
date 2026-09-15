/** @import { ScryfallCard, ScryfallClient } from "../scryfall/client.js" */
import { ScryfallError } from "../scryfall/client.js";
import { cardThumbnail, element } from "./dom.js";

const SEARCH_DELAY_MS = 300;

/** Printings of the same card share an Oracle ID. @param {ScryfallCard} card */
const groupOf = (card) => card.oracle_id ?? card.id;

/**
 * The search box, suggestions and results. The search is kept in the address bar, so reloading or
 * sharing the page repeats it.
 * @param {object} options
 * @param {ScryfallClient} options.scryfall
 * @param {(card: ScryfallCard) => void} options.onSelect
 */
export function createSearch({ scryfall, onSelect }) {
  const ui = {
    form: element("#search", HTMLFormElement),
    query: element("#query", HTMLInputElement),
    allCards: element('input[name="scope"][value="all"]', HTMLInputElement),
    tokens: element('input[name="scope"][value="tokens"]', HTMLInputElement),
    suggestions: element("#suggestions", HTMLElement),
    status: element("#results-status", HTMLElement),
    results: element("#results", HTMLUListElement),
    more: element("#more", HTMLButtonElement),
  };
  /** @type {ScryfallCard[]} */
  let results = [];
  let nextPage = 0;
  /** @type {string | undefined} */
  let chosenGroup;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  let searchId = 0;

  ui.form.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(search, SEARCH_DELAY_MS);
  });

  ui.form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearTimeout(timer);
    search();
  });

  ui.suggestions.addEventListener("click", (event) => {
    const button = event.target instanceof Element && event.target.closest("button");
    if (!button) return;
    ui.query.value = button.textContent ?? "";
    ui.tokens.checked = true;
    search();
  });

  ui.more.addEventListener("click", () => search(nextPage));

  document.addEventListener("keydown", (event) => {
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    if (event.key !== "/" || typing) return;
    event.preventDefault();
    ui.query.focus();
  });

  async function search(page = 1) {
    const text = ui.query.value.trim();
    const id = ++searchId;
    const tokensOnly = !ui.allCards.checked;
    rememberSearch(text, tokensOnly);
    ui.suggestions.hidden = text !== "";
    if (!text) {
      results = [];
      nextPage = 0;
      ui.status.textContent = "";
      showResults();
      return;
    }

    if (page === 1) ui.status.textContent = "Searching…";
    showMoreLoading(page > 1);
    try {
      const list = await scryfall.search(`${tokensOnly ? "t:token " : ""}game:paper (${text})`, { page });
      if (id !== searchId) return;
      results = page === 1 ? list.data : [...results, ...list.data];
      nextPage = list.has_more ? page + 1 : 0;
      const [one, many] = tokensOnly ? ["token", "tokens"] : ["card", "cards"];
      if (list.total_cards === 0) {
        ui.status.textContent = `No ${many} match “${text}”.${tokensOnly ? " Try searching all cards." : ""}`;
      } else {
        ui.status.textContent = `${list.total_cards} ${list.total_cards === 1 ? one : many}`;
      }
      showResults();
    } catch (error) {
      if (id !== searchId) return;
      ui.status.textContent =
        error instanceof ScryfallError
          ? error.message
          : "Couldn't reach Scryfall. Check your connection and try again.";
    } finally {
      if (id === searchId) showMoreLoading(false);
    }
  }

  /** @param {boolean} loading */
  function showMoreLoading(loading) {
    ui.more.disabled = loading;
    ui.more.textContent = loading ? "Loading…" : "Show more";
  }

  /**
   * @param {string} text
   * @param {boolean} tokensOnly
   */
  function rememberSearch(text, tokensOnly) {
    const url = new URL(location.href);
    url.search = "";
    if (text) url.searchParams.set("q", text);
    if (!tokensOnly) url.searchParams.set("scope", "all");
    history.replaceState(history.state, "", url);
  }

  function showResults() {
    ui.results.replaceChildren(...results.map(resultItem));
    ui.more.hidden = !nextPage;
  }

  /** @param {ScryfallCard} card */
  function resultItem(card) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "result";
    button.dataset.group = groupOf(card);
    button.setAttribute("aria-pressed", String(groupOf(card) === chosenGroup));
    button.append(
      cardThumbnail(card, "normal", "result-image"),
      Object.assign(document.createElement("span"), { className: "result-name", textContent: card.name }),
    );
    button.addEventListener("click", () => {
      chosenGroup = groupOf(card);
      for (const result of ui.results.querySelectorAll("button")) {
        result.setAttribute("aria-pressed", String(result.dataset.group === chosenGroup));
      }
      onSelect(card);
    });
    const item = document.createElement("li");
    item.append(button);
    return item;
  }

  const params = new URLSearchParams(location.search);
  ui.query.value = params.get("q") ?? "";
  ui.allCards.checked = params.get("scope") === "all";
  ui.tokens.checked = !ui.allCards.checked;
  if (ui.query.value) search();
}
