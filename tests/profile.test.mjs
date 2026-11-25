import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the profile names the application and its document type", () => {
  const config = JSON.parse(readFileSync("forge.config.json", "utf8"));
  assert.equal(config.identity.name, "PlotForge");
  assert.equal(config.document.extension, "pfg");
});
