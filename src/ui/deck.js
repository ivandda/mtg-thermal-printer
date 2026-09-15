/** @import { Darkness, Design } from "../designs.js" */
/** @import { DeckCard, DeckToken } from "../decklist.js" */
/** @import { PrintList } from "../print-list.js" */
/** @import { ScryfallCard, ScryfallClient } from "../scryfall/client.js" */
import { deckLinkSite, findDeckCards, findDeckTokens, isBasicLand, parseDecklist } from "../decklist.js";
import { DARKNESS } from "../designs.js";
import { MAX_COPIES } from "../print-list.js";
import { cardFaces, pickCard, ScryfallError } from "../scryfall/client.js";
import { cardThumbnail, element } from "./dom.js";
import { readSetting, writeSetting } from "./settings.js";

/**
 * The Deck tab: a pasted decklist, adding its cards to the print list, and the tokens, emblems and
 * game cards the deck makes.
 * @param {object} options
 * @param {ScryfallClient} options.scryfall
 * @param {PrintList} options.printList
 * @param {(card: ScryfallCard) => void} options.onSelect
 */
export function createDeck({ scryfall, printList, onSelect }) {
  const ui = {
    form: element("#deck-form", HTMLFormElement),
    decklist: element("#decklist", HTMLTextAreaElement),
    lookUp: element("#look-up-deck", HTMLButtonElement),
    status: element("#deck-status", HTMLElement),
    missing: element("#deck-missing", HTMLElement),
    cards: element("#deck-cards", HTMLElement),
    basicsOption: element("#basics-option", HTMLElement),
    basics: element("#include-basics", HTMLInputElement),
    basicsLabel: element("#basics-label", HTMLElement),
    bothSides: element("#deck-both-sides", HTMLElement),
    addCards: element("#add-deck-cards", HTMLButtonElement),
    cardsAdded: element("#deck-cards-added", HTMLElement),
    tokensGroup: element("#deck-tokens-group", HTMLElement),
    addTokens: element("#add-deck-tokens", HTMLButtonElement),
    tokensAdded: element("#deck-tokens-added", HTMLElement),
    tokens: element("#deck-tokens", HTMLUListElement),
  };
  /** @type {DeckCard[]} */
  let cards = [];
  /** @type {DeckToken[]} */
  let tokens = [];
  let searchId = 0;

  ui.form.addEventListener("submit", (event) => {
    event.preventDefault();
    lookUpDeck();
  });

  ui.basics.addEventListener("change", () => {
    writeSetting("includeBasics", ui.basics.checked);
    showCards();
  });

  ui.addCards.addEventListener("click", () => {
    const printed = printedCards();
    for (const { card, count } of printed) {
      const design = designOf(card, true);
      for (let left = count; left > 0; left -= MAX_COPIES) printList.add(design, Math.min(left, MAX_COPIES));
    }
    ui.cardsAdded.textContent = `Added ${cardCount(total(printed))} to the print list.`;
  });

  ui.addTokens.addEventListener("click", () => {
    for (const { card } of tokens) printList.add(designOf(card, false), 1);
    ui.tokensAdded.textContent =
      tokens.length === 1
        ? "Added 1 label to the print list. Change its copies there."
        : `Added ${tokens.length} labels to the print list. Change their copies there.`;
  });

  async function lookUpDeck() {
    const text = ui.decklist.value;
    writeSetting("decklist", text);
    const id = ++searchId;
    cards = [];
    tokens = [];
    showCards();
    showTokens();
    ui.missing.hidden = true;

    const site = deckLinkSite(text);
    if (site) {
      ui.status.textContent =
        site === "archidekt.com"
          ? "Archidekt doesn't let other sites open its decks. Use Export on the deck, copy the text and paste it here."
          : "Links can't be opened here. Export the deck as text on the site and paste it here.";
      return;
    }
    const entries = parseDecklist(text);
    if (entries.length === 0) {
      ui.status.textContent = "Paste a decklist first, with one card on each line.";
      return;
    }

    ui.status.textContent = `Looking up ${cardCount(entries.reduce((sum, entry) => sum + entry.count, 0))}…`;
    ui.lookUp.disabled = true;
    try {
      const found = await findDeckCards(scryfall, entries);
      if (id !== searchId) return;
      const made = await findDeckTokens(
        scryfall,
        found.cards.map(({ card }) => card),
      );
      if (id !== searchId) return;
      cards = found.cards;
      tokens = made;
      const listed = cardCount(total(cards));
      ui.status.textContent =
        cards.length === 0
          ? "None of these cards were found."
          : tokens.length === 0
            ? `${listed}. No tokens, emblems or game cards.`
            : `${listed} and ${tokens.length === 1 ? "1 token" : `${tokens.length} tokens`}`;
      ui.missing.hidden = found.missing.length === 0;
      ui.missing.textContent = `Not found, check the spelling: ${found.missing.join(", ")}.`;
      showCards();
      showTokens();
    } catch (error) {
      if (id !== searchId) return;
      ui.status.textContent =
        error instanceof ScryfallError
          ? error.message
          : "Couldn't reach Scryfall. Check your connection and try again.";
    } finally {
      if (id === searchId) ui.lookUp.disabled = false;
    }
  }

  /** The deck's cards to print, without basic lands unless they're included. */
  function printedCards() {
    return ui.basics.checked ? cards : cards.filter(({ card }) => !isBasicLand(card));
  }

  function showCards() {
    const basics = total(cards.filter(({ card }) => isBasicLand(card)));
    const printed = printedCards();
    const twoSided = total(printed.filter(({ card }) => cardFaces(card).length > 1));
    ui.cards.hidden = cards.length === 0;
    ui.basicsOption.hidden = basics === 0;
    ui.basicsLabel.textContent = basics === 1 ? "Include 1 basic land" : `Include ${basics} basic lands`;
    ui.bothSides.hidden = twoSided === 0;
    ui.bothSides.textContent =
      twoSided === 1
        ? "1 double-faced card prints both sides."
        : `${twoSided} double-faced cards print both sides.`;
    ui.addCards.textContent = `Add ${cardCount(total(printed))} to the print list`;
    ui.addCards.disabled = printed.length === 0;
    ui.cardsAdded.textContent = "";
  }

  function showTokens() {
    ui.tokens.replaceChildren(...tokens.map(tokenItem));
    ui.tokensGroup.hidden = tokens.length === 0;
    ui.tokensAdded.textContent = "";
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
  ui.basics.checked = readSetting("includeBasics") === true;
}

/**
 * A card added from a deck, printed with the options last chosen for cards.
 * @param {ScryfallCard} card
 * @param {boolean} bothSides  Both faces, when the card has two.
 * @returns {Design}
 */
function designOf(card, bothSides) {
  const darkness = readSetting("darkness");
  return {
    type: "card",
    card: pickCard(card),
    face: 0,
    bothSides,
    style: readSetting("style") === "text" ? "text" : "image",
    darkness:
      typeof darkness === "string" && DARKNESS.includes(darkness)
        ? /** @type {Darkness} */ (darkness)
        : "normal",
    cropBorder: readSetting("cropBorder") === true,
    art: readSetting("art") === true,
  };
}

/** @param {DeckCard[]} cards */
const total = (cards) => cards.reduce((sum, { count }) => sum + count, 0);

/** @param {number} count */
const cardCount = (count) => (count === 1 ? "1 card" : `${count} cards`);

/** @param {string[]} makers */
function madeByText(makers) {
  const shown = makers.length > 3 ? [...makers.slice(0, 2), `${makers.length - 2} more`] : makers;
  const list = shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}` : shown[0];
  return `Made by ${list}`;
}
