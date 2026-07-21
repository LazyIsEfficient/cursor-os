import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const readWorkflow = (name) => readFile(join(root, ".github", "workflows", name), "utf8");

test("CI runs deterministic Node 22 validation without credentials or model calls", async () => {
  const workflow = await readWorkflow("ci.yml");
  assert.match(workflow, /pull_request:/u);
  assert.match(workflow, /push:/u);
  assert.match(workflow, /node-version: "22"/u);
  for (const command of [
    "npm ci",
    "npm run validate",
    "npm test",
    "tests/validator/install-lifecycle.test.mjs",
    "npm run benchmark:corpus-smoke",
  ]) assert.ok(workflow.includes(command));
  assert.doesNotMatch(workflow, /secrets\.|CURSOR_API_KEY|benchmark:smoke:authenticated|benchmark:release:authenticated/u);
});

test("authenticated profiles use protected pre-authenticated config and sanitized artifacts", async () => {
  const workflow = await readWorkflow("authenticated-benchmark.yml");
  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /type: environment/u);
  assert.match(workflow, /confirm_authenticated_run/u);
  assert.match(workflow, /self-hosted/u);
  assert.match(workflow, /CURSOR_CONFIG_TEMPLATE/u);
  assert.match(workflow, /benchmark:preflight/u);
  assert.match(workflow, /agent status/u);
  assert.match(workflow, /benchmark:export/u);
  assert.match(workflow, /benchmark:smoke:authenticated/u);
  assert.match(workflow, /benchmark:release:authenticated/u);
  assert.match(workflow, /npm run plugin:lifecycle:verify/u);
  assert.match(workflow, /plugin-lifecycle\.json/u);
  assert.match(
    workflow,
    /npm run plugin:lifecycle:verify[\s\S]*benchmark:smoke:authenticated/u,
  );
  assert.match(
    workflow,
    /npm run plugin:lifecycle:verify[\s\S]*benchmark:release:authenticated/u,
  );
  assert.match(
    workflow,
    /--plugin-lifecycle-evidence-file "\$RAW_RUN_ROOT\/plugin-lifecycle\.json"/u,
  );
  assert.doesNotMatch(
    workflow,
    /--plugin-lifecycle-evidence "npm run validate passed/u,
  );
  // Shape, not a literal SHA: do not re-pin this to a specific commit. A literal SHA makes every
  // legitimate dependabot bump of upload-artifact land red for no security benefit. What this
  // assertion uniquely guards is that the upload step still EXISTS in this workflow and is still
  // actions/upload-artifact -- the "pinned by 40-hex SHA" policy itself is enforced across all
  // actions by the "immutable first-party action pins" test below.
  assert.match(workflow, /actions\/upload-artifact@[0-9a-f]{40}/u);
  assert.match(workflow, /benchmark\/sanitized\//u);
  assert.doesNotMatch(workflow, /secrets\.|CURSOR_API_KEY|path:\s*benchmark\/results\//u);
  assert.doesNotMatch(workflow, /\bnpm publish\b|\bgh release create\b|\bgit push\b/u);
});

test("workflows use only immutable first-party action pins", async () => {
  for (const name of ["ci.yml", "authenticated-benchmark.yml"]) {
    const workflow = await readWorkflow(name);
    const uses = [...workflow.matchAll(/uses:\s+([^\s]+)/gu)].map((match) => match[1]);
    assert.ok(uses.length > 0);
    assert.ok(uses.every((action) => action.startsWith("actions/")));
    assert.ok(uses.every((action) => /^actions\/[^@]+@[a-f0-9]{40}$/u.test(action)));
  }
});
