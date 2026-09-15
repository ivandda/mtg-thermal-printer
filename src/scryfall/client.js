/**
 * Scryfall API client that stays within the published rate limits
 * (https://scryfall.com/docs/api/rate-limits): requests go out one at a time, card lookups at most
 * every 500 ms and other endpoints every 100 ms, and HTTP 429 pauses for 30 seconds before a single
 * retry. Responses are cached, as Scryfall asks. Card images are served from *.scryfall.io, which
 * has no rate limit, so they are fetched directly rather than through this client.
 */

/**
 * The parts of a Scryfall card object this app uses (https://scryfall.com/docs/api/cards).
 * @typedef {object} ScryfallCard
 * @property {string} id
 * @property {string} name
 * @property {{ large: string }} [image_uris]
 * @property {{ name: string, image_uris?: { large: string } }[]} [card_faces]
 */

/** @typedef {{ data: ScryfallCard[], total_cards: number, has_more: boolean }} ScryfallList */

const API_URL = "https://api.scryfall.com";
const CARD_ENDPOINT = /^\/cards\/(search|named|random|collection)\b/;
const CARD_INTERVAL_MS = 500;
const DEFAULT_INTERVAL_MS = 100;
const RATE_LIMIT_PAUSE_MS = 30_000;
const CACHE_SIZE = 50;

export class ScryfallError extends Error {
  /**
   * @param {string} message
   * @param {number} status  HTTP status code.
   */
  constructor(message, status) {
    super(message);
    this.name = "ScryfallError";
    this.status = status;
  }
}

/**
 * @param {object} [dependencies]  Replaceable in tests.
 * @param {typeof globalThis.fetch} [dependencies.fetch]
 * @param {(ms: number) => Promise<void>} [dependencies.wait]
 * @param {() => number} [dependencies.now]
 */
export function createScryfallClient({
  fetch = globalThis.fetch,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
} = {}) {
  /** @type {Map<string, Promise<any>>} */
  const cache = new Map();
  let queue = Promise.resolve();
  let lastRequestAt = Number.NEGATIVE_INFINITY;

  /** @param {string} path */
  function get(path) {
    const cached = cache.get(path);
    if (cached) return cached;

    const response = queue.then(() => send(path));
    queue = response.then(
      () => {},
      () => {},
    );
    cache.set(path, response);
    response.catch(() => cache.delete(path));
    const oldest = cache.keys().next().value;
    if (cache.size > CACHE_SIZE && oldest !== undefined) cache.delete(oldest);
    return response;
  }

  /**
   * @param {string} path
   * @param {boolean} [retried]
   * @returns {Promise<any>}
   */
  async function send(path, retried = false) {
    const interval = CARD_ENDPOINT.test(path) ? CARD_INTERVAL_MS : DEFAULT_INTERVAL_MS;
    await wait(Math.max(0, lastRequestAt + interval - now()));
    lastRequestAt = now();

    const response = await fetch(`${API_URL}${path}`, { headers: { Accept: "application/json" } });
    if (response.status === 429 && !retried) {
      await wait(RATE_LIMIT_PAUSE_MS);
      return send(path, true);
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ScryfallError(
        body.details ?? `Scryfall request failed (${response.status})`,
        response.status,
      );
    }
    return body;
  }

  return {
    /**
     * Cards matching a search query in Scryfall syntax (https://scryfall.com/docs/syntax).
     * @param {string} query
     * @param {number} [page]
     * @returns {Promise<ScryfallList>}
     */
    async search(query, page = 1) {
      try {
        return await get(`/cards/search?${new URLSearchParams({ q: query, page: String(page) })}`);
      } catch (error) {
        if (error instanceof ScryfallError && error.status === 404) {
          return { data: [], total_cards: 0, has_more: false };
        }
        throw error;
      }
    },

    /**
     * The card whose name best matches, e.g. "lightning bolt".
     * @param {string} name
     * @returns {Promise<ScryfallCard>}
     */
    cardNamed: (name) => get(`/cards/named?${new URLSearchParams({ fuzzy: name })}`),
  };
}

/**
 * Large image of a card's front face.
 * @param {ScryfallCard} card
 */
export function imageUrl(card) {
  return card.image_uris?.large ?? card.card_faces?.[0]?.image_uris?.large;
}
