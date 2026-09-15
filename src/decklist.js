/** @import { CardIdentifier, ScryfallCard, ScryfallClient } from "./scryfall/client.js" */
import { madeBy } from "./scryfall/client.js";

/**
 * Decklists as text, the way Arena, MTGO, Moxfield and most deck sites export them, and the tokens a
 * deck needs.
 */

/**
 * @typedef {object} DeckEntry
 * @property {number} count
 * @property {string} name
 * @property {string} [set]  Set code, when the list names the printing.
 * @property {string} [number]  Collector number in that set.
 */

/**
 * @typedef {object} DeckToken
 * @property {ScryfallCard} card  The token, emblem or game card.
 * @property {string[]} makers  Names of the deck's cards that make it.
 */

const SECTION =
  /^(about|deck|main|mainboard|main deck|sideboard|side|commander|commanders|companion|maybeboard|considering|tokens)\b[\s:]*(\(\d+\))?$/i;
// "4x Lightning Bolt (M10) 146 *F*": count, name, then optionally set, collector number and markers.
const LINE =
  /^(?:(\d+)x?\s+)?(.+?)(?:\s+[([]([A-Za-z0-9]{2,6})[)\]](?:\s+([A-Za-z0-9★-]+))?)?(?:\s+\*[A-Za-z]+\*)*$/;

/**
 * The cards in a decklist, once each with how many there are. Section headers, comments and the
 * deck's name are skipped.
 * @param {string} text
 * @returns {DeckEntry[]}
 */
export function parseDecklist(text) {
  /** @type {Map<string, DeckEntry>} */
  const entries = new Map();
  let inAbout = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^SB:\s*/i, "");
    if (!line) {
      inAbout = false;
      continue;
    }
    if (line.startsWith("//") || line.startsWith("#")) continue;
    const section = SECTION.exec(line);
    if (section) {
      inAbout = section[1].toLowerCase() === "about";
      continue;
    }
    if (inAbout) continue; // Arena's "About" section holds the deck's name.
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
 * Looks up a deck's cards and the tokens, emblems and game cards they make, once each.
 * @param {Pick<ScryfallClient, "collection">} scryfall
 * @param {DeckEntry[]} entries
 * @returns {Promise<{ tokens: DeckToken[], missing: string[] }>}
 */
export async function findDeckTokens(scryfall, entries) {
  const first = await lookUp(scryfall, entries, identifierOf);
  // A printing the list names may not exist, and some sites write only a card's front face, so what
  // wasn't found is looked up again by its name alone.
  const retry = await lookUp(scryfall, first.missing, (entry) => ({ name: entry.name.split(" // ")[0] }));
  const cards = [...first.cards, ...retry.cards];

  /** Deck cards that make each related card, by its Scryfall ID. @type {Map<string, Set<string>>} */
  const makersById = new Map();
  for (const card of cards) {
    for (const part of madeBy(card)) {
      const makers = makersById.get(part.id) ?? new Set();
      makers.add(card.name);
      makersById.set(part.id, makers);
    }
  }
  if (makersById.size === 0) return { tokens: [], missing: retry.missing.map(({ name }) => name) };

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
  return {
    tokens: [...byOracle.values()].map(({ card, makers }) => ({ card, makers: [...makers] })),
    missing: retry.missing.map(({ name }) => name),
  };
}

/**
 * @param {Pick<ScryfallClient, "collection">} scryfall
 * @param {DeckEntry[]} entries
 * @param {(entry: DeckEntry) => CardIdentifier} identify
 */
async function lookUp(scryfall, entries, identify) {
  if (entries.length === 0) return { cards: [], missing: [] };
  const identifiers = entries.map(identify);
  const { cards, notFound } = await scryfall.collection(identifiers);
  const notFoundKeys = new Set(notFound.map((identifier) => JSON.stringify(identifier)));
  return {
    cards,
    missing: entries.filter((_, index) => notFoundKeys.has(JSON.stringify(identifiers[index]))),
  };
}

/**
 * @param {DeckEntry} entry
 * @returns {CardIdentifier}
 */
function identifierOf({ name, set, number }) {
  if (set && number) return { set, collector_number: number };
  if (set) return { name, set };
  return { name };
}
