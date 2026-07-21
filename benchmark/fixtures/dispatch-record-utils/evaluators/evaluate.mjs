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

const grouped = await load("src/group-by-status.mjs");
const summed = await load("src/sum-by-category.mjs");
const sorted = await load("src/sort-by-priority.mjs");
const records = [
  { id: "a", status: "open", category: "x", amount: 2, priority: 2 },
  { id: "b", status: "done", category: "y", amount: 4, priority: 1 },
  { id: "c", status: "open", category: "x", amount: 3, priority: 1 },
];
check("groupByStatus complete", () => assert.deepEqual(grouped.groupByStatus(records), {
  open: [records[0], records[2]],
  done: [records[1]],
}));
check("groupByStatus empty", () => assert.deepEqual(grouped.groupByStatus([]), {}));
check("sumByCategory complete", () => assert.deepEqual(summed.sumByCategory(records), { x: 5, y: 4 }));
check("sumByCategory negatives", () => assert.deepEqual(
  summed.sumByCategory([{ category: "x", amount: -2 }, { category: "x", amount: 1 }]),
  { x: -1 },
));
check("sortByPriority stable", () => assert.deepEqual(
  sorted.sortByPriority(records).map(({ id }) => id),
  ["b", "c", "a"],
));
check("sortByPriority non-mutating", () => {
  const input = [...records];
  sorted.sortByPriority(input);
  assert.deepEqual(input, records);
});

if (failures.length > 0) {
  console.error("acceptance failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("acceptance passed");
