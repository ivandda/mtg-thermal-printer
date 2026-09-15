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
 * @property {string} [oracle_id]
 * @property {string} name
 * @property {string} set_name
 * @property {string} collector_number
 * @property {string} [border_color]  e.g. "black" or "borderless"
 * @property {ImageUris} [image_uris]
 * @property {{ name: string, image_uris?: ImageUris }[]} [card_faces]
 */

/** @typedef {{ small: string, normal: string, large: string }} ImageUris */

/** @typedef {{ data: ScryfallCard[], total_cards: number, has_more: boolean }} ScryfallList */

/** @typedef {ReturnType<typeof createScryfallClient>} ScryfallClient */

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
     * @param {{ page?: number, unique?: "cards" | "art" | "prints", order?: string }} [options]
     * @returns {Promise<ScryfallList>}
     */
    async search(query, { page = 1, unique = "cards", order = "name" } = {}) {
      const params = new URLSearchParams({ q: query, unique, order, page: String(page) });
      try {
        return await get(`/cards/search?${params}`);
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
 * Image of one face of a card. Double-faced cards have an image per face; other cards share one.
 * @param {ScryfallCard} card
 * @param {number} [face]
 * @param {keyof ImageUris} [size]
 */
export function imageUrl(card, face = 0, size = "large") {
  return (card.card_faces?.[face]?.image_uris ?? card.image_uris)?.[size];
}

/**
 * The faces of a double-faced card, each with its own image, or an empty list for other cards.
 * @param {ScryfallCard} card
 */
export function cardFaces(card) {
  return card.card_faces?.filter((face) => face.image_uris) ?? [];
}

/**
 * Only the parts of a card this app uses, e.g. to save it.
 * @param {ScryfallCard} card
 * @returns {ScryfallCard}
 */
export function pickCard({
  id,
  oracle_id,
  name,
  set_name,
  collector_number,
  border_color,
  image_uris,
  card_faces,
}) {
  return {
    id,
    oracle_id,
    name,
    set_name,
    collector_number,
    border_color,
    image_uris,
    card_faces: card_faces?.map((face) => ({ name: face.name, image_uris: face.image_uris })),
  };
}
