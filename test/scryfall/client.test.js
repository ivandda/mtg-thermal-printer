import assert from "node:assert/strict";
import { test } from "node:test";
import { createScryfallClient, ScryfallError } from "../../src/scryfall/client.js";

/**
 * A client whose network and clock are fakes. `replies` is consumed in order, one per request.
 * @param {{ status?: number, body?: object }[]} replies
 */
function fakeScryfall(replies) {
  let clock = 0;
  /** @type {{ url: string, at: number }[]} */
  const requests = [];
  const client = createScryfallClient({
    /** @param {RequestInfo | URL} url */
    fetch: async (url) => {
      requests.push({ url: String(url), at: clock });
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

test("card lookups are sent one at a time, 500 ms apart", async () => {
  const { client, requests } = fakeScryfall([{ body: PILOT }, { body: PILOT }]);
  await Promise.all([client.cardNamed("pilot"), client.cardNamed("pilot token")]);
  assert.deepEqual(
    requests.map(({ at }) => at),
    [0, 500],
  );
});

test("repeated requests are served from the cache", async () => {
  const { client, requests } = fakeScryfall([{ body: PILOT }]);
  assert.deepEqual(await client.cardNamed("pilot"), PILOT);
  assert.deepEqual(await client.cardNamed("pilot"), PILOT);
  assert.equal(requests.length, 1);
});

test("HTTP 429 pauses 30 seconds, then retries once", async () => {
  const { client, requests } = fakeScryfall([{ status: 429 }, { body: PILOT }]);
  assert.deepEqual(await client.cardNamed("pilot"), PILOT);
  assert.deepEqual(
    requests.map(({ at }) => at),
    [0, 30_000],
  );
});

test("a second 429 in a row is reported instead of retried", async () => {
  const { client, requests } = fakeScryfall([{ status: 429 }, { status: 429 }]);
  await assert.rejects(client.cardNamed("pilot"), ScryfallError);
  assert.equal(requests.length, 2);
});

test("failed requests are not cached", async () => {
  const { client, requests } = fakeScryfall([
    { status: 503, body: { details: "Down for maintenance" } },
    { body: PILOT },
  ]);
  await assert.rejects(client.cardNamed("pilot"), { message: "Down for maintenance" });
  assert.deepEqual(await client.cardNamed("pilot"), PILOT);
  assert.equal(requests.length, 2);
});

test("a search without matches returns an empty list", async () => {
  const { client } = fakeScryfall([{ status: 404, body: { details: "Your query didn't match any cards." } }]);
  assert.deepEqual(await client.search("t:token name:zzzz"), { data: [], total_cards: 0, has_more: false });
});
