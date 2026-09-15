/** @import { Darkness, Design } from "../designs.js" */
/** @import { DeckToken } from "../decklist.js" */
/** @import { PrintList } from "../print-list.js" */
/** @import { ScryfallCard, ScryfallClient } from "../scryfall/client.js" */
import { findDeckTokens, parseDecklist } from "../decklist.js";
import { DARKNESS } from "../designs.js";
import { pickCard, ScryfallError } from "../scryfall/client.js";
import { cardThumbnail, element } from "./dom.js";
import { readSetting, writeSetting } from "./settings.js";

/**
 * The Deck tab: a pasted decklist, the tokens, emblems and game cards the deck makes, and adding them
 * all to the print list.
 * @param {object} options
 * @param {ScryfallClient} options.scryfall
 * @param {PrintList} options.printList
 * @param {(card: ScryfallCard) => void} options.onSelect
 */
export function createDeck({ scryfall, printList, onSelect }) {
  const ui = {
    form: element("#deck-form", HTMLFormElement),
    decklist: element("#decklist", HTMLTextAreaElement),
    find: element("#find-deck-tokens", HTMLButtonElement),
    status: element("#deck-status", HTMLElement),
    missing: element("#deck-missing", HTMLElement),
    actions: element("#deck-actions", HTMLElement),
    addAll: element("#add-deck-tokens", HTMLButtonElement),
    added: element("#deck-added", HTMLElement),
    tokens: element("#deck-tokens", HTMLUListElement),
  };
  /** @type {DeckToken[]} */
  let found = [];
  let searchId = 0;

  ui.form.addEventListener("submit", (event) => {
    event.preventDefault();
    findTokens();
  });

  ui.addAll.addEventListener("click", () => {
    for (const { card } of found) printList.add(designOf(card), 1);
    ui.added.textContent =
      found.length === 1
        ? "Added 1 label to the print list. Change its copies there."
        : `Added ${found.length} labels to the print list. Change their copies there.`;
  });

  async function findTokens() {
    const entries = parseDecklist(ui.decklist.value);
    writeSetting("decklist", ui.decklist.value);
    const id = ++searchId;
    found = [];
    showTokens();
    ui.missing.hidden = true;
    if (entries.length === 0) {
      ui.status.textContent = "Paste a decklist first, with one card on each line.";
      return;
    }

    const count = entries.reduce((total, entry) => total + entry.count, 0);
    const cards = count === 1 ? "1 card" : `${count} cards`;
    ui.status.textContent = `Looking up ${cards}…`;
    ui.find.disabled = true;
    try {
      const { tokens, missing } = await findDeckTokens(scryfall, entries);
      if (id !== searchId) return;
      found = tokens;
      ui.status.textContent =
        tokens.length === 0
          ? `These ${cards} don't make any tokens, emblems or game cards.`
          : `${tokens.length === 1 ? "1 token" : `${tokens.length} tokens`} for ${cards}`;
      ui.missing.hidden = missing.length === 0;
      ui.missing.textContent = `Not found, check the spelling: ${missing.join(", ")}.`;
      showTokens();
    } catch (error) {
      if (id !== searchId) return;
      ui.status.textContent =
        error instanceof ScryfallError
          ? error.message
          : "Couldn't reach Scryfall. Check your connection and try again.";
    } finally {
      if (id === searchId) ui.find.disabled = false;
    }
  }

  function showTokens() {
    ui.tokens.replaceChildren(...found.map(tokenItem));
    ui.actions.hidden = found.length === 0;
    ui.added.textContent = "";
  }

  /** @param {DeckToken} token */
  function tokenItem({ card, makers }) {
    const button = Object.assign(document.createElement("button"), { type: "button", className: "result" });
    button.setAttribute("aria-pressed", "false");
    button.append(
      cardThumbnail(card, "normal", "result-image"),
      Object.assign(document.createElement("span"), { className: "result-name", textContent: card.name }),
      Object.assign(document.createElement("span"), {
        className: "result-detail",
        textContent: madeByText(makers),
      }),
    );
    button.addEventListener("click", () => {
      for (const other of ui.tokens.querySelectorAll("button")) other.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-pressed", "true");
      onSelect(card);
    });
    const item = document.createElement("li");
    item.append(button);
    return item;
  }

  const saved = readSetting("decklist");
  if (typeof saved === "string") ui.decklist.value = saved;
}

/**
 * A token added from a deck, printed with the options last chosen for cards.
 * @param {ScryfallCard} card
 * @returns {Design}
 */
function designOf(card) {
  const darkness = readSetting("darkness");
  return {
    type: "card",
    card: pickCard(card),
    face: 0,
    style: readSetting("style") === "text" ? "text" : "image",
    darkness:
      typeof darkness === "string" && DARKNESS.includes(darkness)
        ? /** @type {Darkness} */ (darkness)
        : "normal",
    cropBorder: readSetting("cropBorder") === true,
    art: readSetting("art") === true,
  };
}

/** @param {string[]} makers */
function madeByText(makers) {
  const shown = makers.length > 3 ? [...makers.slice(0, 2), `${makers.length - 2} more`] : makers;
  const list = shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}` : shown[0];
  return `Made by ${list}`;
}
