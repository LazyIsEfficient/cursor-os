import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const workspace = process.argv[2];
const { summarizeNote } = await import(pathToFileURL(`${workspace}/src/summarize-note.mjs`));

assert.equal(summarizeNote("\n# Quarterly status\n\nRelease is on schedule."), "Quarterly status");
assert.equal(summarizeNote("  Plain status  \nsecond line"), "Plain status");
assert.equal(summarizeNote("\n\n"), "");
assert.equal(summarizeNote(`# ${"x".repeat(100)}`).length, 80);
assert.throws(() => summarizeNote(null), TypeError);
