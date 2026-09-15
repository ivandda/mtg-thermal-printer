/**
 * Scryfall API client that stays within the published rate limits
 * (https://scryfall.com/docs/api/rate-limits): requests go out one at a time, card lookups at most
 * every 500 ms and other endpoints every 100 ms, and HTTP 429 pauses for 30 seconds before a single
 * retry. Responses are cached, as Scryfall asks. Card images are served from *.scryfall.io, which
 * has no rate limit, so they are fetched directly rather than through this client.
 */

/**
 * The parts of a Scryfall card object this app uses (https://scryfall.com/docs/api/cards).
 * @typedef {CardText & {
 *   id: string,
 *   oracle_id?: string,
 *   name: string,
 *   set_name: string,
 *   collector_number: string,
 *   border_color?: string,
 *   image_uris?: ImageUris,
 *   card_faces?: CardFace[],
 *   all_parts?: RelatedCard[],
 * }} ScryfallCard
 */

/**
 * A card related to another, such as a token it makes (https://scryfall.com/docs/api/cards#related-card-objects).
 * @typedef {{ id: string, component: string, name: string, type_line: string }} RelatedCard
 */

/**
 * A card to look up in a collection request: by Scryfall ID, by name, or by name or number in a set.
 * @typedef {{ id: string } | { name: string, set?: string } | { set: string, collector_number: string }} CardIdentifier
 */

/**
 * A face of a double-faced card, or a half of a split or adventure card.
 * @typedef {CardText & { name: string, image_uris?: ImageUris }} CardFace
 */

/**
 * @typedef {object} CardText
 * @property {string} [mana_cost]
 * @property {string} [type_line]
 * @property {string} [oracle_text]
 * @property {string} [power]
 * @property {string} [toughness]
 * @property {string} [loyalty]
 */

/** @typedef {{ small: string, normal: string, large: string, png: string, art_crop: string }} ImageUris */

/** @typedef {{ data: ScryfallCard[], total_cards: number, has_more: boolean }} ScryfallList */

/** @typedef {ReturnType<typeof createScryfallClient>} ScryfallClient */

const API_URL = "https://api.scryfall.com";
const CARD_ENDPOINT = /^\/cards\/(search|named|random|collection)\b/;
const CARD_INTERVAL_MS = 500;
const DEFAULT_INTERVAL_MS = 100;
const RATE_LIMIT_PAUSE_MS = 30_000;
const CACHE_SIZE = 50;
/** The most cards Scryfall looks up in one collection request. */
const COLLECTION_SIZE = 75;

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

  /**
   * @param {string} path
   * @param {object} [body]  Sent as JSON in a POST request.
   */
  function get(path, body) {
    const key = body ? `${path} ${JSON.stringify(body)}` : path;
    const cached = cache.get(key);
    if (cached) return cached;

    const response = queue.then(() => send(path, body));
    queue = response.then(
      () => {},
      () => {},
    );
    cache.set(key, response);
    response.catch(() => cache.delete(key));
    const oldest = cache.keys().next().value;
    if (cache.size > CACHE_SIZE && oldest !== undefined) cache.delete(oldest);
    return response;
  }

  /**
   * @param {string} path
   * @param {object} [body]
   * @param {boolean} [retried]
   * @returns {Promise<any>}
   */
  async function send(path, body, retried = false) {
    const interval = CARD_ENDPOINT.test(path) ? CARD_INTERVAL_MS : DEFAULT_INTERVAL_MS;
    await wait(Math.max(0, lastRequestAt + interval - now()));
    lastRequestAt = now();

    /** @type {RequestInit} */
    const request = body
      ? {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { headers: { Accept: "application/json" } };
    const response = await fetch(`${API_URL}${path}`, request);
    if (response.status === 429 && !retried) {
      await wait(RATE_LIMIT_PAUSE_MS);
      return send(path, body, true);
    }
    const reply = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ScryfallError(
        reply.details ?? `Scryfall request failed (${response.status})`,
        response.status,
      );
    }
    return reply;
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
     * One printing, by its Scryfall ID.
     * @param {string} id
     * @returns {Promise<ScryfallCard>}
     */
    card: (id) => get(`/cards/${encodeURIComponent(id)}`),

    /**
     * Many cards at once, in as few requests as Scryfall allows. Cards come back in the order asked
     * for; the identifiers of cards Scryfall doesn't have come back in `notFound`.
     * @param {CardIdentifier[]} identifiers
     * @returns {Promise<{ cards: ScryfallCard[], notFound: CardIdentifier[] }>}
     */
    async collection(identifiers) {
      /** @type {ScryfallCard[]} */
      const cards = [];
      /** @type {CardIdentifier[]} */
      const notFound = [];
      for (let start = 0; start < identifiers.length; start += COLLECTION_SIZE) {
        const reply = await get("/cards/collection", {
          identifiers: identifiers.slice(start, start + COLLECTION_SIZE),
        });
        cards.push(...reply.data);
        notFound.push(...(reply.not_found ?? []));
      }
      return { cards, notFound };
    },
  };
}

/** Related cards that aren't tokens but are printed like them: emblems, dungeons and cards like The Monarch. */
const TOKEN_LIKE = /^(Emblem|Dungeon|Card)\b/;

/**
 * The tokens, emblems and game cards a card makes, once each. Other cards it's related to, such as
 * the cards it melds or combos with, are left out.
 * @param {ScryfallCard} card
 * @returns {RelatedCard[]}
 */
export function madeBy(card) {
  const parts = (card.all_parts ?? []).filter(
    (part) =>
      part.id !== card.id &&
      part.name !== card.name &&
      (part.component === "token" || TOKEN_LIKE.test(part.type_line)),
  );
  return [...new Map(parts.map((part) => [part.id, part])).values()];
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
export function pickCard(card) {
  return {
    ...pickText(card),
    id: card.id,
    oracle_id: card.oracle_id,
    name: card.name,
    set_name: card.set_name,
    collector_number: card.collector_number,
    border_color: card.border_color,
    image_uris: card.image_uris,
    card_faces: card.card_faces?.map((face) => ({
      ...pickText(face),
      name: face.name,
      image_uris: face.image_uris,
    })),
  };
}

/**
 * @param {CardText} source
 * @returns {CardText}
 */
function pickText({ mana_cost, type_line, oracle_text, power, toughness, loyalty }) {
  return { mana_cost, type_line, oracle_text, power, toughness, loyalty };
}

/**
 * What is written on a card, or on one face of a double-faced card.
 * @param {ScryfallCard} card
 * @param {number} face
 */
export function cardText(card, face) {
  const own = cardFaces(card)[face];
  if (own) return textOf(own);
  // Split and adventure cards keep the rules text on each half.
  const text = textOf(card);
  const halves = card.card_faces ?? [];
  return { ...text, rules: text.rules || halves.map((half) => half.oracle_text ?? "").join("\n") };
}

/** @param {CardText & { name: string }} source */
function textOf(source) {
  const power = source.power ?? "";
  const toughness = source.toughness ?? "";
  return {
    name: source.name,
    manaCost: source.mana_cost ?? "",
    typeLine: source.type_line ?? "",
    rules: source.oracle_text ?? "",
    power,
    toughness,
    stats: power ? `${power}/${toughness}` : (source.loyalty ?? ""),
  };
}
