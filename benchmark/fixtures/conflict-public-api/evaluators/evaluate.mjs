import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const workspace = process.argv[2];
const failures = [];

if (!workspace) {
  console.error("workspace argument is required");
  process.exit(2);
}
async function load(path) {
  try {
    return await import(pathToFileURL(join(workspace, path)).href);
  } catch (error) {
    failures.push(`${path}: ${error.message}`);
    return {};
  }
}

function check(label, assertion) {
  try {
    assertion();
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
}

const api = await load("src/index.mjs");
const writer = await load("src/write-record.mjs");
const reader = await load("src/read-record.mjs");
check("public interface preserved", () => assert.equal(api.codecVersion, "1.0"));
check("public interface complete", () => {
  assert.equal(typeof api.encodeKey, "function");
  assert.equal(typeof api.decodeKey, "function");
});
check("codec escaping", () => {
  const parts = ["team one", "a:b", "100%"];
  const encoded = api.encodeKey(parts);
  assert.equal(encoded, "team%20one:a%3Ab:100%25");
  assert.deepEqual(api.decodeKey(encoded), parts);
});
check("writer uses public behavior", () => assert.deepEqual(
  writer.writeRecord(["a b", "c"], 7),
  { key: "a%20b:c", value: 7 },
));
check("reader uses public behavior", () => assert.deepEqual(
  reader.readRecord({ key: "a%20b:c", value: 7 }),
  { parts: ["a b", "c"], value: 7 },
));
check("consumers compose", () => {
  const value = { ok: true };
  assert.deepEqual(
    reader.readRecord(writer.writeRecord(["x:y", "z"], value)),
    { parts: ["x:y", "z"], value },
  );
});

if (failures.length > 0) {
  console.error("acceptance failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("acceptance passed");
