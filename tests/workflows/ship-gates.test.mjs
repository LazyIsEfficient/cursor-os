import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function runBash(script) {
  const result = spawnSync("bash", [join(root, script)], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `${script} failed (exit ${result.status}):\n${result.stdout}\n${result.stderr}`,
  );
}

test("gate-plan fixture tests pass", () => {
  runBash("scripts/gate-plan-test.sh");
});

test("check-pr-ship-gates fixture tests pass", () => {
  runBash("scripts/check-pr-ship-gates-test.sh");
});

test("implementation-close fixture tests pass", () => {
  runBash("scripts/implementation-close-test.sh");
});
