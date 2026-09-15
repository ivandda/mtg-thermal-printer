/** @import { CardIdentifier, ScryfallCard } from "../src/scryfall/client.js" */
import assert from "node:assert/strict";
import { test } from "node:test";
import { findDeckTokens, parseDecklist } from "../src/decklist.js";

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

/**
 * @param {string} id
 * @param {string} name
 * @param {Partial<ScryfallCard>} [extra]
 * @returns {ScryfallCard}
 */
const card = (id, name, extra = {}) => ({
  id,
  oracle_id: `o-${id}`,
  name,
  set_name: "Set",
  collector_number: "1",
  ...extra,
});

/**
 * A Scryfall stand-in that knows some cards by name, set and number, or ID.
 * @param {ScryfallCard[]} known
 */
function fakeScryfall(known) {
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
              candidate.name.split(" // ")[0] === identifier.name) ||
            ("collector_number" in identifier && candidate.collector_number === identifier.collector_number),
        );
        if (found) cards.push(found);
        else notFound.push(identifier);
      }
      return { cards, notFound };
    },
  };
}

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
    card("krenko", "Krenko, Mob Boss", { all_parts: [goblin] }),
    card("warchief", "Goblin Warchief Maker", { all_parts: [otherGoblin, treasure] }),
    card("bolt", "Lightning Bolt"),
    card("goblin", "Goblin", { oracle_id: "o-goblin" }),
    card("goblin-2", "Goblin", { oracle_id: "o-goblin" }),
    card("treasure", "Treasure"),
  ]);
  const { tokens, missing } = await findDeckTokens(scryfall, [
    { count: 4, name: "Krenko, Mob Boss", set: "zzz", number: "999" },
    { count: 2, name: "Goblin Warchief Maker" },
    { count: 4, name: "Lightning Bolt" },
    { count: 1, name: "Not A Card" },
  ]);
  assert.deepEqual(
    tokens.map(({ card: token, makers }) => [token.name, makers]),
    [
      ["Goblin", ["Goblin Warchief Maker", "Krenko, Mob Boss"]],
      ["Treasure", ["Goblin Warchief Maker"]],
    ],
  );
  assert.deepEqual(missing, ["Not A Card"]);
  assert.deepEqual(scryfall.requests[1], [{ name: "Krenko, Mob Boss" }, { name: "Not A Card" }]);
});

test("a deck that makes nothing needs no more requests", async () => {
  const scryfall = fakeScryfall([card("bolt", "Lightning Bolt")]);
  assert.deepEqual(await findDeckTokens(scryfall, [{ count: 4, name: "Lightning Bolt" }]), {
    tokens: [],
    missing: [],
  });
  assert.equal(scryfall.requests.length, 1);
});
