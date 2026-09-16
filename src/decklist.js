/** @import { CardIdentifier, ScryfallCard, ScryfallClient } from "./scryfall/client.js" */
import { madeBy } from "./scryfall/client.js";

/**
 * Decklists as text, the way Arena, MTGO, Moxfield, Archidekt and most deck sites export them, the
 * cards they list and the tokens a deck needs.
 */

/**
 * @typedef {object} DeckEntry
 * @property {number} count
 * @property {string} name
 * @property {string} [set]  Set code, when the list names the printing.
 * @property {string} [number]  Collector number in that set.
 */

/**
 * @typedef {object} DeckCard
 * @property {ScryfallCard} card
 * @property {number} count
 */

/**
 * @typedef {object} DeckToken
 * @property {ScryfallCard} card  The token, emblem or game card.
 * @property {string[]} makers  Names of the deck's cards that make it.
 */

const SECTION =
  /^(about|deck|main|mainboard|main deck|sideboard|side|commander|commanders|companion|maybeboard|considering|tokens)\b[\s:]*(\(\d+\))?$/i;
/** Sections whose lines aren't cards in the deck: Arena's "About" holds the deck's name. */
const LEFT_OUT = new Set(["about", "maybeboard", "considering", "tokens"]);
// "4x Lightning Bolt (M10) 146 *F*": count, name, then optionally set, collector number and markers.
const LINE =
  /^(?:(\d+)x?\s+)?(.+?)(?:\s+[([]([A-Za-z0-9]{2,6})[)\]](?:\s+([A-Za-z0-9★-]+))?)?(?:\s+\*[A-Za-z]+\*)*$/;
// Archidekt adds a card's labels between carets and its categories in brackets:
// "1x Sol Ring (c21) 263 [Ramp,Maybeboard{noDeck}] ^Have,#37d67a^".
const LABELS = /\s+\^[^^]*\^/g;
const CATEGORIES = /\s+\[([^\]]*)\]$/;

/**
 * The cards in a decklist, once each with how many there are. Section headers, comments, the deck's
 * name and cards kept out of the deck, like a maybeboard, are skipped.
 * @param {string} text
 * @returns {DeckEntry[]}
 */
export function parseDecklist(text) {
  /** @type {Map<string, DeckEntry>} */
  const entries = new Map();
  /** The section being skipped, if any. It lasts until the next header. */
  let leftOut = "";
  for (const raw of text.split(/\r?\n/)) {
    let line = raw
      .trim()
      .replace(/^SB:\s*/i, "")
      .replace(LABELS, "");
    if (!line) {
      // Arena's About section is the deck's name and ends at the blank line; others don't.
      if (leftOut === "about") leftOut = "";
      continue;
    }
    if (line.startsWith("//") || line.startsWith("#")) continue;
    const section = SECTION.exec(line);
    if (section) {
      const name = section[1].toLowerCase();
      leftOut = LEFT_OUT.has(name) ? name : "";
      continue;
    }
    if (leftOut) continue;
    // A trailing bracket is Archidekt's categories. Reading it as a set code instead would turn
    // a category like [Ramp] into a set, so the printing is left to the name.
    const categories = CATEGORIES.exec(line);
    if (categories) {
      if (/\{noDeck\}/i.test(categories[1])) continue;
      line = line.slice(0, categories.index);
    }
    const match = LINE.exec(line);
    if (!match) continue;
    const [, count, name, set, number] = match;
    const entry = {
      count: Number(count ?? 1),
      name: name.replace(/\s*\/{1,2}\s*/g, " // "),
      ...(set && { set: set.toLowerCase() }),
      ...(set && number && { number }),
    };
    const key = JSON.stringify([entry.name.toLowerCase(), entry.set, entry.number]);
    const same = entries.get(key);
    if (same) same.count += entry.count;
    else entries.set(key, entry);
  }
  return [...entries.values()];
}

/**
 * The site a pasted deck link points to, since deck sites don't let other sites read their decks.
 * @param {string} text
 * @returns {string | undefined}  Its host name without "www.", or nothing when the text isn't a link.
 */
export function deckLinkSite(text) {
  const trimmed = text.trim();
  if (!/^https?:\/\/\S+$/i.test(trimmed)) return undefined;
  try {
    return new URL(trimmed).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/**
 * Looks up a deck's cards. The same printing listed twice is counted once.
 * @param {Pick<ScryfallClient, "collection">} scryfall
 * @param {DeckEntry[]} entries
 * @returns {Promise<{ cards: DeckCard[], missing: string[] }>}
 */
export async function findDeckCards(scryfall, entries) {
  const first = await lookUp(scryfall, entries, identifierOf);
  // A printing the list names may not exist, and some sites write only a card's front face, so what
  // wasn't found is looked up again by its name alone.
  const retry = await lookUp(scryfall, first.missing, (entry) => ({ name: frontName(entry.name) }));
  /** @type {Map<string, DeckCard>} */
  const byId = new Map();
  for (const { card, count } of [...first.found, ...retry.found]) {
    const same = byId.get(card.id);
    if (same) same.count += count;
    else byId.set(card.id, { card, count });
  }
  return { cards: [...byId.values()], missing: retry.missing.map(({ name }) => name) };
}

/**
 * The tokens, emblems and game cards a deck's cards make, once each.
 * @param {Pick<ScryfallClient, "collection">} scryfall
 * @param {ScryfallCard[]} cards
 * @returns {Promise<DeckToken[]>}
 */
export async function findDeckTokens(scryfall, cards) {
  /** Deck cards that make each related card, by its Scryfall ID. @type {Map<string, Set<string>>} */
  const makersById = new Map();
  for (const card of cards) {
    for (const part of madeBy(card)) {
      const makers = makersById.get(part.id) ?? new Set();
      makers.add(card.name);
      makersById.set(part.id, makers);
    }
  }
  if (makersById.size === 0) return [];

  const related = await scryfall.collection([...makersById.keys()].map((id) => ({ id })));
  // Different cards can make the same token from different sets; it's listed once.
  /** @type {Map<string, { card: ScryfallCard, makers: Set<string> }>} */
  const byOracle = new Map();
  for (const card of related.cards) {
    const key = card.oracle_id ?? card.id;
    const token = byOracle.get(key) ?? { card, makers: new Set() };
    for (const maker of makersById.get(card.id) ?? []) token.makers.add(maker);
    byOracle.set(key, token);
  }
  return [...byOracle.values()].map(({ card, makers }) => ({ card, makers: [...makers] }));
}

/**
 * Basic lands, including snow-covered ones and Wastes.
 * @param {ScryfallCard} card
 */
export const isBasicLand = (card) => /^Basic\b/.test(card.type_line ?? "");

/**
 * @param {Pick<ScryfallClient, "collection">} scryfall
 * @param {DeckEntry[]} entries
 * @param {(entry: DeckEntry) => CardIdentifier} identify
 */
async function lookUp(scryfall, entries, identify) {
  if (entries.length === 0) return { found: [], missing: [] };
  // Lines asking for the same card share one identifier, so a reply that answers it once counts
  // for all of them.
  /** @type {{ identifier: CardIdentifier, entries: DeckEntry[] }[]} */
  const wanted = [];
  /** @type {Map<string, { identifier: CardIdentifier, entries: DeckEntry[] }>} */
  const byKey = new Map();
  for (const entry of entries) {
    const identifier = identify(entry);
    const key = JSON.stringify(Object.entries(identifier).sort());
    const same = byKey.get(key);
    if (same) {
      same.entries.push(entry);
      continue;
    }
    const group = { identifier, entries: [entry] };
    byKey.set(key, group);
    wanted.push(group);
  }

  const { cards } = await scryfall.collection(wanted.map(({ identifier }) => identifier));
  // Every card is paired with what it was asked for, so counts stay with their cards whatever
  // order the reply comes in. What nothing answers is missing, never another card.
  const taken = new Set();
  /** @type {DeckCard[]} */
  const found = [];
  /** @type {DeckEntry[]} */
  const missing = [];
  for (const { identifier, entries: asked } of wanted) {
    const card =
      cards.find((candidate) => !taken.has(candidate) && matches(candidate, identifier)) ??
      cards.find((candidate) => matches(candidate, identifier));
    if (!card) {
      missing.push(...asked);
      continue;
    }
    taken.add(card);
    for (const entry of asked) found.push({ card, count: entry.count });
  }
  return { found, missing };
}

/**
 * @param {ScryfallCard} card
 * @param {CardIdentifier} identifier
 */
function matches(card, identifier) {
  if ("id" in identifier) return card.id === identifier.id;
  if ("collector_number" in identifier) {
    // Collector numbers repeat across sets, so the set has to agree too.
    return card.set === identifier.set && card.collector_number === identifier.collector_number;
  }
  if (identifier.set && card.set !== identifier.set) return false;
  return [card.name, frontName(card.name)].some((name) => plain(name) === plain(identifier.name));
}

/** @param {string} name */
const frontName = (name) => name.split(" // ")[0];

/**
 * A name as Scryfall compares it, which ignores accents, punctuation and case.
 * @param {string} name
 */
const plain = (name) =>
  name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();

/**
 * @param {DeckEntry} entry
 * @returns {CardIdentifier}
 */
function identifierOf({ name, set, number }) {
  if (set && number) return { set, collector_number: number };
  if (set) return { name, set };
  return { name };
}
