import assert from "node:assert/strict";
import { test } from "node:test";
import { customMarker, customMarkers, markerCounts } from "../src/markers.js";

test("a marker typed in is a keyword marker with a trimmed name", () => {
  const marker = customMarker("  +1/+1 counter  ");
  assert.equal(marker.name, "+1/+1 counter");
  assert.equal(marker.kind, "keyword");
  assert.match(marker.id, /^custom-/);
});

test("saved markers typed in keep only valid entries", () => {
  assert.deepEqual(customMarkers("Shield"), []);
  assert.deepEqual(
    customMarkers([
      { id: "custom-a", name: "Shield" },
      { id: "flying", name: "Flying" },
      { id: "custom-b", name: "   " },
      { id: "custom-c" },
    ]),
    [{ id: "custom-a", name: "Shield", kind: "keyword" }],
  );
});

test("counts keep markers typed in only while they exist", () => {
  const custom = customMarkers([{ id: "custom-a", name: "Shield" }]);
  assert.deepEqual(markerCounts({ "custom-a": 2, "custom-b": 1, flying: 1 }, custom), {
    flying: 1,
    "custom-a": 2,
  });
});
