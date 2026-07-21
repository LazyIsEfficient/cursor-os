import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const workspace = process.argv[2];
const { summarizeRange } = await import(pathToFileURL(`${workspace}/src/range-summary.mjs`));

assert.deepEqual(summarizeRange([7, -2, 4]), { min: -2, max: 7, total: 9, count: 3 });
assert.deepEqual(summarizeRange([]), { min: null, max: null, total: 0, count: 0 });
assert.deepEqual(summarizeRange([2.5, 1.5]), { min: 1.5, max: 2.5, total: 4, count: 2 });
assert.throws(() => summarizeRange("1,2"), TypeError);
assert.throws(() => summarizeRange([1, Number.NaN]), TypeError);
