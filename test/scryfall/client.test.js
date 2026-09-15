import assert from "node:assert/strict";
import { test } from "node:test";
import { createScryfallClient, madeBy, ScryfallError } from "../../src/scryfall/client.js";

/**
 * A client whose network and clock are fakes. `replies` is consumed in order, one per request.
 * @param {{ status?: number, body?: object }[]} replies
 */
function fakeScryfall(replies) {
  let clock = 0;
  /** @type {{ url: string, at: number, method: string, body?: any }[]} */
  const requests = [];
  const client = createScryfallClient({
    /**
     * @param {RequestInfo | URL} url
     * @param {RequestInit} [init]
     */
    fetch: async (url, init) => {
      const sent = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ url: String(url), at: clock, method: init?.method ?? "GET", body: sent });
      const { status = 200, body = {} } = replies.shift() ?? {};
      return new Response(JSON.stringify(body), { status });
    },
    wait: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  });
  return { client, requests };
}

const PILOT = { id: "1", name: "Pilot" };
const NO_RESULTS = { data: [], total_cards: 0, has_more: false };

test("searches are sent one at a time, 500 ms apart", async () => {
  const { client, requests } = fakeScryfall([{ body: NO_RESULTS }, { body: NO_RESULTS }]);
  await Promise.all([client.search("pilot"), client.search("pilot token")]);
  assert.deepEqual(
    requests.map(({ at }) => at),
    [0, 500],
  );
});

test("cards fetched by ID are 100 ms apart", async () => {
  const { client, requests } = fakeScryfall([{ body: PILOT }, { body: PILOT }]);
  await Promise.all([client.card("1"), client.card("2")]);
  assert.deepEqual(
    requests.map(({ url, at }) => [new URL(url).pathname, at]),
    [
      ["/cards/1", 0],
      ["/cards/2", 100],
    ],
  );
});

test("repeated requests are served from the cache", async () => {
  const { client, requests } = fakeScryfall([{ body: PILOT }]);
  assert.deepEqual(await client.card("1"), PILOT);
  assert.deepEqual(await client.card("1"), PILOT);
  assert.equal(requests.length, 1);
});

test("HTTP 429 pauses 30 seconds, then retries once", async () => {
  const { client, requests } = fakeScryfall([{ status: 429 }, { body: PILOT }]);
  assert.deepEqual(await client.card("1"), PILOT);
  assert.deepEqual(
    requests.map(({ at }) => at),
    [0, 30_000],
  );
});

test("a second 429 in a row is reported instead of retried", async () => {
  const { client, requests } = fakeScryfall([{ status: 429 }, { status: 429 }]);
  await assert.rejects(client.card("1"), ScryfallError);
  assert.equal(requests.length, 2);
});

test("failed requests are not cached", async () => {
  const { client, requests } = fakeScryfall([
    { status: 503, body: { details: "Down for maintenance" } },
    { body: PILOT },
  ]);
  await assert.rejects(client.card("1"), { message: "Down for maintenance" });
  assert.deepEqual(await client.card("1"), PILOT);
  assert.equal(requests.length, 2);
});

test("a search without matches returns an empty list", async () => {
  const { client } = fakeScryfall([{ status: 404, body: { details: "Your query didn't match any cards." } }]);
  assert.deepEqual(await client.search("t:token name:zzzz"), NO_RESULTS);
});

test("a collection is looked up 75 cards per request, in order", async () => {
  const identifiers = Array.from({ length: 80 }, (_, index) => ({ id: String(index) }));
  const { client, requests } = fakeScryfall([
    {
      body: { data: identifiers.slice(0, 74).map(({ id }) => ({ id, name: id })), not_found: [{ id: "74" }] },
    },
    { body: { data: identifiers.slice(75).map(({ id }) => ({ id, name: id })), not_found: [] } },
  ]);
  const { cards, notFound } = await client.collection(identifiers);
  assert.equal(cards.length, 79);
  assert.deepEqual(notFound, [{ id: "74" }]);
  assert.deepEqual(
    requests.map(({ url, method, body, at }) => [new URL(url).pathname, method, body.identifiers.length, at]),
    [
      ["/cards/collection", "POST", 75, 0],
      ["/cards/collection", "POST", 5, 500],
    ],
  );
});

test("a card makes its tokens, emblems and game cards, but not the cards it combos with", () => {
  const krenko = {
    id: "krenko",
    name: "Krenko, Mob Boss",
    set_name: "Magic 2013",
    collector_number: "139",
    all_parts: [
      {
        id: "krenko",
        component: "combo_piece",
        name: "Krenko, Mob Boss",
        type_line: "Legendary Creature — Goblin Warrior",
      },
      { id: "goblin", component: "token", name: "Goblin", type_line: "Token Creature — Goblin" },
      { id: "goblin", component: "token", name: "Goblin", type_line: "Token Creature — Goblin" },
      { id: "monarch", component: "combo_piece", name: "The Monarch", type_line: "Card" },
      { id: "emblem", component: "combo_piece", name: "Krenko Emblem", type_line: "Emblem — Krenko" },
      { id: "undercity", component: "combo_piece", name: "Undercity", type_line: "Dungeon — Undercity" },
      {
        id: "partner",
        component: "combo_piece",
        name: "Siege-Gang Commander",
        type_line: "Creature — Goblin",
      },
      {
        id: "meld",
        component: "meld_result",
        name: "Brisela",
        type_line: "Legendary Creature — Eldrazi Angel",
      },
    ],
  };
  assert.deepEqual(
    madeBy(krenko).map(({ id }) => id),
    ["goblin", "monarch", "emblem", "undercity"],
  );
  assert.deepEqual(madeBy({ ...krenko, all_parts: undefined }), []);
});
