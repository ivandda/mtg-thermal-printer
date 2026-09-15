import assert from "node:assert/strict";
import { test } from "node:test";
import { brotherQlDrivers } from "../../src/printers/brother-ql/driver.js";
import { MODELS } from "../../src/printers/brother-ql/models.js";

test("each model has its own USB product ID", () => {
  const ids = MODELS.map((model) => model.productId);
  assert.equal(new Set(ids).size, ids.length);
});

test("wide labels are only offered to printers with a wide print head", () => {
  for (const driver of brotherQlDrivers) {
    const wideLabels = driver.media.filter((media) => media.printableWidth > 720);
    const model = MODELS.find((candidate) => driver.name === `Brother ${candidate.name}`);
    assert.ok(model);
    assert.equal(wideLabels.length > 0, model.bytesPerRow * 8 > 720, driver.name);
  }
});

test("labels shorter than a printer prints aren't offered for it", () => {
  /** @param {string} name */
  const labelsOf = (name) =>
    brotherQlDrivers.find((driver) => driver.name === `Brother ${name}`)?.media.map((media) => media.id) ??
    [];
  assert.ok(labelsOf("QL-700").includes("62x29"));
  assert.ok(!labelsOf("QL-700").includes("d12"));
  assert.ok(!labelsOf("QL-500").includes("62x29"));
});
