/** @import { Token } from "../src/designs.js" */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readBackup, writeBackup } from "../src/backup.js";

/** @type {Token} */
const GOBLIN = {
  id: "goblin",
  name: "Goblin",
  manaCost: "",
  typeLine: "Token Creature — Goblin",
  power: "1",
  toughness: "1",
  rules: "Haste",
  art: { fit: "fill", zoom: 1.5, x: 0.4, y: 0.6, source: { image: "image-1" } },
};

/** @type {Token} */
const DRAGON = {
  id: "dragon",
  name: "Dragon",
  manaCost: "{4}{R}{R}",
  typeLine: "Creature — Dragon",
  power: "5",
  toughness: "5",
  rules: "Flying",
  art: { fit: "fit", zoom: 1, x: 0.5, y: 0.5, source: { url: "https://cards.scryfall.io/art_crop/a.jpg" } },
};

const IMAGE = { type: "image/webp", bytes: new Uint8Array([0, 1, 2, 250, 255]) };

test("cards and their images come back from a backup as they were", () => {
  const { cards, images } = readBackup(writeBackup([GOBLIN, DRAGON], new Map([["image-1", IMAGE]])));
  assert.deepEqual(cards, [GOBLIN, DRAGON]);
  assert.deepEqual(images.get("image-1"), IMAGE);
});

test("a file that isn't a backup is refused with a message", () => {
  assert.throws(() => readBackup("not json"), /isn't a backup of My cards/);
  assert.throws(() => readBackup('{"cards": []}'), /isn't a backup of My cards/);
  const newer = JSON.parse(writeBackup([], new Map()));
  assert.throws(() => readBackup(JSON.stringify({ ...newer, version: 99 })), /newer version/);
});

test("damaged cards are left out and a card whose image is missing comes back without it", () => {
  const backup = JSON.parse(writeBackup([GOBLIN, DRAGON], new Map()));
  backup.cards.push({ id: "broken", name: 3 });
  backup.cards.push({
    ...DRAGON,
    id: "elsewhere",
    art: { ...DRAGON.art, source: { url: "https://example.com/a.jpg" } },
  });
  const { cards } = readBackup(JSON.stringify(backup));
  const { art, ...goblinWithoutArt } = GOBLIN;
  assert.deepEqual(cards, [goblinWithoutArt, DRAGON]);
});

test("cards saved before mana costs existed get an empty one", () => {
  const { manaCost, ...old } = GOBLIN;
  const backup = JSON.parse(writeBackup([], new Map([["image-1", IMAGE]])));
  backup.cards = [old];
  assert.equal(readBackup(JSON.stringify(backup)).cards[0].manaCost, "");
});

test("a file with no version isn't mistaken for a newer backup", () => {
  const text = JSON.stringify({ format: "mtg-thermal-printer/my-cards", cards: [] });
  assert.throws(
    () => readBackup(text),
    (error) => error instanceof Error && !/newer version/.test(error.message),
    "a missing version means it isn't a backup, not that it's from a newer page",
  );
  const newer = JSON.stringify({ format: "mtg-thermal-printer/my-cards", version: 99, cards: [] });
  assert.throws(() => readBackup(newer), /newer version/);
});
