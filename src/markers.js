/**
 * @typedef {object} Marker
 * @property {string} id
 * @property {string} name
 * @property {"game" | "tracker" | "keyword"} kind
 * @property {string} [reminder]  Game markers: a short reminder of the rule.
 * @property {number} [track]  Trackers: how many numbered boxes to mark.
 */

const MAX_EACH = 20;

/** @type {Marker[]} */
export const MARKERS = [
  {
    id: "monarch",
    name: "The Monarch",
    kind: "game",
    reminder: "Draw a card at the beginning of your end step.",
  },
  {
    id: "initiative",
    name: "The Initiative",
    kind: "game",
    reminder: "Venture into Undercity now and at your upkeep.",
  },
  {
    id: "citys-blessing",
    name: "City's Blessing",
    kind: "game",
    reminder: "You have it for the rest of the game.",
  },
  { id: "day", name: "Day", kind: "game", reminder: "Night next turn if the active player casts no spells." },
  {
    id: "night",
    name: "Night",
    kind: "game",
    reminder: "Day next turn if the active player casts two or more spells.",
  },
  {
    id: "ring",
    name: "The Ring",
    kind: "game",
    reminder: "Choose a Ring-bearer each time the Ring tempts you.",
  },
  { id: "speed", name: "Speed", kind: "tracker", track: 4 },
  { id: "energy", name: "Energy", kind: "tracker", track: 10 },
  { id: "experience", name: "Experience", kind: "tracker", track: 10 },
  { id: "poison", name: "Poison", kind: "tracker", track: 10 },
  { id: "flying", name: "Flying", kind: "keyword" },
  { id: "first-strike", name: "First strike", kind: "keyword" },
  { id: "double-strike", name: "Double strike", kind: "keyword" },
  { id: "deathtouch", name: "Deathtouch", kind: "keyword" },
  { id: "haste", name: "Haste", kind: "keyword" },
  { id: "hexproof", name: "Hexproof", kind: "keyword" },
  { id: "indestructible", name: "Indestructible", kind: "keyword" },
  { id: "lifelink", name: "Lifelink", kind: "keyword" },
  { id: "menace", name: "Menace", kind: "keyword" },
  { id: "reach", name: "Reach", kind: "keyword" },
  { id: "trample", name: "Trample", kind: "keyword" },
  { id: "vigilance", name: "Vigilance", kind: "keyword" },
  { id: "ward", name: "Ward", kind: "keyword" },
];

/** @type {{ kind: Marker["kind"], name: string }[]} */
export const MARKER_GROUPS = [
  { kind: "game", name: "Game markers" },
  { kind: "tracker", name: "Trackers" },
  { kind: "keyword", name: "Keywords" },
];

/**
 * How many of each marker to print, from saved or edited data: known markers only, each a whole
 * number up to 20. Markers with none are left out.
 * @param {unknown} value
 * @returns {Record<string, number>}
 */
export function markerCounts(value) {
  /** @type {Record<string, number>} */
  const counts = {};
  if (typeof value !== "object" || value === null) return counts;
  for (const { id } of MARKERS) {
    const count = Math.min(
      Math.round(Number(/** @type {Record<string, unknown>} */ (value)[id])) || 0,
      MAX_EACH,
    );
    if (count > 0) counts[id] = count;
  }
  return counts;
}

/** @param {Record<string, number>} counts */
export const markerTotal = (counts) => Object.values(counts).reduce((total, count) => total + count, 0);
