import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const readWorkflow = (name) => readFile(join(root, ".github", "workflows", name), "utf8");

test("release runs only on manual dispatch with an explicit publish confirmation", async () => {
  const workflow = await readWorkflow("release.yml");
  assert.match(workflow, /^on:\n  workflow_dispatch:/mu);
  assert.doesNotMatch(workflow, /^\s{2}(?:push|pull_request|schedule|release):/mu);
  assert.match(workflow, /confirm_publish/u);
  assert.match(workflow, /if: inputs\.confirm_publish/u);
});

test("release sequences install, tests, and packaging before publishing", async () => {
  const workflow = await readWorkflow("release.yml");
  const order = [
    "npm ci --ignore-scripts",
    "npm run release:test",
    "npm run release:dry-run",
    "gh release create",
  ].map((command) => {
    const index = workflow.indexOf(command);
    assert.ok(index >= 0, `release workflow is missing ${command}`);
    return index;
  });
  assert.deepEqual(order, [...order].sort((left, right) => left - right));
  assert.match(workflow, /\.sha256/u);
  assert.match(workflow, /sha256sum --check --strict/u);
});

test("release keeps write access scoped to the publishing job", async () => {
  const workflow = await readWorkflow("release.yml");
  assert.match(workflow, /^permissions: \{\}$/mu);
  assert.deepEqual(
    [...workflow.matchAll(/^ {6}(\w[\w-]*): (\w+)$/gmu)]
      .filter(([, scope]) => ["contents", "packages", "pull-requests", "id-token", "actions"].includes(scope))
      .map(([, scope, level]) => `${scope}: ${level}`),
    ["contents: read", "contents: write"],
  );
  const publishJob = workflow.slice(workflow.indexOf("\n  publish:"));
  assert.match(publishJob, /contents: write/u);
  assert.doesNotMatch(publishJob, /npm (?:ci|run|test)/u);
});

test("release pins immutable first-party actions and never interpolates dispatch input into run blocks", async () => {
  const workflow = await readWorkflow("release.yml");
  const uses = [...workflow.matchAll(/uses:\s+([^\s]+)/gu)].map((match) => match[1]);
  assert.ok(uses.length > 0);
  assert.ok(uses.every((action) => /^actions\/[^@]+@[a-f0-9]{40}$/u.test(action)), uses.join(", "));

  const blocks = [...workflow.matchAll(/run: \|\n((?: {10}.*\n|\n)*)/gu)].map(([, block]) => block);
  assert.ok(blocks.length >= 5, "expected the multi-line run blocks to be captured");
  for (const block of [...blocks, ...workflow.match(/^ +run: .*$/gmu)]) {
    assert.doesNotMatch(block, /\$\{\{/u, "dispatch input must reach run blocks through env, not interpolation");
  }
  assert.match(workflow, /REQUESTED_VERSION: \$\{\{ inputs\.version \}\}/u);
  assert.match(workflow, /grep -Eq '\^\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+/u);
  assert.doesNotMatch(workflow, /secrets\./u);
});
