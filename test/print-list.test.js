/** @import { Design } from "../src/designs.js" */
import assert from "node:assert/strict";
import { test } from "node:test";
import { PrintList } from "../src/print-list.js";

/**
 * A stand-in for localStorage.
 * @param {Record<string, string>} [saved]
 */
function memoryStorage(saved = {}) {
  const values = new Map(Object.entries(saved));
  return {
    /** @param {string} key */
    getItem: (key) => values.get(key) ?? null,
    /**
     * @param {string} key
     * @param {string} value
     */
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

/** @type {Design} */
const TREASURE = {
  type: "card",
  card: { id: "a1", name: "Treasure", set_name: "Tokens", collector_number: "1" },
  face: 0,
  darkness: "normal",
  cropBorder: false,
};

test("saved labels come back on the next visit", () => {
  const storage = memoryStorage();
  new PrintList(storage).add(TREASURE, 3);
  const [item] = new PrintList(storage).items;
  assert.deepEqual(item.design, TREASURE);
  assert.equal(item.copies, 3);
});

test("copies stay between 1 and 20", () => {
  const list = new PrintList(memoryStorage());
  list.add(TREASURE, 50);
  assert.equal(list.items[0].copies, 20);
  list.setCopies(list.items[0].id, 0);
  assert.equal(list.items[0].copies, 1);
});

test("every edit notifies listeners", () => {
  const list = new PrintList(memoryStorage());
  let changes = 0;
  list.addEventListener("change", () => changes++);
  list.add(TREASURE, 1);
  list.add(TREASURE, 2);
  list.remove(list.items[0].id);
  assert.deepEqual(
    list.items.map((item) => item.copies),
    [2],
  );
  list.clear();
  assert.deepEqual(list.items, []);
  assert.equal(changes, 4);
});

test("a damaged saved list starts empty", () => {
  assert.deepEqual(new PrintList(memoryStorage({ "print-list": "{not json" })).items, []);
  assert.deepEqual(new PrintList(memoryStorage({ "print-list": '[{"id": 1}]' })).items, []);
});

test("the list still works when the browser can't save it", () => {
  const list = new PrintList({
    getItem: () => null,
    setItem: () => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    },
  });
  list.add(TREASURE, 1);
  assert.equal(list.items.length, 1);
});
