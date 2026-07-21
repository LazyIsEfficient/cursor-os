import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workspace = process.argv[2];
const source = await readFile(`${workspace}/src/format-record.mjs`, "utf8");
const branchCount = (source.match(/\b(?:if|for|while|switch)\s*\(/gu) ?? []).length;
const nameNormalizations = (source.match(/String\(record\.name\s*\?\?\s*""\)\.trim\(\)/gu) ?? []).length;
const roleNormalizations = (source.match(/String\(record\.role\s*\?\?\s*""\)\.trim\(\)/gu) ?? []).length;

assert.ok(branchCount <= 1, "formatRecord exceeds the branch-count contract");
assert.equal(nameNormalizations, 1, "name normalization must have one source of truth");
assert.equal(roleNormalizations, 1, "role normalization must have one source of truth");
