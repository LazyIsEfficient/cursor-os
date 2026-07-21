import assert from "node:assert/strict";
import test from "node:test";

import { summarizeRange } from "../src/range-summary.mjs";

test("returns the summary fields", () => {
  assert.deepEqual(Object.keys(summarizeRange([1, 2, 3])), ["min", "max", "total", "count"]);
});
