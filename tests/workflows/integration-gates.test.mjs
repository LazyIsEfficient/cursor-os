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
    "scripts/gate-plan-test.sh",
    "scripts/check-pr-ship-gates-test.sh",
    "scripts/implementation-close-test.sh",
    "scripts/check-pr-ship-gates.sh",
  ]) assert.ok(workflow.includes(command), `ci.yml missing ${command}`);
  assert.match(workflow, /ship-gates:/u);
  assert.match(workflow, /PR_BODY:/u);
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

test("CI pull_request trigger includes edited so PR-body checkbox edits re-run gates", async () => {
  const workflow = await readWorkflow("ci.yml");
  assert.match(
    workflow,
    /pull_request:\n\s+#[^\n]*\n?\s+types:\s*\[[^\]]*\]/u,
    "pull_request trigger must declare explicit types",
  );
  const trigger = workflow.match(/types:\s*\[([^\]]*)\]/u);
  assert.ok(trigger, "explicit pull_request types missing");
  for (const type of ["opened", "synchronize", "reopened", "edited", "ready_for_review"]) {
    assert.ok(trigger[1].includes(type), `pull_request types missing ${type}`);
  }
});

test("ship-gates run gate scripts from the base ref, not the PR merge tree", async () => {
  const workflow = await readWorkflow("ci.yml");
  const job = workflow.slice(workflow.indexOf("\n  ship-gates:"));
  assert.match(
    job,
    /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/u,
    "gate scripts must be checked out from the base ref (fork PRs can edit the script)",
  );
  assert.match(job, /path: gate-src/u);
  assert.match(job, /bash gate-src\/scripts\/check-pr-ship-gates\.sh/u);
  // Changed-files diff is computed on the merge tree and injected, so the
  // base-ref script never needs PR-tree git state.
  assert.match(job, /SHIP_GATES_CHANGED_FILES=/u);
  assert.match(job, /git diff --name-only "\$BASE_SHA" "\$HEAD_SHA"/u);
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
