/** @import { CardIdentifier, ScryfallCard } from "../src/scryfall/client.js" */
import assert from "node:assert/strict";
import { test } from "node:test";
import { deckLinkSite, findDeckCards, findDeckTokens, isBasicLand, parseDecklist } from "../src/decklist.js";

test("lists exported by Arena, MTGO and deck sites are read the same way", () => {
  const arena = `About
Name Goblins

Deck
4 Krenko, Mob Boss (M13) 139
2x Lightning Bolt
1 Delver of Secrets/Insectile Aberration
1 Sol Ring (CMM) 400 *F*

Sideboard
SB: 2 Lightning Bolt
// a comment
Fire // Ice`;
  assert.deepEqual(parseDecklist(arena), [
    { count: 4, name: "Krenko, Mob Boss", set: "m13", number: "139" },
    { count: 4, name: "Lightning Bolt" },
    { count: 1, name: "Delver of Secrets // Insectile Aberration" },
    { count: 1, name: "Sol Ring", set: "cmm", number: "400" },
    { count: 1, name: "Fire // Ice" },
  ]);
  assert.deepEqual(parseDecklist("\n  \nCommander (1)\n"), []);
});

test("Archidekt's categories and labels are read, and cards kept out of the deck are skipped", () => {
  const archidekt = `1x Sol Ring (c21) 263 [Ramp] ^Have,#37d67a^
1x Krenko, Mob Boss (m13) 139 *F* [Commander{top}]
1x Lightning Bolt [Removal,Instant]
2x Goblin Guide (zen) 126 [Maybeboard{noDeck}{noPrice}]
1x Llanowar Elves [M19]

Maybeboard
1 Skullclamp

1 Mox Diamond

Tokens
1 Goblin`;
  assert.deepEqual(parseDecklist(archidekt), [
    { count: 1, name: "Sol Ring", set: "c21", number: "263" },
    { count: 1, name: "Krenko, Mob Boss", set: "m13", number: "139" },
    { count: 1, name: "Lightning Bolt" },
    { count: 1, name: "Llanowar Elves" },
  ]);
});

test("basic lands and pasted deck links are recognized", () => {
  assert.equal(isBasicLand(card("forest", "Forest", { type_line: "Basic Land — Forest" })), true);
  assert.equal(
    isBasicLand(card("island", "Snow-Covered Island", { type_line: "Basic Snow Land — Island" })),
    true,
  );
  assert.equal(
    isBasicLand(card("arbor", "Dryad Arbor", { type_line: "Land Creature — Forest Dryad" })),
    false,
  );
  assert.equal(deckLinkSite(" https://archidekt.com/decks/123/goblins\n"), "archidekt.com");
  assert.equal(deckLinkSite("https://www.moxfield.com/decks/abc"), "moxfield.com");
  assert.equal(deckLinkSite("4 Lightning Bolt"), undefined);
});

/**
 * @param {string} id
 * @param {string} name
 * @param {Partial<ScryfallCard>} [extra]
 * @returns {ScryfallCard}
 */
function card(id, name, extra = {}) {
  return { id, oracle_id: `o-${id}`, name, set: "set", set_name: "Set", collector_number: "1", ...extra };
}

/** Names as Scryfall compares them: punctuation, spacing and case don't count. */
const loose = (/** @type {string} */ name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * A Scryfall stand-in that knows some cards by name, set and number, or ID.
 * @param {ScryfallCard[]} known
 * @param {{ reversed?: boolean }} [options]  Returns found cards in the opposite order.
 */
function fakeScryfall(known, { reversed = false } = {}) {
  /** @type {CardIdentifier[][]} */
  const requests = [];
  return {
    requests,
    /** @param {CardIdentifier[]} identifiers */
    async collection(identifiers) {
      requests.push(identifiers);
      /** @type {ScryfallCard[]} */
      const cards = [];
      /** @type {CardIdentifier[]} */
      const notFound = [];
      for (const identifier of identifiers) {
        const found = known.find(
          (candidate) =>
            ("id" in identifier && candidate.id === identifier.id) ||
            ("name" in identifier &&
              !("set" in identifier) &&
              loose(candidate.name.split(" // ")[0]) === loose(identifier.name)) ||
            ("collector_number" in identifier &&
              candidate.set === identifier.set &&
              candidate.collector_number === identifier.collector_number),
        );
        if (found) cards.push(found);
        else notFound.push(identifier);
      }
      return { cards: reversed ? cards.reverse() : cards, notFound };
    },
  };
}

test("a deck's cards are found with their counts, and names not found are listed", async () => {
  const scryfall = fakeScryfall([
    card("krenko", "Krenko, Mob Boss"),
    card("delver", "Delver of Secrets // Insectile Aberration"),
    card("bolt", "Lightning Bolt", { set: "m10", collector_number: "146" }),
  ]);
  const { cards, missing } = await findDeckCards(scryfall, [
    { count: 4, name: "Krenko, Mob Boss", set: "zzz", number: "999" },
    { count: 2, name: "Lightning Bolt" },
    { count: 1, name: "Delver of Secrets" },
    { count: 2, name: "Lightning Bolt", set: "m10", number: "146" },
    { count: 1, name: "Not A Card" },
  ]);
  assert.deepEqual(
    cards.map(({ card: found, count }) => [found.name, count]),
    [
      ["Lightning Bolt", 4],
      ["Delver of Secrets // Insectile Aberration", 1],
      ["Krenko, Mob Boss", 4],
    ],
  );
  assert.deepEqual(missing, ["Not A Card"]);
  assert.deepEqual(scryfall.requests[1], [{ name: "Krenko, Mob Boss" }, { name: "Not A Card" }]);
});

test("counts stay with their cards whatever order Scryfall answers in", async () => {
  const scryfall = fakeScryfall([card("bolt", "Lightning Bolt"), card("forest", "Forest")], {
    reversed: true,
  });
  const { cards } = await findDeckCards(scryfall, [
    { count: 4, name: "Lightning Bolt" },
    { count: 30, name: "Forest" },
  ]);
  assert.deepEqual(
    cards.map(({ card: found, count }) => [found.name, count]),
    [
      ["Lightning Bolt", 4],
      ["Forest", 30],
    ],
  );
});

test("a deck's tokens are listed once, with the cards that make them", async () => {
  const goblin = { id: "goblin", component: "token", name: "Goblin", type_line: "Token Creature — Goblin" };
  const otherGoblin = { ...goblin, id: "goblin-2" };
  const treasure = {
    id: "treasure",
    component: "token",
    name: "Treasure",
    type_line: "Token Artifact — Treasure",
  };
  const scryfall = fakeScryfall([
    card("goblin", "Goblin", { oracle_id: "o-goblin" }),
    card("goblin-2", "Goblin", { oracle_id: "o-goblin" }),
    card("treasure", "Treasure"),
  ]);
  const tokens = await findDeckTokens(scryfall, [
    card("krenko", "Krenko, Mob Boss", { all_parts: [goblin] }),
    card("warchief", "Goblin Warchief Maker", { all_parts: [otherGoblin, treasure] }),
    card("bolt", "Lightning Bolt"),
  ]);
  assert.deepEqual(
    tokens.map(({ card: token, makers }) => [token.name, makers]),
    [
      ["Goblin", ["Krenko, Mob Boss", "Goblin Warchief Maker"]],
      ["Treasure", ["Goblin Warchief Maker"]],
    ],
  );
});

test("two sets sharing a collector number keep their own counts", async () => {
  const scryfall = fakeScryfall(
    [
      card("bolt", "Lightning Bolt", { set: "m10", collector_number: "146" }),
      card("forest", "Forest", { set: "khm", collector_number: "146" }),
    ],
    { reversed: true },
  );
  const { cards, missing } = await findDeckCards(scryfall, [
    { count: 4, name: "Lightning Bolt", set: "m10", number: "146" },
    { count: 30, name: "Forest", set: "khm", number: "146" },
  ]);
  assert.deepEqual(
    cards.map(({ card: found, count }) => [found.name, count]),
    [
      ["Lightning Bolt", 4],
      ["Forest", 30],
    ],
  );
  assert.deepEqual(missing, []);
});

test("a card the reply doesn't answer is listed, never given another card's count", async () => {
  /** @type {CardIdentifier[][]} */
  const requests = [];
  const scryfall = {
    requests,
    /** @param {CardIdentifier[]} identifiers */
    async collection(identifiers) {
      requests.push(identifiers);
      // Answers with a card nothing asked for, as a reply out of step would.
      return { cards: [card("forest", "Forest")], notFound: [] };
    },
  };
  const { cards, missing } = await findDeckCards(scryfall, [{ count: 4, name: "Lightning Bolt" }]);
  assert.deepEqual(cards, []);
  assert.deepEqual(missing, ["Lightning Bolt"]);
});

test("names match the way Scryfall compares them, apostrophes and all", async () => {
  const scryfall = fakeScryfall([card("jaya", "Jaya's Immolating Inferno"), card("forest", "Forest")], {
    reversed: true,
  });
  const { cards, missing } = await findDeckCards(scryfall, [
    { count: 1, name: "Jaya\u2019s Immolating Inferno" },
    { count: 30, name: "Forest" },
  ]);
  assert.deepEqual(
    cards.map(({ card: found, count }) => [found.name, count]),
    [
      ["Jaya's Immolating Inferno", 1],
      ["Forest", 30],
    ],
  );
  assert.deepEqual(missing, []);
});

test("lines that ask for the same card are looked up once and both counted", async () => {
  const scryfall = fakeScryfall([card("sol", "Sol Ring")]);
  const { cards, missing } = await findDeckCards(scryfall, [
    { count: 1, name: "Sol Ring", set: "ltr", number: "999" },
    { count: 1, name: "Sol Ring", set: "cmm", number: "888" },
  ]);
  assert.deepEqual(
    cards.map(({ card: found, count }) => [found.name, count]),
    [["Sol Ring", 2]],
  );
  assert.deepEqual(missing, []);
  assert.deepEqual(scryfall.requests[1], [{ name: "Sol Ring" }]);
});

test("a deck that makes nothing needs no request for tokens", async () => {
  const scryfall = fakeScryfall([]);
  assert.deepEqual(await findDeckTokens(scryfall, [card("bolt", "Lightning Bolt")]), []);
  assert.equal(scryfall.requests.length, 0);
});
