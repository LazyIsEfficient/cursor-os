import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const workspace = process.argv[2];
const failures = [];

function check(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(label);
}

if (!workspace) {
  failures.push("workspace argument is required");
} else {
  try {
    const moduleUrl = pathToFileURL(resolve(workspace, "src/window.mjs")).href;
    const { centeredWindow } = await import(moduleUrl);
    check("middle window includes both endpoints", centeredWindow([0, 1, 2, 3, 4], 2, 1), [1, 2, 3]);
    check("right boundary includes final item", centeredWindow(["a", "b", "c"], 2, 1), ["b", "c"]);
    check("zero radius includes center", centeredWindow([7, 8, 9], 1, 0), [8]);
    check("left boundary is clamped", centeredWindow([0, 1, 2, 3], 0, 2), [0, 1, 2]);
  } catch {
    failures.push("workspace module could not be evaluated");
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
