import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const workspace = process.argv[2];
const { formatRecord } = await import(pathToFileURL(`${workspace}/src/format-record.mjs`));

assert.equal(typeof formatRecord, "function");
assert.equal(formatRecord({ name: " Ada ", role: " Engineer " }), "Ada|Engineer");
assert.equal(
  formatRecord({ name: " Ada ", role: " Engineer " }, "verbose"),
  "Name: Ada; Role: Engineer",
);
assert.equal(formatRecord({ name: null }, "compact"), "|");
assert.throws(() => formatRecord({}, "unknown"), RangeError);
